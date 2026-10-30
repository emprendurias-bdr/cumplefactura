//! Firma XAdES del XML VERI*FACTU vía ContaPro sidecar local (fail-closed).
//!
//! Flujo: preflight (hash, vault ref, flag, URL local) → POST HMAC a `/verifactu/sign-xml`
//! solo si `CUMPLEFACTURA_ENABLE_REAL_XADES_SIDECAR=1`. No abre AEAT; el certificado es
//! referencia `vault://certs/...`, nunca materializado aquí.

use crate::services::sidecar_http;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::Path;

const ENABLE_REAL_XADES_ENV: &str = "CUMPLEFACTURA_ENABLE_REAL_XADES_SIDECAR";
const SIDECAR_SHARED_SECRET_ENV: &str = "CUMPLEFACTURA_SIDECAR_SHARED_SECRET";
const SIDECAR_SHARED_SECRET_FALLBACK_ENV: &str = "SIDECAR_SHARED_SECRET";
const DEFAULT_SIDECAR_SIGN_XML_URL: &str = "http://127.0.0.1:8000/verifactu/sign-xml";
const SIGN_XML_PATH: &str = "/verifactu/sign-xml";
const CERT_REF_PREFIX: &str = "vault://certs/";
const SIGNATURE_MODE_REAL_XADES: &str = "xades_bes_local";

/// Entrada del preflight de firma (XML + SHA + estado + ref vault).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XadesSidecarPreflightRequest {
    pub invoice_id: String,
    pub export_id: String,
    pub xml_path: String,
    pub xml_sha256: String,
    pub signature_status: String,
    pub certificate_secret_ref: String,
    pub sidecar_url: Option<String>,
}

/// Entrada de firma: igual que preflight + path destino del XML firmado.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XadesSidecarSignRequest {
    pub invoice_id: String,
    pub export_id: String,
    pub xml_path: String,
    pub xml_sha256: String,
    pub signature_status: String,
    pub certificate_secret_ref: String,
    pub sidecar_url: Option<String>,
    pub signed_xml_path: String,
    pub reference_uri: Option<String>,
    pub id_attribute: Option<String>,
}

/// Resultado del preflight: ready/blockers sin necesariamente llamar al sidecar.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct XadesSidecarPreflight {
    pub ready: bool,
    pub status: String,
    pub invoice_id: String,
    pub export_id: String,
    pub sidecar_url: String,
    pub sidecar_endpoint: String,
    pub xml_sha256: String,
    pub xml_bytes: u64,
    pub certificate_ref_status: String,
    pub current_signature_status: String,
    pub signature_status_after_success: String,
    pub external_call_performed: bool,
    pub blockers: Vec<String>,
    pub warnings: Vec<String>,
    pub source_refs: Vec<String>,
    pub request_contract: Vec<String>,
}

/// Resultado de firma: paths/hashes del XML firmado y estados post-sidecar.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct XadesSidecarSignature {
    pub invoice_id: String,
    pub source_export_id: String,
    pub export_id: String,
    pub provider: String,
    pub environment: String,
    pub payload_version: String,
    pub source_xml_path: String,
    pub source_xml_sha256: String,
    pub xml_path: String,
    pub xml_sha256: String,
    pub xml_bytes: u64,
    pub xsd_validated_before_signature: bool,
    pub signature_status: String,
    pub transmission_status: String,
    pub signature_mode: String,
    pub certificate_source: Option<String>,
    pub sidecar_url: String,
    pub sidecar_call_performed: bool,
    pub external_call_performed: bool,
    pub notes: Vec<String>,
    pub warnings: Vec<String>,
}

/// Preflight leyendo el flag de entorno XAdES real.
pub fn preflight(request: XadesSidecarPreflightRequest) -> Result<XadesSidecarPreflight, String> {
    let enabled = std::env::var(ENABLE_REAL_XADES_ENV).unwrap_or_default() == "1";
    preflight_with_flag(request, enabled)
}

/// Firma el XML exacto (mismo SHA) vía sidecar; requiere secret HMAC + flag.
pub fn sign_exact_xml(request: XadesSidecarSignRequest) -> Result<XadesSidecarSignature, String> {
    let enabled = std::env::var(ENABLE_REAL_XADES_ENV).unwrap_or_default() == "1";
    let secret = std::env::var(SIDECAR_SHARED_SECRET_ENV)
        .or_else(|_| std::env::var(SIDECAR_SHARED_SECRET_FALLBACK_ENV))
        .unwrap_or_default();
    sign_exact_xml_with_config(request, enabled, secret.as_str())
}

/// Núcleo de firma inyectable (tests): preflight → POST local → escribe signed XML.
pub fn sign_exact_xml_with_config(
    request: XadesSidecarSignRequest,
    real_xades_enabled: bool,
    shared_secret: &str,
) -> Result<XadesSidecarSignature, String> {
    require("signed_xml_path", &request.signed_xml_path)?;
    require("sidecar shared secret", shared_secret)?;

    let preflight = preflight_with_flag(
        XadesSidecarPreflightRequest {
            invoice_id: request.invoice_id.clone(),
            export_id: request.export_id.clone(),
            xml_path: request.xml_path.clone(),
            xml_sha256: request.xml_sha256.clone(),
            signature_status: request.signature_status.clone(),
            certificate_secret_ref: request.certificate_secret_ref.clone(),
            sidecar_url: request.sidecar_url.clone(),
        },
        real_xades_enabled,
    )?;
    if !preflight.ready {
        return Err(format!(
            "xades_sidecar_preflight_blocked: {}",
            preflight.blockers.join(",")
        ));
    }

    let signed_path = Path::new(&request.signed_xml_path);
    if signed_path.exists() {
        return Err("signed_xml_path already exists".to_string());
    }
    if let Some(parent) = signed_path.parent() {
        fs::create_dir_all(parent).map_err(|err| format!("signed XML directory error: {err}"))?;
    }

    let source_xml = fs::read_to_string(&request.xml_path)
        .map_err(|err| format!("XAdES XML read error: {err}"))?;
    let payload = SidecarSignXmlPayload {
        xml: source_xml,
        certificate_secret_ref: request.certificate_secret_ref.clone(),
        expected_xml_sha256: preflight.xml_sha256.to_lowercase(),
        reference_uri: request
            .reference_uri
            .clone()
            .filter(|value| !value.trim().is_empty()),
        id_attribute: request
            .id_attribute
            .clone()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| "Id".to_string()),
    };
    let body =
        serde_json::to_vec(&payload).map_err(|err| format!("sidecar payload error: {err}"))?;
    let response: SidecarSignXmlResponse = sidecar_http::post_json_local_sidecar(
        &preflight.sidecar_url,
        SIGN_XML_PATH,
        shared_secret,
        &body,
    )?;

    if response.signature_mode != SIGNATURE_MODE_REAL_XADES {
        return Err("sidecar_returned_non_real_signature_mode".to_string());
    }
    if response.external_call_performed {
        return Err("sidecar_reported_external_call".to_string());
    }
    if response.xml_sha256.to_uppercase() != preflight.xml_sha256 {
        return Err("sidecar_xml_sha256_mismatch".to_string());
    }
    if response
        .xml_firmado
        .contains(&request.certificate_secret_ref)
    {
        return Err("sidecar_response_leaked_certificate_ref".to_string());
    }
    if response.xml_firmado.contains(shared_secret) {
        return Err("sidecar_response_leaked_shared_secret".to_string());
    }

    fs::write(signed_path, response.xml_firmado.as_bytes())
        .map_err(|err| format!("signed XML write error: {err}"))?;
    let metadata =
        fs::metadata(signed_path).map_err(|err| format!("signed XML metadata error: {err}"))?;
    let signed_xml_sha256 = sha256_file(signed_path)?;

    Ok(XadesSidecarSignature {
        invoice_id: request.invoice_id,
        source_export_id: request.export_id.clone(),
        export_id: request.export_id,
        provider: "AEAT-VERIFACTU".to_string(),
        environment: "local-dev".to_string(),
        payload_version: "verifactu-xades-signed-v1".to_string(),
        source_xml_path: request.xml_path,
        source_xml_sha256: preflight.xml_sha256,
        xml_path: request.signed_xml_path,
        xml_sha256: signed_xml_sha256,
        xml_bytes: metadata.len(),
        xsd_validated_before_signature: true,
        signature_status: "signed_xades".to_string(),
        transmission_status: "not_submitted".to_string(),
        signature_mode: response.signature_mode,
        certificate_source: response.certificate_source,
        sidecar_url: preflight.sidecar_url,
        sidecar_call_performed: true,
        external_call_performed: false,
        notes: vec![
            "Exact XML sent to local sidecar /verifactu/sign-xml with HMAC authentication.".to_string(),
            "Sidecar returned real local XAdES signature mode; signed XML stored locally.".to_string(),
            "No AEAT network transmission has been performed.".to_string(),
        ],
        warnings: vec![
            "Signed XML is not proof of AEAT acceptance.".to_string(),
            "Certificate material remains in the sidecar vault; CumpleFactura only sends a vault ref.".to_string(),
        ],
    })
}

/// Preflight inyectable: valida contrato local y blockers sin AEAT.
pub fn preflight_with_flag(
    request: XadesSidecarPreflightRequest,
    real_xades_enabled: bool,
) -> Result<XadesSidecarPreflight, String> {
    require("invoice_id", &request.invoice_id)?;
    require("export_id", &request.export_id)?;
    require("xml_path", &request.xml_path)?;
    require("xml_sha256", &request.xml_sha256)?;
    require("signature_status", &request.signature_status)?;

    let xml_path = Path::new(&request.xml_path);
    let metadata =
        fs::metadata(xml_path).map_err(|err| format!("XAdES XML metadata error: {err}"))?;
    if !metadata.is_file() {
        return Err("XAdES XML path is not a file".to_string());
    }

    let actual_sha256 = sha256_file(xml_path)?;
    let expected_sha256 = request.xml_sha256.trim().to_uppercase();
    let sidecar_url = request
        .sidecar_url
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_SIDECAR_SIGN_XML_URL.to_string());

    let mut blockers = Vec::new();
    if actual_sha256 != expected_sha256 {
        blockers.push("xml_sha256_mismatch".to_string());
    }
    if request.signature_status != "pending_xades" {
        blockers.push("requires_pending_xades_package".to_string());
    }
    if !valid_certificate_ref(&request.certificate_secret_ref) {
        blockers.push("certificate_secret_ref_must_use_vault_certs_prefix".to_string());
    }
    if !allowed_sidecar_sign_xml_url(&sidecar_url) {
        blockers.push("sidecar_url_must_be_local_verifactu_sign_xml".to_string());
    }
    if !real_xades_enabled {
        blockers.push(format!("{ENABLE_REAL_XADES_ENV}_not_enabled"));
    }

    let ready = blockers.is_empty();
    Ok(XadesSidecarPreflight {
        ready,
        status: if ready { "ready" } else { "blocked" }.to_string(),
        invoice_id: request.invoice_id,
        export_id: request.export_id,
        sidecar_url,
        sidecar_endpoint: "/verifactu/sign-xml".to_string(),
        xml_sha256: actual_sha256,
        xml_bytes: metadata.len(),
        certificate_ref_status: if valid_certificate_ref(&request.certificate_secret_ref) {
            "vault_ref_present"
        } else {
            "invalid_or_missing"
        }
        .to_string(),
        current_signature_status: request.signature_status,
        signature_status_after_success: "signed_xades".to_string(),
        external_call_performed: false,
        blockers,
        warnings: vec![
            "Preflight only; CumpleFactura has not sent XML or certificate refs to the sidecar.".to_string(),
            "Sidecar must be started separately with SIDECAR_ENABLE_REAL_XADES_ENDPOINTS=1 and a mounted PKCS#12 vault.".to_string(),
            "The sidecar endpoint signs the exact XML only via /verifactu/sign-xml; /verifactu/sign builds its own XML.".to_string(),
        ],
        source_refs: vec![
            "C:\\07 DESARROLLO\\apps\\contapro\\services\\sidecar\\app\\verifactu\\router.py::/verifactu/sign-xml".to_string(),
            "C:\\07 DESARROLLO\\apps\\contapro\\services\\sidecar\\REGULATORY_EVIDENCE_MATRIX.md".to_string(),
            "C:\\03 LEGISLACION\\AEAT\\FACTURACION Y SIF\\05 DOCUMENTACION TECNICA AEAT\\01 VERIFACTU".to_string(),
        ],
        request_contract: vec![
            "POST /verifactu/sign-xml".to_string(),
            "xml=<exact XSD-valid VERI*FACTU XML>".to_string(),
            "expected_xml_sha256=<local SHA256>".to_string(),
            "certificate_secret_ref=<redacted vault://certs/... ref>".to_string(),
            "reference_uri/id_attribute depend on XML Id placement".to_string(),
        ],
    })
}

/// Solo acepta refs `vault://certs/...` (sin secretos embebidos).
fn valid_certificate_ref(value: &str) -> bool {
    let trimmed = value.trim();
    trimmed.starts_with(CERT_REF_PREFIX) && trimmed.len() > CERT_REF_PREFIX.len()
}

/// URL debe ser loopback y terminar en `/verifactu/sign-xml`.
fn allowed_sidecar_sign_xml_url(value: &str) -> bool {
    let trimmed = value.trim();
    let local =
        trimmed.starts_with("http://127.0.0.1:") || trimmed.starts_with("http://localhost:");
    local && trimmed.ends_with("/verifactu/sign-xml")
}

fn sha256_file(path: &Path) -> Result<String, String> {
    let bytes = fs::read(path).map_err(|err| format!("XAdES XML read error: {err}"))?;
    Ok(hex::encode(Sha256::digest(&bytes)).to_uppercase())
}

#[derive(Serialize)]
struct SidecarSignXmlPayload {
    xml: String,
    certificate_secret_ref: String,
    expected_xml_sha256: String,
    reference_uri: Option<String>,
    id_attribute: String,
}

#[derive(Deserialize)]
struct SidecarSignXmlResponse {
    xml_sha256: String,
    #[allow(dead_code)]
    signature_value: String,
    #[serde(rename = "xml_firmado")]
    xml_firmado: String,
    signature_mode: String,
    certificate_source: Option<String>,
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
            "cumplefactura-xades-sidecar-{}.xml",
            uuid::Uuid::new_v4()
        ));
        fs::write(&target, b"<RegistroFacturacion Id=\"cf-1\"/>").expect("write xml");
        let sha = sha256_file(&target).expect("sha");
        (target.to_str().expect("utf8").to_string(), sha)
    }

    fn request() -> XadesSidecarPreflightRequest {
        let (xml_path, xml_sha256) = write_xml();
        XadesSidecarPreflightRequest {
            invoice_id: "invoice-1".to_string(),
            export_id: "export-1".to_string(),
            xml_path,
            xml_sha256,
            signature_status: "pending_xades".to_string(),
            certificate_secret_ref: "vault://certs/prod".to_string(),
            sidecar_url: None,
        }
    }

    fn sign_request(sidecar_url: String, signed_xml_path: String) -> XadesSidecarSignRequest {
        let (xml_path, xml_sha256) = write_xml();
        XadesSidecarSignRequest {
            invoice_id: "invoice-1".to_string(),
            export_id: "export-1".to_string(),
            xml_path,
            xml_sha256,
            signature_status: "pending_xades".to_string(),
            certificate_secret_ref: "vault://certs/prod".to_string(),
            sidecar_url: Some(sidecar_url),
            signed_xml_path,
            reference_uri: Some("#cf-1".to_string()),
            id_attribute: Some("Id".to_string()),
        }
    }

    fn fake_sidecar(
        signature_mode: &str,
    ) -> (String, mpsc::Receiver<bool>, thread::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
        let port = listener.local_addr().expect("addr").port();
        let mode = signature_mode.to_string();
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
            let signature_ok = headers.contains("POST /verifactu/sign-xml HTTP/1.1")
                && headers.contains(&format!("x-signature: {expected}"));
            tx.send(signature_ok).expect("send");

            let parsed: serde_json::Value = serde_json::from_slice(body).expect("json");
            let expected_hash = parsed["expected_xml_sha256"].as_str().expect("hash");
            let response = format!(
                "{{\"xml_sha256\":\"{}\",\"signature_value\":\"abc123\",\"xml_firmado\":\"<RegistroFacturacion Id=\\\"cf-1\\\"><Signature>ok</Signature></RegistroFacturacion>\",\"signature_mode\":\"{}\",\"certificate_source\":\"pkcs12\",\"external_call_performed\":false}}",
                expected_hash,
                mode
            );
            let http = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                response.len(),
                response
            );
            stream.write_all(http.as_bytes()).expect("write");
        });
        (
            format!("http://127.0.0.1:{port}/verifactu/sign-xml"),
            rx,
            handle,
        )
    }

    fn find_header_end(buffer: &[u8]) -> Option<usize> {
        buffer.windows(4).position(|window| window == b"\r\n\r\n")
    }

    #[test]
    fn blocks_when_flag_or_vault_ref_are_missing() {
        let mut req = request();
        let xml_path = req.xml_path.clone();
        req.certificate_secret_ref = "prod".to_string();

        let result = preflight_with_flag(req, false).expect("preflight");
        let _ = fs::remove_file(xml_path);

        assert!(!result.ready);
        assert_eq!(result.status, "blocked");
        assert!(!result.external_call_performed);
        assert!(result
            .blockers
            .contains(&"certificate_secret_ref_must_use_vault_certs_prefix".to_string()));
        assert!(result
            .blockers
            .contains(&format!("{ENABLE_REAL_XADES_ENV}_not_enabled")));
    }

    #[test]
    fn becomes_ready_for_local_sidecar_sign_xml_when_enabled() {
        let req = request();
        let xml_path = req.xml_path.clone();

        let result = preflight_with_flag(req, true).expect("preflight");
        let _ = fs::remove_file(xml_path);

        assert!(result.ready);
        assert_eq!(result.sidecar_url, DEFAULT_SIDECAR_SIGN_XML_URL);
        assert_eq!(result.sidecar_endpoint, "/verifactu/sign-xml");
        assert_eq!(result.certificate_ref_status, "vault_ref_present");
        assert_eq!(result.signature_status_after_success, "signed_xades");
        assert!(result.blockers.is_empty());
        assert!(!result.external_call_performed);
    }

    #[test]
    fn blocks_unknown_sidecar_url_hash_mismatch_and_wrong_status() {
        let mut req = request();
        let xml_path = req.xml_path.clone();
        req.sidecar_url = Some("https://example.com/verifactu/sign-xml".to_string());
        req.xml_sha256 = "0".repeat(64);
        req.signature_status = "signed_xades".to_string();

        let result = preflight_with_flag(req, true).expect("preflight");
        let _ = fs::remove_file(xml_path);

        assert!(!result.ready);
        assert!(result.blockers.contains(&"xml_sha256_mismatch".to_string()));
        assert!(result
            .blockers
            .contains(&"requires_pending_xades_package".to_string()));
        assert!(result
            .blockers
            .contains(&"sidecar_url_must_be_local_verifactu_sign_xml".to_string()));
    }

    #[test]
    fn sign_exact_xml_calls_local_sidecar_with_hmac_and_writes_signed_xml() {
        let (url, rx, handle) = fake_sidecar(SIGNATURE_MODE_REAL_XADES);
        let signed_path = std::env::temp_dir().join(format!(
            "cumplefactura-xades-signed-{}.xml",
            uuid::Uuid::new_v4()
        ));
        let req = sign_request(url, signed_path.to_str().expect("utf8").to_string());
        let source_path = req.xml_path.clone();

        let result =
            sign_exact_xml_with_config(req, true, "test-secret").expect("sidecar signature");

        assert!(rx.recv().expect("signature check"));
        handle.join().expect("server join");
        assert_eq!(result.signature_status, "signed_xades");
        assert_eq!(result.signature_mode, SIGNATURE_MODE_REAL_XADES);
        assert_eq!(result.certificate_source, Some("pkcs12".to_string()));
        assert!(result.sidecar_call_performed);
        assert!(!result.external_call_performed);
        assert!(Path::new(&result.xml_path).exists());
        assert_eq!(result.xml_sha256.len(), 64);

        let _ = fs::remove_file(source_path);
        let _ = fs::remove_file(result.xml_path);
    }

    #[test]
    fn sign_exact_xml_blocks_without_flag_or_secret_before_network() {
        let signed_path = std::env::temp_dir().join(format!(
            "cumplefactura-xades-signed-{}.xml",
            uuid::Uuid::new_v4()
        ));
        let req = sign_request(
            "http://127.0.0.1:9/verifactu/sign-xml".to_string(),
            signed_path.to_str().expect("utf8").to_string(),
        );
        let source_path = req.xml_path.clone();

        let err = sign_exact_xml_with_config(req, false, "").expect_err("blocked");

        assert_eq!(err, "sidecar shared secret is required");
        let _ = fs::remove_file(source_path);
    }

    #[test]
    fn sign_exact_xml_rejects_mock_signature_mode() {
        let (url, rx, handle) = fake_sidecar("mock_xades_contract");
        let signed_path = std::env::temp_dir().join(format!(
            "cumplefactura-xades-signed-{}.xml",
            uuid::Uuid::new_v4()
        ));
        let req = sign_request(url, signed_path.to_str().expect("utf8").to_string());
        let source_path = req.xml_path.clone();

        let err = sign_exact_xml_with_config(req, true, "test-secret").expect_err("mock rejected");

        assert!(rx.recv().expect("signature check"));
        handle.join().expect("server join");
        assert_eq!(err, "sidecar_returned_non_real_signature_mode");
        assert!(!signed_path.exists());
        let _ = fs::remove_file(source_path);
    }
}
