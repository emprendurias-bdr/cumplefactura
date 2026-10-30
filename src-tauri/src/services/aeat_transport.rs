//! Preflight de transporte AEAT VERI*FACTU (fail-closed).
//!
//! Comprueba XML, SHA-256, estado de firma y endpoint permitido. Por defecto **no** realiza
//! llamada externa; solo reporta blockers. Flag `CUMPLEFACTURA_ENABLE_REAL_AEAT_TRANSPORT=1`
//! no implica SOAP real aquí: este módulo sigue siendo preflight de evidencia local.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::Path;

const ENABLE_REAL_TRANSPORT_ENV: &str = "CUMPLEFACTURA_ENABLE_REAL_AEAT_TRANSPORT";
const DEFAULT_TEST_ENDPOINT: &str =
    "https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP";

const ALLOWED_ENDPOINTS: [(&str, &str); 4] = [
    (
        "SistemaVerifactu",
        "https://www1.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP",
    ),
    (
        "SistemaVerifactuSello",
        "https://www10.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP",
    ),
    (
        "SistemaVerifactuPruebas",
        "https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP",
    ),
    (
        "SistemaVerifactuSelloPruebas",
        "https://prewww10.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP",
    ),
];

/// Datos del paquete firmado/a enviar que el preflight debe verificar.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AeatTransportPreflightRequest {
    pub invoice_id: String,
    pub export_id: String,
    pub xml_path: String,
    pub xml_sha256: String,
    pub signature_status: String,
    pub endpoint_url: Option<String>,
}

/// Resultado del preflight: ready/blockers, endpoint resuelto, sin llamada AEAT en MVP.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AeatTransportPreflight {
    pub ready: bool,
    pub status: String,
    pub invoice_id: String,
    pub export_id: String,
    pub endpoint_name: String,
    pub endpoint_url: String,
    pub xml_sha256: String,
    pub xml_bytes: u64,
    pub external_call_performed: bool,
    pub blockers: Vec<String>,
    pub warnings: Vec<String>,
    pub source_refs: Vec<String>,
}

/// Preflight leyendo el flag de entorno real-transport.
pub fn preflight(request: AeatTransportPreflightRequest) -> Result<AeatTransportPreflight, String> {
    let enabled = std::env::var(ENABLE_REAL_TRANSPORT_ENV).unwrap_or_default() == "1";
    preflight_with_flag(request, enabled)
}

/// Misma lógica inyectando el flag (tests / evidencia sin tocar env).
pub fn preflight_with_flag(
    request: AeatTransportPreflightRequest,
    real_transport_enabled: bool,
) -> Result<AeatTransportPreflight, String> {
    require("invoice_id", &request.invoice_id)?;
    require("export_id", &request.export_id)?;
    require("xml_path", &request.xml_path)?;
    require("xml_sha256", &request.xml_sha256)?;
    require("signature_status", &request.signature_status)?;

    let xml_path = Path::new(&request.xml_path);
    let metadata =
        fs::metadata(xml_path).map_err(|err| format!("AEAT XML metadata error: {err}"))?;
    if !metadata.is_file() {
        return Err("AEAT XML path is not a file".to_string());
    }
    let actual_sha256 = sha256_file(xml_path)?;
    let expected_sha256 = request.xml_sha256.trim().to_uppercase();
    let endpoint_url = request
        .endpoint_url
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_TEST_ENDPOINT.to_string());
    let endpoint_name = allowed_endpoint_name(&endpoint_url);

    let mut blockers = Vec::new();
    if actual_sha256 != expected_sha256 {
        blockers.push("xml_sha256_mismatch".to_string());
    }
    if endpoint_name.is_none() {
        blockers.push("endpoint_not_in_local_aeat_wsdl_allowlist".to_string());
    }
    if request.signature_status != "signed_xades" {
        blockers.push("requires_signed_xades".to_string());
    }
    if !real_transport_enabled {
        blockers.push(format!("{ENABLE_REAL_TRANSPORT_ENV}_not_enabled"));
    }

    let ready = blockers.is_empty();
    Ok(AeatTransportPreflight {
        ready,
        status: if ready { "ready" } else { "blocked" }.to_string(),
        invoice_id: request.invoice_id,
        export_id: request.export_id,
        endpoint_name: endpoint_name.unwrap_or("unknown").to_string(),
        endpoint_url,
        xml_sha256: actual_sha256,
        xml_bytes: metadata.len(),
        external_call_performed: false,
        blockers,
        warnings: vec![
            "Preflight only; no SOAP request has been sent to AEAT.".to_string(),
            "Real transport requires certificate-backed XAdES and explicit runtime flag.".to_string(),
        ],
        source_refs: vec![
            "C:\\03 LEGISLACION\\AEAT\\FACTURACION Y SIF\\05 DOCUMENTACION TECNICA AEAT\\01 VERIFACTU\\SistemaFacturacion VERI-FACTU.wsdl".to_string(),
            "WSDL service sfVerifactu / port SistemaVerifactu* / operation RegFactuSistemaFacturacion".to_string(),
        ],
    })
}

/// Resuelve URL → nombre canónico AEAT (prod/pruebas, sello o no).
fn allowed_endpoint_name(endpoint_url: &str) -> Option<&'static str> {
    ALLOWED_ENDPOINTS
        .iter()
        .find(|(_, allowed_url)| *allowed_url == endpoint_url)
        .map(|(name, _)| *name)
}

fn sha256_file(path: &Path) -> Result<String, String> {
    let bytes = fs::read(path).map_err(|err| format!("AEAT XML read error: {err}"))?;
    Ok(hex::encode(Sha256::digest(&bytes)).to_uppercase())
}

/// Rechaza campos vacíos/whitespace (contrato de entrada del preflight).
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

    fn write_xml() -> (String, String) {
        let target = std::env::temp_dir().join(format!(
            "cumplefactura-aeat-transport-{}.xml",
            uuid::Uuid::new_v4()
        ));
        fs::write(&target, b"<xml/>").expect("write xml");
        let sha = sha256_file(&target).expect("sha");
        (target.to_str().expect("utf8").to_string(), sha)
    }

    fn request(signature_status: &str) -> AeatTransportPreflightRequest {
        let (xml_path, xml_sha256) = write_xml();
        AeatTransportPreflightRequest {
            invoice_id: "invoice-1".to_string(),
            export_id: "export-1".to_string(),
            xml_path,
            xml_sha256,
            signature_status: signature_status.to_string(),
            endpoint_url: None,
        }
    }

    #[test]
    fn blocks_when_transport_flag_or_xades_are_missing() {
        let req = request("pending_xades");
        let xml_path = req.xml_path.clone();

        let result = preflight_with_flag(req, false).expect("preflight");
        let _ = fs::remove_file(xml_path);

        assert!(!result.ready);
        assert_eq!(result.status, "blocked");
        assert!(!result.external_call_performed);
        assert!(result
            .blockers
            .contains(&"requires_signed_xades".to_string()));
        assert!(result
            .blockers
            .contains(&format!("{ENABLE_REAL_TRANSPORT_ENV}_not_enabled")));
    }

    #[test]
    fn becomes_ready_for_allowed_endpoint_when_signed_and_enabled() {
        let req = request("signed_xades");
        let xml_path = req.xml_path.clone();

        let result = preflight_with_flag(req, true).expect("preflight");
        let _ = fs::remove_file(xml_path);

        assert!(result.ready);
        assert_eq!(result.endpoint_name, "SistemaVerifactuPruebas");
        assert_eq!(result.endpoint_url, DEFAULT_TEST_ENDPOINT);
        assert!(!result.external_call_performed);
        assert!(result.blockers.is_empty());
    }

    #[test]
    fn blocks_unknown_endpoint_and_hash_mismatch() {
        let mut req = request("signed_xades");
        let xml_path = req.xml_path.clone();
        req.endpoint_url = Some("https://example.com/not-aeat".to_string());
        req.xml_sha256 = "0".repeat(64);

        let result = preflight_with_flag(req, true).expect("preflight");
        let _ = fs::remove_file(xml_path);

        assert!(!result.ready);
        assert!(result.blockers.contains(&"xml_sha256_mismatch".to_string()));
        assert!(result
            .blockers
            .contains(&"endpoint_not_in_local_aeat_wsdl_allowlist".to_string()));
    }
}
