//! IPC documentos comerciales: presupuestos, proformas y albaranes (sin valor fiscal).
//!
//! Delegan en `db::commercial_documents` y `services::pdf`. Nunca numeran facturas ni escriben
//! registros fiscales: convertir solo crea un borrador de factura, que se emite con `invoice_issue`.

use crate::db::{
    self, AppState, CommercialDocument, CommercialDocumentInput, CommercialDocumentListFilters,
    CommercialDocumentPage, CommercialSeriesConfig, CommercialSeriesConfigInput, ListPagination,
};
use crate::domain::invoice::Invoice;
use crate::domain::require;
use crate::services::pdf;
use serde::Serialize;
use tauri::State;

#[derive(Debug, Serialize)]
pub struct CommercialDocumentPdf {
    pub target_path: String,
    pub sha256: String,
}

#[tauri::command]
pub fn commercial_document_list(
    state: State<'_, AppState>,
    filters: CommercialDocumentListFilters,
    pagination: Option<ListPagination>,
) -> Result<CommercialDocumentPage, String> {
    let conn = state.lock()?;
    db::list_commercial_documents(&conn, filters, pagination.unwrap_or_default())
}

#[tauri::command]
pub fn commercial_document_get(
    state: State<'_, AppState>,
    id: String,
) -> Result<CommercialDocument, String> {
    let conn = state.lock()?;
    db::get_commercial_document(&conn, &id)
}

#[tauri::command]
pub fn commercial_document_save_draft(
    state: State<'_, AppState>,
    input: CommercialDocumentInput,
) -> Result<CommercialDocument, String> {
    let mut conn = state.lock()?;
    db::save_commercial_draft(&mut conn, input)
}

#[tauri::command]
pub fn commercial_document_delete_draft(
    state: State<'_, AppState>,
    id: String,
) -> Result<serde_json::Value, String> {
    let mut conn = state.lock()?;
    db::delete_commercial_draft(&mut conn, &id)?;
    Ok(serde_json::json!({}))
}

/// Asigna número (`commercial_sequences`) y pasa a `sent` o, si es albarán, a `delivered`.
#[tauri::command]
pub fn commercial_document_send(
    state: State<'_, AppState>,
    id: String,
) -> Result<CommercialDocument, String> {
    let mut conn = state.lock()?;
    db::send_commercial_document(&mut conn, &id)
}

/// `void` exige `reason`; una transición fuera de la tabla devuelve `transition_not_allowed:<de>→<a>`.
#[tauri::command]
pub fn commercial_document_set_status(
    state: State<'_, AppState>,
    id: String,
    status: String,
    reason: Option<String>,
) -> Result<CommercialDocument, String> {
    let mut conn = state.lock()?;
    db::set_commercial_status(&mut conn, &id, &status, reason.as_deref())
}

#[tauri::command]
pub fn commercial_document_derive(
    state: State<'_, AppState>,
    id: String,
    target_kind: String,
) -> Result<CommercialDocument, String> {
    let mut conn = state.lock()?;
    db::derive_commercial_document(&mut conn, &id, &target_kind)
}

/// Borrador de factura (misma forma que `invoice_draft_create`); no emite nada.
#[tauri::command]
pub fn commercial_document_to_invoice_draft(
    state: State<'_, AppState>,
    ids: Vec<String>,
) -> Result<Invoice, String> {
    let mut conn = state.lock()?;
    db::commercial_documents_to_invoice_draft(&mut conn, &ids)
}

#[tauri::command]
pub fn commercial_document_pdf(
    state: State<'_, AppState>,
    id: String,
    target_path: String,
) -> Result<CommercialDocumentPdf, String> {
    require("target_path", &target_path)?;
    let conn = state.lock()?;
    let data = db::commercial_document_pdf_data(&conn, &id)?;
    let sha256 = pdf::write_commercial_document_pdf(&target_path, &data)
        .map_err(|err| format!("io_error:{err}"))?;
    Ok(CommercialDocumentPdf {
        target_path,
        sha256,
    })
}

/// Series de presupuesto, proforma y albarán de la empresa (guardadas o por defecto P/PF/AL).
#[tauri::command]
pub fn commercial_series_list(
    state: State<'_, AppState>,
    company_id: String,
) -> Result<Vec<CommercialSeriesConfig>, String> {
    require("company_id", &company_id)?;
    let conn = state.lock()?;
    db::list_commercial_series(&conn, &company_id)
}

/// Cambia el código/relleno de un tipo; no renumera documentos ya numerados.
#[tauri::command]
pub fn commercial_series_configure(
    state: State<'_, AppState>,
    input: CommercialSeriesConfigInput,
) -> Result<CommercialSeriesConfig, String> {
    let mut conn = state.lock()?;
    db::configure_commercial_series(&mut conn, input)
}
