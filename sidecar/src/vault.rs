//! Vault local de certificados.
//!
//! Qué hace: convierte una referencia `vault://certs/<id>` en una identidad TLS
//! (`native_tls::Identity`) leyendo `<vault_dir>/<id>.p12` o `<vault_dir>/<id>.pfx`.
//! La contraseña es la que llega en la petición (`certificate_password`, modo
//! «solo durante esta sesión») y, si no llega, `CUMPLEFACTURA_CERT_PASSWORD_<ID>`
//! o `CUMPLEFACTURA_CERT_PASSWORD`.
//! También lee la fecha de caducidad (`notAfter`) del certificado ya abierto.
//!
//! Qué no hace nunca:
//! - Devolver los bytes del certificado o la contraseña fuera de este módulo.
//! - Escribir rutas, nombres de fichero o contraseñas en logs o respuestas.
//!   Los errores son códigos fijos (`certificate_not_found`, …).
//! - Leer fuera de `vault_dir`: el id solo admite `[A-Za-z0-9_-]` y, además, la
//!   ruta final se canoniza y se exige que siga dentro de la carpeta (enlaces simbólicos).
//!
//! Por qué aquí y no en la app: así el certificado solo existe en la memoria de este
//! proceso. La app nunca lo toca; como mucho guarda la contraseña en memoria durante
//! la sesión para mandarla en el cuerpo firmado.
//!
//! Caducidad sin librerías: `native-tls` no expone el certificado de una `Identity`
//! y el PKCS#12 va cifrado. `certificate_not_after` hace un apretón de manos TLS
//! consigo mismo por una tubería en memoria (sin red, sin sockets): el lado
//! servidor usa la identidad y el lado cliente lee el certificado del par en DER
//! (`peer_certificate`, existe en Windows, macOS y Linux). Del DER solo se lee
//! `tbsCertificate.validity.notAfter`. Si algo falla, `None`: solo sirve para avisar.
//!
//! Límite conocido: en Linux, `native-tls` usa OpenSSL 3, que no abre ficheros
//! PKCS#12 cifrados con algoritmos antiguos (RC2/3DES) sin el proveedor «legacy».
//! En Windows (SChannel) y macOS se abren sin problema.

use native_tls::{Identity, TlsAcceptor, TlsConnector};
use std::fs;
use std::io::{self, Read, Write};
use std::path::Path;
use std::sync::mpsc::{self, Receiver, Sender};
use std::time::Duration;

/// Límite del apretón de manos en memoria que lee la caducidad.
const EXPIRY_HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(5);

/// Nombre de la variable de contraseña específica de un certificado.
pub fn password_env_name(certificate_id: &str) -> String {
    let suffix: String = certificate_id
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() {
                c.to_ascii_uppercase()
            } else {
                '_'
            }
        })
        .collect();
    format!("CUMPLEFACTURA_CERT_PASSWORD_{suffix}")
}

/// Carga la identidad con la contraseña de la petición o, si no llega, la del entorno.
pub fn load(
    vault_dir: Option<&Path>,
    certificate_ref: &str,
    password: Option<&str>,
) -> Result<Identity, &'static str> {
    load_with(vault_dir, certificate_ref, password, |name| {
        std::env::var(name).ok()
    })
}

/// Igual que `load`, con la búsqueda en el entorno inyectable (tests).
pub fn load_with(
    vault_dir: Option<&Path>,
    certificate_ref: &str,
    password: Option<&str>,
    password_lookup: impl Fn(&str) -> Option<String>,
) -> Result<Identity, &'static str> {
    let id = fiscal_contract::certificate_id(certificate_ref).ok_or("certificate_ref_invalid")?;
    let bytes = read_pkcs12(vault_dir, id)?;
    // Una contraseña vacía en la petición cuenta como «no enviada».
    let password = password
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .or_else(|| password_lookup(&password_env_name(id)))
        .or_else(|| password_lookup("CUMPLEFACTURA_CERT_PASSWORD"))
        .ok_or("certificate_password_required")?;
    Identity::from_pkcs12(&bytes, &password).map_err(|_| "certificate_pkcs12_invalid")
}

/// `notAfter` del certificado de la identidad, en segundos Unix. `None` si no se puede leer.
pub fn certificate_not_after(identity: &Identity) -> Option<i64> {
    let (server_end, client_end) = MemoryPipe::pair();
    let acceptor = TlsAcceptor::new(identity.clone()).ok()?;
    let server = std::thread::spawn(move || {
        let _ = acceptor.accept(server_end);
    });
    // Solo se lee el certificado propio: no hay nada que verificar.
    let der = TlsConnector::builder()
        .danger_accept_invalid_certs(true)
        .danger_accept_invalid_hostnames(true)
        .build()
        .ok()
        .and_then(|connector| connector.connect("certificado.local", client_end).ok())
        .and_then(|stream| stream.peer_certificate().ok().flatten())
        .and_then(|certificate| certificate.to_der().ok());
    let _ = server.join();
    x509_not_after(&der?)
}

/// Extremo de una tubería en memoria: lo que escribe uno lo lee el otro.
struct MemoryPipe {
    tx: Sender<Vec<u8>>,
    rx: Receiver<Vec<u8>>,
    pending: Vec<u8>,
}

impl MemoryPipe {
    fn pair() -> (Self, Self) {
        let (a_tx, a_rx) = mpsc::channel();
        let (b_tx, b_rx) = mpsc::channel();
        let end = |tx, rx| Self {
            tx,
            rx,
            pending: Vec::new(),
        };
        (end(a_tx, b_rx), end(b_tx, a_rx))
    }
}

impl Read for MemoryPipe {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        if self.pending.is_empty() {
            // Desconexión o espera agotada: el otro extremo falló y el apretón se aborta.
            self.pending = self
                .rx
                .recv_timeout(EXPIRY_HANDSHAKE_TIMEOUT)
                .map_err(|_| io::Error::from(io::ErrorKind::TimedOut))?;
        }
        let n = buf.len().min(self.pending.len());
        buf[..n].copy_from_slice(&self.pending[..n]);
        self.pending.drain(..n);
        Ok(n)
    }
}

impl Write for MemoryPipe {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        self.tx
            .send(buf.to_vec())
            .map_err(|_| io::Error::from(io::ErrorKind::BrokenPipe))?;
        Ok(buf.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

/// Lee `tbsCertificate.validity.notAfter` de un X.509 en DER (RFC 5280 §4.1).
fn x509_not_after(der: &[u8]) -> Option<i64> {
    let (_, certificate, _) = der_tlv(der)?;
    let (_, tbs, _) = der_tlv(certificate)?;
    // `version` es `[0] EXPLICIT` y opcional.
    let (tag, _, after_version) = der_tlv(tbs)?;
    let mut fields = if tag == 0xA0 { after_version } else { tbs };
    // serialNumber, signature, issuer
    for _ in 0..3 {
        fields = der_tlv(fields)?.2;
    }
    let (_, validity, _) = der_tlv(fields)?;
    let (_, _, not_after) = der_tlv(validity)?;
    let (tag, time, _) = der_tlv(not_after)?;
    der_time(tag, time)
}

/// Un elemento DER: (etiqueta, contenido, resto).
fn der_tlv(input: &[u8]) -> Option<(u8, &[u8], &[u8])> {
    let (&tag, rest) = input.split_first()?;
    let (&first, rest) = rest.split_first()?;
    let (len, rest) = if first < 0x80 {
        (first as usize, rest)
    } else {
        let count = (first & 0x7f) as usize;
        if count == 0 || count > 4 || rest.len() < count {
            return None;
        }
        let len = rest[..count]
            .iter()
            .fold(0usize, |acc, byte| (acc << 8) | *byte as usize);
        (len, &rest[count..])
    };
    (rest.len() >= len).then(|| (tag, &rest[..len], &rest[len..]))
}

/// `UTCTime` (`AAMMDDhhmmssZ`) o `GeneralizedTime` (`AAAAMMDDhhmmssZ`) a segundos Unix.
fn der_time(tag: u8, value: &[u8]) -> Option<i64> {
    let text = std::str::from_utf8(value).ok()?.strip_suffix('Z')?;
    if !text.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    let (year, rest) = match (tag, text.len()) {
        // RFC 5280: en UTCTime, AA < 50 es 20AA.
        (0x17, 12) => {
            let short: i64 = text[..2].parse().ok()?;
            (if short < 50 { 2000 } else { 1900 } + short, &text[2..])
        }
        (0x18, 14) => (text[..4].parse().ok()?, &text[4..]),
        _ => return None,
    };
    let part = |at: usize| rest[at..at + 2].parse::<i64>().ok();
    let days = days_from_civil(year, part(0)?, part(2)?);
    Some(days * 86_400 + part(4)? * 3_600 + part(6)? * 60 + part(8)?)
}

/// Días desde 1970-01-01 (algoritmo de H. Hinnant, calendario gregoriano proléptico).
fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let year = if month <= 2 { year - 1 } else { year };
    let era = year.div_euclid(400);
    let year_of_era = year - era * 400;
    let day_of_year = (153 * ((month + 9) % 12) + 2) / 5 + day - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    era * 146_097 + day_of_era - 719_468
}

/// Segundos Unix a `AAAA-MM-DDThh:mm:ssZ` (inverso de `days_from_civil`).
pub fn iso_utc(unix: i64) -> String {
    let days = unix.div_euclid(86_400) + 719_468;
    let secs = unix.rem_euclid(86_400);
    let era = days.div_euclid(146_097);
    let day_of_era = days - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let shifted_month = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * shifted_month + 2) / 5 + 1;
    let month = if shifted_month < 10 {
        shifted_month + 3
    } else {
        shifted_month - 9
    };
    let year = year_of_era + era * 400 + i64::from(month <= 2);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}Z",
        secs / 3_600,
        secs % 3_600 / 60,
        secs % 60
    )
}

/// Lee `<vault_dir>/<id>.p12|.pfx` comprobando que la ruta real sigue dentro del vault.
fn read_pkcs12(vault_dir: Option<&Path>, id: &str) -> Result<Vec<u8>, &'static str> {
    let vault_dir = vault_dir.ok_or("certificate_vault_dir_missing")?;
    let vault_dir = vault_dir
        .canonicalize()
        .map_err(|_| "certificate_vault_dir_missing")?;
    for extension in ["p12", "pfx"] {
        let candidate = vault_dir.join(format!("{id}.{extension}"));
        let Ok(resolved) = candidate.canonicalize() else {
            continue;
        };
        if !resolved.starts_with(&vault_dir) || !resolved.is_file() {
            return Err("certificate_ref_invalid");
        }
        return fs::read(resolved).map_err(|_| "certificate_not_found");
    }
    Err("certificate_not_found")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::process::Command;

    fn temp_vault(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("cf-sidecar-vault-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn no_password(_: &str) -> Option<String> {
        None
    }

    #[test]
    fn password_env_name_is_upper_snake() {
        assert_eq!(
            password_env_name("mi-cert_01"),
            "CUMPLEFACTURA_CERT_PASSWORD_MI_CERT_01"
        );
    }

    #[test]
    fn rejects_bad_refs_and_missing_vault() {
        let dir = temp_vault("refs");
        assert_eq!(
            load_with(Some(&dir), "vault://certs/../x", None, no_password).err(),
            Some("certificate_ref_invalid")
        );
        assert_eq!(
            load_with(Some(&dir), "C:/certs/a.p12", None, no_password).err(),
            Some("certificate_ref_invalid")
        );
        assert_eq!(
            load_with(None, "vault://certs/a", None, no_password).err(),
            Some("certificate_vault_dir_missing")
        );
        assert_eq!(
            load_with(
                Some(&dir.join("no-existe")),
                "vault://certs/a",
                None,
                no_password
            )
            .err(),
            Some("certificate_vault_dir_missing")
        );
        assert_eq!(
            load_with(Some(&dir), "vault://certs/a", None, no_password).err(),
            Some("certificate_not_found")
        );
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn requires_password_and_valid_pkcs12() {
        let dir = temp_vault("pkcs12");
        fs::write(dir.join("roto.pfx"), b"esto no es un pkcs12").unwrap();
        assert_eq!(
            load_with(Some(&dir), "vault://certs/roto", None, no_password).err(),
            Some("certificate_password_required")
        );
        let generic = |name: &str| (name == "CUMPLEFACTURA_CERT_PASSWORD").then(|| "x".to_string());
        assert_eq!(
            load_with(Some(&dir), "vault://certs/roto", None, generic).err(),
            Some("certificate_pkcs12_invalid")
        );
        fs::remove_dir_all(dir).unwrap();
    }

    /// Ruta feliz con un PKCS#12 generado al vuelo. Necesita el comando `openssl`;
    /// si no está instalado, el test lo indica y no comprueba nada más. Nunca se
    /// guarda un certificado en el repositorio.
    #[test]
    fn loads_generated_pkcs12_when_openssl_cli_is_available() {
        let dir = temp_vault("ok");
        let key = dir.join("k.pem");
        let cert = dir.join("c.pem");
        let generated = Command::new("openssl")
            .args([
                "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
            ])
            .args(["-subj", "/CN=cumplefactura-test"])
            .arg("-keyout")
            .arg(&key)
            .arg("-out")
            .arg(&cert)
            .output()
            .is_ok_and(|out| out.status.success())
            && Command::new("openssl")
                .args(["pkcs12", "-export", "-passout", "pass:clave"])
                .arg("-inkey")
                .arg(&key)
                .arg("-in")
                .arg(&cert)
                .arg("-out")
                .arg(dir.join("prueba.p12"))
                .output()
                .is_ok_and(|out| out.status.success());
        if !generated {
            eprintln!("openssl no disponible: se omite la carga real de PKCS#12");
            fs::remove_dir_all(dir).unwrap();
            return;
        }
        let specific = |name: &str| {
            (name == "CUMPLEFACTURA_CERT_PASSWORD_PRUEBA").then(|| "clave".to_string())
        };
        assert!(load_with(Some(&dir), "vault://certs/prueba", None, specific).is_ok());
        let wrong = |_: &str| Some("otra".to_string());
        assert_eq!(
            load_with(Some(&dir), "vault://certs/prueba", None, wrong).err(),
            Some("certificate_pkcs12_invalid")
        );
        // La contraseña de la petición va antes que el entorno; vacía cuenta como ausente.
        let identity = load_with(Some(&dir), "vault://certs/prueba", Some("clave"), wrong)
            .expect("abre con la contraseña de la petición");
        assert_eq!(
            load_with(Some(&dir), "vault://certs/prueba", Some(""), no_password).err(),
            Some("certificate_password_required")
        );
        assert_eq!(
            load_with(Some(&dir), "vault://certs/prueba", Some("otra"), specific).err(),
            Some("certificate_pkcs12_invalid")
        );
        // `-days 1`: caduca en unas 24 h.
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        let left = certificate_not_after(&identity).expect("notAfter legible") - now;
        assert!((0..=86_400 + 60).contains(&left), "{left}");
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn reads_not_after_from_certificate_der_and_identity() {
        let key = rcgen::KeyPair::generate().unwrap();
        let mut params = rcgen::CertificateParams::new(vec!["prueba".to_string()]).unwrap();
        params.not_after = rcgen::date_time_ymd(2031, 2, 28);
        let cert = params.self_signed(&key).unwrap();
        let expected = days_from_civil(2031, 2, 28) * 86_400;
        assert_eq!(x509_not_after(cert.der()), Some(expected));
        assert_eq!(iso_utc(expected), "2031-02-28T00:00:00Z");
        // También a través de una identidad real, por el apretón de manos en memoria.
        let identity =
            Identity::from_pkcs8(cert.pem().as_bytes(), key.serialize_pem().as_bytes()).unwrap();
        assert_eq!(certificate_not_after(&identity), Some(expected));
    }

    #[test]
    fn der_time_and_calendar_edges() {
        assert_eq!(der_time(0x17, b"700101000000Z"), Some(0));
        assert_eq!(der_time(0x17, b"491231235959Z"), Some(2_524_607_999));
        assert_eq!(
            der_time(0x18, b"20240229120000Z"),
            Some(days_from_civil(2024, 2, 29) * 86_400 + 43_200)
        );
        assert_eq!(iso_utc(1_709_208_000), "2024-02-29T12:00:00Z");
        assert_eq!(iso_utc(-1), "1969-12-31T23:59:59Z");
        assert_eq!(der_time(0x17, b"7001010000Z"), None);
        assert_eq!(der_time(0x18, "2024é0229120000Z".as_bytes()), None);
        assert_eq!(x509_not_after(b"\x30\x82\x01"), None);
    }
}
