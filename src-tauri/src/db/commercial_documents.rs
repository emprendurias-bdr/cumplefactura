//! Documentos comerciales (presupuestos, proformas y albaranes): borradores, numeración propia,
//! estados, conversión a borrador de factura y datos para su PDF.
//!
//! Nunca escribe en `invoice_sequences`, `fiscal_records`, `fiscal_exports` ni
//! `verifactu_submissions`: estos documentos no tienen valor fiscal y su serie
//! (`commercial_sequences`) no puede dejar huecos en la de facturas. La única factura que crea
//! es un **borrador** sin número ni huella; emitirlo sigue siendo `invoice_issue`.
//!
//! Albaranes en una recapitulativa: al crear el borrador quedan `delivered` con `invoice_id`
//! apuntando a él (reservados: no se pueden volver a facturar ni anular). Al emitir, `invoice_issue`
//! los pasa a `invoiced`. Si el borrador se borra, la FK `ON DELETE SET NULL` limpia el enlace y
//! vuelven a estar libres sin más código.
//!
//! Alta, cambio de estado, conversión, anulación y borrado quedan en `audit_events`.

use super::*;
use crate::domain::invoice::{
    build_line, calculate_totals, InvoiceDraftInput, InvoiceKind, InvoiceLineInput, InvoiceTotals,
};
use crate::domain::tax::TerritoryFlag;
use chrono::{Datelike, Local, NaiveDate, Utc};
use serde_json::json;

/// Mismos campos que `InvoiceLineInput` (la conversión los copia tal cual) + `position`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommercialDocumentLine {
    #[serde(flatten)]
    pub line: InvoiceLineInput,
    #[serde(default)]
    pub product_id: Option<String>,
    #[serde(default)]
    pub position: i64,
}

/// Entrada de `commercial_document_save_draft`: sin `number` ni `status` (los pone Rust).
#[derive(Debug, Clone, Deserialize)]
pub struct CommercialDocumentInput {
    pub id: Option<String>,
    pub company_id: String,
    pub customer_id: String,
    pub kind: String,
    pub series_code: Option<String>,
    pub issue_date: String,
    pub valid_until: Option<String>,
    pub delivery_date: Option<String>,
    #[serde(default = "default_true")]
    pub show_prices: bool,
    #[serde(default)]
    pub notes: String,
    pub lines: Vec<CommercialDocumentLine>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CommercialDocumentSummary {
    pub id: String,
    pub company_id: String,
    pub customer_id: String,
    pub kind: String,
    pub series_code: String,
    pub fiscal_year: i32,
    pub number: Option<i64>,
    pub display_number: Option<String>,
    /// Estado efectivo: un presupuesto `sent` con `valid_until` pasado se lee `expired`.
    pub status: String,
    pub issue_date: String,
    pub valid_until: Option<String>,
    pub delivery_date: Option<String>,
    pub show_prices: bool,
    pub notes: String,
    pub taxable_base_cents: i64,
    pub tax_cents: i64,
    pub withholding_cents: i64,
    pub total_cents: i64,
    pub source_document_id: Option<String>,
    pub invoice_id: Option<String>,
    pub void_reason: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct CommercialDocument {
    #[serde(flatten)]
    pub header: CommercialDocumentSummary,
    pub lines: Vec<CommercialDocumentLine>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CommercialDocumentPage {
    pub items: Vec<CommercialDocumentSummary>,
    pub total: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CommercialDocumentListFilters {
    pub company_id: String,
    pub kind: String,
    pub status: Option<String>,
    pub customer_id: Option<String>,
    pub year: Option<i32>,
}

#[derive(Debug, Clone)]
pub struct CommercialDocumentPdfData {
    pub document: CommercialDocument,
    pub company_legal_name: String,
    pub company_tax_id: String,
    pub customer_display_name: String,
    pub customer_tax_id: String,
}

// ?1 = hoy: `expired` se calcula al leer, sin proceso en segundo plano.
const SELECT_DOC: &str = "SELECT id, company_id, customer_id, kind, series_code, fiscal_year, number,
        CASE WHEN kind = 'quote' AND status = 'sent' AND valid_until < ?1 THEN 'expired' ELSE status END AS effective_status,
        issue_date, valid_until, delivery_date, show_prices, notes,
        taxable_base_cents, tax_cents, withholding_cents, total_cents,
        source_document_id, invoice_id, void_reason, created_at, updated_at
     FROM commercial_documents";

pub fn save_commercial_draft(
    conn: &mut Connection,
    input: CommercialDocumentInput,
) -> Result<CommercialDocument, String> {
    let tx = conn.transaction().map_err(db_error)?;
    let id = save_draft_tx(&tx, input, None)?;
    tx.commit().map_err(db_error)?;
    get_commercial_document(conn, &id)
}

pub fn get_commercial_document(conn: &Connection, id: &str) -> Result<CommercialDocument, String> {
    let header = conn
        .query_row(
            &format!("{SELECT_DOC} WHERE id = ?2"),
            params![today(), id],
            summary_from_row,
        )
        .optional()
        .map_err(db_error)?
        .ok_or_else(|| "not_found".to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT description, quantity, unit_price_cents, discount_rate_basis_points,
                    tax_rate_basis_points, withholding_rate_basis_points, product_id, position
             FROM commercial_document_lines WHERE document_id = ?1 ORDER BY position ASC",
        )
        .map_err(db_error)?;
    let lines = stmt
        .query_map(params![id], |row| {
            Ok(CommercialDocumentLine {
                line: InvoiceLineInput {
                    description: row.get(0)?,
                    quantity: row.get(1)?,
                    unit_price_cents: row.get(2)?,
                    discount_rate_basis_points: row.get(3)?,
                    tax_rate_basis_points: row.get(4)?,
                    withholding_rate_basis_points: row.get(5)?,
                },
                product_id: row.get(6)?,
                position: row.get(7)?,
            })
        })
        .map_err(db_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(db_error)?;
    Ok(CommercialDocument { header, lines })
}

pub fn list_commercial_documents(
    conn: &Connection,
    filters: CommercialDocumentListFilters,
    pagination: ListPagination,
) -> Result<CommercialDocumentPage, String> {
    validate_kind(&filters.kind)?;
    let pagination = pagination.normalized()?;
    let filtered = format!(
        "{SELECT_DOC} WHERE company_id = ?2 AND kind = ?3
           AND (?4 IS NULL OR effective_status = ?4)
           AND (?5 IS NULL OR customer_id = ?5)
           AND (?6 IS NULL OR fiscal_year = ?6)"
    );
    let status = clean_optional(filters.status);
    let customer_id = clean_optional(filters.customer_id);
    let today = today();
    let total = conn
        .query_row(
            &format!("SELECT COUNT(*) FROM ({filtered})"),
            params![
                today,
                filters.company_id,
                filters.kind,
                status,
                customer_id,
                filters.year
            ],
            |row| row.get(0),
        )
        .map_err(db_error)?;
    let mut stmt = conn
        .prepare(&format!(
            "{filtered} ORDER BY issue_date DESC, created_at DESC LIMIT ?7 OFFSET ?8"
        ))
        .map_err(db_error)?;
    let items = stmt
        .query_map(
            params![
                today,
                filters.company_id,
                filters.kind,
                status,
                customer_id,
                filters.year,
                pagination.limit(),
                pagination.offset(),
            ],
            summary_from_row,
        )
        .map_err(db_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(db_error)?;
    Ok(CommercialDocumentPage { items, total })
}

/// Solo los borradores se borran; después se anulan con motivo.
pub fn delete_commercial_draft(conn: &mut Connection, id: &str) -> Result<(), String> {
    let tx = conn.transaction().map_err(db_error)?;
    let doc = get_commercial_document(&tx, id)?;
    if doc.header.status != "draft" {
        return Err("not_draft".to_string());
    }
    tx.execute(
        "DELETE FROM commercial_documents WHERE id = ?1",
        params![id],
    )
    .map_err(db_error)?;
    audit(
        &tx,
        id,
        "commercial_document_deleted",
        json!({ "kind": doc.header.kind }),
    )?;
    tx.commit().map_err(db_error)
}

/// Borrador → `sent` (presupuesto, proforma) o `delivered` (albarán), con número asignado.
pub fn send_commercial_document(
    conn: &mut Connection,
    id: &str,
) -> Result<CommercialDocument, String> {
    let doc = get_commercial_document(conn, id)?;
    if doc.header.status != "draft" {
        return Err("not_draft".to_string());
    }
    let target = if doc.header.kind == "delivery_note" {
        "delivered"
    } else {
        "sent"
    };
    set_commercial_status(conn, id, target, None)
}

pub fn set_commercial_status(
    conn: &mut Connection,
    id: &str,
    to: &str,
    reason: Option<&str>,
) -> Result<CommercialDocument, String> {
    let tx = conn.transaction().map_err(db_error)?;
    let doc = get_commercial_document(&tx, id)?;
    let from = doc.header.status.as_str();
    // `converted` e `invoiced` solo los ponen la conversión y la emisión.
    if matches!(to, "converted" | "invoiced") || !transition_allowed(&doc.header.kind, from, to) {
        return Err(format!("transition_not_allowed:{from}→{to}"));
    }
    let reason = reason.map(str::trim).filter(|value| !value.is_empty());
    if to == "void" && reason.is_none() {
        return Err("reason_required".to_string());
    }
    if to == "void" && doc.header.invoice_id.is_some() {
        return Err("already_invoiced".to_string());
    }
    let mut number = doc.header.number;
    if matches!(to, "sent" | "delivered") {
        if doc.lines.is_empty() {
            return Err("empty_lines".to_string());
        }
        number = Some(reserve_commercial_number(&tx, &doc.header)?);
    }
    let void_reason = reason.filter(|_| to == "void");
    tx.execute(
        "UPDATE commercial_documents
         SET status = ?2, number = ?3, void_reason = COALESCE(?4, void_reason), updated_at = ?5
         WHERE id = ?1",
        params![id, to, number, void_reason, Utc::now().to_rfc3339()],
    )
    .map_err(db_error)?;
    audit(
        &tx,
        id,
        &format!("commercial_document_{to}"),
        json!({ "from": from, "to": to, "number": number, "reason": void_reason }),
    )?;
    tx.commit().map_err(db_error)?;
    get_commercial_document(conn, id)
}

/// Presupuesto aceptado → proforma o albarán; proforma enviada/pagada → albarán.
pub fn derive_commercial_document(
    conn: &mut Connection,
    id: &str,
    target_kind: &str,
) -> Result<CommercialDocument, String> {
    let source = get_commercial_document(conn, id)?;
    let status = source.header.status.as_str();
    let allowed = matches!(
        (source.header.kind.as_str(), status, target_kind),
        ("quote", "accepted", "proforma" | "delivery_note")
            | ("proforma", "sent" | "paid", "delivery_note")
    );
    if !allowed {
        return Err(format!("transition_not_allowed:{status}→{target_kind}"));
    }
    let input = CommercialDocumentInput {
        id: None,
        company_id: source.header.company_id.clone(),
        customer_id: source.header.customer_id.clone(),
        kind: target_kind.to_string(),
        series_code: None,
        issue_date: today(),
        valid_until: None,
        delivery_date: None,
        show_prices: true,
        notes: source.header.notes.clone(),
        lines: source.lines,
    };
    let tx = conn.transaction().map_err(db_error)?;
    let new_id = save_draft_tx(&tx, input, Some(id))?;
    tx.commit().map_err(db_error)?;
    get_commercial_document(conn, &new_id)
}

/// Un presupuesto/proforma → borrador con sus líneas; varios albaranes → borrador recapitulativo.
pub fn commercial_documents_to_invoice_draft(
    conn: &mut Connection,
    ids: &[String],
) -> Result<Invoice, String> {
    let unique: std::collections::BTreeSet<&String> = ids.iter().collect();
    if ids.is_empty() || unique.len() != ids.len() {
        return Err("validation_error:ids".to_string());
    }
    let tx = conn.transaction().map_err(db_error)?;
    let docs = ids
        .iter()
        .map(|id| get_commercial_document(&tx, id))
        .collect::<Result<Vec<_>, _>>()?;
    let first = &docs[0].header;
    let mut lines = Vec::new();
    if docs.len() == 1 && first.kind != "delivery_note" {
        if !transition_allowed(&first.kind, &first.status, "converted") {
            return Err(format!("transition_not_allowed:{}→converted", first.status));
        }
        lines.extend(docs[0].lines.iter().map(|line| line.line.clone()));
    } else {
        if docs.iter().any(|doc| doc.header.kind != "delivery_note") {
            return Err("validation_error:ids".to_string());
        }
        let month = |doc: &CommercialDocument| operation_date(&doc.header)[..7].to_string();
        if docs.iter().any(|doc| {
            doc.header.customer_id != first.customer_id || doc.header.company_id != first.company_id
        }) {
            return Err("mixed_customers".to_string());
        }
        if docs.iter().any(|doc| month(doc) != month(&docs[0])) {
            return Err("mixed_months".to_string());
        }
        if docs
            .iter()
            .any(|doc| doc.header.status == "invoiced" || doc.header.invoice_id.is_some())
        {
            return Err("already_invoiced".to_string());
        }
        if docs.iter().any(|doc| doc.header.status != "delivered") {
            return Err("not_delivered".to_string());
        }
        for doc in &docs {
            // Línea de texto a 0 € con el IVA de la primera línea: no añade tipos al desglose.
            let tax_rate_basis_points = doc
                .lines
                .first()
                .map(|line| line.line.tax_rate_basis_points)
                .unwrap_or(0);
            lines.push(InvoiceLineInput {
                description: format!(
                    "Albarán {} · {}",
                    doc.header.display_number.as_deref().unwrap_or_default(),
                    spanish_date(operation_date(&doc.header))
                ),
                quantity: 1,
                unit_price_cents: 0,
                discount_rate_basis_points: None,
                tax_rate_basis_points,
                withholding_rate_basis_points: None,
            });
            lines.extend(doc.lines.iter().map(|line| line.line.clone()));
        }
    }

    let fiscal_year = Local::now().year();
    let invoice = Invoice::draft(InvoiceDraftInput {
        company_id: first.company_id.clone(),
        customer_id: first.customer_id.clone(),
        fiscal_year,
        series: default_invoice_series(&tx, &first.company_id, fiscal_year)?,
        number: None,
        kind: InvoiceKind::Complete,
        territory_flags: default_territory_flags(&tx)?,
        lines,
        rectifies_invoice_id: None,
        rectification_reason_code: None,
        rectification_method: None,
    })?;
    insert_invoice(&tx, &invoice, None)?;
    let now = Utc::now().to_rfc3339();
    for doc in &docs {
        // Los albaranes siguen `delivered` (reservados) hasta que se emita la factura.
        let status = if doc.header.kind == "delivery_note" {
            "delivered"
        } else {
            "converted"
        };
        tx.execute(
            "UPDATE commercial_documents SET status = ?2, invoice_id = ?3, updated_at = ?4 WHERE id = ?1",
            params![doc.header.id, status, invoice.id, now],
        )
        .map_err(db_error)?;
        audit(
            &tx,
            &doc.header.id,
            "commercial_document_converted",
            json!({ "invoice_id": invoice.id, "status": status }),
        )?;
    }
    tx.commit().map_err(db_error)?;
    Ok(invoice)
}

/// Antes de emitir `draft_id`: sus documentos enlazados deben ser del mismo cliente.
pub fn check_commercial_links_for_issue(
    conn: &Connection,
    draft_id: &str,
    customer_id: &str,
) -> Result<(), String> {
    let mismatched: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM commercial_documents
             WHERE invoice_id = ?1 AND customer_id <> ?2
               AND EXISTS (SELECT 1 FROM invoices WHERE id = ?1 AND status = 'Draft')",
            params![draft_id, customer_id],
            |row| row.get(0),
        )
        .map_err(db_error)?;
    if mismatched > 0 {
        return Err("mixed_customers".to_string());
    }
    Ok(())
}

/// Al emitir (dentro de la transacción de emisión): los documentos del borrador apuntan a la
/// factura emitida y sus albaranes pasan a `invoiced`.
pub(crate) fn link_commercial_documents_to_issued(
    tx: &Connection,
    draft_id: &str,
    invoice_id: &str,
) -> Result<(), String> {
    let linked = {
        let mut stmt = tx
            .prepare(
                "SELECT id, kind FROM commercial_documents
                 WHERE invoice_id = ?1
                   AND EXISTS (SELECT 1 FROM invoices WHERE id = ?1 AND status = 'Draft')",
            )
            .map_err(db_error)?;
        let rows = stmt
            .query_map(params![draft_id], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(db_error)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(db_error)?
    };
    let now = Utc::now().to_rfc3339();
    for (id, kind) in linked {
        tx.execute(
            "UPDATE commercial_documents
             SET invoice_id = ?2,
                 status = CASE WHEN kind = 'delivery_note' THEN 'invoiced' ELSE status END,
                 updated_at = ?3
             WHERE id = ?1",
            params![id, invoice_id, now],
        )
        .map_err(db_error)?;
        if kind == "delivery_note" {
            audit(
                tx,
                &id,
                "commercial_document_invoiced",
                json!({ "from": "delivered", "to": "invoiced", "invoice_id": invoice_id }),
            )?;
        }
    }
    Ok(())
}

pub fn commercial_document_pdf_data(
    conn: &Connection,
    id: &str,
) -> Result<CommercialDocumentPdfData, String> {
    let document = get_commercial_document(conn, id)?;
    let (company_legal_name, company_tax_id, customer_display_name, customer_tax_id) = conn
        .query_row(
            "SELECT c.legal_name, c.tax_id, cu.display_name, cu.tax_id
             FROM companies c, customers cu WHERE c.id = ?1 AND cu.id = ?2",
            params![document.header.company_id, document.header.customer_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .map_err(db_error)?;
    Ok(CommercialDocumentPdfData {
        document,
        company_legal_name,
        company_tax_id,
        customer_display_name,
        customer_tax_id,
    })
}

/// `P-2026-0014`: serie, año y número con 4 cifras.
pub fn commercial_display_number(series_code: &str, fiscal_year: i32, number: i64) -> String {
    format!("{series_code}-{fiscal_year}-{number:04}")
}

fn save_draft_tx(
    tx: &Transaction<'_>,
    input: CommercialDocumentInput,
    source_document_id: Option<&str>,
) -> Result<String, String> {
    validate_kind(&input.kind)?;
    for (field, value) in [
        ("company_id", &input.company_id),
        ("customer_id", &input.customer_id),
    ] {
        if value.trim().is_empty() {
            return Err(format!("validation_error:{field}"));
        }
    }
    let issue_date = parse_date("issue_date", &input.issue_date)?;
    let valid_until = clean_optional(input.valid_until);
    let delivery_date = clean_optional(input.delivery_date);
    let is_note = input.kind == "delivery_note";
    if is_note && valid_until.is_some() {
        return Err("validation_error:valid_until".to_string());
    }
    if !is_note && delivery_date.is_some() {
        return Err("validation_error:delivery_date".to_string());
    }
    if let Some(value) = &valid_until {
        parse_date("valid_until", value)?;
    }
    if let Some(value) = &delivery_date {
        parse_date("delivery_date", value)?;
    }
    let series_code =
        clean_optional(input.series_code).unwrap_or_else(|| default_series(&input.kind).into());
    let totals = document_totals(&input.lines)?;
    let now = Utc::now().to_rfc3339();

    let id = match &input.id {
        Some(id) => {
            let current: Option<(String, String, String)> = tx
                .query_row(
                    "SELECT status, kind, company_id FROM commercial_documents WHERE id = ?1",
                    params![id],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
                )
                .optional()
                .map_err(db_error)?;
            let (status, kind, company_id) = current.ok_or_else(|| "not_found".to_string())?;
            if status != "draft" {
                return Err("not_draft".to_string());
            }
            if kind != input.kind || company_id != input.company_id {
                return Err("validation_error:kind".to_string());
            }
            tx.execute(
                "UPDATE commercial_documents
                 SET customer_id = ?2, series_code = ?3, fiscal_year = ?4, issue_date = ?5,
                     valid_until = ?6, delivery_date = ?7, show_prices = ?8, notes = ?9,
                     taxable_base_cents = ?10, tax_cents = ?11, withholding_cents = ?12,
                     total_cents = ?13, updated_at = ?14
                 WHERE id = ?1",
                params![
                    id,
                    input.customer_id,
                    series_code,
                    issue_date.year(),
                    input.issue_date.trim(),
                    valid_until,
                    delivery_date,
                    input.show_prices,
                    input.notes,
                    totals.taxable_base_cents,
                    totals.tax_cents,
                    totals.withholding_cents,
                    totals.total_cents,
                    now,
                ],
            )
            .map_err(db_error)?;
            tx.execute(
                "DELETE FROM commercial_document_lines WHERE document_id = ?1",
                params![id],
            )
            .map_err(db_error)?;
            id.clone()
        }
        None => {
            let id = uuid::Uuid::new_v4().to_string();
            tx.execute(
                "INSERT INTO commercial_documents (id, company_id, customer_id, kind, series_code, fiscal_year, number, status,
                    issue_date, valid_until, delivery_date, show_prices, notes,
                    taxable_base_cents, tax_cents, withholding_cents, total_cents,
                    source_document_id, invoice_id, void_reason, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, 'draft', ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, NULL, NULL, ?17, ?17)",
                params![
                    id,
                    input.company_id,
                    input.customer_id,
                    input.kind,
                    series_code,
                    issue_date.year(),
                    input.issue_date.trim(),
                    valid_until,
                    delivery_date,
                    input.show_prices,
                    input.notes,
                    totals.taxable_base_cents,
                    totals.tax_cents,
                    totals.withholding_cents,
                    totals.total_cents,
                    source_document_id,
                    now,
                ],
            )
            .map_err(db_error)?;
            audit(
                tx,
                &id,
                "commercial_document_created",
                json!({ "kind": input.kind, "source_document_id": source_document_id, "total_cents": totals.total_cents }),
            )?;
            id
        }
    };

    for (index, line) in input.lines.iter().enumerate() {
        tx.execute(
            "INSERT INTO commercial_document_lines (id, document_id, position, description, quantity, unit_price_cents,
                discount_rate_basis_points, tax_rate_basis_points, withholding_rate_basis_points, product_id)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                uuid::Uuid::new_v4().to_string(),
                id,
                index as i64 + 1,
                line.line.description,
                line.line.quantity,
                line.line.unit_price_cents,
                line.line.discount_rate_basis_points,
                line.line.tax_rate_basis_points,
                line.line.withholding_rate_basis_points,
                clean_optional(line.product_id.clone()),
            ],
        )
        .map_err(db_error)?;
    }
    Ok(id)
}

fn transition_allowed(kind: &str, from: &str, to: &str) -> bool {
    matches!(
        (kind, from, to),
        ("quote", "draft", "sent")
            | (
                "quote",
                "sent",
                "accepted" | "rejected" | "expired" | "superseded"
            )
            | ("quote", "accepted", "converted")
            | ("quote", "sent" | "accepted", "void")
            | ("proforma", "draft", "sent")
            | ("proforma", "sent", "paid" | "converted" | "superseded")
            | ("proforma", "paid", "converted")
            | ("proforma", "sent" | "paid", "void")
            | ("delivery_note", "draft", "delivered")
            | ("delivery_note", "delivered", "invoiced" | "void")
    )
}

fn reserve_commercial_number(
    tx: &Transaction<'_>,
    doc: &CommercialDocumentSummary,
) -> Result<i64, String> {
    let key = params![doc.company_id, doc.kind, doc.series_code, doc.fiscal_year];
    tx.execute(
        "INSERT OR IGNORE INTO commercial_sequences (company_id, kind, series_code, fiscal_year, next_number)
         VALUES (?1, ?2, ?3, ?4, 1)",
        key,
    )
    .map_err(db_error)?;
    let next: i64 = tx
        .query_row(
            "SELECT next_number FROM commercial_sequences
             WHERE company_id = ?1 AND kind = ?2 AND series_code = ?3 AND fiscal_year = ?4",
            key,
            |row| row.get(0),
        )
        .map_err(db_error)?;
    tx.execute(
        "UPDATE commercial_sequences SET next_number = next_number + 1
         WHERE company_id = ?1 AND kind = ?2 AND series_code = ?3 AND fiscal_year = ?4",
        key,
    )
    .map_err(db_error)?;
    Ok(next)
}

fn audit(
    conn: &Connection,
    id: &str,
    action: &str,
    payload: serde_json::Value,
) -> Result<(), String> {
    let event = AuditEvent::operational(
        "commercial_document",
        id,
        action,
        fiscal_contract::sha256_hex(payload.to_string().as_bytes()),
        latest_audit_hash(conn)?,
    );
    conn.execute(
        "INSERT INTO audit_events (id, entity_type, entity_id, action, actor, occurred_at, payload_hash, previous_hash, hash)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            event.id,
            event.entity_type,
            event.entity_id,
            event.action,
            event.actor,
            event.occurred_at,
            event.payload_hash,
            event.previous_hash,
            event.chain_hash(),
        ],
    )
    .map(|_| ())
    .map_err(db_error)
}

fn summary_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<CommercialDocumentSummary> {
    let series_code: String = row.get(4)?;
    let fiscal_year: i32 = row.get(5)?;
    let number: Option<i64> = row.get(6)?;
    Ok(CommercialDocumentSummary {
        id: row.get(0)?,
        company_id: row.get(1)?,
        customer_id: row.get(2)?,
        kind: row.get(3)?,
        display_number: number
            .map(|value| commercial_display_number(&series_code, fiscal_year, value)),
        series_code,
        fiscal_year,
        number,
        status: row.get(7)?,
        issue_date: row.get(8)?,
        valid_until: row.get(9)?,
        delivery_date: row.get(10)?,
        show_prices: row.get(11)?,
        notes: row.get(12)?,
        taxable_base_cents: row.get(13)?,
        tax_cents: row.get(14)?,
        withholding_cents: row.get(15)?,
        total_cents: row.get(16)?,
        source_document_id: row.get(17)?,
        invoice_id: row.get(18)?,
        void_reason: row.get(19)?,
        created_at: row.get(20)?,
        updated_at: row.get(21)?,
    })
}

/// Totales con el mismo código que las facturas (`domain::invoice`).
fn document_totals(lines: &[CommercialDocumentLine]) -> Result<InvoiceTotals, String> {
    let built = lines
        .iter()
        .map(|line| build_line(line.line.clone(), false))
        .collect::<Result<Vec<_>, _>>()
        // Los errores de `build_line` empiezan por el campo: "line.quantity must be positive".
        .map_err(|err| {
            format!(
                "validation_error:{}",
                err.split(' ').next().unwrap_or("lines")
            )
        })?;
    Ok(calculate_totals(&built))
}

fn default_invoice_series(
    conn: &Connection,
    company_id: &str,
    year: i32,
) -> Result<String, String> {
    if let Some(config) = list_invoice_series_configs(conn, company_id, year)?
        .into_iter()
        .find(|config| config.is_default)
    {
        return Ok(config.resolved_series);
    }
    conn.query_row(
        "SELECT default_series FROM companies WHERE id = ?1",
        params![company_id],
        |row| row.get(0),
    )
    .map_err(db_error)
}

fn default_territory_flags(conn: &Connection) -> Result<Vec<TerritoryFlag>, String> {
    get_app_settings(conn)?
        .default_territory_flags
        .into_iter()
        .map(|flag| serde_json::from_value(serde_json::Value::String(flag)))
        .collect::<Result<Vec<_>, _>>()
        .map_err(|err| format!("settings json error: {err}"))
}

fn validate_kind(kind: &str) -> Result<(), String> {
    if matches!(kind, "quote" | "proforma" | "delivery_note") {
        Ok(())
    } else {
        Err("validation_error:kind".to_string())
    }
}

fn default_series(kind: &str) -> &'static str {
    match kind {
        "quote" => "P",
        "proforma" => "PF",
        _ => "AL",
    }
}

/// Fecha de la operación del albarán (entrega o, si falta, la del documento).
fn operation_date(doc: &CommercialDocumentSummary) -> &str {
    doc.delivery_date.as_deref().unwrap_or(&doc.issue_date)
}

fn parse_date(field: &str, value: &str) -> Result<NaiveDate, String> {
    NaiveDate::parse_from_str(value.trim(), "%Y-%m-%d")
        .map_err(|_| format!("validation_error:{field}"))
}

fn spanish_date(iso: &str) -> String {
    NaiveDate::parse_from_str(iso, "%Y-%m-%d")
        .map(|date| date.format("%d/%m/%Y").to_string())
        .unwrap_or_else(|_| iso.to_string())
}

fn today() -> String {
    Local::now().date_naive().format("%Y-%m-%d").to_string()
}

fn default_true() -> bool {
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::company::{Company, CompanyInput};
    use crate::domain::customer::{Customer, CustomerInput, CustomerKind};
    use crate::domain::invoice::InvoiceIssueInput;

    struct Fixture {
        conn: Connection,
        company_id: String,
        customer_id: String,
        other_customer_id: String,
    }

    fn customer(name: &str, tax_id: &str) -> Customer {
        Customer::from_input(CustomerInput {
            id: None,
            display_name: name.to_string(),
            tax_id: tax_id.to_string(),
            kind: CustomerKind::Business,
            address: "Calle Cliente 1".to_string(),
            postal_code: "28002".to_string(),
            municipality: "Madrid".to_string(),
            province: "Madrid".to_string(),
            country_code: "ES".to_string(),
        })
    }

    fn fixture() -> Fixture {
        let conn = test_conn();
        let company = Company::from_input(CompanyInput {
            legal_name: "Demo SL".to_string(),
            tax_id: "B00000000".to_string(),
            address: "Calle Demo 1".to_string(),
            postal_code: "28001".to_string(),
            municipality: "Madrid".to_string(),
            province: "Madrid".to_string(),
            country_code: "ES".to_string(),
            default_series: Some("A".to_string()),
        });
        insert_company(&conn, &company).expect("company");
        let first = customer("Cliente Demo", "00000000T");
        let other = customer("Otro Cliente", "11111111H");
        upsert_customer(&conn, &first).expect("customer");
        upsert_customer(&conn, &other).expect("other customer");
        Fixture {
            conn,
            company_id: company.id,
            customer_id: first.id,
            other_customer_id: other.id,
        }
    }

    fn line(description: &str, quantity: i64, price: i64) -> CommercialDocumentLine {
        CommercialDocumentLine {
            line: InvoiceLineInput {
                description: description.to_string(),
                quantity,
                unit_price_cents: price,
                discount_rate_basis_points: Some(1_000),
                tax_rate_basis_points: 2_100,
                withholding_rate_basis_points: Some(1_500),
            },
            product_id: None,
            position: 0,
        }
    }

    fn input(f: &Fixture, kind: &str) -> CommercialDocumentInput {
        let is_note = kind == "delivery_note";
        CommercialDocumentInput {
            id: None,
            company_id: f.company_id.clone(),
            customer_id: f.customer_id.clone(),
            kind: kind.to_string(),
            series_code: None,
            issue_date: "2026-11-03".to_string(),
            valid_until: (!is_note).then(|| "2099-12-31".to_string()),
            delivery_date: is_note.then(|| "2026-11-05".to_string()),
            show_prices: true,
            notes: "Pago a 30 días".to_string(),
            lines: vec![line("Diseño web", 2, 12_345), line("Hosting", 1, 999)],
        }
    }

    fn save(f: &mut Fixture, kind: &str) -> Result<CommercialDocument, String> {
        let doc = input(f, kind);
        save_commercial_draft(&mut f.conn, doc)
    }

    fn delivered_note(f: &mut Fixture, customer_id: &str, date: &str) -> CommercialDocument {
        let mut note = input(f, "delivery_note");
        note.customer_id = customer_id.to_string();
        note.delivery_date = Some(date.to_string());
        let note = save_commercial_draft(&mut f.conn, note).expect("note");
        send_commercial_document(&mut f.conn, &note.header.id).expect("delivered")
    }

    fn count(conn: &Connection, table: &str) -> i64 {
        conn.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
            row.get(0)
        })
        .expect("count")
    }

    fn quote_filters(f: &Fixture, status: Option<&str>) -> CommercialDocumentListFilters {
        CommercialDocumentListFilters {
            company_id: f.company_id.clone(),
            kind: "quote".to_string(),
            status: status.map(str::to_string),
            customer_id: None,
            year: None,
        }
    }

    fn temp_pdf() -> String {
        std::env::temp_dir()
            .join(format!("cumplefactura-doc-{}.pdf", uuid::Uuid::new_v4()))
            .to_string_lossy()
            .into_owned()
    }

    const FISCAL_TABLES: [&str; 4] = [
        "invoice_sequences",
        "fiscal_records",
        "fiscal_exports",
        "verifactu_submissions",
    ];

    #[test]
    fn quote_sends_with_own_series_and_converts_to_identical_draft() {
        let mut f = fixture();
        let quote = save(&mut f, "quote").expect("quote");
        assert_eq!(quote.header.status, "draft");
        assert_eq!(quote.header.number, None);
        assert_eq!(quote.header.series_code, "P");

        let sent = send_commercial_document(&mut f.conn, &quote.header.id).expect("send");
        assert_eq!(sent.header.status, "sent");
        assert_eq!(sent.header.display_number.as_deref(), Some("P-2026-0001"));
        let second = save(&mut f, "quote").expect("quote 2");
        let second = send_commercial_document(&mut f.conn, &second.header.id).expect("send 2");
        assert_eq!(second.header.display_number.as_deref(), Some("P-2026-0002"));
        let proforma = save(&mut f, "proforma").expect("pf");
        let proforma = send_commercial_document(&mut f.conn, &proforma.header.id).expect("send");
        assert_eq!(
            proforma.header.display_number.as_deref(),
            Some("PF-2026-0001")
        );

        set_commercial_status(&mut f.conn, &quote.header.id, "accepted", None).expect("accept");
        let invoice = commercial_documents_to_invoice_draft(
            &mut f.conn,
            std::slice::from_ref(&quote.header.id),
        )
        .expect("draft");

        assert!(matches!(
            invoice.status,
            crate::domain::invoice::InvoiceStatus::Draft
        ));
        assert_eq!(invoice.number, None);
        assert_eq!(invoice.series, "A");
        assert_eq!(invoice.lines.len(), quote.lines.len());
        for (invoice_line, quote_line) in invoice.lines.iter().zip(&quote.lines) {
            assert_eq!(invoice_line.description, quote_line.line.description);
            assert_eq!(invoice_line.quantity, quote_line.line.quantity);
            assert_eq!(
                invoice_line.unit_price_cents,
                quote_line.line.unit_price_cents
            );
            assert_eq!(
                Some(invoice_line.discount_rate_basis_points),
                quote_line.line.discount_rate_basis_points
            );
        }
        assert_eq!(
            invoice.totals.taxable_base_cents,
            quote.header.taxable_base_cents
        );
        assert_eq!(invoice.totals.tax_cents, quote.header.tax_cents);
        assert_eq!(
            invoice.totals.withholding_cents,
            quote.header.withholding_cents
        );
        assert_eq!(invoice.totals.total_cents, quote.header.total_cents);

        let converted = get_commercial_document(&f.conn, &quote.header.id).expect("get");
        assert_eq!(converted.header.status, "converted");
        assert_eq!(
            converted.header.invoice_id.as_deref(),
            Some(invoice.id.as_str())
        );
        let stored: i64 = f
            .conn
            .query_row(
                "SELECT total_cents FROM invoices WHERE id = ?1 AND status = 'Draft'",
                params![invoice.id],
                |row| row.get(0),
            )
            .expect("stored draft");
        assert_eq!(stored, quote.header.total_cents);

        let actions: Vec<String> = f
            .conn
            .prepare("SELECT action FROM audit_events WHERE entity_id = ?1 ORDER BY rowid")
            .expect("stmt")
            .query_map(params![quote.header.id], |row| row.get(0))
            .expect("rows")
            .collect::<Result<_, _>>()
            .expect("actions");
        assert_eq!(
            actions,
            [
                "commercial_document_created",
                "commercial_document_sent",
                "commercial_document_accepted",
                "commercial_document_converted"
            ]
        );
    }

    #[test]
    fn no_command_of_the_module_writes_fiscal_tables() {
        let mut f = fixture();
        let before: Vec<i64> = FISCAL_TABLES.iter().map(|t| count(&f.conn, t)).collect();

        let quote = save(&mut f, "quote").expect("quote");
        let mut edit = input(&f, "quote");
        edit.id = Some(quote.header.id.clone());
        save_commercial_draft(&mut f.conn, edit).expect("edit draft");
        send_commercial_document(&mut f.conn, &quote.header.id).expect("send");
        set_commercial_status(&mut f.conn, &quote.header.id, "accepted", None).expect("accept");
        let proforma =
            derive_commercial_document(&mut f.conn, &quote.header.id, "proforma").expect("derive");
        assert_eq!(
            proforma.header.source_document_id.as_deref(),
            Some(quote.header.id.as_str())
        );
        send_commercial_document(&mut f.conn, &proforma.header.id).expect("send pf");
        set_commercial_status(&mut f.conn, &proforma.header.id, "paid", None).expect("paid");
        commercial_documents_to_invoice_draft(
            &mut f.conn,
            std::slice::from_ref(&proforma.header.id),
        )
        .expect("pf to invoice");
        commercial_documents_to_invoice_draft(&mut f.conn, std::slice::from_ref(&quote.header.id))
            .expect("quote to invoice");
        let scratch = save(&mut f, "quote").expect("scratch");
        delete_commercial_draft(&mut f.conn, &scratch.header.id).expect("delete");
        let customer_id = f.customer_id.clone();
        let note = delivered_note(&mut f, &customer_id, "2026-11-05");
        commercial_documents_to_invoice_draft(&mut f.conn, std::slice::from_ref(&note.header.id))
            .expect("recap");
        let other = delivered_note(&mut f, &customer_id, "2026-11-06");
        set_commercial_status(&mut f.conn, &other.header.id, "void", Some("Error")).expect("void");
        let page =
            list_commercial_documents(&f.conn, quote_filters(&f, None), ListPagination::default())
                .expect("list");
        assert_eq!(page.total, 1);
        let target = temp_pdf();
        let data = commercial_document_pdf_data(&f.conn, &quote.header.id).expect("pdf data");
        crate::services::pdf::write_commercial_document_pdf(&target, &data).expect("pdf");
        std::fs::remove_file(target).expect("cleanup");

        let after: Vec<i64> = FISCAL_TABLES.iter().map(|t| count(&f.conn, t)).collect();
        assert_eq!(before, after);
        assert!(after.iter().all(|value| *value == 0));
        assert_eq!(count(&f.conn, "commercial_sequences"), 3);
    }

    #[test]
    fn recapitulative_rejects_mixed_or_unavailable_delivery_notes() {
        let mut f = fixture();
        let (me, other) = (f.customer_id.clone(), f.other_customer_id.clone());
        let a = delivered_note(&mut f, &me, "2026-11-05").header.id;
        let b = delivered_note(&mut f, &other, "2026-11-06").header.id;
        let c = delivered_note(&mut f, &me, "2026-10-30").header.id;
        let draft = save(&mut f, "delivery_note").expect("draft note").header.id;
        let d = delivered_note(&mut f, &me, "2026-11-20").header.id;
        commercial_documents_to_invoice_draft(&mut f.conn, std::slice::from_ref(&d))
            .expect("reserve d");

        let mut err = |ids: &[&String]| {
            let ids: Vec<String> = ids.iter().map(|id| id.to_string()).collect();
            commercial_documents_to_invoice_draft(&mut f.conn, &ids).expect_err("must fail")
        };
        assert_eq!(err(&[&a, &b]), "mixed_customers");
        assert_eq!(err(&[&a, &c]), "mixed_months");
        assert_eq!(err(&[&a, &draft]), "not_delivered");
        assert_eq!(err(&[&a, &d]), "already_invoiced");
        assert_eq!(err(&[&a, &a]), "validation_error:ids");

        let note = get_commercial_document(&f.conn, &a).expect("a");
        assert_eq!(note.header.status, "delivered");
        assert_eq!(note.header.invoice_id, None);
    }

    #[test]
    fn recapitulative_reserves_notes_until_issue_and_frees_them_if_draft_is_deleted() {
        let mut f = fixture();
        let me = f.customer_id.clone();
        let a = delivered_note(&mut f, &me, "2026-11-05");
        let b = delivered_note(&mut f, &me, "2026-11-20");
        let ids = [a.header.id.clone(), b.header.id.clone()];

        let draft = commercial_documents_to_invoice_draft(&mut f.conn, &ids).expect("recap");
        let descriptions: Vec<&str> = draft
            .lines
            .iter()
            .map(|line| line.description.as_str())
            .collect();
        assert_eq!(
            descriptions,
            [
                "Albarán AL-2026-0001 · 05/11/2026",
                "Diseño web",
                "Hosting",
                "Albarán AL-2026-0002 · 20/11/2026",
                "Diseño web",
                "Hosting"
            ]
        );
        assert_eq!(
            (draft.lines[0].taxable_base_cents, draft.lines[0].tax_cents),
            (0, 0)
        );
        assert_eq!(
            draft.totals.total_cents,
            a.header.total_cents + b.header.total_cents
        );
        let reserved = get_commercial_document(&f.conn, &a.header.id).expect("a");
        assert_eq!(reserved.header.status, "delivered");
        assert_eq!(
            reserved.header.invoice_id.as_deref(),
            Some(draft.id.as_str())
        );
        let void = set_commercial_status(&mut f.conn, &a.header.id, "void", Some("x"));
        assert_eq!(void.expect_err("reserved"), "already_invoiced");

        // Borrar el borrador (como haría un futuro borrado de borradores) libera los albaranes.
        for sql in [
            "DELETE FROM invoice_lines WHERE invoice_id = ?1",
            "DELETE FROM invoice_territory_flags WHERE invoice_id = ?1",
            "DELETE FROM invoices WHERE id = ?1",
        ] {
            f.conn
                .execute(sql, params![draft.id])
                .expect("delete draft");
        }
        let freed = get_commercial_document(&f.conn, &a.header.id).expect("a");
        assert_eq!(freed.header.status, "delivered");
        assert_eq!(freed.header.invoice_id, None);

        let draft = commercial_documents_to_invoice_draft(&mut f.conn, &ids).expect("again");
        assert_eq!(
            check_commercial_links_for_issue(&f.conn, &draft.id, &f.other_customer_id)
                .expect_err("other customer"),
            "mixed_customers"
        );
        check_commercial_links_for_issue(&f.conn, &draft.id, &me).expect("same customer");
        let (issued, fiscal_hash) = Invoice::issue(InvoiceIssueInput {
            draft: InvoiceDraftInput {
                company_id: draft.company_id.clone(),
                customer_id: draft.customer_id.clone(),
                fiscal_year: draft.fiscal_year,
                series: draft.series.clone(),
                number: None,
                kind: InvoiceKind::Complete,
                territory_flags: draft.territory_flags.clone(),
                lines: vec![line("Diseño web", 2, 12_345).line],
                rectifies_invoice_id: None,
                rectification_reason_code: None,
                rectification_method: None,
            },
            number: 1,
            issued_at: "2026-11-30T10:00:00Z".to_string(),
            actor: "test".to_string(),
            previous_audit_hash: None,
        })
        .expect("issue");
        let event = AuditEvent::invoice_issued(
            issued.id.clone(),
            "test".to_string(),
            fiscal_hash.clone(),
            latest_audit_hash(&f.conn).expect("hash"),
        );
        insert_issued_invoice_from_draft(
            &mut f.conn,
            &issued,
            &fiscal_hash,
            None,
            &event,
            Some(&draft.id),
        )
        .expect("insert");
        // El borrador se consume al emitir: no puede emitirse una segunda vez.
        let drafts: i64 = f
            .conn
            .query_row(
                "SELECT COUNT(*) FROM invoices WHERE id = ?1",
                params![draft.id],
                |row| row.get(0),
            )
            .expect("count");
        assert_eq!(drafts, 0);

        for id in &ids {
            let note = get_commercial_document(&f.conn, id).expect("note");
            assert_eq!(note.header.status, "invoiced");
            assert_eq!(note.header.invoice_id.as_deref(), Some(issued.id.as_str()));
        }
        let again = commercial_documents_to_invoice_draft(&mut f.conn, &ids);
        assert_eq!(again.expect_err("invoiced"), "already_invoiced");
    }

    #[test]
    fn invalid_transitions_return_code_and_change_nothing() {
        let mut f = fixture();
        let quote = save(&mut f, "quote").expect("quote");
        let id = quote.header.id.clone();
        let snapshot = |f: &Fixture| {
            (
                serde_json::to_string(&get_commercial_document(&f.conn, &id).expect("get"))
                    .expect("json"),
                count(&f.conn, "audit_events"),
                count(&f.conn, "commercial_sequences"),
                count(&f.conn, "invoices"),
            )
        };
        let before = snapshot(&f);
        let cases = [
            ("accepted", None, "transition_not_allowed:draft→accepted"),
            ("converted", None, "transition_not_allowed:draft→converted"),
            ("void", Some("motivo"), "transition_not_allowed:draft→void"),
            ("paid", None, "transition_not_allowed:draft→paid"),
        ];
        for (to, reason, expected) in cases {
            let err = set_commercial_status(&mut f.conn, &id, to, reason).expect_err(to);
            assert_eq!(err, expected);
        }
        assert_eq!(
            commercial_documents_to_invoice_draft(&mut f.conn, std::slice::from_ref(&id))
                .expect_err("draft"),
            "transition_not_allowed:draft→converted"
        );
        assert_eq!(
            derive_commercial_document(&mut f.conn, &id, "proforma").expect_err("derive"),
            "transition_not_allowed:draft→proforma"
        );
        assert_eq!(snapshot(&f), before);

        send_commercial_document(&mut f.conn, &id).expect("send");
        assert_eq!(
            send_commercial_document(&mut f.conn, &id).expect_err("again"),
            "not_draft"
        );
        let mut edit = input(&f, "quote");
        edit.id = Some(id.clone());
        assert_eq!(
            save_commercial_draft(&mut f.conn, edit).expect_err("sent is immutable"),
            "not_draft"
        );
        assert_eq!(
            delete_commercial_draft(&mut f.conn, &id).expect_err("delete"),
            "not_draft"
        );
        assert_eq!(
            set_commercial_status(&mut f.conn, &id, "void", Some("  ")).expect_err("reason"),
            "reason_required"
        );
        let voided =
            set_commercial_status(&mut f.conn, &id, "void", Some("Cliente desiste")).expect("void");
        assert_eq!(
            voided.header.void_reason.as_deref(),
            Some("Cliente desiste")
        );
        assert_eq!(
            set_commercial_status(&mut f.conn, &id, "sent", None).expect_err("from void"),
            "transition_not_allowed:void→sent"
        );

        let note = save(&mut f, "delivery_note").expect("note");
        assert_eq!(
            set_commercial_status(&mut f.conn, &note.header.id, "invoiced", None)
                .expect_err("invoiced only via issue"),
            "transition_not_allowed:draft→invoiced"
        );
        let mut empty = input(&f, "proforma");
        empty.lines.clear();
        let empty = save_commercial_draft(&mut f.conn, empty).expect("empty draft");
        assert_eq!(
            send_commercial_document(&mut f.conn, &empty.header.id).expect_err("empty"),
            "empty_lines"
        );
    }

    #[test]
    fn sent_quote_past_valid_until_reads_as_expired() {
        let mut f = fixture();
        let mut old = input(&f, "quote");
        old.issue_date = "2020-01-02".to_string();
        old.valid_until = Some("2020-01-31".to_string());
        let old = save_commercial_draft(&mut f.conn, old).expect("old");
        let old = send_commercial_document(&mut f.conn, &old.header.id).expect("send");
        assert_eq!(old.header.status, "expired");
        assert_eq!(old.header.display_number.as_deref(), Some("P-2020-0001"));
        assert_eq!(
            set_commercial_status(&mut f.conn, &old.header.id, "accepted", None)
                .expect_err("expired"),
            "transition_not_allowed:expired→accepted"
        );
        save(&mut f, "quote").expect("fresh");
        let page = list_commercial_documents(
            &f.conn,
            quote_filters(&f, Some("expired")),
            ListPagination::default(),
        )
        .expect("list");
        assert_eq!(page.total, 1);
        assert_eq!(page.items[0].id, old.header.id);
    }

    #[test]
    fn save_draft_validates_fields() {
        let mut f = fixture();
        let mut bad = input(&f, "quote");
        bad.issue_date = "03/11/2026".to_string();
        assert_eq!(
            save_commercial_draft(&mut f.conn, bad).expect_err("date"),
            "validation_error:issue_date"
        );
        let mut bad = input(&f, "quote");
        bad.lines[0].line.quantity = 0;
        assert_eq!(
            save_commercial_draft(&mut f.conn, bad).expect_err("qty"),
            "validation_error:line.quantity"
        );
        let mut bad = input(&f, "quote");
        bad.kind = "invoice".to_string();
        assert_eq!(
            save_commercial_draft(&mut f.conn, bad).expect_err("kind"),
            "validation_error:kind"
        );
        let mut bad = input(&f, "delivery_note");
        bad.valid_until = Some("2026-12-01".to_string());
        assert_eq!(
            save_commercial_draft(&mut f.conn, bad).expect_err("valid_until"),
            "validation_error:valid_until"
        );
        assert_eq!(count(&f.conn, "commercial_documents"), 0);
    }

    #[test]
    fn line_json_matches_invoice_line_input_plus_position() {
        let parsed: CommercialDocumentLine = serde_json::from_value(json!({
            "description": "Servicio",
            "quantity": 1,
            "unit_price_cents": 100,
            "tax_rate_basis_points": 2100,
            "position": 3
        }))
        .expect("line json");
        assert_eq!(parsed.position, 3);
        assert_eq!(parsed.line.discount_rate_basis_points, None);
        let value = serde_json::to_value(&parsed).expect("to json");
        assert_eq!(value["unit_price_cents"], 100);
        assert!(value.get("line").is_none());
    }

    #[test]
    fn pdfs_say_no_fiscal_value_and_carry_no_qr_or_hash() {
        let mut f = fixture();
        for kind in ["quote", "proforma", "delivery_note"] {
            let mut doc = input(&f, kind);
            doc.show_prices = kind != "delivery_note";
            let doc = save_commercial_draft(&mut f.conn, doc).expect("doc");
            let doc = send_commercial_document(&mut f.conn, &doc.header.id).expect("send");
            let target = temp_pdf();
            let data = commercial_document_pdf_data(&f.conn, &doc.header.id).expect("data");
            let sha =
                crate::services::pdf::write_commercial_document_pdf(&target, &data).expect("pdf");
            let bytes = std::fs::read(&target).expect("read");
            std::fs::remove_file(&target).expect("cleanup");
            let text = String::from_utf8_lossy(&bytes);

            assert_eq!(sha, fiscal_contract::sha256_hex(&bytes));
            assert!(text.contains("(Documento sin valor fiscal) Tj"), "{kind}");
            assert!(!text.contains("Huella") && !text.contains("QR"), "{kind}");
            assert!(!text.contains("/Image") && !text.contains("AEAT"), "{kind}");
            match kind {
                "quote" => assert!(text.contains("(Presupuesto P-2026-0001) Tj")),
                "proforma" => {
                    assert!(text.contains("/F1 20 Tf\n(Factura proforma \\267 sin valor fiscal)"));
                    assert!(text.contains("PVP"));
                }
                _ => {
                    assert!(text.contains("(Albar\\341n AL-2026-0001) Tj"));
                    assert!(!text.contains("PVP") && !text.contains("Total"));
                }
            }
        }
    }
}
