//! IPC fiscal/local: exports, XML VERI\*FACTU, cadena, backup y fronteras sidecar.
//!
//! Orquesta `services::*`; restore es preflight-only (sin replace destructivo en MVP).

use super::fiscal_assets::resolve_verifactu_xsd_assets;
use crate::db::{
    self, AppState, AuditSummary, FiscalRecordSummary, ListPagination, PreviousInvoiceLink,
};
use crate::domain::invoice::FiscalPayload;
use crate::services::aeat_transport::{
    self, AeatTransportPreflight, AeatTransportPreflightRequest,
};
use crate::services::audit::AuditEvent;
use crate::services::export;
use crate::services::fiscal_chain::{self, FiscalChainVerification};
use crate::services::rectification_advisor::{self, RectificationAdvice, RectificationAdviceInput};
use crate::services::sidecar_channels::{
    self, ImportedSidecarCapabilities, SiiSidecarPreflight, SiiSidecarPreflightRequest,
    TicketBaiSidecarPreflight, TicketBaiSidecarPreflightRequest,
};
use crate::services::submission::{self, SubmissionPreparation};
use crate::services::verifactu;
use crate::services::verifactu_submit_sidecar::{
    self, VerifactuSubmitSidecarInvocation, VerifactuSubmitSidecarInvokeRequest,
    VerifactuSubmitSidecarPreflight, VerifactuSubmitSidecarPreflightRequest,
};
use crate::services::xades_sidecar::{
    self, XadesSidecarPreflight, XadesSidecarPreflightRequest, XadesSidecarSignRequest,
    XadesSidecarSignature,
};
use chrono::{SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use tauri::{AppHandle, State};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupResult {
    pub target_path: String,
    pub status: String,
    pub notes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerifactuXmlResult {
    pub target_path: String,
    pub status: String,
    pub xsd_validated: bool,
    pub notes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupRestoreResult {
    pub source_path: String,
    pub status: String,
    pub destructive_restore_performed: bool,
    pub notes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportResult {
    pub target_path: String,
    pub status: String,
    pub notes: Vec<String>,
}

#[path = "fiscal_exports.rs"]
mod fiscal_exports;
#[path = "fiscal_sidecars.rs"]
mod fiscal_sidecars;
#[path = "fiscal_verifactu.rs"]
mod fiscal_verifactu;

pub use fiscal_exports::*;
pub use fiscal_sidecars::*;
pub use fiscal_verifactu::*;
