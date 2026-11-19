//! Facturas: borradores, emisión con numeración reservada en transacción, listados y datos para PDF/XML.
//!
//! Observaciones (`notes`), vencimiento, cobros, origen recurrente y `price_pending` son
//! operativos: se guardan y se listan, pero nunca entran en la huella ni en el XML. La única
//! marca que cambia el XML es `is_recapitulative` (sin `FechaOperacion`, decisión D5).

use super::*;
use crate::domain::invoice::InvoiceDraftInput;

pub fn insert_invoice_draft(conn: &mut Connection, invoice: &Invoice) -> Result<(), String> {
    let tx = conn.transaction().map_err(db_error)?;
    insert_invoice(&tx, invoice, None)?;
    tx.commit().map_err(db_error)
}

/// Emisión sin borrador previo; la app usa `insert_issued_invoice_from_draft`.
#[cfg(test)]
pub fn insert_issued_invoice(
    conn: &mut Connection,
    invoice: &Invoice,
    fiscal_hash: &str,
    previous_fiscal_hash: Option<&str>,
    audit_event: &AuditEvent,
) -> Result<(), String> {
    insert_issued_invoice_from_draft(
        conn,
        invoice,
        fiscal_hash,
        previous_fiscal_hash,
        audit_event,
        None,
    )
}

/// Emite como `insert_issued_invoice`. Con `draft_id`, en la misma transacción pasa a la factura
/// emitida los albaranes y periodos recurrentes del borrador y borra el borrador: así no puede
/// emitirse dos veces ni facturar dos veces los mismos albaranes.
pub fn insert_issued_invoice_from_draft(
    conn: &mut Connection,
    invoice: &Invoice,
    fiscal_hash: &str,
    previous_fiscal_hash: Option<&str>,
    audit_event: &AuditEvent,
    draft_id: Option<&str>,
) -> Result<(), String> {
    let audit_hash = audit_event.chain_hash();
    let tx = conn.transaction().map_err(db_error)?;
    if let Some(source_invoice_id) = &invoice.rectifies_invoice_id {
        let updated = tx
            .execute(
                "UPDATE invoices SET status = 'Rectified'
                 WHERE id = ?1 AND company_id = ?2 AND status = 'Issued'",
                params![source_invoice_id, invoice.company_id],
            )
            .map_err(db_error)?;
        if updated != 1 {
            return Err("rectifying invoice source must be issued in the same company".to_string());
        }
    }
    insert_invoice(&tx, invoice, Some(fiscal_hash))?;
    insert_fiscal_record_tx(
        &tx,
        &FiscalRecordInput {
            id: uuid::Uuid::new_v4().to_string(),
            company_id: invoice.company_id.clone(),
            invoice_id: invoice.id.clone(),
            record_type: "Alta".to_string(),
            generated_at: invoice
                .issued_at
                .clone()
                .ok_or_else(|| "issued invoice missing issued_at".to_string())?,
            fiscal_hash: fiscal_hash.to_string(),
            previous_fiscal_hash: previous_fiscal_hash.map(str::to_string),
            xml_path: None,
            status: "created".to_string(),
            created_at: chrono::Utc::now().to_rfc3339(),
        },
    )?;
    tx.execute(
        "INSERT INTO audit_events (id, entity_type, entity_id, action, actor, occurred_at, payload_hash, previous_hash, hash)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            audit_event.id,
            audit_event.entity_type,
            audit_event.entity_id,
            audit_event.action,
            audit_event.actor,
            audit_event.occurred_at,
            audit_event.payload_hash,
            audit_event.previous_hash,
            audit_hash,
        ],
    )
    .map_err(db_error)?;
    if let Some(draft_id) = draft_id {
        consume_draft(&tx, draft_id, invoice)?;
    }
    tx.commit().map_err(db_error)
}

fn consume_draft(tx: &Connection, draft_id: &str, issued: &Invoice) -> Result<(), String> {
    let is_draft: bool = tx
        .query_row(
            "SELECT EXISTS (SELECT 1 FROM invoices WHERE id = ?1 AND company_id = ?2 AND status = 'Draft')",
            params![draft_id, issued.company_id],
            |row| row.get(0),
        )
        .map_err(db_error)?;
    if !is_draft {
        return Err("not_draft".to_string());
    }
    link_commercial_documents_to_issued(tx, draft_id, &issued.id)?;
    tx.execute(
        "UPDATE recurring_runs SET invoice_id = ?2 WHERE invoice_id = ?1",
        params![draft_id, issued.id],
    )
    .map_err(db_error)?;
    // Marca de recapitulativa y vencimiento los pone Rust (no la UI): se heredan del borrador.
    tx.execute(
        "UPDATE invoices SET (is_recapitulative, due_date) =
           (SELECT is_recapitulative, due_date FROM invoices WHERE id = ?1)
         WHERE id = ?2",
        params![draft_id, issued.id],
    )
    .map_err(db_error)?;
    // Los cobros del borrador (anticipo de proforma) pasan a la emitida.
    tx.execute(
        "UPDATE invoice_payments SET invoice_id = ?2 WHERE invoice_id = ?1",
        params![draft_id, issued.id],
    )
    .map_err(db_error)?;
    if invoice_paid_cents(tx, &issued.id)? > issued.totals.total_cents {
        return Err("payments_exceed_total".to_string());
    }
    for table in ["invoice_territory_flags", "invoice_lines"] {
        tx.execute(
            &format!("DELETE FROM {table} WHERE invoice_id = ?1"),
            params![draft_id],
        )
        .map_err(db_error)?;
    }
    tx.execute("DELETE FROM invoices WHERE id = ?1", params![draft_id])
        .map_err(db_error)?;
    Ok(())
}

/// Líneas del borrador que siguen «pendiente de precio» (marca y 0 €).
pub fn pending_price_lines(conn: &Connection, draft_id: &str) -> Result<i64, String> {
    conn.query_row(
        "SELECT COUNT(*) FROM invoice_lines
         WHERE invoice_id = ?1 AND price_pending = 1 AND unit_price_cents = 0",
        params![draft_id],
        |row| row.get(0),
    )
    .map_err(db_error)
}

/// D8: `price_pending_lines:<n>` si el borrador guardado o la entrada de emisión tienen líneas
/// pendientes de precio (las de texto «Albarán AL-…» nunca lo están).
pub fn check_price_pending_for_issue(
    conn: &Connection,
    draft_id: Option<&str>,
    input: &InvoiceDraftInput,
) -> Result<(), String> {
    let from_input = input
        .lines
        .iter()
        .filter(|line| line.price_pending == Some(true) && line.unit_price_cents == 0)
        .count() as i64;
    let stored = match draft_id {
        Some(id) => pending_price_lines(conn, id)?,
        None => 0,
    };
    match from_input.max(stored) {
        0 => Ok(()),
        pending => Err(format!("price_pending_lines:{pending}")),
    }
}

/// Reescribe cabecera y líneas de un borrador (conserva id, fecha de alta, vínculos, cobros,
/// vencimiento y marca de recapitulativa). Una línea sin `price_pending` hereda la marca de la
/// línea en su misma posición; con precio la marca desaparece (`build_line`).
pub fn update_invoice_draft(
    conn: &mut Connection,
    draft_id: &str,
    input: InvoiceDraftInput,
) -> Result<Invoice, String> {
    let tx = conn.transaction().map_err(db_error)?;
    let (status, company_id, created_at): (String, String, String) = tx
        .query_row(
            "SELECT status, company_id, created_at FROM invoices WHERE id = ?1",
            params![draft_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()
        .map_err(db_error)?
        .ok_or_else(|| "not_found".to_string())?;
    if status != "Draft" {
        return Err("not_draft".to_string());
    }
    if company_id != input.company_id {
        return Err("validation_error:company_id".to_string());
    }
    let previous: Vec<bool> = tx
        .prepare("SELECT price_pending FROM invoice_lines WHERE invoice_id = ?1 ORDER BY position")
        .map_err(db_error)?
        .query_map(params![draft_id], |row| row.get(0))
        .map_err(db_error)?
        .collect::<Result<_, _>>()
        .map_err(db_error)?;
    let mut input = input;
    for (index, line) in input.lines.iter_mut().enumerate() {
        if line.price_pending.is_none() {
            line.price_pending = Some(previous.get(index).copied().unwrap_or(false));
        }
    }
    let mut invoice = Invoice::draft(input)?;
    invoice.id = draft_id.to_string();
    invoice.created_at = created_at;
    if invoice_paid_cents(&tx, draft_id)? > invoice.totals.total_cents {
        return Err("payments_exceed_total".to_string());
    }
    tx.execute(
        "UPDATE invoices SET customer_id = ?2, fiscal_year = ?3, series = ?4, kind = ?5,
            rectifies_invoice_id = ?6, rectification_reason_code = ?7, rectification_method = ?8,
            taxable_base_cents = ?9, tax_cents = ?10, withholding_cents = ?11, total_cents = ?12,
            notes = ?13
         WHERE id = ?1",
        params![
            invoice.id,
            invoice.customer_id,
            invoice.fiscal_year,
            invoice.series,
            format!("{:?}", invoice.kind),
            invoice.rectifies_invoice_id,
            invoice
                .rectification_reason_code
                .as_ref()
                .map(|value| format!("{:?}", value)),
            invoice
                .rectification_method
                .as_ref()
                .map(|value| format!("{:?}", value)),
            invoice.totals.taxable_base_cents,
            invoice.totals.tax_cents,
            invoice.totals.withholding_cents,
            invoice.totals.total_cents,
            invoice.notes,
        ],
    )
    .map_err(db_error)?;
    for table in ["invoice_territory_flags", "invoice_lines"] {
        tx.execute(
            &format!("DELETE FROM {table} WHERE invoice_id = ?1"),
            params![draft_id],
        )
        .map_err(db_error)?;
    }
    for (position, line) in invoice.lines.iter().enumerate() {
        insert_line(&tx, &invoice.id, position as i64 + 1, line)?;
    }
    for flag in &invoice.territory_flags {
        tx.execute(
            "INSERT INTO invoice_territory_flags (invoice_id, flag) VALUES (?1, ?2)",
            params![invoice.id, format!("{:?}", flag)],
        )
        .map_err(db_error)?;
    }
    let payload = serde_json::to_string(&invoice).map_err(|err| err.to_string())?;
    operational_audit(&tx, "invoice", draft_id, "invoice_draft_updated", &payload)?;
    tx.commit().map_err(db_error)?;
    Ok(invoice)
}

pub fn next_invoice_number_preview(
    conn: &Connection,
    company_id: &str,
    fiscal_year: i32,
    series: &str,
) -> Result<i64, String> {
    conn.query_row(
        "SELECT next_number FROM invoice_sequences
         WHERE company_id = ?1 AND fiscal_year = ?2 AND series = ?3",
        params![company_id, fiscal_year, series],
        |row| row.get(0),
    )
    .optional()
    .map_err(db_error)
    .map(|value| value.unwrap_or(1))
}

pub fn reserve_invoice_number(
    conn: &mut Connection,
    company_id: &str,
    fiscal_year: i32,
    series: &str,
) -> Result<i64, String> {
    require_company(conn, company_id)?;
    if series.trim().is_empty() {
        return Err("series is required".to_string());
    }
    let tx = conn.transaction().map_err(db_error)?;
    let next = reserve_invoice_number_tx(&tx, company_id, fiscal_year, series)?;
    tx.commit().map_err(db_error)?;
    Ok(next)
}

pub(super) fn max_invoice_number(
    conn: &Connection,
    company_id: &str,
    fiscal_year: i32,
    series: &str,
) -> Result<i64, String> {
    conn.query_row(
        "SELECT COALESCE(MAX(number), 0)
         FROM invoices
         WHERE company_id = ?1 AND fiscal_year = ?2 AND series = ?3 AND number IS NOT NULL",
        params![company_id, fiscal_year, series],
        |row| row.get(0),
    )
    .map_err(db_error)
}

#[derive(Debug, Clone, Serialize)]
pub struct InvoiceSummary {
    pub id: String,
    pub company_id: String,
    pub customer_id: String,
    pub fiscal_year: i32,
    pub series: String,
    pub number: Option<i64>,
    pub kind: String,
    pub status: String,
    pub rectifies_invoice_id: Option<String>,
    pub rectification_reason_code: Option<String>,
    pub rectification_method: Option<String>,
    pub total_cents: i64,
    pub fiscal_hash: Option<String>,
    pub created_at: String,
    pub issued_at: Option<String>,
    pub due_date: Option<String>,
    pub paid_cents: i64,
    /// `unpaid` · `partial` · `paid` · `overdue` (ver `payments::payment_status`).
    pub payment_status: String,
    /// Plantilla y periodo si la factura salió de una recurrente («Recurrente · <plantilla> · <periodo>»).
    pub recurring_label: Option<String>,
    pub recurring_period_key: Option<String>,
}

/// Columnas operativas comunes a listado y ficha (alias `i` = `invoices`).
const OPERATIONAL_COLUMNS: &str = "i.due_date,
    COALESCE((SELECT SUM(p.amount_cents) FROM invoice_payments p WHERE p.invoice_id = i.id), 0),
    (SELECT t.label FROM recurring_runs r JOIN recurring_invoices t ON t.id = r.recurring_id
     WHERE r.invoice_id = i.id LIMIT 1),
    (SELECT r.period_key FROM recurring_runs r WHERE r.invoice_id = i.id LIMIT 1)";

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct InvoiceListFilters {
    pub company_id: Option<String>,
    pub customer_id: Option<String>,
    pub fiscal_year: Option<i32>,
    pub series: Option<String>,
    pub status: Option<String>,
    pub kind: Option<String>,
    pub search: Option<String>,
}

impl InvoiceListFilters {
    fn normalized(self) -> Result<Self, String> {
        let status = clean_optional(self.status);
        if let Some(value) = &status {
            if !matches!(value.as_str(), "Draft" | "Issued" | "Void" | "Rectified") {
                return Err(format!("unsupported invoice status: {value}"));
            }
        }
        let kind = clean_optional(self.kind);
        if let Some(value) = &kind {
            if !matches!(value.as_str(), "Complete" | "Simplified" | "Rectifying") {
                return Err(format!("unsupported invoice kind: {value}"));
            }
        }
        Ok(Self {
            company_id: clean_optional(self.company_id),
            customer_id: clean_optional(self.customer_id),
            fiscal_year: self.fiscal_year,
            series: clean_optional(self.series),
            status,
            kind,
            search: clean_optional(self.search),
        })
    }
}

pub fn list_invoices(conn: &Connection) -> Result<Vec<InvoiceSummary>, String> {
    list_invoices_filtered(conn, InvoiceListFilters::default())
}

pub fn list_invoices_filtered(
    conn: &Connection,
    filters: InvoiceListFilters,
) -> Result<Vec<InvoiceSummary>, String> {
    list_invoices_filtered_paginated(conn, filters, ListPagination::default())
}

pub fn list_invoices_filtered_paginated(
    conn: &Connection,
    filters: InvoiceListFilters,
    pagination: ListPagination,
) -> Result<Vec<InvoiceSummary>, String> {
    let filters = filters.normalized()?;
    let pagination = pagination.normalized()?;
    let search = filters
        .search
        .as_ref()
        .map(|value| format!("%{}%", value.to_ascii_lowercase()));
    let today = today_iso();
    let mut stmt = conn
        .prepare(&format!(
            "SELECT i.id, i.company_id, i.customer_id, i.fiscal_year, i.series, i.number, i.kind, i.status,
                    i.rectifies_invoice_id, i.rectification_reason_code, i.rectification_method,
                    i.total_cents, i.fiscal_hash, i.created_at, i.issued_at, {OPERATIONAL_COLUMNS}
             FROM invoices i
             JOIN companies c ON c.id = i.company_id
             JOIN customers cu ON cu.id = i.customer_id
             WHERE (?1 IS NULL OR i.company_id = ?1)
               AND (?2 IS NULL OR i.customer_id = ?2)
               AND (?3 IS NULL OR i.fiscal_year = ?3)
               AND (?4 IS NULL OR i.series = ?4)
               AND (?5 IS NULL OR i.status = ?5)
               AND (?6 IS NULL OR i.kind = ?6)
               AND (
                 ?7 IS NULL
                 OR lower(i.series) LIKE ?7
                 OR lower(COALESCE(CAST(i.number AS TEXT), 'bor')) LIKE ?7
                 OR lower(i.kind) LIKE ?7
                 OR lower(i.status) LIKE ?7
                 OR lower(COALESCE(i.fiscal_hash, '')) LIKE ?7
                 OR lower(c.legal_name) LIKE ?7
                 OR lower(c.tax_id) LIKE ?7
                 OR lower(cu.display_name) LIKE ?7
                 OR lower(cu.tax_id) LIKE ?7
               )
             ORDER BY i.created_at DESC
             LIMIT ?8 OFFSET ?9"
        ))
        .map_err(db_error)?;
    let rows = stmt
        .query_map(
            params![
                filters.company_id,
                filters.customer_id,
                filters.fiscal_year,
                filters.series,
                filters.status,
                filters.kind,
                search,
                pagination.limit(),
                pagination.offset(),
            ],
            |row| {
                let total_cents: i64 = row.get(11)?;
                let due_date: Option<String> = row.get(15)?;
                let paid_cents: i64 = row.get(16)?;
                Ok(InvoiceSummary {
                    id: row.get(0)?,
                    company_id: row.get(1)?,
                    customer_id: row.get(2)?,
                    fiscal_year: row.get(3)?,
                    series: row.get(4)?,
                    number: row.get(5)?,
                    kind: row.get(6)?,
                    status: row.get(7)?,
                    rectifies_invoice_id: row.get(8)?,
                    rectification_reason_code: row.get(9)?,
                    rectification_method: row.get(10)?,
                    total_cents,
                    fiscal_hash: row.get(12)?,
                    created_at: row.get(13)?,
                    issued_at: row.get(14)?,
                    payment_status: payment_status(
                        total_cents,
                        paid_cents,
                        due_date.as_deref(),
                        &today,
                    )
                    .to_string(),
                    due_date,
                    paid_cents,
                    recurring_label: row.get(17)?,
                    recurring_period_key: row.get(18)?,
                })
            },
        )
        .map_err(db_error)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(db_error)
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct InvoicePdfLine {
    pub description: String,
    pub quantity: i64,
    pub unit_price_cents: i64,
    pub discount_rate_basis_points: i64,
    pub taxable_base_cents: i64,
    pub tax_rate_basis_points: i64,
    pub tax_cents: i64,
    pub withholding_rate_basis_points: i64,
    pub withholding_cents: i64,
    pub price_pending: bool,
}

/// Ficha de factura (`invoice_get`), PDF y XML. Los campos tras `rectified_invoice` son
/// operativos y el XML no los lee (salvo `is_recapitulative`).
#[derive(Debug, Clone, Default, Serialize)]
pub struct InvoicePdfData {
    pub id: String,
    pub company_id: String,
    pub company_legal_name: String,
    pub company_tax_id: String,
    pub customer_display_name: String,
    pub customer_tax_id: String,
    pub fiscal_year: i32,
    pub series: String,
    pub number: Option<i64>,
    pub kind: String,
    pub status: String,
    pub rectifies_invoice_id: Option<String>,
    pub rectification_reason_code: Option<String>,
    pub rectification_method: Option<String>,
    pub taxable_base_cents: i64,
    pub tax_cents: i64,
    pub total_cents: i64,
    pub fiscal_hash: Option<String>,
    pub issued_at: Option<String>,
    pub lines: Vec<InvoicePdfLine>,
    pub rectified_invoice: Option<RectifiedInvoiceLink>,
    pub withholding_cents: i64,
    pub company_address: String,
    pub company_logo_path: Option<String>,
    pub customer_address: String,
    pub notes: String,
    pub is_recapitulative: bool,
    pub due_date: Option<String>,
    pub paid_cents: i64,
    pub payment_status: String,
    pub recurring_label: Option<String>,
    pub recurring_period_key: Option<String>,
}

impl InvoicePdfData {
    pub fn title(&self) -> String {
        match self.number {
            Some(number) => format!("Factura {}-{} / {}", self.series, number, self.fiscal_year),
            None => format!("Borrador {} / {}", self.series, self.fiscal_year),
        }
    }
}

pub fn invoice_pdf_data(conn: &Connection, invoice_id: &str) -> Result<InvoicePdfData, String> {
    let today = today_iso();
    let mut invoice = conn
        .query_row(
            &format!("SELECT i.id, i.company_id, c.legal_name, c.tax_id, cu.display_name, cu.tax_id, i.fiscal_year, i.series, i.number, i.kind, i.status,
                    i.rectifies_invoice_id, i.rectification_reason_code, i.rectification_method,
                    i.taxable_base_cents, i.tax_cents, i.total_cents, i.fiscal_hash, i.issued_at,
                    {OPERATIONAL_COLUMNS},
                    i.withholding_cents, i.notes, i.is_recapitulative, c.logo_path,
                    c.address, c.postal_code, c.municipality, c.province,
                    cu.address, cu.postal_code, cu.municipality, cu.province
             FROM invoices i
             JOIN companies c ON c.id = i.company_id
             JOIN customers cu ON cu.id = i.customer_id
             WHERE i.id = ?1"),
            params![invoice_id],
            |row| {
                let total_cents: i64 = row.get(16)?;
                let due_date: Option<String> = row.get(19)?;
                let paid_cents: i64 = row.get(20)?;
                let address = |first: usize| -> rusqlite::Result<String> {
                    Ok(postal_address(
                        &row.get::<_, String>(first)?,
                        &row.get::<_, String>(first + 1)?,
                        &row.get::<_, String>(first + 2)?,
                        &row.get::<_, String>(first + 3)?,
                    ))
                };
                Ok(InvoicePdfData {
                    id: row.get(0)?,
                    company_id: row.get(1)?,
                    company_legal_name: row.get(2)?,
                    company_tax_id: row.get(3)?,
                    customer_display_name: row.get(4)?,
                    customer_tax_id: row.get(5)?,
                    fiscal_year: row.get(6)?,
                    series: row.get(7)?,
                    number: row.get(8)?,
                    kind: row.get(9)?,
                    status: row.get(10)?,
                    rectifies_invoice_id: row.get(11)?,
                    rectification_reason_code: row.get(12)?,
                    rectification_method: row.get(13)?,
                    taxable_base_cents: row.get(14)?,
                    tax_cents: row.get(15)?,
                    total_cents,
                    fiscal_hash: row.get(17)?,
                    issued_at: row.get(18)?,
                    lines: Vec::new(),
                    rectified_invoice: None,
                    payment_status: payment_status(
                        total_cents,
                        paid_cents,
                        due_date.as_deref(),
                        &today,
                    )
                    .to_string(),
                    due_date,
                    paid_cents,
                    recurring_label: row.get(21)?,
                    recurring_period_key: row.get(22)?,
                    withholding_cents: row.get(23)?,
                    notes: row.get(24)?,
                    is_recapitulative: row.get(25)?,
                    company_logo_path: row.get(26)?,
                    company_address: address(27)?,
                    customer_address: address(31)?,
                })
            },
        )
        .map_err(db_error)?;

    let mut stmt = conn
        .prepare(
            "SELECT description, quantity, unit_price_cents, discount_rate_basis_points, taxable_base_cents, tax_rate_basis_points, tax_cents,
                    withholding_rate_basis_points, withholding_cents, price_pending
             FROM invoice_lines WHERE invoice_id = ?1 ORDER BY position ASC",
        )
        .map_err(db_error)?;
    let rows = stmt
        .query_map(params![invoice_id], |row| {
            Ok(InvoicePdfLine {
                description: row.get(0)?,
                quantity: row.get(1)?,
                unit_price_cents: row.get(2)?,
                discount_rate_basis_points: row.get(3)?,
                taxable_base_cents: row.get(4)?,
                tax_rate_basis_points: row.get(5)?,
                tax_cents: row.get(6)?,
                withholding_rate_basis_points: row.get(7)?,
                withholding_cents: row.get(8)?,
                price_pending: row.get(9)?,
            })
        })
        .map_err(db_error)?;
    invoice.lines = rows.collect::<Result<Vec<_>, _>>().map_err(db_error)?;
    if let Some(source_invoice_id) = &invoice.rectifies_invoice_id {
        invoice.rectified_invoice = Some(rectified_invoice_link(conn, source_invoice_id)?);
    }
    Ok(invoice)
}

/// «Calle 1, 28001 Madrid (Madrid)», omitiendo lo vacío y la provincia si coincide con el municipio.
fn postal_address(street: &str, postal_code: &str, municipality: &str, province: &str) -> String {
    let city = [postal_code.trim(), municipality.trim()]
        .into_iter()
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join(" ");
    let mut out = [street.trim(), city.as_str()]
        .into_iter()
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join(", ");
    let province = province.trim();
    if !province.is_empty() && province != municipality.trim() {
        out.push_str(&format!(" ({province})"));
    }
    out
}

/// Emisor y cliente para la cabecera del PDF (facturas y documentos comerciales).
pub struct PartyDetails {
    pub company_legal_name: String,
    pub company_tax_id: String,
    pub company_address: String,
    pub company_logo_path: Option<String>,
    pub customer_display_name: String,
    pub customer_tax_id: String,
    pub customer_address: String,
}

pub fn party_details(
    conn: &Connection,
    company_id: &str,
    customer_id: &str,
) -> Result<PartyDetails, String> {
    conn.query_row(
        "SELECT c.legal_name, c.tax_id, c.address, c.postal_code, c.municipality, c.province, c.logo_path,
                cu.display_name, cu.tax_id, cu.address, cu.postal_code, cu.municipality, cu.province
         FROM companies c, customers cu WHERE c.id = ?1 AND cu.id = ?2",
        params![company_id, customer_id],
        |row| {
            let address = |first: usize| -> rusqlite::Result<String> {
                Ok(postal_address(
                    &row.get::<_, String>(first)?,
                    &row.get::<_, String>(first + 1)?,
                    &row.get::<_, String>(first + 2)?,
                    &row.get::<_, String>(first + 3)?,
                ))
            };
            Ok(PartyDetails {
                company_legal_name: row.get(0)?,
                company_tax_id: row.get(1)?,
                company_address: address(2)?,
                company_logo_path: row.get(6)?,
                customer_display_name: row.get(7)?,
                customer_tax_id: row.get(8)?,
                customer_address: address(9)?,
            })
        },
    )
    .map_err(db_error)
}

/// `invoice_get`: la misma forma que `Invoice` (la del editor) más los campos operativos.
#[derive(Debug, Clone, Serialize)]
pub struct InvoiceDetail {
    #[serde(flatten)]
    pub invoice: Invoice,
    pub is_recapitulative: bool,
    pub due_date: Option<String>,
    pub paid_cents: i64,
    pub payment_status: String,
    pub recurring_label: Option<String>,
    pub recurring_period_key: Option<String>,
    pub void_reason: Option<String>,
}

/// Enum guardado con `format!("{:?}")` → valor serde (mismo nombre de variante).
fn stored_enum<T: serde::de::DeserializeOwned>(value: String) -> rusqlite::Result<T> {
    serde_json::from_value(serde_json::Value::String(value)).map_err(|err| {
        rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(err))
    })
}

pub fn get_invoice_detail(conn: &Connection, invoice_id: &str) -> Result<InvoiceDetail, String> {
    let today = today_iso();
    let mut detail = conn
        .query_row(
            &format!(
                "SELECT i.id, i.company_id, i.customer_id, i.fiscal_year, i.series, i.number, i.kind, i.status,
                        i.rectifies_invoice_id, i.rectification_reason_code, i.rectification_method,
                        i.taxable_base_cents, i.tax_cents, i.withholding_cents, i.total_cents,
                        i.created_at, i.issued_at, i.notes, i.is_recapitulative, i.void_reason,
                        {OPERATIONAL_COLUMNS}
                 FROM invoices i WHERE i.id = ?1"
            ),
            params![invoice_id],
            |row| {
                let total_cents: i64 = row.get(14)?;
                let due_date: Option<String> = row.get(20)?;
                let paid_cents: i64 = row.get(21)?;
                Ok(InvoiceDetail {
                    invoice: Invoice {
                        id: row.get(0)?,
                        company_id: row.get(1)?,
                        customer_id: row.get(2)?,
                        fiscal_year: row.get(3)?,
                        series: row.get(4)?,
                        number: row.get(5)?,
                        kind: stored_enum(row.get(6)?)?,
                        status: stored_enum(row.get(7)?)?,
                        territory_flags: Vec::new(),
                        rectifies_invoice_id: row.get(8)?,
                        rectification_reason_code: row
                            .get::<_, Option<String>>(9)?
                            .map(stored_enum)
                            .transpose()?,
                        rectification_method: row
                            .get::<_, Option<String>>(10)?
                            .map(stored_enum)
                            .transpose()?,
                        lines: Vec::new(),
                        totals: crate::domain::invoice::InvoiceTotals {
                            taxable_base_cents: row.get(11)?,
                            tax_cents: row.get(12)?,
                            withholding_cents: row.get(13)?,
                            total_cents,
                        },
                        created_at: row.get(15)?,
                        issued_at: row.get(16)?,
                        notes: row.get(17)?,
                    },
                    is_recapitulative: row.get(18)?,
                    void_reason: row.get(19)?,
                    payment_status: payment_status(
                        total_cents,
                        paid_cents,
                        due_date.as_deref(),
                        &today,
                    )
                    .to_string(),
                    due_date,
                    paid_cents,
                    recurring_label: row.get(22)?,
                    recurring_period_key: row.get(23)?,
                })
            },
        )
        .optional()
        .map_err(db_error)?
        .ok_or_else(|| "not_found".to_string())?;
    detail.invoice.territory_flags = conn
        .prepare("SELECT flag FROM invoice_territory_flags WHERE invoice_id = ?1 ORDER BY rowid")
        .map_err(db_error)?
        .query_map(params![invoice_id], |row| stored_enum(row.get(0)?))
        .map_err(db_error)?
        .collect::<Result<_, _>>()
        .map_err(db_error)?;
    detail.invoice.lines = conn
        .prepare(
            "SELECT id, description, quantity, unit_price_cents, discount_rate_basis_points, taxable_base_cents,
                    tax_rate_basis_points, tax_cents, withholding_rate_basis_points, withholding_cents, price_pending
             FROM invoice_lines WHERE invoice_id = ?1 ORDER BY position",
        )
        .map_err(db_error)?
        .query_map(params![invoice_id], |row| {
            Ok(InvoiceLine {
                id: row.get(0)?,
                description: row.get(1)?,
                quantity: row.get(2)?,
                unit_price_cents: row.get(3)?,
                discount_rate_basis_points: row.get(4)?,
                taxable_base_cents: row.get(5)?,
                tax_rate_basis_points: row.get(6)?,
                tax_cents: row.get(7)?,
                withholding_rate_basis_points: row.get(8)?,
                withholding_cents: row.get(9)?,
                price_pending: row.get(10)?,
            })
        })
        .map_err(db_error)?
        .collect::<Result<_, _>>()
        .map_err(db_error)?;
    Ok(detail)
}

pub(super) fn insert_invoice(
    tx: &Transaction<'_>,
    invoice: &Invoice,
    fiscal_hash: Option<&str>,
) -> Result<(), String> {
    tx.execute(
        "INSERT INTO invoices (id, company_id, customer_id, fiscal_year, series, number, kind, status, rectifies_invoice_id, rectification_reason_code, rectification_method, taxable_base_cents, tax_cents, withholding_cents, total_cents, fiscal_hash, created_at, issued_at, notes)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)",
        params![
            invoice.id,
            invoice.company_id,
            invoice.customer_id,
            invoice.fiscal_year,
            invoice.series,
            invoice.number,
            format!("{:?}", invoice.kind),
            format!("{:?}", invoice.status),
            invoice.rectifies_invoice_id,
            invoice
                .rectification_reason_code
                .as_ref()
                .map(|value| format!("{:?}", value)),
            invoice
                .rectification_method
                .as_ref()
                .map(|value| format!("{:?}", value)),
            invoice.totals.taxable_base_cents,
            invoice.totals.tax_cents,
            invoice.totals.withholding_cents,
            invoice.totals.total_cents,
            fiscal_hash,
            invoice.created_at,
            invoice.issued_at,
            invoice.notes,
        ],
    )
    .map_err(db_error)?;

    for (position, line) in invoice.lines.iter().enumerate() {
        insert_line(tx, &invoice.id, position as i64 + 1, line)?;
    }

    for flag in &invoice.territory_flags {
        tx.execute(
            "INSERT INTO invoice_territory_flags (invoice_id, flag) VALUES (?1, ?2)",
            params![invoice.id, format!("{:?}", flag)],
        )
        .map_err(db_error)?;
    }

    Ok(())
}

pub(super) fn reserve_invoice_number_tx(
    tx: &Transaction<'_>,
    company_id: &str,
    fiscal_year: i32,
    series: &str,
) -> Result<i64, String> {
    tx.execute(
        "INSERT OR IGNORE INTO invoice_sequences (company_id, fiscal_year, series, next_number)
         VALUES (?1, ?2, ?3, 1)",
        params![company_id, fiscal_year, series],
    )
    .map_err(db_error)?;

    let next: i64 = tx
        .query_row(
            "SELECT next_number FROM invoice_sequences
             WHERE company_id = ?1 AND fiscal_year = ?2 AND series = ?3",
            params![company_id, fiscal_year, series],
            |row| row.get(0),
        )
        .map_err(db_error)?;

    tx.execute(
        "UPDATE invoice_sequences SET next_number = ?4
         WHERE company_id = ?1 AND fiscal_year = ?2 AND series = ?3",
        params![company_id, fiscal_year, series, next + 1],
    )
    .map_err(db_error)?;

    Ok(next)
}

pub(super) fn insert_line(
    tx: &Transaction<'_>,
    invoice_id: &str,
    position: i64,
    line: &InvoiceLine,
) -> Result<(), String> {
    tx.execute(
        "INSERT INTO invoice_lines (id, invoice_id, position, description, quantity, unit_price_cents, discount_rate_basis_points, taxable_base_cents, tax_rate_basis_points, tax_cents, withholding_rate_basis_points, withholding_cents, price_pending)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
        params![
            line.id,
            invoice_id,
            position,
            line.description,
            line.quantity,
            line.unit_price_cents,
            line.discount_rate_basis_points,
            line.taxable_base_cents,
            line.tax_rate_basis_points,
            line.tax_cents,
            line.withholding_rate_basis_points,
            line.withholding_cents,
            line.price_pending,
        ],
    )
    .map(|_| ())
    .map_err(db_error)
}
