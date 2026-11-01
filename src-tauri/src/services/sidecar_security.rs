//! Validaciones compartidas para las integraciones con el sidecar local.
//!
//! Centraliza las comprobaciones repetidas de referencias de certificado,
//! secreto HMAC, campos obligatorios y URLs loopback. Todas las integraciones
//! siguen siendo fail-closed y deben pasar explícitamente la ruta esperada.

use super::sidecar_http;

const SIDECAR_SHARED_SECRET_ENV: &str = "CUMPLEFACTURA_SIDECAR_SHARED_SECRET";
const SIDECAR_SHARED_SECRET_FALLBACK_ENV: &str = "SIDECAR_SHARED_SECRET";
const CERT_REF_PREFIX: &str = "vault://certs/";

pub fn valid_certificate_ref(value: &str) -> bool {
    let trimmed = value.trim();
    trimmed.starts_with(CERT_REF_PREFIX) && trimmed.len() > CERT_REF_PREFIX.len()
}

pub fn sidecar_secret() -> String {
    std::env::var(SIDECAR_SHARED_SECRET_ENV)
        .or_else(|_| std::env::var(SIDECAR_SHARED_SECRET_FALLBACK_ENV))
        .unwrap_or_default()
}

pub fn allowed_local_url(value: &str, expected_path: &str) -> bool {
    sidecar_http::parse_local_http_url(value, expected_path).is_ok()
}

pub fn require(field: &str, value: &str) -> Result<(), String> {
    if value.trim().is_empty() {
        Err(format!("{field} is required"))
    } else {
        Ok(())
    }
}
