//! Contrato compartido entre la app CumpleFactura y su sidecar VERI*FACTU.
//!
//! Qué hace:
//! - Define las rutas, cabeceras y mensajes JSON que viajan por el canal loopback
//!   `127.0.0.1` entre la app y el sidecar (`messages`).
//! - Fija la lista cerrada de endpoints AEAT a los que se puede enviar (`endpoints`).
//! - Firma y verifica cada petición con HMAC-SHA256 sobre el cuerpo exacto.
//! - Ofrece un lector HTTP/1.1 mínimo que usan los dos lados y los tests (`http`).
//!
//! Qué no hace nunca:
//! - No abre conexiones a internet ni carga certificados: eso es exclusivo del sidecar.
//! - No conoce SQLite, Tauri ni el XML fiscal.
//!
//! Por qué existe: antes cada módulo de la app repetía su propia copia del cliente
//! HTTP, del HMAC y de la validación de `vault://certs/...`. Con un único crate, la
//! app y el sidecar no pueden desalinearse sin que falle la compilación.

pub mod endpoints;
pub mod http;
pub mod messages;

use hmac::{Hmac, Mac};
use sha2::{Digest, Sha256};

/// Ruta de salud del sidecar. No exige HMAC ni devuelve secretos.
pub const PATH_HEALTHZ: &str = "/healthz";
/// Comprueba endpoint, certificado y flags sin llamar a la AEAT.
pub const PATH_SUBMIT_PREFLIGHT: &str = "/verifactu/submit-preflight";
/// Envía el XML VERI*FACTU a la AEAT con el certificado del vault.
pub const PATH_INVOKE_SUBMIT: &str = "/verifactu/invoke-submit";

/// HMAC-SHA256 en hexadecimal del cuerpo exacto de la petición.
pub const HEADER_SIGNATURE: &str = "x-signature";
/// Identificador de traza; el sidecar lo registra pero no lo interpreta.
pub const HEADER_CORRELATION_ID: &str = "x-correlation-id";

/// Límite de cuerpo en ambos sentidos. Un registro VERI*FACTU ocupa pocos KB.
pub const MAX_BODY_BYTES: usize = 4 * 1024 * 1024;

/// Prefijo obligatorio de las referencias a certificado. La app solo maneja la
/// referencia; el fichero y la contraseña viven en el sidecar.
pub const CERT_REF_PREFIX: &str = "vault://certs/";

/// Devuelve el identificador de `vault://certs/<id>` si la referencia es válida.
///
/// El id solo admite `[A-Za-z0-9_-]`, lo que impide rutas como `../x`.
pub fn certificate_id(certificate_ref: &str) -> Option<&str> {
    let id = certificate_ref.trim().strip_prefix(CERT_REF_PREFIX)?;
    let valid = !id.is_empty()
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-');
    valid.then_some(id)
}

/// Hexadecimal en minúsculas.
pub fn to_hex(bytes: &[u8]) -> String {
    const DIGITS: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push(DIGITS[(byte >> 4) as usize] as char);
        out.push(DIGITS[(byte & 0x0f) as usize] as char);
    }
    out
}

/// Decodifica hexadecimal (mayúsculas o minúsculas). `None` si no es válido.
pub fn from_hex(text: &str) -> Option<Vec<u8>> {
    if text.len() % 2 != 0 {
        return None;
    }
    (0..text.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(text.get(i..i + 2)?, 16).ok())
        .collect()
}

/// SHA-256 en hexadecimal minúsculas.
pub fn sha256_hex(bytes: &[u8]) -> String {
    to_hex(&Sha256::digest(bytes))
}

/// HMAC-SHA256 del cuerpo con el secreto de sesión, en hexadecimal minúsculas.
pub fn hmac_sha256_hex(secret: &[u8], body: &[u8]) -> String {
    to_hex(&hmac_sha256(secret, body).finalize().into_bytes())
}

/// Verifica la firma en tiempo constante.
pub fn verify_hmac_hex(secret: &[u8], body: &[u8], signature_hex: &str) -> bool {
    match from_hex(signature_hex.trim()) {
        Some(signature) => hmac_sha256(secret, body).verify_slice(&signature).is_ok(),
        None => false,
    }
}

fn hmac_sha256(secret: &[u8], body: &[u8]) -> Hmac<Sha256> {
    // HMAC acepta claves de cualquier longitud, así que este constructor no falla.
    let mut mac = Hmac::<Sha256>::new_from_slice(secret).expect("HMAC admite cualquier clave");
    mac.update(body);
    mac
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn certificate_id_accepts_only_safe_vault_refs() {
        assert_eq!(
            certificate_id("vault://certs/mi-cert_01"),
            Some("mi-cert_01")
        );
        assert_eq!(certificate_id(" vault://certs/abc "), Some("abc"));
        assert_eq!(certificate_id("vault://certs/"), None);
        assert_eq!(certificate_id("vault://certs/../x"), None);
        assert_eq!(certificate_id("vault://certs/a/b"), None);
        assert_eq!(certificate_id("file:///c/cert.p12"), None);
    }

    #[test]
    fn hex_roundtrip_and_sha256_vector() {
        assert_eq!(to_hex(&[0x00, 0xab, 0xff]), "00abff");
        assert_eq!(from_hex("00ABff"), Some(vec![0x00, 0xab, 0xff]));
        assert_eq!(from_hex("abc"), None);
        assert_eq!(from_hex("zz"), None);
        assert_eq!(
            sha256_hex(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn hmac_matches_rfc4231_case_2_and_verifies() {
        let signature = hmac_sha256_hex(b"Jefe", b"what do ya want for nothing?");
        assert_eq!(
            signature,
            "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843"
        );
        assert!(verify_hmac_hex(
            b"Jefe",
            b"what do ya want for nothing?",
            &signature
        ));
        assert!(verify_hmac_hex(
            b"Jefe",
            b"what do ya want for nothing?",
            &signature.to_uppercase()
        ));
        assert!(!verify_hmac_hex(b"Jefe", b"otro cuerpo", &signature));
        assert!(!verify_hmac_hex(
            b"Jefe",
            b"what do ya want for nothing?",
            "no-hex"
        ));
    }
}
