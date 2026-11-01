//! Modelos de entrada y salida del preflight e invoke del sidecar VERI*FACTU.
//!
//! Se mantienen separados de la lógica de transporte para que los contratos
//! serializados sean fáciles de localizar y revisar.

use serde::{Deserialize, Serialize};

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
