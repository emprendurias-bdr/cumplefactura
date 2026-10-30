//! Transporte HTTP loopback compartido para sidecars ContaPro (HMAC + JSON).
//!
//! Solo TCP local (`127.0.0.1` / `localhost`). Allowlists de path/flag y parsers de
//! negocio se quedan en cada módulo (`xades_sidecar`, `verifactu_submit_sidecar`,
//! `sidecar_channels`).

use hmac::{Hmac, Mac};
use serde::de::DeserializeOwned;
use sha2::Sha256;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::time::Duration;

type HmacSha256 = Hmac<Sha256>;

/// Destino HTTP local ya parseado (host/puerto/path).
#[derive(Debug, Clone)]
pub struct LocalHttpTarget {
    pub host: String,
    pub port: u16,
    pub path: String,
}

/// Parsea `http://127.0.0.1:port/path` y exige `expected_path` exacto.
pub fn parse_local_http_url(url: &str, expected_path: &str) -> Result<LocalHttpTarget, String> {
    let rest = url
        .strip_prefix("http://")
        .ok_or_else(|| "sidecar_url_must_use_http_localhost".to_string())?;
    let (host_port, path) = rest
        .split_once('/')
        .ok_or_else(|| "sidecar_url_missing_path".to_string())?;
    let (host, port_text) = host_port
        .split_once(':')
        .ok_or_else(|| "sidecar_url_missing_port".to_string())?;
    if host != "127.0.0.1" && host != "localhost" {
        return Err("sidecar_url_host_must_be_local".to_string());
    }
    let path = format!("/{path}");
    if path != expected_path {
        return Err(format!(
            "sidecar_url_path_must_be_{}",
            expected_path.trim_start_matches('/').replace('/', "_")
        ));
    }
    let port = port_text
        .parse::<u16>()
        .map_err(|_| "sidecar_url_invalid_port".to_string())?;
    Ok(LocalHttpTarget {
        host: host.to_string(),
        port,
        path,
    })
}

/// HMAC-SHA256 hex del body (header `x-signature`).
pub fn hmac_sha256_hex(key: &[u8], body: &[u8]) -> Result<String, String> {
    let mut mac =
        HmacSha256::new_from_slice(key).map_err(|_| "sidecar_hmac_key_invalid".to_string())?;
    mac.update(body);
    Ok(hex::encode(mac.finalize().into_bytes()))
}

/// Extrae JSON del body HTTP si el status es 2xx.
pub fn parse_http_json_response<T: DeserializeOwned>(response: &[u8]) -> Result<T, String> {
    let raw = String::from_utf8_lossy(response);
    let (headers, body) = raw
        .split_once("\r\n\r\n")
        .ok_or_else(|| "sidecar response missing body".to_string())?;
    let status_code = headers
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .ok_or_else(|| "sidecar_missing_status_code".to_string())?
        .parse::<u16>()
        .map_err(|_| "sidecar_invalid_status_code".to_string())?;
    if !(200..300).contains(&status_code) {
        return Err(format!("sidecar_http_status_{status_code}"));
    }
    serde_json::from_str(body).map_err(|err| format!("sidecar response JSON error: {err}"))
}

/// POST JSON + HMAC al sidecar local; deserializa la respuesta tipada.
pub fn post_json_local_sidecar<T: DeserializeOwned>(
    url: &str,
    expected_path: &str,
    shared_secret: &str,
    body: &[u8],
) -> Result<T, String> {
    let target = parse_local_http_url(url, expected_path)?;
    let signature = hmac_sha256_hex(shared_secret.as_bytes(), body)?;
    let mut stream = TcpStream::connect((target.host.as_str(), target.port))
        .map_err(|err| format!("sidecar connection error: {err}"))?;
    stream
        .set_read_timeout(Some(Duration::from_secs(20)))
        .map_err(|err| format!("sidecar read timeout error: {err}"))?;
    stream
        .set_write_timeout(Some(Duration::from_secs(20)))
        .map_err(|err| format!("sidecar write timeout error: {err}"))?;

    let request = format!(
        "POST {} HTTP/1.1\r\nHost: {}:{}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nx-correlation-id: {}\r\nx-idempotency-key: {}\r\nx-signature: {}\r\nConnection: close\r\n\r\n",
        target.path,
        target.host,
        target.port,
        body.len(),
        uuid::Uuid::new_v4(),
        uuid::Uuid::new_v4(),
        signature
    );
    stream
        .write_all(request.as_bytes())
        .and_then(|_| stream.write_all(body))
        .map_err(|err| format!("sidecar request error: {err}"))?;

    let mut response = Vec::new();
    stream
        .read_to_end(&mut response)
        .map_err(|err| format!("sidecar response read error: {err}"))?;
    parse_http_json_response(&response)
}
