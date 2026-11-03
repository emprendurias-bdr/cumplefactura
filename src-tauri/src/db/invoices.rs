//! Facturas: borradores, emisión con numeración reservada en transacción, listados y datos para PDF/XML.

use super::*;

pub fn insert_invoice_draft(conn: &mut Connection, invoice: &Invoice) -> Result<(), String> {
    let tx = conn.transaction().map_err(db_error)?;
    insert_invoice(&tx, invoice, None)?;
    tx.commit().map_err(db_error)
}

pub fn insert_issued_invoice(
    conn: &mut Connection,
    invoice: &Invoice,
    fiscal_hash: &str,
    previous_fiscal_hash: Option<&str>,
    audit_event: &AuditEvent,
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
    tx.commit().map_err(db_error)
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
}

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
    let mut stmt = conn
        .prepare(
            "SELECT i.id, i.company_id, i.customer_id, i.fiscal_year, i.series, i.number, i.kind, i.status,
                    i.rectifies_invoice_id, i.rectification_reason_code, i.rectification_method,
                    i.total_cents, i.fiscal_hash, i.created_at, i.issued_at
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
             LIMIT ?8 OFFSET ?9",
        )
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
                    total_cents: row.get(11)?,
                    fiscal_hash: row.get(12)?,
                    created_at: row.get(13)?,
                    issued_at: row.get(14)?,
                })
            },
        )
        .map_err(db_error)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(db_error)
}

#[derive(Debug, Clone, Serialize)]
pub struct InvoicePdfLine {
    pub description: String,
    pub quantity: i64,
    pub unit_price_cents: i64,
    pub discount_rate_basis_points: i64,
    pub taxable_base_cents: i64,
    pub tax_rate_basis_points: i64,
    pub tax_cents: i64,
}

#[derive(Debug, Clone, Serialize)]
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
    let mut invoice = conn
        .query_row(
            "SELECT i.id, i.company_id, c.legal_name, c.tax_id, cu.display_name, cu.tax_id, i.fiscal_year, i.series, i.number, i.kind, i.status,
                    i.rectifies_invoice_id, i.rectification_reason_code, i.rectification_method,
                    i.taxable_base_cents, i.tax_cents, i.total_cents, i.fiscal_hash, i.issued_at
             FROM invoices i
             JOIN companies c ON c.id = i.company_id
             JOIN customers cu ON cu.id = i.customer_id
             WHERE i.id = ?1",
            params![invoice_id],
            |row| {
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
                    total_cents: row.get(16)?,
                    fiscal_hash: row.get(17)?,
                    issued_at: row.get(18)?,
                    lines: Vec::new(),
                    rectified_invoice: None,
                })
            },
        )
        .map_err(db_error)?;

    let mut stmt = conn
        .prepare(
            "SELECT description, quantity, unit_price_cents, discount_rate_basis_points, taxable_base_cents, tax_rate_basis_points, tax_cents
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
            })
        })
        .map_err(db_error)?;
    invoice.lines = rows.collect::<Result<Vec<_>, _>>().map_err(db_error)?;
    if let Some(source_invoice_id) = &invoice.rectifies_invoice_id {
        invoice.rectified_invoice = Some(rectified_invoice_link(conn, source_invoice_id)?);
    }
    Ok(invoice)
}

pub(super) fn insert_invoice(
    tx: &Transaction<'_>,
    invoice: &Invoice,
    fiscal_hash: Option<&str>,
) -> Result<(), String> {
    tx.execute(
        "INSERT INTO invoices (id, company_id, customer_id, fiscal_year, series, number, kind, status, rectifies_invoice_id, rectification_reason_code, rectification_method, taxable_base_cents, tax_cents, withholding_cents, total_cents, fiscal_hash, created_at, issued_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)",
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
        "INSERT INTO invoice_lines (id, invoice_id, position, description, quantity, unit_price_cents, discount_rate_basis_points, taxable_base_cents, tax_rate_basis_points, tax_cents, withholding_rate_basis_points, withholding_cents)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
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
        ],
    )
    .map(|_| ())
    .map_err(db_error)
}
