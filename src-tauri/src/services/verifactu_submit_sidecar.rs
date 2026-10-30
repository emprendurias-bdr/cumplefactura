//! Envío VERI*FACTU a AEAT solo a través del sidecar ContaPro (fail-closed).
//!
//! - `preflight` → `/verifactu/submit-preflight`: WSDL, vault, flags; **sin** XML crudo ni SOAP.
//! - `invoke_submit` → `/verifactu/invoke-submit`: XML firmado + HMAC; requiere flag invoke.
//! CumpleFactura no abre sockets a dominios AEAT directamente.

use crate::services::sidecar_http;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::Path;

const ENABLE_SUBMIT_PREFLIGHT_ENV: &str = "CUMPLEFACTURA_ENABLE_VERIFACTU_SUBMIT_SIDECAR_PREFLIGHT";
const ENABLE_SUBMIT_INVOKE_ENV: &str = "CUMPLEFACTURA_ENABLE_VERIFACTU_SUBMIT_SIDECAR_INVOKE";
const SIDECAR_SHARED_SECRET_ENV: &str = "CUMPLEFACTURA_SIDECAR_SHARED_SECRET";
const SIDECAR_SHARED_SECRET_FALLBACK_ENV: &str = "SIDECAR_SHARED_SECRET";
const DEFAULT_SUBMIT_PREFLIGHT_URL: &str = "http://127.0.0.1:8000/verifactu/submit-preflight";
const DEFAULT_SUBMIT_INVOKE_URL: &str = "http://127.0.0.1:8000/verifactu/invoke-submit";
const DEFAULT_ENDPOINT_NAME: &str = "SistemaVerifactuPruebas";
const CERT_REF_PREFIX: &str = "vault://certs/";
const SUBMIT_PREFLIGHT_PATH: &str = "/verifactu/submit-preflight";
const SUBMIT_INVOKE_PATH: &str = "/verifactu/invoke-submit";

const ALLOWED_ENDPOINT_NAMES: [&str; 4] = [
    "SistemaVerifactu",
    "SistemaVerifactuSello",
    "SistemaVerifactuPruebas",
    "SistemaVerifactuSelloPruebas",
];

/// Entrada preflight de submit (metadatos del paquete + ref vault + endpoint).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerifactuSubmitSidecarPreflightRequest {
    pub invoice_id: String,
    pub export_id: String,
    pub xml_path: String,
    pub xml_sha256: String,
    pub signature_status: String,
    pub certificate_secret_ref: String,
    pub endpoint_name: Option<String>,
    pub sidecar_url: Option<String>,
    pub require_soap_enabled: Option<bool>,
}

/// Estado de readiness del sidecar para submit (WSDL/cert/flags); sin SOAP AEAT aquí.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct VerifactuSubmitSidecarPreflight {
    pub ready: bool,
    pub status: String,
    pub invoice_id: String,
    pub export_id: String,
    pub sidecar_url: String,
    pub sidecar_endpoint: String,
    pub endpoint_name: String,
    pub xml_sha256: String,
    pub xml_bytes: u64,
    pub certificate_ref_status: String,
    pub current_signature_status: String,
    pub wsdl_name: Option<String>,
    pub wsdl_sha256: Option<String>,
    pub operation_available: bool,
    pub endpoint_allowed: bool,
    pub transport_enabled: bool,
    pub soap_calls_enabled: bool,
    pub certificate_loaded: bool,
    pub certificate_source: Option<String>,
    pub certificate_days_remaining: Option<i64>,
    pub sidecar_call_performed: bool,
    pub external_call_performed: bool,
    pub blockers: Vec<String>,
    pub warnings: Vec<String>,
    pub source_refs: Vec<String>,
    pub request_contract: Vec<String>,
}

/// Entrada invoke: XML firmado identificado por path + SHA.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerifactuSubmitSidecarInvokeRequest {
    pub invoice_id: String,
    pub export_id: String,
    pub xml_path: String,
    pub xml_sha256: String,
    pub signature_status: String,
    pub certificate_secret_ref: String,
    pub endpoint_name: Option<String>,
    pub sidecar_url: Option<String>,
    pub timeout_seconds: Option<f64>,
}

/// Resultado del invoke-submit (CSV/estado registro o error devolverlos por el sidecar).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct VerifactuSubmitSidecarInvocation {
    pub invoice_id: String,
    pub source_export_id: String,
    pub export_id: String,
    pub provider: String,
    pub environment: String,
    pub payload_version: String,
    pub xml_path: String,
    pub xml_sha256: String,
    pub xml_bytes: u64,
    pub signature_status: String,
    pub transmission_status: String,
    pub sidecar_url: String,
    pub sidecar_endpoint: String,
    pub endpoint_name: String,
    pub wsdl_name: String,
    pub operation: String,
    pub status: String,
    pub csv: Option<String>,
    pub estado_registro: Option<String>,
    pub codigo_error: Option<String>,
    pub descripcion_error: Option<String>,
    pub transport_mode: String,
    pub certificate_source: String,
    pub sidecar_call_performed: bool,
    pub external_call_performed: bool,
    pub notes: Vec<String>,
    pub warnings: Vec<String>,
}

/// Preflight submit leyendo flags/secret de entorno.
pub fn preflight(
    request: VerifactuSubmitSidecarPreflightRequest,
) -> Result<VerifactuSubmitSidecarPreflight, String> {
    let enabled = std::env::var(ENABLE_SUBMIT_PREFLIGHT_ENV).unwrap_or_default() == "1";
    let secret = std::env::var(SIDECAR_SHARED_SECRET_ENV)
        .or_else(|_| std::env::var(SIDECAR_SHARED_SECRET_FALLBACK_ENV))
        .unwrap_or_default();
    preflight_with_config(request, enabled, secret.as_str())
}

/// Invoke submit leyendo flags/secret de entorno.
pub fn invoke_submit(
    request: VerifactuSubmitSidecarInvokeRequest,
) -> Result<VerifactuSubmitSidecarInvocation, String> {
    let enabled = std::env::var(ENABLE_SUBMIT_INVOKE_ENV).unwrap_or_default() == "1";
    let secret = std::env::var(SIDECAR_SHARED_SECRET_ENV)
        .or_else(|_| std::env::var(SIDECAR_SHARED_SECRET_FALLBACK_ENV))
        .unwrap_or_default();
    invoke_submit_with_config(request, enabled, secret.as_str())
}

/// Núcleo preflight inyectable: valida contrato y opcionalmente consulta sidecar.
pub fn preflight_with_config(
    request: VerifactuSubmitSidecarPreflightRequest,
    submit_preflight_enabled: bool,
    shared_secret: &str,
) -> Result<VerifactuSubmitSidecarPreflight, String> {
    require("invoice_id", &request.invoice_id)?;
    require("export_id", &request.export_id)?;
    require("xml_path", &request.xml_path)?;
    require("xml_sha256", &request.xml_sha256)?;
    require("signature_status", &request.signature_status)?;

    let xml_path = Path::new(&request.xml_path);
    let metadata =
        fs::metadata(xml_path).map_err(|err| format!("submit XML metadata error: {err}"))?;
    if !metadata.is_file() {
        return Err("submit XML path is not a file".to_string());
    }

    let actual_sha256 = sha256_file(xml_path)?;
    let expected_sha256 = request.xml_sha256.trim().to_uppercase();
    let endpoint_name = request
        .endpoint_name
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_ENDPOINT_NAME.to_string());
    let sidecar_url = request
        .sidecar_url
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_SUBMIT_PREFLIGHT_URL.to_string());
    let require_soap_enabled = request.require_soap_enabled.unwrap_or(true);

    let mut blockers = Vec::new();
    if actual_sha256 != expected_sha256 {
        blockers.push("xml_sha256_mismatch".to_string());
    }
    if request.signature_status != "signed_xades" {
        blockers.push("requires_signed_xades".to_string());
    }
    if !valid_certificate_ref(&request.certificate_secret_ref) {
        blockers.push("certificate_secret_ref_must_use_vault_certs_prefix".to_string());
    }
    if !allowed_endpoint_name(&endpoint_name) {
        blockers.push("endpoint_name_not_in_local_wsdl_allowlist".to_string());
    }
    if !allowed_submit_preflight_url(&sidecar_url) {
        blockers.push("sidecar_url_must_be_local_verifactu_submit_preflight".to_string());
    }
    if !submit_preflight_enabled {
        blockers.push(format!("{ENABLE_SUBMIT_PREFLIGHT_ENV}_not_enabled"));
    }
    if shared_secret.trim().is_empty() {
        blockers.push("sidecar_shared_secret_required".to_string());
    }

    let mut result = base_result(
        &request,
        &sidecar_url,
        &endpoint_name,
        actual_sha256,
        metadata.len(),
    );
    if !blockers.is_empty() {
        result.blockers = blockers;
        result.status = "blocked".to_string();
        return Ok(result);
    }

    let payload = SidecarSubmitPreflightPayload {
        certificate_secret_ref: request.certificate_secret_ref.clone(),
        endpoint_name: endpoint_name.clone(),
        require_soap_enabled,
    };
    let body =
        serde_json::to_vec(&payload).map_err(|err| format!("sidecar payload error: {err}"))?;
    let response: SidecarSubmitPreflightResponse = sidecar_http::post_json_local_sidecar(
        &sidecar_url,
        SUBMIT_PREFLIGHT_PATH,
        shared_secret,
        &body,
    )?;
    if response.external_call_performed {
        return Err("sidecar_reported_external_call".to_string());
    }

    result.sidecar_call_performed = true;
    result.wsdl_name = response.wsdl_name;
    result.wsdl_sha256 = response.wsdl_sha256;
    result.endpoint_name = response.endpoint_name;
    result.operation_available = response.operation_available;
    result.endpoint_allowed = response.endpoint_allowed;
    result.transport_enabled = response.transport_enabled;
    result.soap_calls_enabled = response.soap_calls_enabled;
    result.certificate_loaded = response.certificate_loaded;
    result.certificate_source = response.certificate_source;
    result.certificate_days_remaining = response.certificate_days_remaining;
    result.blockers = response.blockers;
    result.warnings.extend(response.warnings);
    result.ready = response.status == "ready" && result.blockers.is_empty();
    result.status = if result.ready { "ready" } else { "blocked" }.to_string();
    Ok(result)
}

/// Núcleo invoke inyectable: exige XML firmado + flag + HMAC al path invoke.
pub fn invoke_submit_with_config(
    request: VerifactuSubmitSidecarInvokeRequest,
    submit_invoke_enabled: bool,
    shared_secret: &str,
) -> Result<VerifactuSubmitSidecarInvocation, String> {
    require("invoice_id", &request.invoice_id)?;
    require("export_id", &request.export_id)?;
    require("xml_path", &request.xml_path)?;
    require("xml_sha256", &request.xml_sha256)?;
    require("signature_status", &request.signature_status)?;

    let xml_path = Path::new(&request.xml_path);
    let metadata =
        fs::metadata(xml_path).map_err(|err| format!("submit XML metadata error: {err}"))?;
    if !metadata.is_file() {
        return Err("submit XML path is not a file".to_string());
    }
    let xml_firmado =
        fs::read_to_string(xml_path).map_err(|err| format!("signed XML read error: {err}"))?;
    let actual_sha256 = sha256_file(xml_path)?;
    let expected_sha256 = request.xml_sha256.trim().to_uppercase();
    let endpoint_name = request
        .endpoint_name
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_ENDPOINT_NAME.to_string());
    let sidecar_url = request
        .sidecar_url
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_SUBMIT_INVOKE_URL.to_string());
    let timeout_seconds = request.timeout_seconds.unwrap_or(20.0);

    let mut blockers = Vec::new();
    if actual_sha256 != expected_sha256 {
        blockers.push("xml_sha256_mismatch".to_string());
    }
    if request.signature_status != "signed_xades" {
        blockers.push("requires_signed_xades".to_string());
    }
    if !xml_firmado.contains("<Signature") && !xml_firmado.contains(":Signature") {
        blockers.push("signed_xml_missing_signature".to_string());
    }
    if !valid_certificate_ref(&request.certificate_secret_ref) {
        blockers.push("certificate_secret_ref_must_use_vault_certs_prefix".to_string());
    }
    if !allowed_endpoint_name(&endpoint_name) {
        blockers.push("endpoint_name_not_in_local_wsdl_allowlist".to_string());
    }
    if !allowed_submit_invoke_url(&sidecar_url) {
        blockers.push("sidecar_url_must_be_local_verifactu_invoke_submit".to_string());
    }
    if !submit_invoke_enabled {
        blockers.push(format!("{ENABLE_SUBMIT_INVOKE_ENV}_not_enabled"));
    }
    if shared_secret.trim().is_empty() {
        blockers.push("sidecar_shared_secret_required".to_string());
    }
    if !blockers.is_empty() {
        return Err(format!(
            "verifactu_submit_invoke_blocked: {}",
            blockers.join(",")
        ));
    }

    let payload = SidecarInvokeSubmitPayload {
        xml_firmado,
        certificate_secret_ref: request.certificate_secret_ref.clone(),
        endpoint_name: endpoint_name.clone(),
        timeout_seconds,
    };
    let body =
        serde_json::to_vec(&payload).map_err(|err| format!("sidecar payload error: {err}"))?;
    let response: SidecarInvokeSubmitResponse = sidecar_http::post_json_local_sidecar(
        &sidecar_url,
        SUBMIT_INVOKE_PATH,
        shared_secret,
        &body,
    )?;

    if response.xml_sha256.to_uppercase() != actual_sha256 {
        return Err("sidecar_xml_sha256_mismatch".to_string());
    }
    if !response.external_call_performed {
        return Err("sidecar_invoke_did_not_report_external_call".to_string());
    }
    if response
        .certificate_source
        .contains(&request.certificate_secret_ref)
    {
        return Err("sidecar_response_leaked_certificate_ref".to_string());
    }
    if response.certificate_source.contains(shared_secret) {
        return Err("sidecar_response_leaked_shared_secret".to_string());
    }

    Ok(VerifactuSubmitSidecarInvocation {
        invoice_id: request.invoice_id,
        source_export_id: request.export_id.clone(),
        export_id: request.export_id,
        provider: "AEAT-VERIFACTU".to_string(),
        environment: "sidecar-runtime".to_string(),
        payload_version: "verifactu-submit-sidecar-v1".to_string(),
        xml_path: request.xml_path,
        xml_sha256: actual_sha256,
        xml_bytes: metadata.len(),
        signature_status: "signed_xades".to_string(),
        transmission_status: response.status.clone(),
        sidecar_url,
        sidecar_endpoint: SUBMIT_INVOKE_PATH.to_string(),
        endpoint_name: response.endpoint_name,
        wsdl_name: response.wsdl_name,
        operation: response.operation,
        status: response.status,
        csv: response.csv,
        estado_registro: response.estado_registro,
        codigo_error: response.codigo_error,
        descripcion_error: response.descripcion_error,
        transport_mode: response.transport_mode,
        certificate_source: response.certificate_source,
        sidecar_call_performed: true,
        external_call_performed: response.external_call_performed,
        notes: vec![
            "Signed XML sent to local sidecar /verifactu/invoke-submit with HMAC authentication.".to_string(),
            "Only the sidecar may perform the AEAT SOAP operation; CumpleFactura never talks to AEAT directly.".to_string(),
            "Returned payload is redacted metadata only: no raw signed XML or certificate material.".to_string(),
        ],
        warnings: vec![
            "Gate tests use a fake local sidecar; real AEAT acceptance requires authorized certificate and homologation.".to_string(),
            "A successful local invocation boundary is not by itself proof of AEAT production acceptance.".to_string(),
        ],
    })
}

/// Plantilla de respuesta preflight (blockers/warnings/source_refs) antes del POST.
fn base_result(
    request: &VerifactuSubmitSidecarPreflightRequest,
    sidecar_url: &str,
    endpoint_name: &str,
    xml_sha256: String,
    xml_bytes: u64,
) -> VerifactuSubmitSidecarPreflight {
    VerifactuSubmitSidecarPreflight {
        ready: false,
        status: "blocked".to_string(),
        invoice_id: request.invoice_id.clone(),
        export_id: request.export_id.clone(),
        sidecar_url: sidecar_url.to_string(),
        sidecar_endpoint: "/verifactu/submit-preflight".to_string(),
        endpoint_name: endpoint_name.to_string(),
        xml_sha256,
        xml_bytes,
        certificate_ref_status: if valid_certificate_ref(&request.certificate_secret_ref) {
            "vault_ref_present"
        } else {
            "invalid_or_missing"
        }
        .to_string(),
        current_signature_status: request.signature_status.clone(),
        wsdl_name: None,
        wsdl_sha256: None,
        operation_available: false,
        endpoint_allowed: allowed_endpoint_name(endpoint_name),
        transport_enabled: false,
        soap_calls_enabled: false,
        certificate_loaded: false,
        certificate_source: None,
        certificate_days_remaining: None,
        sidecar_call_performed: false,
        external_call_performed: false,
        blockers: Vec::new(),
        warnings: vec![
            "Preflight only; no SOAP request has been sent to AEAT.".to_string(),
            "CumpleFactura sends no raw XML to /verifactu/submit-preflight; the sidecar checks WSDL, flags and vault certificate.".to_string(),
            "AEAT acceptance still requires /verifactu/invoke-submit with explicit sidecar flags and authorized certificate.".to_string(),
        ],
        source_refs: vec![
            "C:\\07 DESARROLLO\\apps\\contapro\\services\\sidecar\\app\\verifactu\\router.py::/verifactu/submit-preflight".to_string(),
            "C:\\07 DESARROLLO\\apps\\contapro\\services\\sidecar\\app\\verifactu\\preflight.py".to_string(),
            "C:\\03 LEGISLACION\\AEAT\\FACTURACION Y SIF\\05 DOCUMENTACION TECNICA AEAT\\01 VERIFACTU\\SistemaFacturacion VERI-FACTU.wsdl".to_string(),
        ],
        request_contract: vec![
            "POST /verifactu/submit-preflight".to_string(),
            "certificate_secret_ref=<redacted vault://certs/... ref>".to_string(),
            "endpoint_name=<SistemaVerifactu* port from local WSDL>".to_string(),
            "require_soap_enabled=true before real submit readiness".to_string(),
        ],
    }
}

fn valid_certificate_ref(value: &str) -> bool {
    let trimmed = value.trim();
    trimmed.starts_with(CERT_REF_PREFIX) && trimmed.len() > CERT_REF_PREFIX.len()
}

/// Whitelist de nombres de endpoint AEAT VERI*FACTU (prod/pruebas).
fn allowed_endpoint_name(value: &str) -> bool {
    ALLOWED_ENDPOINT_NAMES.contains(&value.trim())
}

fn allowed_submit_preflight_url(value: &str) -> bool {
    let trimmed = value.trim();
    let local =
        trimmed.starts_with("http://127.0.0.1:") || trimmed.starts_with("http://localhost:");
    local && trimmed.ends_with(SUBMIT_PREFLIGHT_PATH)
}

fn allowed_submit_invoke_url(value: &str) -> bool {
    let trimmed = value.trim();
    let local =
        trimmed.starts_with("http://127.0.0.1:") || trimmed.starts_with("http://localhost:");
    local && trimmed.ends_with(SUBMIT_INVOKE_PATH)
}

fn sha256_file(path: &Path) -> Result<String, String> {
    let bytes = fs::read(path).map_err(|err| format!("submit XML read error: {err}"))?;
    Ok(hex::encode(Sha256::digest(&bytes)).to_uppercase())
}

#[derive(Serialize)]
struct SidecarSubmitPreflightPayload {
    certificate_secret_ref: String,
    endpoint_name: String,
    require_soap_enabled: bool,
}

#[derive(Serialize)]
struct SidecarInvokeSubmitPayload {
    xml_firmado: String,
    certificate_secret_ref: String,
    endpoint_name: String,
    timeout_seconds: f64,
}

#[derive(Deserialize)]
struct SidecarSubmitPreflightResponse {
    status: String,
    wsdl_name: Option<String>,
    wsdl_sha256: Option<String>,
    endpoint_name: String,
    operation_available: bool,
    endpoint_allowed: bool,
    transport_enabled: bool,
    soap_calls_enabled: bool,
    certificate_loaded: bool,
    certificate_source: Option<String>,
    #[allow(dead_code)]
    certificate_sha256: Option<String>,
    #[allow(dead_code)]
    certificate_not_after: Option<String>,
    certificate_days_remaining: Option<i64>,
    blockers: Vec<String>,
    warnings: Vec<String>,
    external_call_performed: bool,
}

#[derive(Deserialize)]
struct SidecarInvokeSubmitResponse {
    wsdl_name: String,
    operation: String,
    endpoint_name: String,
    xml_sha256: String,
    status: String,
    csv: Option<String>,
    estado_registro: Option<String>,
    codigo_error: Option<String>,
    descripcion_error: Option<String>,
    transport_mode: String,
    certificate_source: String,
    external_call_performed: bool,
}

fn require(field: &str, value: &str) -> Result<(), String> {
    if value.trim().is_empty() {
        Err(format!("{field} is required"))
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::sidecar_http::hmac_sha256_hex;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::sync::mpsc;
    use std::thread;

    fn write_xml() -> (String, String) {
        let target = std::env::temp_dir().join(format!(
            "cumplefactura-submit-sidecar-{}.xml",
            uuid::Uuid::new_v4()
        ));
        fs::write(
            &target,
            b"<RegistroFacturacion><Signature>ok</Signature></RegistroFacturacion>",
        )
        .expect("write xml");
        let sha = sha256_file(&target).expect("sha");
        (target.to_str().expect("utf8").to_string(), sha)
    }

    fn request(sidecar_url: Option<String>) -> VerifactuSubmitSidecarPreflightRequest {
        let (xml_path, xml_sha256) = write_xml();
        VerifactuSubmitSidecarPreflightRequest {
            invoice_id: "invoice-1".to_string(),
            export_id: "export-1".to_string(),
            xml_path,
            xml_sha256,
            signature_status: "signed_xades".to_string(),
            certificate_secret_ref: "vault://certs/prod".to_string(),
            endpoint_name: Some(DEFAULT_ENDPOINT_NAME.to_string()),
            sidecar_url,
            require_soap_enabled: Some(true),
        }
    }

    fn fake_sidecar(
        status: &str,
        blockers: Vec<&str>,
        external_call_performed: bool,
    ) -> (String, mpsc::Receiver<bool>, thread::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
        let port = listener.local_addr().expect("addr").port();
        let (tx, rx) = mpsc::channel();
        let status = status.to_string();
        let blockers: Vec<String> = blockers.into_iter().map(ToString::to_string).collect();
        let handle = thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept");
            let mut buffer = Vec::new();
            let mut temp = [0u8; 4096];
            loop {
                let read = stream.read(&mut temp).expect("read");
                if read == 0 {
                    break;
                }
                buffer.extend_from_slice(&temp[..read]);
                if let Some(header_end) = find_header_end(&buffer) {
                    let headers = String::from_utf8_lossy(&buffer[..header_end]);
                    let content_length = headers
                        .lines()
                        .find_map(|line| {
                            line.strip_prefix("Content-Length: ")
                                .and_then(|value| value.parse::<usize>().ok())
                        })
                        .expect("content length");
                    if buffer.len() >= header_end + 4 + content_length {
                        break;
                    }
                }
            }

            let header_end = find_header_end(&buffer).expect("header end");
            let headers = String::from_utf8_lossy(&buffer[..header_end]);
            let body_start = header_end + 4;
            let body = &buffer[body_start..];
            let expected = hmac_sha256_hex(b"test-secret", body).expect("hmac");
            let signature_ok = headers.contains("POST /verifactu/submit-preflight HTTP/1.1")
                && headers.contains(&format!("x-signature: {expected}"))
                && !String::from_utf8_lossy(body).contains("RegistroFacturacion");
            tx.send(signature_ok).expect("send");

            let response = serde_json::json!({
                "status": status,
                "wsdl_name": "SistemaFacturacion.wsdl",
                "wsdl_sha256": "abc123",
                "endpoint_name": DEFAULT_ENDPOINT_NAME,
                "operation_available": true,
                "endpoint_allowed": true,
                "transport_enabled": status == "ready",
                "soap_calls_enabled": status == "ready",
                "certificate_loaded": status == "ready",
                "certificate_source": if status == "ready" { Some("pkcs12") } else { None },
                "certificate_sha256": if status == "ready" { Some("certsha") } else { None },
                "certificate_not_after": null,
                "certificate_days_remaining": if status == "ready" { Some(120) } else { None },
                "blockers": blockers,
                "warnings": ["sidecar warning"],
                "external_call_performed": external_call_performed
            })
            .to_string();
            let http = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                response.len(),
                response
            );
            stream.write_all(http.as_bytes()).expect("write");
        });
        (
            format!("http://127.0.0.1:{port}/verifactu/submit-preflight"),
            rx,
            handle,
        )
    }

    fn fake_invoke_sidecar(
        external_call_performed: bool,
    ) -> (String, mpsc::Receiver<bool>, thread::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
        let port = listener.local_addr().expect("addr").port();
        let (tx, rx) = mpsc::channel();
        let handle = thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept");
            let mut buffer = Vec::new();
            let mut temp = [0u8; 4096];
            loop {
                let read = stream.read(&mut temp).expect("read");
                if read == 0 {
                    break;
                }
                buffer.extend_from_slice(&temp[..read]);
                if let Some(header_end) = find_header_end(&buffer) {
                    let headers = String::from_utf8_lossy(&buffer[..header_end]);
                    let content_length = headers
                        .lines()
                        .find_map(|line| {
                            line.strip_prefix("Content-Length: ")
                                .and_then(|value| value.parse::<usize>().ok())
                        })
                        .expect("content length");
                    if buffer.len() >= header_end + 4 + content_length {
                        break;
                    }
                }
            }

            let header_end = find_header_end(&buffer).expect("header end");
            let headers = String::from_utf8_lossy(&buffer[..header_end]);
            let body_start = header_end + 4;
            let body = &buffer[body_start..];
            let expected = hmac_sha256_hex(b"test-secret", body).expect("hmac");
            let parsed: serde_json::Value = serde_json::from_slice(body).expect("json");
            let xml = parsed["xml_firmado"].as_str().expect("xml");
            let xml_hash = hex::encode(Sha256::digest(xml.as_bytes()));
            let signature_ok = headers.contains("POST /verifactu/invoke-submit HTTP/1.1")
                && headers.contains(&format!("x-signature: {expected}"))
                && xml.contains("<Signature>ok</Signature>")
                && parsed["certificate_secret_ref"] == "vault://certs/prod";
            tx.send(signature_ok).expect("send");

            let response = serde_json::json!({
                "wsdl_name": "SistemaFacturacion.wsdl",
                "operation": "RegFactuSistemaFacturacion",
                "endpoint_name": DEFAULT_ENDPOINT_NAME,
                "xml_sha256": xml_hash,
                "status": "submitted",
                "csv": "CSV123",
                "estado_registro": "Correcto",
                "codigo_error": null,
                "descripcion_error": null,
                "transport_mode": "zeep_pkcs12_local",
                "certificate_source": "pkcs12",
                "external_call_performed": external_call_performed
            })
            .to_string();
            let http = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                response.len(),
                response
            );
            stream.write_all(http.as_bytes()).expect("write");
        });
        (
            format!("http://127.0.0.1:{port}/verifactu/invoke-submit"),
            rx,
            handle,
        )
    }

    fn find_header_end(buffer: &[u8]) -> Option<usize> {
        buffer.windows(4).position(|window| window == b"\r\n\r\n")
    }

    #[test]
    fn blocks_before_network_without_flag_secret_or_signed_xades() {
        let mut req = request(Some(
            "http://127.0.0.1:9/verifactu/submit-preflight".to_string(),
        ));
        let xml_path = req.xml_path.clone();
        req.signature_status = "pending_xades".to_string();

        let result = preflight_with_config(req, false, "").expect("preflight");
        let _ = fs::remove_file(xml_path);

        assert!(!result.ready);
        assert!(!result.sidecar_call_performed);
        assert!(result
            .blockers
            .contains(&"requires_signed_xades".to_string()));
        assert!(result
            .blockers
            .contains(&format!("{ENABLE_SUBMIT_PREFLIGHT_ENV}_not_enabled")));
        assert!(result
            .blockers
            .contains(&"sidecar_shared_secret_required".to_string()));
    }

    #[test]
    fn calls_sidecar_submit_preflight_with_hmac_without_raw_xml() {
        let (url, rx, handle) = fake_sidecar(
            "blocked",
            vec!["verifactu_real_transport_disabled", "certificate_not_found"],
            false,
        );
        let req = request(Some(url));
        let xml_path = req.xml_path.clone();

        let result =
            preflight_with_config(req, true, "test-secret").expect("sidecar submit preflight");

        assert!(rx.recv().expect("signature check"));
        handle.join().expect("server join");
        assert!(!result.ready);
        assert!(result.sidecar_call_performed);
        assert!(!result.external_call_performed);
        assert!(result
            .blockers
            .contains(&"verifactu_real_transport_disabled".to_string()));
        assert!(result
            .blockers
            .contains(&"certificate_not_found".to_string()));
        let _ = fs::remove_file(xml_path);
    }

    #[test]
    fn becomes_ready_when_sidecar_reports_ready() {
        let (url, rx, handle) = fake_sidecar("ready", vec![], false);
        let req = request(Some(url));
        let xml_path = req.xml_path.clone();

        let result =
            preflight_with_config(req, true, "test-secret").expect("sidecar submit preflight");

        assert!(rx.recv().expect("signature check"));
        handle.join().expect("server join");
        assert!(result.ready);
        assert_eq!(result.status, "ready");
        assert!(result.operation_available);
        assert!(result.endpoint_allowed);
        assert!(result.transport_enabled);
        assert!(result.soap_calls_enabled);
        assert!(result.certificate_loaded);
        assert_eq!(result.certificate_source, Some("pkcs12".to_string()));
        let _ = fs::remove_file(xml_path);
    }

    #[test]
    fn rejects_sidecar_response_that_reports_external_call() {
        let (url, rx, handle) = fake_sidecar("ready", vec![], true);
        let req = request(Some(url));
        let xml_path = req.xml_path.clone();

        let err = preflight_with_config(req, true, "test-secret").expect_err("external rejected");

        assert!(rx.recv().expect("signature check"));
        handle.join().expect("server join");
        assert_eq!(err, "sidecar_reported_external_call");
        let _ = fs::remove_file(xml_path);
    }

    #[test]
    fn invoke_blocks_before_network_without_flag_secret_or_signed_status() {
        let (xml_path, xml_sha256) = write_xml();
        let req = VerifactuSubmitSidecarInvokeRequest {
            invoice_id: "invoice-1".to_string(),
            export_id: "export-1".to_string(),
            xml_path: xml_path.clone(),
            xml_sha256,
            signature_status: "pending_xades".to_string(),
            certificate_secret_ref: "vault://certs/prod".to_string(),
            endpoint_name: Some(DEFAULT_ENDPOINT_NAME.to_string()),
            sidecar_url: Some("http://127.0.0.1:9/verifactu/invoke-submit".to_string()),
            timeout_seconds: Some(20.0),
        };

        let err = invoke_submit_with_config(req, false, "").expect_err("blocked");

        assert!(err.contains("verifactu_submit_invoke_blocked"));
        assert!(err.contains("requires_signed_xades"));
        assert!(err.contains(ENABLE_SUBMIT_INVOKE_ENV));
        assert!(err.contains("sidecar_shared_secret_required"));
        let _ = fs::remove_file(xml_path);
    }

    #[test]
    fn invoke_calls_sidecar_with_hmac_and_returns_redacted_status() {
        let (url, rx, handle) = fake_invoke_sidecar(true);
        let (xml_path, xml_sha256) = write_xml();
        let req = VerifactuSubmitSidecarInvokeRequest {
            invoice_id: "invoice-1".to_string(),
            export_id: "export-1".to_string(),
            xml_path: xml_path.clone(),
            xml_sha256,
            signature_status: "signed_xades".to_string(),
            certificate_secret_ref: "vault://certs/prod".to_string(),
            endpoint_name: Some(DEFAULT_ENDPOINT_NAME.to_string()),
            sidecar_url: Some(url),
            timeout_seconds: Some(20.0),
        };

        let result = invoke_submit_with_config(req, true, "test-secret").expect("invoke submit");

        assert!(rx.recv().expect("signature check"));
        handle.join().expect("server join");
        assert_eq!(result.operation, "RegFactuSistemaFacturacion");
        assert_eq!(result.status, "submitted");
        assert_eq!(result.csv, Some("CSV123".to_string()));
        assert!(result.sidecar_call_performed);
        assert!(result.external_call_performed);
        assert_eq!(result.xml_sha256.len(), 64);
        let _ = fs::remove_file(xml_path);
    }

    #[test]
    fn invoke_rejects_response_without_external_call_report() {
        let (url, rx, handle) = fake_invoke_sidecar(false);
        let (xml_path, xml_sha256) = write_xml();
        let req = VerifactuSubmitSidecarInvokeRequest {
            invoice_id: "invoice-1".to_string(),
            export_id: "export-1".to_string(),
            xml_path: xml_path.clone(),
            xml_sha256,
            signature_status: "signed_xades".to_string(),
            certificate_secret_ref: "vault://certs/prod".to_string(),
            endpoint_name: Some(DEFAULT_ENDPOINT_NAME.to_string()),
            sidecar_url: Some(url),
            timeout_seconds: Some(20.0),
        };

        let err = invoke_submit_with_config(req, true, "test-secret").expect_err("external flag");

        assert!(rx.recv().expect("signature check"));
        handle.join().expect("server join");
        assert_eq!(err, "sidecar_invoke_did_not_report_external_call");
        let _ = fs::remove_file(xml_path);
    }
}
