//! IPC fiscal local: exportaciones, XML VERI*FACTU, cadena, copia de seguridad y envío.
//!
//! El envío a la AEAT pasa siempre por el sidecar (`services::sidecar_process`):
//! la app nunca abre certificados ni conexiones salientes. Toda respuesta del envío
//! se guarda (`verifactu_submission_list`); reenviar es siempre decisión del usuario.
//! `backup_restore` solo valida salvo con `confirm = true` (ver `db::backup`).

use crate::db::{
    self, AppState, AuditSummary, FiscalRecordSummary, ListPagination, PreviousInvoiceLink,
    VerifactuSubmissionSummary,
};
use crate::domain::require;
use crate::services::audit::AuditEvent;
use crate::services::export;
use crate::services::fiscal_chain::{self, FiscalChainVerification};
use crate::services::rectification_advisor::{self, RectificationAdvice, RectificationAdviceInput};
use crate::services::sidecar_process::{LaunchConfig, SidecarManager};
use crate::services::verifactu;
use crate::services::verifactu_submit::{self, SubmitInput, XmlExport};
use chrono::{SecondsFormat, Utc};
use fiscal_contract::messages::{InvokeSubmitResponse, SubmitPreflightResponse};
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
    /// Exportación registrada: su `export_id` y `xml_sha256` habilitan el envío.
    #[serde(flatten)]
    pub export: XmlExport,
    pub notes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupRestoreResult {
    pub source_path: String,
    /// `validated-only` · `restored` · `rolled_back`.
    pub status: String,
    pub destructive_restore_performed: bool,
    /// Copia de la base anterior, hecha antes de sustituirla.
    pub safety_backup_path: Option<String>,
    pub chain_ok: Option<bool>,
    pub notes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportResult {
    pub target_path: String,
    pub status: String,
    pub notes: Vec<String>,
}

/// Resultado del envío: respuesta AEAT interpretada y el identificador de la fila
/// guardada en `verifactu_submissions` (también si fue `transport_error`).
#[derive(Debug, Clone, Serialize)]
pub struct VerifactuSubmission {
    pub invoice_id: String,
    pub export_id: String,
    pub submission_id: String,
    #[serde(flatten)]
    pub aeat: InvokeSubmitResponse,
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
    require("target_path", &target_path)?;

    let conn = state.lock()?;
    db::backup_database(&conn, &target_path)?;

    Ok(BackupResult {
        target_path,
        status: "created".to_string(),
        notes: vec!["SQLite backup created with VACUUM INTO.".to_string()],
    })
}

/// Restaurar copia. Sin `confirm` (o `false`) solo valida; con `true` sustituye la
/// base activa con copia previa y vuelta atrás si la cadena fiscal no verifica.
#[tauri::command]
pub fn backup_restore(
    state: State<'_, AppState>,
    source_path: String,
    confirm: Option<bool>,
) -> Result<BackupRestoreResult, String> {
    require("source_path", &source_path)?;
    export::validate_restore_source(&source_path)?;
    db::validate_backup_file(Path::new(&source_path))?;
    if !confirm.unwrap_or(false) {
        return Ok(BackupRestoreResult {
            source_path,
            status: "validated-only".to_string(),
            destructive_restore_performed: false,
            safety_backup_path: None,
            chain_ok: None,
            notes: vec![
                "Copia válida. Confirma para sustituir la base actual (se guarda antes una copia previa).".to_string(),
            ],
        });
    }
    let mut conn = state.lock()?;
    let outcome = db::restore_database(&mut conn, Path::new(&source_path))?;
    Ok(BackupRestoreResult {
        source_path,
        status: outcome.status.to_string(),
        destructive_restore_performed: outcome.status == "restored",
        safety_backup_path: Some(outcome.safety_backup_path),
        chain_ok: outcome.chain_ok,
        notes: outcome.notes,
    })
}

#[tauri::command]
pub fn invoice_export_json(
    state: State<'_, AppState>,
    invoice_id: String,
    target_path: String,
) -> Result<ExportResult, String> {
    require("invoice_id", &invoice_id)?;
    require("target_path", &target_path)?;
    let conn = state.lock()?;
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
    require("target_path", &target_path)?;
    let conn = state.lock()?;
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
    require("target_path", &target_path)?;
    let conn = state.lock()?;
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
    require("invoice_id", &invoice_id)?;
    require("target_path", &target_path)?;

    let conn = state.lock()?;
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
    let export = verifactu_submit::record_xml_export(&conn, &invoice_id, &target_path)?;

    Ok(VerifactuXmlResult {
        target_path,
        status: "draft-created-xsd-valid".to_string(),
        xsd_validated: true,
        export,
        notes: vec![
            "XML alta generated and validated against local AEAT XSD; not submitted yet."
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
    require("invoice_id", &invoice_id)?;
    require("target_path", &target_path)?;

    let mut conn = state.lock()?;
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
    if let Err(err) = db::insert_anulacion_record(
        &mut conn,
        &invoice_id,
        &cancellation_hash,
        Some(&previous.fiscal_hash),
        &generated_at,
        &target_path,
        &audit_event,
    ) {
        let _ = fs::remove_file(&target_path);
        return Err(err);
    }
    let export = verifactu_submit::record_xml_export(&conn, &invoice_id, &target_path)?;

    Ok(VerifactuXmlResult {
        target_path,
        status: "anulacion-created-xsd-valid-recorded".to_string(),
        xsd_validated: true,
        export,
        notes: vec![
            "XML anulacion generated, XSD-validated, recorded in fiscal chain, invoice marked Void."
                .to_string(),
            "Not submitted to AEAT yet.".to_string(),
            "XSD validation is structural, not full fiscal/legal compliance.".to_string(),
        ],
    })
}

#[tauri::command]
pub fn audit_list(
    state: State<'_, AppState>,
    pagination: Option<ListPagination>,
) -> Result<Vec<AuditSummary>, String> {
    let conn = state.lock()?;
    db::list_audit_events_paginated(&conn, pagination.unwrap_or_default())
}

#[tauri::command]
pub fn fiscal_record_list(
    state: State<'_, AppState>,
    pagination: Option<ListPagination>,
) -> Result<Vec<FiscalRecordSummary>, String> {
    let conn = state.lock()?;
    db::list_fiscal_records_paginated(&conn, pagination.unwrap_or_default())
}

/// Verifica cadena de huellas fiscales en SQLite.
#[tauri::command]
pub fn fiscal_chain_verify(state: State<'_, AppState>) -> Result<FiscalChainVerification, String> {
    let conn = state.lock()?;
    fiscal_chain::verify(&conn)
}

/// Comprueba con el sidecar si el XML exportado se podría enviar ahora.
/// No llama a la AEAT.
#[tauri::command]
pub fn verifactu_submit_preflight(
    app: AppHandle,
    state: State<'_, AppState>,
    sidecar: State<'_, SidecarManager>,
    mut input: SubmitInput,
) -> Result<SubmitPreflightResponse, String> {
    let (_, endpoint_name) = checked_submission(&state, &mut input)?;
    let client = sidecar.client(|| LaunchConfig::resolve(&app))?;
    verifactu_submit::preflight(&client, &input, &endpoint_name)
}

/// Envía el XML exportado a la AEAT a través del sidecar y guarda la respuesta.
/// Un `transport_error` previo no bloquea: el usuario puede reintentar a mano.
#[tauri::command]
pub fn verifactu_submit(
    app: AppHandle,
    state: State<'_, AppState>,
    sidecar: State<'_, SidecarManager>,
    mut input: SubmitInput,
) -> Result<VerifactuSubmission, String> {
    let (xml, endpoint_name) = checked_submission(&state, &mut input)?;
    {
        let conn = state.lock()?;
        verifactu_submit::check_wait_time(&conn, &input.invoice_id, &endpoint_name, Utc::now())?;
    }
    let client = sidecar.client(|| LaunchConfig::resolve(&app))?;
    // Sin bloqueo de base de datos durante la llamada a la AEAT (hasta 30 s).
    let aeat = verifactu_submit::submit(&client, &input, xml, &endpoint_name)?;
    let conn = state.lock()?;
    let submission_id = db::insert_verifactu_submission(
        &conn,
        db::VerifactuSubmissionRecord {
            invoice_id: &input.invoice_id,
            fiscal_export_id: &input.export_id,
            response: &aeat,
        },
    )?;
    Ok(VerifactuSubmission {
        invoice_id: input.invoice_id,
        export_id: input.export_id,
        submission_id,
        aeat,
    })
}

/// Respuestas de la AEAT guardadas, de la más reciente a la más antigua.
#[tauri::command]
pub fn verifactu_submission_list(
    state: State<'_, AppState>,
    invoice_id: Option<String>,
) -> Result<Vec<VerifactuSubmissionSummary>, String> {
    let conn = state.lock()?;
    db::list_verifactu_submissions(&conn, invoice_id.as_deref())
}

/// Comprobaciones comunes a preflight y envío. Devuelve el XML y el endpoint configurado.
/// En modo `env` descarta la contraseña que llegue de la interfaz: manda el entorno del sidecar.
fn checked_submission(
    state: &AppState,
    input: &mut SubmitInput,
) -> Result<(String, String), String> {
    let xml = verifactu_submit::read_checked_xml(input)?;
    let conn = state.lock()?;
    if !db::fiscal_export_matches(
        &conn,
        &input.export_id,
        &input.invoice_id,
        &input.xml_sha256,
    )? {
        return Err("export_not_found: exporta de nuevo el XML de esta factura".to_string());
    }
    if db::verifactu_xml_already_accepted(&conn, &input.xml_sha256)? {
        return Err("xml_already_accepted_by_aeat".to_string());
    }
    let settings = db::get_app_settings(&conn)?;
    if !settings.sends_certificate_password() {
        input.certificate_password = None;
    }
    Ok((xml, settings.verifactu_endpoint_name))
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
