//! HTTP/1.1 mínimo para el canal loopback y para leer respuestas de la AEAT.
//!
//! Qué hace:
//! - `read_http_message` lee una petición o respuesta completa: cabeceras, y cuerpo
//!   por `Content-Length`, por `Transfer-Encoding: chunked` o, en respuestas sin
//!   longitud, hasta que el servidor cierra.
//! - `post_json_loopback` es el cliente que usa la app para hablar con el sidecar.
//! - `response_bytes` compone respuestas; la usan el sidecar y los servidores falsos
//!   de los tests.
//!
//! Qué no hace nunca: redirecciones, keep-alive, compresión ni TLS. Cada conexión
//! lleva una sola petición y se cierra (`Connection: close`).
//!
//! Por qué no una librería HTTP: el canal tiene dos rutas fijas y un solo cliente.
//! Un lector de ~100 líneas probado es más fácil de auditar que una dependencia
//! con su propio árbol de crates.

use crate::{hmac_sha256_hex, HEADER_CORRELATION_ID, HEADER_SIGNATURE, MAX_BODY_BYTES};
use serde::de::DeserializeOwned;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{Ipv4Addr, TcpStream};
use std::time::Duration;

/// Tope de la sección de cabeceras. Una petición legítima ocupa menos de 1 KB.
const MAX_HEADER_BYTES: usize = 64 * 1024;

/// Petición o respuesta HTTP ya leída.
#[derive(Debug, Clone)]
pub struct HttpMessage {
    /// `POST /ruta HTTP/1.1` o `HTTP/1.1 200 OK`.
    pub start_line: String,
    /// Nombres en minúsculas, en el orden recibido.
    pub headers: Vec<(String, String)>,
    pub body: Vec<u8>,
}

impl HttpMessage {
    pub fn header(&self, name: &str) -> Option<&str> {
        self.headers
            .iter()
            .find(|(key, _)| key.eq_ignore_ascii_case(name))
            .map(|(_, value)| value.as_str())
    }

    /// Código de estado si el mensaje es una respuesta.
    pub fn status_code(&self) -> Option<u16> {
        let mut parts = self.start_line.split_whitespace();
        parts
            .next()
            .filter(|version| version.starts_with("HTTP/"))?;
        parts.next()?.parse().ok()
    }

    /// `(método, ruta)` si el mensaje es una petición.
    pub fn method_and_path(&self) -> Option<(&str, &str)> {
        let mut parts = self.start_line.split_whitespace();
        let method = parts.next()?;
        let path = parts.next()?;
        (!method.starts_with("HTTP/")).then_some((method, path))
    }

    fn is_response(&self) -> bool {
        self.start_line.starts_with("HTTP/")
    }
}

/// Lee un mensaje HTTP completo. El cuerpo no puede superar `max_body` bytes.
pub fn read_http_message<R: BufRead>(
    reader: &mut R,
    max_body: usize,
) -> Result<HttpMessage, String> {
    let start_line = read_line(reader)?;
    if start_line.is_empty() {
        return Err("http_empty_message".to_string());
    }
    let mut headers = Vec::new();
    let mut header_bytes = start_line.len();
    loop {
        let line = read_line(reader)?;
        if line.is_empty() {
            break;
        }
        header_bytes += line.len();
        if header_bytes > MAX_HEADER_BYTES {
            return Err("http_headers_too_large".to_string());
        }
        let (name, value) = line
            .split_once(':')
            .ok_or_else(|| "http_malformed_header".to_string())?;
        headers.push((name.trim().to_ascii_lowercase(), value.trim().to_string()));
    }
    let mut message = HttpMessage {
        start_line,
        headers,
        body: Vec::new(),
    };

    let chunked = message
        .header("transfer-encoding")
        .is_some_and(|value| value.to_ascii_lowercase().contains("chunked"));
    if chunked {
        message.body = read_chunked(reader, max_body)?;
    } else if let Some(length) = message.header("content-length") {
        let length: usize = length
            .parse()
            .map_err(|_| "http_invalid_content_length".to_string())?;
        if length > max_body {
            return Err("http_body_too_large".to_string());
        }
        message.body = vec![0; length];
        reader
            .read_exact(&mut message.body)
            .map_err(|err| format!("http_body_read_error: {err}"))?;
    } else if message.is_response() {
        // Sin longitud declarada, el servidor marca el final cerrando la conexión.
        reader
            .take(max_body as u64 + 1)
            .read_to_end(&mut message.body)
            .map_err(|err| format!("http_body_read_error: {err}"))?;
        if message.body.len() > max_body {
            return Err("http_body_too_large".to_string());
        }
    }
    Ok(message)
}

/// Respuesta HTTP completa lista para escribir en el socket.
pub fn response_bytes(status: u16, content_type: &str, body: &[u8]) -> Vec<u8> {
    let reason = match status {
        200 => "OK",
        400 => "Bad Request",
        401 => "Unauthorized",
        404 => "Not Found",
        405 => "Method Not Allowed",
        409 => "Conflict",
        413 => "Payload Too Large",
        _ => "Error",
    };
    let mut out = format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    )
    .into_bytes();
    out.extend_from_slice(body);
    out
}

/// Petición `POST` firmada con HMAC para el sidecar loopback.
pub fn signed_request_bytes(path: &str, port: u16, secret: &[u8], body: &[u8]) -> Vec<u8> {
    let mut out = format!(
        "POST {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nContent-Type: application/json\r\nContent-Length: {}\r\n{HEADER_CORRELATION_ID}: {}\r\n{HEADER_SIGNATURE}: {}\r\nConnection: close\r\n\r\n",
        body.len(),
        uuid::Uuid::new_v4(),
        hmac_sha256_hex(secret, body),
    )
    .into_bytes();
    out.extend_from_slice(body);
    out
}

/// Envía JSON firmado al sidecar en `127.0.0.1:port` y deserializa la respuesta.
///
/// Un estado distinto de 2xx se devuelve como `Err("sidecar_http_<código>: <error>")`,
/// usando el campo `error` del cuerpo si existe.
pub fn post_json_loopback<T: DeserializeOwned>(
    port: u16,
    path: &str,
    secret: &[u8],
    body: &[u8],
    timeout: Duration,
) -> Result<T, String> {
    let mut stream = TcpStream::connect((Ipv4Addr::LOCALHOST, port))
        .map_err(|err| format!("sidecar_connection_error: {err}"))?;
    stream
        .set_read_timeout(Some(timeout))
        .and_then(|_| stream.set_write_timeout(Some(timeout)))
        .map_err(|err| format!("sidecar_timeout_setup_error: {err}"))?;
    stream
        .write_all(&signed_request_bytes(path, port, secret, body))
        .map_err(|err| format!("sidecar_request_error: {err}"))?;
    let response = read_http_message(&mut BufReader::new(stream), MAX_BODY_BYTES)?;
    let status = response
        .status_code()
        .ok_or_else(|| "sidecar_invalid_status_line".to_string())?;
    if !(200..300).contains(&status) {
        let error = serde_json::from_slice::<serde_json::Value>(&response.body)
            .ok()
            .and_then(|value| value.get("error")?.as_str().map(str::to_string))
            .unwrap_or_else(|| "unknown".to_string());
        return Err(format!("sidecar_http_{status}: {error}"));
    }
    serde_json::from_slice(&response.body).map_err(|err| format!("sidecar_json_error: {err}"))
}

fn read_line<R: BufRead>(reader: &mut R) -> Result<String, String> {
    let mut raw = Vec::new();
    reader
        .take(MAX_HEADER_BYTES as u64)
        .read_until(b'\n', &mut raw)
        .map_err(|err| format!("http_read_error: {err}"))?;
    while raw
        .last()
        .is_some_and(|byte| *byte == b'\n' || *byte == b'\r')
    {
        raw.pop();
    }
    String::from_utf8(raw).map_err(|_| "http_non_utf8_header".to_string())
}

fn read_chunked<R: BufRead>(reader: &mut R, max_body: usize) -> Result<Vec<u8>, String> {
    let mut body = Vec::new();
    loop {
        let size_line = read_line(reader)?;
        let size_hex = size_line.split(';').next().unwrap_or("").trim();
        let size = usize::from_str_radix(size_hex, 16)
            .map_err(|_| "http_invalid_chunk_size".to_string())?;
        if size == 0 {
            // Cabeceras finales opcionales hasta la línea vacía.
            while !read_line(reader)?.is_empty() {}
            return Ok(body);
        }
        if body.len() + size > max_body {
            return Err("http_body_too_large".to_string());
        }
        let start = body.len();
        body.resize(start + size, 0);
        reader
            .read_exact(&mut body[start..])
            .map_err(|err| format!("http_body_read_error: {err}"))?;
        read_line(reader)?; // CRLF tras cada bloque
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;
    use std::net::TcpListener;

    fn read(raw: &str) -> Result<HttpMessage, String> {
        read_http_message(&mut Cursor::new(raw.as_bytes().to_vec()), 1024)
    }

    #[test]
    fn reads_request_with_content_length() {
        let message =
            read("POST /verifactu/submit-preflight HTTP/1.1\r\nContent-Length: 2\r\nX-Signature: ab\r\n\r\n{}")
                .unwrap();
        assert_eq!(
            message.method_and_path(),
            Some(("POST", "/verifactu/submit-preflight"))
        );
        assert_eq!(message.header("x-signature"), Some("ab"));
        assert_eq!(message.body, b"{}");
        assert_eq!(message.status_code(), None);
    }

    #[test]
    fn request_without_length_has_empty_body() {
        let message = read("GET /healthz HTTP/1.1\r\nHost: x\r\n\r\n").unwrap();
        assert!(message.body.is_empty());
    }

    #[test]
    fn reads_chunked_response_with_trailers() {
        let message = read(
            "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n4;ext=1\r\nWiki\r\n5\r\npedia\r\n0\r\nX-Trailer: y\r\n\r\n",
        )
        .unwrap();
        assert_eq!(message.status_code(), Some(200));
        assert_eq!(message.body, b"Wikipedia");
    }

    #[test]
    fn reads_response_until_close_and_keeps_error_bodies() {
        let message = read("HTTP/1.1 500 Internal Server Error\r\n\r\n<Fault/>").unwrap();
        assert_eq!(message.status_code(), Some(500));
        assert_eq!(message.body, b"<Fault/>");
    }

    #[test]
    fn rejects_oversized_and_malformed_messages() {
        assert_eq!(
            read("POST / HTTP/1.1\r\nContent-Length: 4096\r\n\r\n").unwrap_err(),
            "http_body_too_large"
        );
        assert_eq!(
            read("POST / HTTP/1.1\r\nsin-dos-puntos\r\n\r\n").unwrap_err(),
            "http_malformed_header"
        );
        assert_eq!(read("").unwrap_err(), "http_empty_message");
        assert!(read("HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\nzz\r\n").is_err());
    }

    #[test]
    fn loopback_client_signs_body_and_maps_errors() {
        let secret = b"secreto-de-prueba";
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let server = std::thread::spawn(move || {
            let mut verdicts = Vec::new();
            for status in [200u16, 409] {
                let (stream, _) = listener.accept().unwrap();
                let mut reader = BufReader::new(stream.try_clone().unwrap());
                let request = read_http_message(&mut reader, MAX_BODY_BYTES).unwrap();
                verdicts.push(crate::verify_hmac_hex(
                    secret,
                    &request.body,
                    request.header(HEADER_SIGNATURE).unwrap_or(""),
                ));
                let body: &[u8] = if status == 200 {
                    br#"{"ok":true}"#
                } else {
                    br#"{"error":"aeat_calls_disabled"}"#
                };
                (&stream)
                    .write_all(&response_bytes(status, "application/json", body))
                    .unwrap();
            }
            verdicts
        });

        let ok: serde_json::Value =
            post_json_loopback(port, "/x", secret, b"{\"a\":1}", Duration::from_secs(5)).unwrap();
        assert_eq!(ok["ok"], true);
        let err = post_json_loopback::<serde_json::Value>(
            port,
            "/x",
            secret,
            b"{}",
            Duration::from_secs(5),
        )
        .unwrap_err();
        assert_eq!(err, "sidecar_http_409: aeat_calls_disabled");
        assert_eq!(server.join().unwrap(), vec![true, true]);
    }
}
