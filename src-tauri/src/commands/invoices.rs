//! IPC facturas: borrador, emisión (nº + huella en Rust), listado, ficha, PDF.
//!
//! Editar un borrador (`invoice_draft_update`) nunca toca facturas emitidas (`not_draft`).
//! La emisión se bloquea con `price_pending_lines:<n>` mientras haya líneas sin precio (D8).

use crate::db::{
    self, AppState, InvoiceDetail, InvoiceListFilters, InvoiceSummary, ListPagination,
};
use crate::domain::company::format_invoice_number;
use crate::domain::invoice::{Invoice, InvoiceDraftInput, InvoiceIssueInput, IssuedInvoice};
use crate::domain::require;
use crate::services::pdf;
use crate::services::qr::QrEnvironment;
use crate::services::verifactu;
use tauri::State;

/// Preview del siguiente número (UI); la reserva real ocurre en `invoice_issue`.
#[derive(Debug, serde::Serialize)]
pub struct NextNumberPreview {
    pub company_id: String,
    pub fiscal_year: i32,
    pub series: String,
    pub next_number: i64,
    /// `NumSerieFactura` que llevará la factura si se emite ahora (mismo formato que XML y PDF).
    pub preview: String,
    pub source: String,
}

/// Persiste borrador; no asigna número fiscal definitivo.
#[tauri::command]
pub fn invoice_draft_create(
    state: State<'_, AppState>,
    input: InvoiceDraftInput,
) -> Result<Invoice, String> {
    let invoice = Invoice::draft(input)?;
    let mut conn = state.lock()?;
    db::insert_invoice_draft(&mut conn, &invoice)?;
    Ok(invoice)
}

/// Reescribe un borrador (cabecera, líneas, observaciones). Solo `Draft`.
#[tauri::command]
pub fn invoice_draft_update(
    state: State<'_, AppState>,
    id: String,
    input: InvoiceDraftInput,
) -> Result<Invoice, String> {
    require("id", &id)?;
    let mut conn = state.lock()?;
    db::update_invoice_draft(&mut conn, &id, input)
}

/// Ficha completa (borrador o emitida) con la forma de `Invoice` + campos operativos.
#[tauri::command]
pub fn invoice_get(
    state: State<'_, AppState>,
    invoice_id: String,
) -> Result<InvoiceDetail, String> {
    require("invoice_id", &invoice_id)?;
    let conn = state.lock()?;
    db::get_invoice_detail(&conn, &invoice_id)
}

/// Emite en una sola transacción (`db::issue_invoice`): número, huella, alta, registro fiscal y
/// auditoría. `FechaHoraHusoGenRegistro` sale del reloj del sistema, no de `issued_at`.
/// `draft_id` (opcional): borrador que se emite. Se borra en la misma transacción y sus albaranes
/// y periodos recurrentes pasan a la factura emitida.
#[tauri::command]
pub fn invoice_issue(
    state: State<'_, AppState>,
    input: InvoiceIssueInput,
    draft_id: Option<String>,
) -> Result<IssuedInvoice, String> {
    let mut conn = state.lock()?;
    if let Some(draft_id) = draft_id.as_deref() {
        db::check_commercial_links_for_issue(&conn, draft_id, &input.draft.customer_id)?;
    }
    db::check_price_pending_for_issue(&conn, draft_id.as_deref(), &input.draft)?;
    require("actor", &input.actor)?;
    require("issued_at", &input.issued_at)?;
    db::issue_invoice(
        &mut conn,
        input,
        draft_id.as_deref(),
        &verifactu::generated_at_now(),
    )
}

/// Consulta el próximo número sin consumir la secuencia.
#[tauri::command]
pub fn invoice_next_number_preview(
    state: State<'_, AppState>,
    company_id: String,
    fiscal_year: i32,
    series: String,
) -> Result<NextNumberPreview, String> {
    require("company_id", &company_id)?;
    require("series", &series)?;
    let conn = state.lock()?;
    let next_number = db::next_invoice_number_preview(&conn, &company_id, fiscal_year, &series)?;
    let (separator, padding) = db::invoice_number_format(&conn, &company_id, fiscal_year, &series)?;
    Ok(NextNumberPreview {
        preview: format_invoice_number(&series, &separator, padding, next_number),
        company_id,
        fiscal_year,
        series,
        next_number,
        source: "invoice_sequences".to_string(),
    })
}

/// Listado con filtros opcionales + paginación.
#[tauri::command]
pub fn invoice_list(
    state: State<'_, AppState>,
    filters: Option<InvoiceListFilters>,
    pagination: Option<ListPagination>,
) -> Result<Vec<InvoiceSummary>, String> {
    let conn = state.lock()?;
    db::list_invoices_filtered_paginated(
        &conn,
        filters.unwrap_or_default(),
        pagination.unwrap_or_default(),
    )
}
/// Exporta PDF local de una factura (servicio `pdf`).
#[tauri::command]
pub fn invoice_export_pdf(
    state: State<'_, AppState>,
    invoice_id: String,
    target_path: String,
) -> Result<String, String> {
    require("invoice_id", &invoice_id)?;
    require("target_path", &target_path)?;
    let conn = state.lock()?;
    let invoice = db::invoice_pdf_data(&conn, &invoice_id)?;
    let qr_environment = QrEnvironment::parse(&db::get_app_settings(&conn)?.qr_environment)?;
    pdf::write_invoice_pdf(&target_path, &invoice, qr_environment)?;
    Ok(target_path)
}
