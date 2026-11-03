//! Vault local de certificados.
//!
//! Qué hace: convierte una referencia `vault://certs/<id>` en una identidad TLS
//! (`native_tls::Identity`) leyendo `<vault_dir>/<id>.p12` o `<vault_dir>/<id>.pfx`.
//! La contraseña se busca en `CUMPLEFACTURA_CERT_PASSWORD_<ID>` y, si no existe,
//! en `CUMPLEFACTURA_CERT_PASSWORD`.
//!
//! Qué no hace nunca:
//! - Devolver los bytes del certificado o la contraseña fuera de este módulo.
//! - Escribir rutas, nombres de fichero o contraseñas en logs o respuestas.
//!   Los errores son códigos fijos (`certificate_not_found`, …).
//! - Leer fuera de `vault_dir`: el id solo admite `[A-Za-z0-9_-]` y, además, la
//!   ruta final se canoniza y se exige que siga dentro de la carpeta (enlaces simbólicos).
//!
//! Por qué aquí y no en la app: así el certificado y su contraseña solo existen en la
//! memoria de este proceso. La app nunca los toca.
//!
//! Límite conocido: en Linux, `native-tls` usa OpenSSL 3, que no abre ficheros
//! PKCS#12 cifrados con algoritmos antiguos (RC2/3DES) sin el proveedor «legacy».
//! En Windows (SChannel) y macOS se abren sin problema.

use native_tls::Identity;
use std::fs;
use std::path::Path;

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

/// Carga la identidad usando variables de entorno para la contraseña.
pub fn load(vault_dir: Option<&Path>, certificate_ref: &str) -> Result<Identity, &'static str> {
    load_with(vault_dir, certificate_ref, |name| std::env::var(name).ok())
}

/// Igual que `load`, con la búsqueda de contraseña inyectable (tests).
pub fn load_with(
    vault_dir: Option<&Path>,
    certificate_ref: &str,
    password_lookup: impl Fn(&str) -> Option<String>,
) -> Result<Identity, &'static str> {
    let id = fiscal_contract::certificate_id(certificate_ref).ok_or("certificate_ref_invalid")?;
    let bytes = read_pkcs12(vault_dir, id)?;
    let password = password_lookup(&password_env_name(id))
        .or_else(|| password_lookup("CUMPLEFACTURA_CERT_PASSWORD"))
        .ok_or("certificate_password_required")?;
    Identity::from_pkcs12(&bytes, &password).map_err(|_| "certificate_pkcs12_invalid")
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
            load_with(Some(&dir), "vault://certs/../x", no_password).err(),
            Some("certificate_ref_invalid")
        );
        assert_eq!(
            load_with(Some(&dir), "C:/certs/a.p12", no_password).err(),
            Some("certificate_ref_invalid")
        );
        assert_eq!(
            load_with(None, "vault://certs/a", no_password).err(),
            Some("certificate_vault_dir_missing")
        );
        assert_eq!(
            load_with(Some(&dir.join("no-existe")), "vault://certs/a", no_password).err(),
            Some("certificate_vault_dir_missing")
        );
        assert_eq!(
            load_with(Some(&dir), "vault://certs/a", no_password).err(),
            Some("certificate_not_found")
        );
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn requires_password_and_valid_pkcs12() {
        let dir = temp_vault("pkcs12");
        fs::write(dir.join("roto.pfx"), b"esto no es un pkcs12").unwrap();
        assert_eq!(
            load_with(Some(&dir), "vault://certs/roto", no_password).err(),
            Some("certificate_password_required")
        );
        let generic = |name: &str| (name == "CUMPLEFACTURA_CERT_PASSWORD").then(|| "x".to_string());
        assert_eq!(
            load_with(Some(&dir), "vault://certs/roto", generic).err(),
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
        assert!(load_with(Some(&dir), "vault://certs/prueba", specific).is_ok());
        let wrong = |_: &str| Some("otra".to_string());
        assert_eq!(
            load_with(Some(&dir), "vault://certs/prueba", wrong).err(),
            Some("certificate_pkcs12_invalid")
        );
        fs::remove_dir_all(dir).unwrap();
    }
}
