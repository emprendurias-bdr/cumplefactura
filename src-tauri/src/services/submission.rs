//! Preparación de paquete VERI*FACTU sin firmar ni transmitir.
//!
//! Tras validar XSD, materializa metadatos (SHA-256, bytes, estados) para el flujo
//! submission → XAdES → transporte. No toca red ni certificados.

use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::Path;

/// Paquete local listo para firmar: XML + huella + estados pendientes.
#[derive(Debug, Clone, Serialize)]
pub struct SubmissionPreparation {
    pub invoice_id: String,
    pub export_id: String,
    pub provider: String,
    pub environment: String,
    pub payload_version: String,
    pub xml_path: String,
    pub xml_sha256: String,
    pub xml_bytes: u64,
    pub xsd_validated: bool,
    pub signature_status: String,
    pub transmission_status: String,
    pub notes: Vec<String>,
}

/// Lee el XML emitido, calcula SHA-256 y marca firma/transmisión como pendientes.
pub fn prepare_unsigned_verifactu_package(
    invoice_id: String,
    export_id: String,
    xml_path: String,
) -> Result<SubmissionPreparation, String> {
    let metadata =
        fs::metadata(&xml_path).map_err(|err| format!("VERI*FACTU XML metadata error: {err}"))?;
    if !metadata.is_file() {
        return Err("VERI*FACTU XML path is not a file".to_string());
    }

    let xml_sha256 = sha256_file(Path::new(&xml_path))?;

    Ok(SubmissionPreparation {
        invoice_id,
        export_id,
        provider: "AEAT-VERIFACTU".to_string(),
        environment: "local-dev".to_string(),
        payload_version: "verifactu-unsigned-v1".to_string(),
        xml_path,
        xml_sha256,
        xml_bytes: metadata.len(),
        xsd_validated: true,
        signature_status: "pending_xades".to_string(),
        transmission_status: "not_submitted".to_string(),
        notes: vec![
            "Package prepared from XSD-valid XML; not signed.".to_string(),
            "Requires certificate-backed XAdES before AEAT submission.".to_string(),
            "No network transmission has been performed.".to_string(),
        ],
    })
}

/// SHA-256 hex mayúsculas del fichero XML.
fn sha256_file(path: &Path) -> Result<String, String> {
    let bytes = fs::read(path).map_err(|err| format!("VERI*FACTU XML read error: {err}"))?;
    Ok(hex::encode(Sha256::digest(&bytes)).to_uppercase())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prepares_unsigned_package_with_sha256() {
        let target = std::env::temp_dir().join(format!(
            "cumplefactura-submission-{}.xml",
            uuid::Uuid::new_v4()
        ));
        fs::write(&target, b"<xml/>").expect("write xml");

        let package = prepare_unsigned_verifactu_package(
            "invoice-1".to_string(),
            "export-1".to_string(),
            target.to_str().expect("utf8").to_string(),
        )
        .expect("package");

        let _ = fs::remove_file(target);

        assert_eq!(package.provider, "AEAT-VERIFACTU");
        assert_eq!(package.payload_version, "verifactu-unsigned-v1");
        assert_eq!(package.signature_status, "pending_xades");
        assert_eq!(package.transmission_status, "not_submitted");
        assert_eq!(package.xml_bytes, 6);
        assert_eq!(package.xml_sha256.len(), 64);
    }
}
