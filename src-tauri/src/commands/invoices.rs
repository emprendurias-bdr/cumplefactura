use crate::db::{self, AppState, InvoiceListFilters, InvoiceSummary, ListPagination};
use crate::domain::invoice::{Invoice, InvoiceDraftInput, InvoiceIssueInput, IssuedInvoice};
use crate::services::audit::AuditEvent;
use crate::services::pdf;
use crate::services::verifactu;
use tauri::State;

#[derive(Debug, serde::Serialize)]
pub struct NextNumberPreview {
    pub company_id: String,
    pub fiscal_year: i32,
    pub series: String,
    pub next_number: i64,
    pub source: String,
}

#[tauri::command]
pub fn invoice_draft_create(
    state: State<'_, AppState>,
    input: InvoiceDraftInput,
) -> Result<Invoice, String> {
    let invoice = Invoice::draft(input)?;
    let mut conn = state
        .conn
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;
    db::insert_invoice_draft(&mut conn, &invoice)?;
    Ok(invoice)
}

#[tauri::command]
pub fn invoice_issue(
    state: State<'_, AppState>,
    input: InvoiceIssueInput,
) -> Result<IssuedInvoice, String> {
    let mut conn = state
        .conn
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;
    let previous_hash = match input.previous_audit_hash.clone() {
        Some(hash) => Some(hash),
        None => db::latest_audit_hash(&conn)?,
    };
    let actor = input.actor.clone();
    let mut issue_input = input;
    if issue_input.actor.trim().is_empty() {
        return Err("actor is required".to_string());
    }
    if issue_input.issued_at.trim().is_empty() {
        return Err("issued_at is required".to_string());
    }
    Invoice::draft(issue_input.draft.clone())?;
    let number = db::reserve_invoice_number(
        &mut conn,
        &issue_input.draft.company_id,
        issue_input.draft.fiscal_year,
        &issue_input.draft.series,
    )?;
    issue_input.number = number;
    issue_input.previous_audit_hash = previous_hash.clone();

    let (invoice, _technical_hash) = Invoice::issue(issue_input)?;
    let issued_at = invoice
        .issued_at
        .as_deref()
        .ok_or_else(|| "issued invoice missing issued_at".to_string())?;
    let number = invoice
        .number
        .ok_or_else(|| "issued invoice missing number".to_string())?;
    let company_tax_id = db::company_tax_id(&conn, &invoice.company_id)?;
    let previous_fiscal_hash =
        db::latest_fiscal_record_hash_for_company(&conn, &invoice.company_id)?;
    let rectification_reason_code = invoice
        .rectification_reason_code
        .as_ref()
        .map(|value| format!("{:?}", value));
    let invoice_type = verifactu::registro_alta_invoice_type_for_kind(
        &format!("{:?}", invoice.kind),
        rectification_reason_code.as_deref(),
    )?;
    let fiscal_hash = verifactu::calculate_issued_invoice_registro_alta_hash_with_type(
        &company_tax_id,
        &invoice.series,
        number,
        issued_at,
        invoice.totals.tax_cents,
        invoice.totals.total_cents,
        invoice_type,
        previous_fiscal_hash.as_deref(),
    )?;
    let audit_event = AuditEvent::invoice_issued(
        invoice.id.clone(),
        actor,
        fiscal_hash.clone(),
        previous_hash,
    );
    let audit_hash = audit_event.chain_hash();

    db::insert_issued_invoice(
        &mut conn,
        &invoice,
        &fiscal_hash,
        previous_fiscal_hash.as_deref(),
        &audit_event,
        &audit_hash,
    )?;

    Ok(IssuedInvoice {
        invoice,
        fiscal_hash,
        audit_hash,
    })
}

#[tauri::command]
pub fn invoice_next_number_preview(
    state: State<'_, AppState>,
    company_id: String,
    fiscal_year: i32,
    series: String,
) -> Result<NextNumberPreview, String> {
    if company_id.trim().is_empty() {
        return Err("company_id is required".to_string());
    }
    if series.trim().is_empty() {
        return Err("series is required".to_string());
    }
    let conn = state
        .conn
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;
    let next_number = db::next_invoice_number_preview(&conn, &company_id, fiscal_year, &series)?;
    Ok(NextNumberPreview {
        company_id,
        fiscal_year,
        series,
        next_number,
        source: "invoice_sequences".to_string(),
    })
}

#[derive(Debug, serde::Serialize)]
pub struct InvoiceListItem {
    #[serde(flatten)]
    invoice: InvoiceSummary,
    taxable_base_cents: i64,
}

pub(crate) fn presentation_rows(rows: Vec<InvoiceSummary>) -> Vec<InvoiceListItem> {
    rows.into_iter()
        .map(|invoice| InvoiceListItem {
            taxable_base_cents: invoice.taxable_base_cents,
            invoice,
        })
        .collect()
}

#[tauri::command]
pub fn invoice_list(
    state: State<'_, AppState>,
    filters: Option<InvoiceListFilters>,
    pagination: Option<ListPagination>,
) -> Result<Vec<InvoiceListItem>, String> {
    let conn = state
        .conn
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;
    db::list_invoices_filtered_paginated(
        &conn,
        filters.unwrap_or_default(),
        pagination.unwrap_or_default(),
    )
    .map(presentation_rows)
}
#[tauri::command]
pub fn invoice_export_pdf(
    state: State<'_, AppState>,
    invoice_id: String,
    target_path: String,
) -> Result<String, String> {
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
    pdf::write_invoice_pdf(&target_path, &invoice)?;
    Ok(target_path)
}
