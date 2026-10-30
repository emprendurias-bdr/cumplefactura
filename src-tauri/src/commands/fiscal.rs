//! IPC fiscal/local: exports, XML VERI\*FACTU, cadena, backup y fronteras sidecar.
//!
//! Orquesta `services::*`; restore es preflight-only (sin replace destructivo en MVP).

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
use crate::services::xades_sidecar::{self, XadesSidecarPreflight, XadesSidecarPreflightRequest};
use crate::services::xades_sidecar::{XadesSidecarSignRequest, XadesSidecarSignature};
use chrono::{SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use tauri::{AppHandle, Manager, State};

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

/// Placeholder de payload VERI\*FACTU (pre-MVP; sin transporte).
#[tauri::command]
pub fn fiscal_prepare_verifactu(invoice_id: String) -> Result<FiscalPayload, String> {
    if invoice_id.trim().is_empty() {
        return Err("invoice_id is required".to_string());
    }

    Ok(FiscalPayload {
        invoice_id,
        provider: "verifactu-placeholder".to_string(),
        environment: "local-dev".to_string(),
        payload_version: "pre-mvp".to_string(),
        transmission_required: false,
        notes: vec![
            "Payload contract only; no real AEAT submission yet.".to_string(),
            "Validate against local XSD before enabling transmission.".to_string(),
        ],
    })
}

/// Import local ContaPro: canales mvp vs diferidos.
#[tauri::command]
pub fn fiscal_sidecar_capabilities_get() -> Result<ImportedSidecarCapabilities, String> {
    Ok(sidecar_channels::imported_sidecar_capabilities())
}

#[tauri::command]
pub fn sii_submit_sidecar_preflight(
    input: SiiSidecarPreflightRequest,
) -> Result<SiiSidecarPreflight, String> {
    sidecar_channels::sii_preflight(input)
}

#[tauri::command]
pub fn ticketbai_submit_sidecar_preflight(
    input: TicketBaiSidecarPreflightRequest,
) -> Result<TicketBaiSidecarPreflight, String> {
    sidecar_channels::ticketbai_preflight(input)
}

/// Asistente técnico R1–R5 / S|I (no decide causa jurídica).
#[tauri::command]
pub fn rectification_advice(
    input: RectificationAdviceInput,
) -> Result<RectificationAdvice, String> {
    Ok(rectification_advisor::advise(input))
}

/// Copia de seguridad SQLite a path nuevo.
#[tauri::command]
pub fn backup_export(
    state: State<'_, AppState>,
    target_path: String,
) -> Result<BackupResult, String> {
    if target_path.trim().is_empty() {
        return Err("target_path is required".to_string());
    }

    let conn = state
        .conn
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;
    db::backup_database(&conn, &target_path)?;

    Ok(BackupResult {
        target_path,
        status: "created".to_string(),
        notes: vec!["SQLite backup created with VACUUM INTO.".to_string()],
    })
}

/// Preflight restore: valida origen; no reemplaza la BD en MVP.
#[tauri::command]
pub fn backup_restore(source_path: String) -> Result<BackupRestoreResult, String> {
    if source_path.trim().is_empty() {
        return Err("source_path is required".to_string());
    }
    export::validate_restore_source(&source_path)?;
    Ok(BackupRestoreResult {
        source_path,
        status: "validated-only".to_string(),
        destructive_restore_performed: false,
        notes: vec![
            "Restore is intentionally preflight-only in this MVP to avoid replacing the active fiscal database without an explicit offline recovery flow.".to_string(),
            "Close the app and use a documented recovery procedure before destructive restore.".to_string(),
        ],
    })
}

#[tauri::command]
pub fn invoice_export_json(
    state: State<'_, AppState>,
    invoice_id: String,
    target_path: String,
) -> Result<ExportResult, String> {
    if invoice_id.trim().is_empty() {
        return Err("invoice_id is required".to_string());
    }
    if target_path.trim().is_empty() {
        return Err("target_path is required".to_string());
    }
    let conn = state
        .conn
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;
    let invoice = db::invoice_pdf_data(&conn, &invoice_id)?;
    export::write_invoice_json(&target_path, &invoice)?;
    Ok(ExportResult {
        target_path,
        status: "created".to_string(),
        notes: vec!["Invoice JSON export created locally.".to_string()],
    })
}

#[tauri::command]
pub fn invoice_export_csv(
    state: State<'_, AppState>,
    filters: Option<serde_json::Value>,
    target_path: String,
) -> Result<ExportResult, String> {
    if target_path.trim().is_empty() {
        return Err("target_path is required".to_string());
    }
    let conn = state
        .conn
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;
    let invoices = db::list_invoices(&conn)?;
    export::write_invoice_csv(&target_path, &invoices)?;
    Ok(ExportResult {
        target_path,
        status: "created".to_string(),
        notes: vec![
            "Invoice CSV export created locally.".to_string(),
            if filters.is_some() {
                "Filters accepted for contract compatibility; MVP export still includes all invoices.".to_string()
            } else {
                "No filters supplied; all invoices exported.".to_string()
            },
        ],
    })
}

#[tauri::command]
pub fn fiscal_audit_export(
    state: State<'_, AppState>,
    filters: Option<serde_json::Value>,
    target_path: String,
) -> Result<ExportResult, String> {
    if target_path.trim().is_empty() {
        return Err("target_path is required".to_string());
    }
    let conn = state
        .conn
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;
    export::write_fiscal_audit_json(
        &target_path,
        db::list_invoices(&conn)?,
        db::list_audit_events(&conn)?,
        db::list_fiscal_records(&conn)?,
        fiscal_chain::verify(&conn)?,
    )?;
    Ok(ExportResult {
        target_path,
        status: "created".to_string(),
        notes: vec![
            "Fiscal audit export created locally.".to_string(),
            if filters.is_some() {
                "Filters accepted for contract compatibility; MVP audit export still includes all records.".to_string()
            } else {
                "No filters supplied; all audit records exported.".to_string()
            },
            "This is traceability evidence, not certification.".to_string(),
        ],
    })
}

#[tauri::command]
pub fn verifactu_xml_draft_export(
    app: AppHandle,
    state: State<'_, AppState>,
    invoice_id: String,
    target_path: String,
) -> Result<VerifactuXmlResult, String> {
    if invoice_id.trim().is_empty() {
        return Err("invoice_id is required".to_string());
    }
    if target_path.trim().is_empty() {
        return Err("target_path is required".to_string());
    }

    let conn = state
        .conn
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;
    let invoice = db::invoice_pdf_data(&conn, &invoice_id)?;
    let previous = match db::previous_fiscal_record_link_for_invoice(&conn, &invoice_id, "Alta")? {
        Some(link) => Some(link),
        None => db::previous_issued_invoice_link(&conn, &invoice_id)?,
    };
    let has_previous = previous.is_some();
    let assets = resolve_verifactu_xsd_assets(&app)?;
    verifactu::write_verifactu_xml_draft_validated(
        &target_path,
        &invoice,
        previous.as_ref(),
        &assets,
    )?;

    Ok(VerifactuXmlResult {
        target_path,
        status: "draft-created-xsd-valid".to_string(),
        xsd_validated: true,
        notes: vec![
            "XML alta generated and validated against local AEAT XSD; not signed or submitted."
                .to_string(),
            "XSD validation is structural, not full fiscal/legal compliance.".to_string(),
            if has_previous {
                "Includes provisional RegistroAnterior."
            } else {
                "Marked as provisional PrimerRegistro."
            }
            .to_string(),
        ],
    })
}

#[tauri::command]
pub fn verifactu_xml_anulacion_draft_export(
    app: AppHandle,
    state: State<'_, AppState>,
    invoice_id: String,
    target_path: String,
) -> Result<VerifactuXmlResult, String> {
    if invoice_id.trim().is_empty() {
        return Err("invoice_id is required".to_string());
    }
    if target_path.trim().is_empty() {
        return Err("target_path is required".to_string());
    }

    let mut conn = state
        .conn
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;
    let invoice = db::invoice_pdf_data(&conn, &invoice_id)?;
    if invoice.status != "Issued" {
        return Err("anulacion requires invoice status Issued".to_string());
    }
    if invoice.fiscal_hash.is_none() {
        return Err("anulacion requires an issued invoice fiscal_hash".to_string());
    }
    let generated_at = Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true);
    let previous = match db::latest_fiscal_record_link_for_company(&conn, &invoice.company_id)? {
        Some(link) => link,
        None => invoice_self_link(&invoice)?,
    };
    let cancellation_hash = verifactu::calculate_invoice_registro_anulacion_hash(
        &invoice,
        &previous.fiscal_hash,
        &generated_at,
    )?;
    let assets = resolve_verifactu_xsd_assets(&app)?;
    verifactu::write_verifactu_anulacion_xml_draft_validated(
        &target_path,
        &invoice,
        &previous,
        &generated_at,
        &assets,
    )?;
    let previous_audit_hash = db::latest_audit_hash(&conn)?;
    let audit_event = AuditEvent::invoice_voided(
        invoice.id.clone(),
        "local-user".to_string(),
        cancellation_hash.clone(),
        previous_audit_hash,
    );
    let audit_hash = audit_event.chain_hash();
    if let Err(err) = db::insert_anulacion_record(
        &mut conn,
        &invoice_id,
        &cancellation_hash,
        Some(&previous.fiscal_hash),
        &generated_at,
        &target_path,
        &audit_event,
        &audit_hash,
    ) {
        let _ = fs::remove_file(&target_path);
        return Err(err);
    }

    Ok(VerifactuXmlResult {
        target_path,
        status: "anulacion-created-xsd-valid-recorded".to_string(),
        xsd_validated: true,
        notes: vec![
            "XML anulacion generated, XSD-validated, recorded in fiscal chain, invoice marked Void."
                .to_string(),
            "Not signed or submitted to AEAT.".to_string(),
            "XSD validation is structural, not full fiscal/legal compliance.".to_string(),
        ],
    })
}

#[tauri::command]
pub fn audit_list(
    state: State<'_, AppState>,
    pagination: Option<ListPagination>,
) -> Result<Vec<AuditSummary>, String> {
    let conn = state
        .conn
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;
    db::list_audit_events_paginated(&conn, pagination.unwrap_or_default())
}

#[tauri::command]
pub fn fiscal_record_list(
    state: State<'_, AppState>,
    pagination: Option<ListPagination>,
) -> Result<Vec<FiscalRecordSummary>, String> {
    let conn = state
        .conn
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;
    db::list_fiscal_records_paginated(&conn, pagination.unwrap_or_default())
}

/// Verifica cadena de huellas fiscales en SQLite.
#[tauri::command]
pub fn fiscal_chain_verify(state: State<'_, AppState>) -> Result<FiscalChainVerification, String> {
    let conn = state
        .conn
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;
    fiscal_chain::verify(&conn)
}

#[tauri::command]
pub fn verifactu_submission_prepare(
    app: AppHandle,
    state: State<'_, AppState>,
    invoice_id: String,
    xml_path: String,
) -> Result<SubmissionPreparation, String> {
    if invoice_id.trim().is_empty() {
        return Err("invoice_id is required".to_string());
    }
    if xml_path.trim().is_empty() {
        return Err("xml_path is required".to_string());
    }

    let assets = resolve_verifactu_xsd_assets(&app)?;
    verifactu::validate_verifactu_xml_file(Path::new(&xml_path), &assets)?;

    let conn = state
        .conn
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;
    db::invoice_pdf_data(&conn, &invoice_id)?;
    let mut package = submission::prepare_unsigned_verifactu_package(
        invoice_id.clone(),
        "pending".to_string(),
        xml_path,
    )?;
    let export_id = db::insert_fiscal_export(
        &conn,
        &invoice_id,
        &package.provider,
        &package.environment,
        &package.payload_version,
        &package.xml_sha256,
        "prepared_for_signature",
    )?;
    package.export_id = export_id;
    Ok(package)
}

#[tauri::command]
pub fn verifactu_transport_preflight(
    app: AppHandle,
    state: State<'_, AppState>,
    input: AeatTransportPreflightRequest,
) -> Result<AeatTransportPreflight, String> {
    if input.invoice_id.trim().is_empty() {
        return Err("invoice_id is required".to_string());
    }
    if input.xml_path.trim().is_empty() {
        return Err("xml_path is required".to_string());
    }

    let assets = resolve_verifactu_xsd_assets(&app)?;
    verifactu::validate_verifactu_xml_file(Path::new(&input.xml_path), &assets)?;

    let conn = state
        .conn
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;
    db::invoice_pdf_data(&conn, &input.invoice_id)?;

    aeat_transport::preflight(input)
}

#[tauri::command]
pub fn verifactu_xades_sidecar_preflight(
    app: AppHandle,
    state: State<'_, AppState>,
    input: XadesSidecarPreflightRequest,
) -> Result<XadesSidecarPreflight, String> {
    if input.invoice_id.trim().is_empty() {
        return Err("invoice_id is required".to_string());
    }
    if input.xml_path.trim().is_empty() {
        return Err("xml_path is required".to_string());
    }

    let assets = resolve_verifactu_xsd_assets(&app)?;
    verifactu::validate_verifactu_xml_file(Path::new(&input.xml_path), &assets)?;

    let conn = state
        .conn
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;
    db::invoice_pdf_data(&conn, &input.invoice_id)?;

    xades_sidecar::preflight(input)
}

#[tauri::command]
pub fn verifactu_xades_sidecar_sign(
    app: AppHandle,
    state: State<'_, AppState>,
    input: XadesSidecarSignRequest,
) -> Result<XadesSidecarSignature, String> {
    if input.invoice_id.trim().is_empty() {
        return Err("invoice_id is required".to_string());
    }
    if input.xml_path.trim().is_empty() {
        return Err("xml_path is required".to_string());
    }
    if input.signed_xml_path.trim().is_empty() {
        return Err("signed_xml_path is required".to_string());
    }

    let assets = resolve_verifactu_xsd_assets(&app)?;
    verifactu::validate_verifactu_xml_file(Path::new(&input.xml_path), &assets)?;

    let conn = state
        .conn
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;
    db::invoice_pdf_data(&conn, &input.invoice_id)?;

    let mut signature = xades_sidecar::sign_exact_xml(input)?;
    let signed_export_id = db::insert_fiscal_export(
        &conn,
        &signature.invoice_id,
        &signature.provider,
        &signature.environment,
        &signature.payload_version,
        &signature.xml_sha256,
        "signed_xades",
    )?;
    signature.export_id = signed_export_id;
    Ok(signature)
}

#[tauri::command]
pub fn verifactu_submit_sidecar_preflight(
    app: AppHandle,
    state: State<'_, AppState>,
    input: VerifactuSubmitSidecarPreflightRequest,
) -> Result<VerifactuSubmitSidecarPreflight, String> {
    if input.invoice_id.trim().is_empty() {
        return Err("invoice_id is required".to_string());
    }
    if input.xml_path.trim().is_empty() {
        return Err("xml_path is required".to_string());
    }

    let assets = resolve_verifactu_xsd_assets(&app)?;
    verifactu::validate_verifactu_xml_file(Path::new(&input.xml_path), &assets)?;

    let conn = state
        .conn
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;
    db::invoice_pdf_data(&conn, &input.invoice_id)?;

    verifactu_submit_sidecar::preflight(input)
}

#[tauri::command]
pub fn verifactu_submit_sidecar_invoke(
    state: State<'_, AppState>,
    input: VerifactuSubmitSidecarInvokeRequest,
) -> Result<VerifactuSubmitSidecarInvocation, String> {
    if input.invoice_id.trim().is_empty() {
        return Err("invoice_id is required".to_string());
    }
    if input.xml_path.trim().is_empty() {
        return Err("xml_path is required".to_string());
    }

    let conn = state
        .conn
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;
    db::invoice_pdf_data(&conn, &input.invoice_id)?;

    let mut result = verifactu_submit_sidecar::invoke_submit(input)?;
    let submit_export_id = db::insert_fiscal_export(
        &conn,
        &result.invoice_id,
        &result.provider,
        &result.environment,
        &result.payload_version,
        &result.xml_sha256,
        "submitted_via_sidecar",
    )?;
    result.export_id = submit_export_id;
    Ok(result)
}

fn resolve_verifactu_xsd_assets(app: &AppHandle) -> Result<verifactu::VerifactuXsdAssets, String> {
    let mut errors = Vec::new();

    if let Ok(resource_dir) = app.path().resource_dir() {
        let candidates = [
            (
                resource_dir
                    .join("tools")
                    .join("validate-verifactu-xsd.ps1"),
                resource_dir.join("xsd").join("verifactu"),
            ),
            (
                resource_dir.join("validate-verifactu-xsd.ps1"),
                resource_dir.join("resources").join("xsd").join("verifactu"),
            ),
        ];

        for (script_path, schema_dir) in candidates {
            match verifactu::VerifactuXsdAssets::new(script_path, schema_dir) {
                Ok(assets) => return Ok(assets),
                Err(err) => errors.push(err),
            }
        }
    }

    match verifactu::dev_verifactu_xsd_assets() {
        Ok(assets) => Ok(assets),
        Err(err) => {
            errors.push(err);
            Err(format!(
                "cannot resolve VERI*FACTU XSD assets: {}",
                errors.join(" | ")
            ))
        }
    }
}

fn invoice_self_link(invoice: &db::InvoicePdfData) -> Result<PreviousInvoiceLink, String> {
    let number = invoice
        .number
        .ok_or_else(|| "issued invoice missing number".to_string())?;
    let issued_at = invoice
        .issued_at
        .clone()
        .ok_or_else(|| "issued invoice missing issued_at".to_string())?;
    let fiscal_hash = invoice
        .fiscal_hash
        .clone()
        .ok_or_else(|| "issued invoice missing fiscal_hash".to_string())?;

    Ok(PreviousInvoiceLink {
        company_tax_id: invoice.company_tax_id.clone(),
        series: invoice.series.clone(),
        number,
        issued_at,
        fiscal_hash,
    })
}
