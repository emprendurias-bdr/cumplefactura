//! Servidor HTTP loopback: la frontera de confianza entre la app y el sidecar.
//!
//! Qué hace, por cada conexión:
//! 1. descarta pares que no sean `127.0.0.1`/`::1`;
//! 2. lee una petición (máx. 4 MiB de cuerpo, 15 s para llegar);
//! 3. `GET /healthz` responde sin autenticación (no expone nada sensible);
//! 4. cualquier `POST` exige `x-signature` = HMAC-SHA256(secreto de sesión, cuerpo);
//! 5. deserializa el JSON y llama al `handler` correspondiente;
//! 6. responde y cierra (`Connection: close`).
//!
//! Qué no hace nunca: TLS, ficheros, certificados o URLs de la AEAT. Tampoco
//! registra cuerpos de petición: en el log solo van método, ruta, estado y traza.
//!
//! Por qué atiende de una en una: la app hace las llamadas fiscales en serie y un
//! envío no debe solaparse con otro. Un servidor secuencial es más simple de
//! razonar y no necesita sincronización.

use crate::config::SidecarConfig;
use crate::handlers::{self, Backend};
use fiscal_contract::http::{read_http_message, response_bytes, HttpMessage};
use fiscal_contract::messages::ErrorResponse;
use fiscal_contract::{
    verify_hmac_hex, HEADER_CORRELATION_ID, HEADER_SIGNATURE, MAX_BODY_BYTES, PATH_HEALTHZ,
    PATH_INVOKE_SUBMIT, PATH_SUBMIT_PREFLIGHT,
};
use serde::de::DeserializeOwned;
use serde::Serialize;
use std::io::{BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::time::Duration;

const REQUEST_READ_TIMEOUT: Duration = Duration::from_secs(15);

/// Atiende conexiones hasta que el proceso termina.
pub fn serve<B: Backend>(listener: TcpListener, config: &SidecarConfig, backend: &B) {
    for stream in listener.incoming() {
        match stream {
            Ok(stream) => handle_connection(stream, config, backend),
            Err(err) => eprintln!("sidecar: conexion rechazada: {err}"),
        }
    }
}

fn handle_connection<B: Backend>(mut stream: TcpStream, config: &SidecarConfig, backend: &B) {
    if !stream.peer_addr().is_ok_and(|peer| peer.ip().is_loopback()) {
        return;
    }
    let _ = stream.set_read_timeout(Some(REQUEST_READ_TIMEOUT));
    let request = {
        let mut reader = BufReader::new(&stream);
        read_http_message(&mut reader, MAX_BODY_BYTES)
    };
    let (status, body, label) = match request {
        Ok(request) => {
            let (status, body) = route(&request, config, backend);
            let label = format!(
                "{} trace={}",
                request
                    .start_line
                    .rsplit_once(' ')
                    .map_or("?", |(head, _)| head),
                request.header(HEADER_CORRELATION_ID).unwrap_or("-")
            );
            (status, body, label)
        }
        Err(error) if error == "http_body_too_large" => (
            413,
            error_body("body_too_large"),
            "peticion demasiado grande".to_string(),
        ),
        Err(_) => (
            400,
            error_body("bad_request"),
            "peticion ilegible".to_string(),
        ),
    };
    eprintln!("sidecar: {label} -> {status}");
    let _ = stream.write_all(&response_bytes(status, "application/json", &body));
}

/// Decide la respuesta de una petición ya leída. Sin sockets: probado directamente.
pub fn route<B: Backend>(
    request: &HttpMessage,
    config: &SidecarConfig,
    backend: &B,
) -> (u16, Vec<u8>) {
    let Some((method, path)) = request.method_and_path() else {
        return (400, error_body("bad_request"));
    };
    match (method, path) {
        ("GET", PATH_HEALTHZ) => (200, to_json(&handlers::healthz(config))),
        ("POST", PATH_SUBMIT_PREFLIGHT) | ("POST", PATH_INVOKE_SUBMIT) => {
            let signature = request.header(HEADER_SIGNATURE).unwrap_or("");
            if !verify_hmac_hex(&config.shared_secret, &request.body, signature) {
                return (401, error_body("hmac_invalid"));
            }
            if path == PATH_SUBMIT_PREFLIGHT {
                match parse(request) {
                    Ok(body) => (200, to_json(&handlers::preflight(config, backend, &body))),
                    Err(reply) => reply,
                }
            } else {
                match parse(request) {
                    Ok(body) => match handlers::invoke_submit(config, backend, &body) {
                        Ok(result) => (200, to_json(&result)),
                        Err((status, error)) => (status, to_json(&error)),
                    },
                    Err(reply) => reply,
                }
            }
        }
        (_, PATH_HEALTHZ | PATH_SUBMIT_PREFLIGHT | PATH_INVOKE_SUBMIT) => {
            (405, error_body("method_not_allowed"))
        }
        _ => (404, error_body("not_found")),
    }
}

fn parse<T: DeserializeOwned>(request: &HttpMessage) -> Result<T, (u16, Vec<u8>)> {
    serde_json::from_slice(&request.body).map_err(|err| {
        (
            400,
            to_json(&ErrorResponse {
                error: "bad_request".to_string(),
                detail: Some(err.to_string()),
                external_call_performed: false,
            }),
        )
    })
}

fn error_body(code: &str) -> Vec<u8> {
    to_json(&ErrorResponse {
        error: code.to_string(),
        detail: None,
        external_call_performed: false,
    })
}

fn to_json<T: Serialize>(value: &T) -> Vec<u8> {
    serde_json::to_vec(value).expect("los mensajes del contrato siempre serializan")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::handlers::tests::{FakeBackend, REGISTRO};
    use fiscal_contract::hmac_sha256_hex;
    use serde_json::{json, Value};

    const SECRET: [u8; 32] = [9; 32];

    fn config() -> SidecarConfig {
        SidecarConfig {
            shared_secret: SECRET.to_vec(),
            allow_aeat: false,
            allow_production: false,
            vault_dir: None,
        }
    }

    fn request(method: &str, path: &str, body: &[u8], signature: Option<String>) -> HttpMessage {
        let mut headers = vec![("content-length".to_string(), body.len().to_string())];
        if let Some(signature) = signature {
            headers.push((HEADER_SIGNATURE.to_string(), signature));
        }
        HttpMessage {
            start_line: format!("{method} {path} HTTP/1.1"),
            headers,
            body: body.to_vec(),
        }
    }

    fn call(method: &str, path: &str, body: Value, sign: bool) -> (u16, Value) {
        let body = serde_json::to_vec(&body).unwrap();
        let signature = sign.then(|| hmac_sha256_hex(&SECRET, &body));
        let (status, out) = route(
            &request(method, path, &body, signature),
            &config(),
            &FakeBackend::answering(200, ""),
        );
        (status, serde_json::from_slice(&out).unwrap())
    }

    #[test]
    fn healthz_needs_no_signature() {
        let (status, body) = call("GET", PATH_HEALTHZ, json!({}), false);
        assert_eq!(status, 200);
        assert_eq!(body["status"], "ok");
        assert_eq!(body["aeat_calls_enabled"], false);
    }

    #[test]
    fn post_without_valid_signature_is_401() {
        let preflight =
            json!({"endpoint_name":"SistemaVerifactuPruebas","certificate_ref":"vault://certs/ok"});
        assert_eq!(
            call("POST", PATH_SUBMIT_PREFLIGHT, preflight.clone(), false).0,
            401
        );
        let body = serde_json::to_vec(&preflight).unwrap();
        let wrong = hmac_sha256_hex(b"otro-secreto", &body);
        let (status, _) = route(
            &request("POST", PATH_SUBMIT_PREFLIGHT, &body, Some(wrong)),
            &config(),
            &FakeBackend::answering(200, ""),
        );
        assert_eq!(status, 401);
    }

    #[test]
    fn signed_preflight_and_submit_follow_policy() {
        let (status, body) = call(
            "POST",
            PATH_SUBMIT_PREFLIGHT,
            json!({"endpoint_name":"SistemaVerifactuPruebas","certificate_ref":"vault://certs/ok"}),
            true,
        );
        assert_eq!((status, body["status"].as_str()), (200, Some("blocked")));
        assert_eq!(body["blockers"], json!(["aeat_calls_disabled"]));

        let (status, body) = call(
            "POST",
            PATH_INVOKE_SUBMIT,
            json!({
                "xml": REGISTRO,
                "xml_sha256": fiscal_contract::sha256_hex(REGISTRO.as_bytes()),
                "endpoint_name": "SistemaVerifactuPruebas",
                "certificate_ref": "vault://certs/ok",
                "timeout_seconds": 30
            }),
            true,
        );
        assert_eq!(status, 409);
        assert_eq!(
            body,
            json!({"error":"aeat_calls_disabled","external_call_performed":false})
        );
    }

    #[test]
    fn malformed_json_unknown_paths_and_wrong_methods() {
        assert_eq!(
            call("POST", PATH_SUBMIT_PREFLIGHT, json!({"x":1}), true).0,
            400
        );
        assert_eq!(call("GET", "/otra", json!({}), false).0, 404);
        assert_eq!(call("GET", PATH_INVOKE_SUBMIT, json!({}), false).0, 405);
        assert_eq!(call("POST", PATH_HEALTHZ, json!({}), false).0, 405);
    }
}
