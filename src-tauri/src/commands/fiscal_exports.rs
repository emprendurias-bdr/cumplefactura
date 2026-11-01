//! Comandos IPC para copias de seguridad, exportaciones y consultas de auditoría.
//!
//! Esta capa valida las entradas, obtiene los datos desde SQLite y delega la
//! escritura o verificación en los servicios correspondientes.

use super::*;

/// Crea una copia de seguridad SQLite en la ruta indicada.
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

/// Valida una copia SQLite sin sustituir la base de datos activa.
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

/// Exporta los datos de una factura en formato JSON.
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

/// Exporta las facturas en formato CSV.
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

/// Exporta la evidencia de auditoría y de la cadena fiscal en formato JSON.
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

/// Devuelve los eventos de auditoría con paginación opcional.
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

/// Devuelve los registros fiscales con paginación opcional.
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

/// Verifica la integridad de la cadena de huellas fiscales persistida.
#[tauri::command]
pub fn fiscal_chain_verify(state: State<'_, AppState>) -> Result<FiscalChainVerification, String> {
    let conn = state
        .conn
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;
    fiscal_chain::verify(&conn)
}
