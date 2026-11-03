//! Mensajes JSON del canal app ↔ sidecar.
//!
//! Qué hace: un único juego de structs serializables que usan los dos extremos.
//! Si un campo cambia aquí, la app y el sidecar dejan de compilar a la vez.
//!
//! Qué no lleva nunca: rutas del vault, contraseñas, bytes del certificado ni el
//! secreto de sesión. La app solo conoce `certificate_ref` (`vault://certs/<id>`).
//!
//! Por qué `endpoint_name` es `String` y no `EndpointName`: un nombre desconocido
//! debe producir un bloqueo explicado (`endpoint_name_not_allowed`), no un error de
//! deserialización opaco.

use serde::{Deserialize, Serialize};

/// Primera y única línea que el sidecar escribe en stdout al arrancar.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Handshake {
    pub port: u16,
    pub pid: u32,
    pub version: String,
}

/// `GET /healthz`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct HealthResponse {
    pub status: String,
    pub version: String,
    pub aeat_calls_enabled: bool,
    pub production_enabled: bool,
}

/// Cuerpo de cualquier respuesta no 2xx.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ErrorResponse {
    pub error: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    pub external_call_performed: bool,
}

/// `POST /verifactu/submit-preflight`: ¿se podría enviar ahora?
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SubmitPreflightRequest {
    pub endpoint_name: String,
    pub certificate_ref: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SubmitPreflightResponse {
    /// `ready` o `blocked`.
    pub status: String,
    pub blockers: Vec<String>,
    pub warnings: Vec<String>,
    pub endpoint_name: String,
    pub endpoint_allowed: bool,
    pub certificate_loaded: bool,
    /// `pkcs12_vault` cuando el certificado se ha podido abrir.
    pub certificate_source: Option<String>,
    pub aeat_calls_enabled: bool,
    pub production_enabled: bool,
    /// Siempre `false`: el preflight nunca sale a internet.
    pub external_call_performed: bool,
}

/// `POST /verifactu/invoke-submit`: envía el XML a la AEAT.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct InvokeSubmitRequest {
    /// Documento `sfLR:RegFactuSistemaFacturacion` completo, tal y como lo generó la app.
    pub xml: String,
    /// SHA-256 del XML en hexadecimal. El sidecar lo recalcula y rechaza si no coincide.
    pub xml_sha256: String,
    pub endpoint_name: String,
    pub certificate_ref: String,
    pub timeout_seconds: u64,
}

/// Resultado de un envío que llegó a salir hacia la AEAT.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct InvokeSubmitResponse {
    pub xml_sha256: String,
    pub endpoint_name: String,
    /// Siempre `RegFactuSistemaFacturacion`.
    pub operation: String,
    /// `accepted`, `accepted_with_errors`, `rejected` o `transport_error`.
    pub status: String,
    pub http_status: Option<u16>,
    /// Código Seguro de Verificación devuelto por la AEAT.
    pub csv: Option<String>,
    pub estado_envio: Option<String>,
    pub estado_registro: Option<String>,
    pub codigo_error: Option<String>,
    pub descripcion_error: Option<String>,
    /// Segundos que la AEAT pide esperar antes del siguiente envío.
    pub tiempo_espera_envio_seconds: Option<u64>,
    pub soap_fault: Option<String>,
    /// `true`: la petición salió hacia la AEAT, aunque fallara después.
    pub external_call_performed: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn error_response_omits_empty_detail() {
        let json = serde_json::to_string(&ErrorResponse {
            error: "hmac_invalid".to_string(),
            detail: None,
            external_call_performed: false,
        })
        .unwrap();
        assert_eq!(
            json,
            r#"{"error":"hmac_invalid","external_call_performed":false}"#
        );
    }
}
