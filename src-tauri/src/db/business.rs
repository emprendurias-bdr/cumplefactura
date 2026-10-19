//! Gestion operativa sobre facturas: cobros y vencimientos, recurrentes, presupuestos y emails.
//!
//! Regla comun: nada de esto modifica registros fiscales ni facturas emitidas (salvo la fecha
//! de vencimiento, que no forma parte del registro VERI*FACTU). Cada cambio deja un evento en
//! `audit_events` encadenado al ultimo hash, igual que la emision.

use super::{db_error, insert_invoice_draft, latest_audit_hash};
use crate::domain::invoice::{Invoice, InvoiceDraftInput};
use crate::services::audit::AuditEvent;
use chrono::{Datelike, Months, NaiveDate, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;

const DATE_FORMAT: &str = "%Y-%m-%d";

pub fn parse_date(value: &str) -> Result<NaiveDate, String> {
    NaiveDate::parse_from_str(value.trim(), DATE_FORMAT)
        .map_err(|_| format!("invalid date (expected YYYY-MM-DD): {value}"))
}

fn audit(
    conn: &Connection,
    entity_type: &str,
    entity_id: &str,
    action: &str,
    payload: &str,
) -> Result<(), String> {
    let payload_hash = hex::encode(Sha256::digest(payload.as_bytes()));
    let event = AuditEvent::operational(
        entity_type,
        entity_id,
        action,
        payload_hash,
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
    .map_err(db_error)?;
    Ok(())
}

// ───────────────────────────── Cobros y vencimientos ─────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaymentInput {
    pub invoice_id: String,
    pub amount_cents: i64,
    pub paid_at: String,
    pub method: String,
    pub reference: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Payment {
    pub id: String,
    pub invoice_id: String,
    pub amount_cents: i64,
    pub paid_at: String,
    pub method: String,
    pub reference: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum CollectionStatus {
    Paid,
    Partial,
    Pending,
    Overdue,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Receivable {
    pub invoice_id: String,
    pub company_id: String,
    pub customer_id: String,
    pub customer_name: String,
    pub customer_tax_id: String,
    pub series: String,
    pub number: Option<i64>,
    pub issued_at: Option<String>,
    pub due_date: Option<String>,
    pub total_cents: i64,
    pub paid_cents: i64,
    pub outstanding_cents: i64,
    pub status: CollectionStatus,
    pub days_overdue: i64,
}

const METHODS: [&str; 6] = ["transfer", "card", "cash", "direct_debit", "bizum", "other"];

/// Estado de cobro. Sin vencimiento se considera al contado (vence el dia de emision).
pub fn collection_status(
    total_cents: i64,
    paid_cents: i64,
    due: Option<NaiveDate>,
    today: NaiveDate,
) -> (CollectionStatus, i64) {
    let outstanding = total_cents - paid_cents;
    if outstanding <= 0 {
        return (CollectionStatus::Paid, 0);
    }
    let days_overdue = due.map(|d| (today - d).num_days()).unwrap_or(0).max(0);
    let status = if days_overdue > 0 {
        CollectionStatus::Overdue
    } else if paid_cents > 0 {
        CollectionStatus::Partial
    } else {
        CollectionStatus::Pending
    };
    (status, days_overdue)
}

pub fn set_invoice_due_date(
    conn: &Connection,
    invoice_id: &str,
    due_date: Option<&str>,
) -> Result<(), String> {
    if let Some(value) = due_date {
        parse_date(value)?;
    }
    let changed = conn
        .execute(
            "UPDATE invoices SET due_date = ?1 WHERE id = ?2",
            params![due_date.map(str::trim), invoice_id],
        )
        .map_err(db_error)?;
    if changed == 0 {
        return Err("invoice not found".to_string());
    }
    audit(
        conn,
        "invoice",
        invoice_id,
        "due_date_set",
        due_date.unwrap_or("none"),
    )
}

pub fn register_payment(conn: &Connection, input: PaymentInput) -> Result<Payment, String> {
    if input.amount_cents <= 0 {
        return Err("amount_cents must be positive".to_string());
    }
    if !METHODS.contains(&input.method.as_str()) {
        return Err(format!("unsupported payment method: {}", input.method));
    }
    parse_date(&input.paid_at)?;
    let (status, total): (String, i64) = conn
        .query_row(
            "SELECT status, total_cents FROM invoices WHERE id = ?1",
            params![input.invoice_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(db_error)?
        .ok_or_else(|| "invoice not found".to_string())?;
    if !matches!(status.as_str(), "Issued" | "Rectified") {
        return Err("payments require an issued invoice".to_string());
    }
    let paid = paid_cents(conn, &input.invoice_id)?;
    if paid + input.amount_cents > total {
        return Err(format!(
            "payment exceeds outstanding amount ({} cents pending)",
            (total - paid).max(0)
        ));
    }
    let payment = Payment {
        id: Uuid::new_v4().to_string(),
        invoice_id: input.invoice_id,
        amount_cents: input.amount_cents,
        paid_at: input.paid_at.trim().to_string(),
        method: input.method,
        reference: input
            .reference
            .map(|r| r.trim().to_string())
            .filter(|r| !r.is_empty()),
        created_at: Utc::now().to_rfc3339(),
    };
    conn.execute(
        "INSERT INTO invoice_payments (id, invoice_id, amount_cents, paid_at, method, reference, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            payment.id,
            payment.invoice_id,
            payment.amount_cents,
            payment.paid_at,
            payment.method,
            payment.reference,
            payment.created_at
        ],
    )
    .map_err(db_error)?;
    audit(
        conn,
        "invoice",
        &payment.invoice_id,
        "payment_registered",
        &format!(
            "{}:{}:{}",
            payment.id, payment.amount_cents, payment.paid_at
        ),
    )?;
    Ok(payment)
}

pub fn delete_payment(conn: &Connection, payment_id: &str) -> Result<(), String> {
    let invoice_id: String = conn
        .query_row(
            "SELECT invoice_id FROM invoice_payments WHERE id = ?1",
            params![payment_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(db_error)?
        .ok_or_else(|| "payment not found".to_string())?;
    conn.execute(
        "DELETE FROM invoice_payments WHERE id = ?1",
        params![payment_id],
    )
    .map_err(db_error)?;
    audit(conn, "invoice", &invoice_id, "payment_deleted", payment_id)
}

fn paid_cents(conn: &Connection, invoice_id: &str) -> Result<i64, String> {
    conn.query_row(
        "SELECT COALESCE(SUM(amount_cents), 0) FROM invoice_payments WHERE invoice_id = ?1",
        params![invoice_id],
        |row| row.get(0),
    )
    .map_err(db_error)
}

pub fn list_payments(conn: &Connection, invoice_id: &str) -> Result<Vec<Payment>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, invoice_id, amount_cents, paid_at, method, reference, created_at
             FROM invoice_payments WHERE invoice_id = ?1 ORDER BY paid_at, created_at",
        )
        .map_err(db_error)?;
    let rows = stmt
        .query_map(params![invoice_id], |row| {
            Ok(Payment {
                id: row.get(0)?,
                invoice_id: row.get(1)?,
                amount_cents: row.get(2)?,
                paid_at: row.get(3)?,
                method: row.get(4)?,
                reference: row.get(5)?,
                created_at: row.get(6)?,
            })
        })
        .map_err(db_error)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(db_error)
}

pub fn list_receivables(
    conn: &Connection,
    company_id: Option<&str>,
    today: NaiveDate,
) -> Result<Vec<Receivable>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT i.id, i.company_id, i.customer_id, c.display_name, c.tax_id, i.series, i.number,
                    i.issued_at, i.due_date, i.total_cents,
                    COALESCE((SELECT SUM(p.amount_cents) FROM invoice_payments p WHERE p.invoice_id = i.id), 0)
             FROM invoices i JOIN customers c ON c.id = i.customer_id
             WHERE i.status IN ('Issued', 'Rectified') AND (?1 IS NULL OR i.company_id = ?1)
             ORDER BY COALESCE(i.due_date, substr(i.issued_at, 1, 10)), i.series, i.number",
        )
        .map_err(db_error)?;
    let rows = stmt
        .query_map(params![company_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, Option<i64>>(6)?,
                row.get::<_, Option<String>>(7)?,
                row.get::<_, Option<String>>(8)?,
                row.get::<_, i64>(9)?,
                row.get::<_, i64>(10)?,
            ))
        })
        .map_err(db_error)?;
    let mut out = Vec::new();
    for row in rows {
        let (id, company, customer, name, tax_id, series, number, issued_at, due_date, total, paid) =
            row.map_err(db_error)?;
        let effective_due = due_date
            .as_deref()
            .and_then(|d| parse_date(d).ok())
            .or_else(|| {
                issued_at
                    .as_deref()
                    .and_then(|d| d.get(..10))
                    .and_then(|d| parse_date(d).ok())
            });
        let (status, days_overdue) = collection_status(total, paid, effective_due, today);
        out.push(Receivable {
            invoice_id: id,
            company_id: company,
            customer_id: customer,
            customer_name: name,
            customer_tax_id: tax_id,
            series,
            number,
            issued_at,
            due_date,
            total_cents: total,
            paid_cents: paid,
            outstanding_cents: (total - paid).max(0),
            status,
            days_overdue,
        });
    }
    Ok(out)
}

// ───────────────────────────── Facturas recurrentes ─────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecurringInput {
    pub id: Option<String>,
    pub label: String,
    pub frequency: String,
    pub next_run_date: String,
    pub end_date: Option<String>,
    pub draft: InvoiceDraftInput,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecurringInvoice {
    pub id: String,
    pub company_id: String,
    pub customer_id: String,
    pub label: String,
    pub frequency: String,
    pub next_run_date: String,
    pub end_date: Option<String>,
    pub active: bool,
    pub last_invoice_id: Option<String>,
    pub total_cents: i64,
    pub draft: InvoiceDraftInput,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecurringRun {
    pub recurring_id: String,
    pub label: String,
    pub run_date: String,
    pub invoice: Invoice,
}

fn advance(date: NaiveDate, frequency: &str) -> Result<NaiveDate, String> {
    let months = match frequency {
        "monthly" => 1,
        "quarterly" => 3,
        "yearly" => 12,
        other => return Err(format!("unsupported frequency: {other}")),
    };
    date.checked_add_months(Months::new(months))
        .ok_or_else(|| "date overflow".to_string())
}

pub fn upsert_recurring(
    conn: &Connection,
    input: RecurringInput,
) -> Result<RecurringInvoice, String> {
    if input.label.trim().is_empty() {
        return Err("label is required".to_string());
    }
    advance(parse_date(&input.next_run_date)?, &input.frequency)?;
    if let Some(end) = &input.end_date {
        parse_date(end)?;
    }
    let mut draft = input.draft.clone();
    draft.number = None;
    Invoice::draft(draft.clone())?;
    let draft_json =
        serde_json::to_string(&draft).map_err(|err| format!("draft json error: {err}"))?;
    let now = Utc::now().to_rfc3339();
    let id = input
        .id
        .clone()
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    conn.execute(
        "INSERT INTO recurring_invoices (id, company_id, customer_id, label, frequency, next_run_date, end_date, draft_json, active, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 1, ?9, ?9)
         ON CONFLICT(id) DO UPDATE SET company_id = excluded.company_id, customer_id = excluded.customer_id,
           label = excluded.label, frequency = excluded.frequency, next_run_date = excluded.next_run_date,
           end_date = excluded.end_date, draft_json = excluded.draft_json, updated_at = excluded.updated_at",
        params![
            id,
            draft.company_id,
            draft.customer_id,
            input.label.trim(),
            input.frequency,
            input.next_run_date.trim(),
            input.end_date,
            draft_json,
            now
        ],
    )
    .map_err(db_error)?;
    audit(
        conn,
        "recurring_invoice",
        &id,
        "recurring_saved",
        &draft_json,
    )?;
    get_recurring(conn, &id)
}

fn get_recurring(conn: &Connection, id: &str) -> Result<RecurringInvoice, String> {
    list_recurring(conn, None)?
        .into_iter()
        .find(|item| item.id == id)
        .ok_or_else(|| "recurring invoice not found".to_string())
}

pub fn list_recurring(
    conn: &Connection,
    company_id: Option<&str>,
) -> Result<Vec<RecurringInvoice>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, company_id, customer_id, label, frequency, next_run_date, end_date, active, last_invoice_id, draft_json
             FROM recurring_invoices WHERE (?1 IS NULL OR company_id = ?1) ORDER BY next_run_date, label",
        )
        .map_err(db_error)?;
    let rows = stmt
        .query_map(params![company_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, Option<String>>(6)?,
                row.get::<_, i64>(7)?,
                row.get::<_, Option<String>>(8)?,
                row.get::<_, String>(9)?,
            ))
        })
        .map_err(db_error)?;
    let mut out = Vec::new();
    for row in rows {
        let (
            id,
            company_id,
            customer_id,
            label,
            frequency,
            next_run_date,
            end_date,
            active,
            last,
            json,
        ) = row.map_err(db_error)?;
        let draft: InvoiceDraftInput =
            serde_json::from_str(&json).map_err(|err| format!("draft json error: {err}"))?;
        let total_cents = Invoice::draft(draft.clone())
            .map(|i| i.totals.total_cents)
            .unwrap_or(0);
        out.push(RecurringInvoice {
            id,
            company_id,
            customer_id,
            label,
            frequency,
            next_run_date,
            end_date,
            active: active == 1,
            last_invoice_id: last,
            total_cents,
            draft,
        });
    }
    Ok(out)
}

pub fn set_recurring_active(conn: &Connection, id: &str, active: bool) -> Result<(), String> {
    let changed = conn
        .execute(
            "UPDATE recurring_invoices SET active = ?1, updated_at = ?2 WHERE id = ?3",
            params![active as i64, Utc::now().to_rfc3339(), id],
        )
        .map_err(db_error)?;
    if changed == 0 {
        return Err("recurring invoice not found".to_string());
    }
    audit(
        conn,
        "recurring_invoice",
        id,
        if active {
            "recurring_resumed"
        } else {
            "recurring_paused"
        },
        id,
    )
}

/// Genera un BORRADOR por plantilla vencida (next_run_date <= hoy) y avanza un periodo.
/// No emite: la emision sigue requiriendo la accion explicita del usuario.
/// Si hay varios periodos atrasados, cada llamada genera el siguiente (sin rafagas).
pub fn generate_due_recurring(
    conn: &mut Connection,
    today: NaiveDate,
) -> Result<Vec<RecurringRun>, String> {
    let due: Vec<RecurringInvoice> = list_recurring(conn, None)?
        .into_iter()
        .filter(|item| {
            item.active
                && parse_date(&item.next_run_date)
                    .map(|d| d <= today)
                    .unwrap_or(false)
        })
        .collect();
    let mut runs = Vec::new();
    for item in due {
        let run_date = parse_date(&item.next_run_date)?;
        if let Some(end) = item.end_date.as_deref().map(parse_date).transpose()? {
            if run_date > end {
                set_recurring_active(conn, &item.id, false)?;
                continue;
            }
        }
        let mut draft = item.draft.clone();
        draft.fiscal_year = run_date.year();
        draft.number = None;
        let invoice = Invoice::draft(draft)?;
        insert_invoice_draft(conn, &invoice)?;
        let next = advance(run_date, &item.frequency)?;
        let still_active = item
            .end_date
            .as_deref()
            .map(parse_date)
            .transpose()?
            .map(|end| next <= end)
            .unwrap_or(true);
        conn.execute(
            "UPDATE recurring_invoices SET next_run_date = ?1, last_invoice_id = ?2, active = ?3, updated_at = ?4 WHERE id = ?5",
            params![
                next.format(DATE_FORMAT).to_string(),
                invoice.id,
                still_active as i64,
                Utc::now().to_rfc3339(),
                item.id
            ],
        )
        .map_err(db_error)?;
        audit(
            conn,
            "recurring_invoice",
            &item.id,
            "recurring_draft_generated",
            &invoice.id,
        )?;
        runs.push(RecurringRun {
            recurring_id: item.id,
            label: item.label,
            run_date: run_date.format(DATE_FORMAT).to_string(),
            invoice,
        });
    }
    Ok(runs)
}

// ───────────────────────────── Presupuestos ─────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuoteInput {
    pub id: Option<String>,
    pub valid_until: Option<String>,
    pub notes: String,
    pub draft: InvoiceDraftInput,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Quote {
    pub id: String,
    pub company_id: String,
    pub customer_id: String,
    pub fiscal_year: i32,
    pub number: i64,
    pub code: String,
    pub status: String,
    pub valid_until: Option<String>,
    pub notes: String,
    pub taxable_base_cents: i64,
    pub tax_cents: i64,
    pub withholding_cents: i64,
    pub total_cents: i64,
    pub invoice_id: Option<String>,
    pub created_at: String,
    pub draft: InvoiceDraftInput,
}

pub fn quote_code(fiscal_year: i32, number: i64) -> String {
    format!("P{fiscal_year}-{number:04}")
}

pub fn upsert_quote(
    conn: &Connection,
    input: QuoteInput,
    today: NaiveDate,
) -> Result<Quote, String> {
    if let Some(valid) = &input.valid_until {
        parse_date(valid)?;
    }
    let mut draft = input.draft.clone();
    draft.number = None;
    let computed = Invoice::draft(draft.clone())?;
    let draft_json =
        serde_json::to_string(&draft).map_err(|err| format!("draft json error: {err}"))?;
    let now = Utc::now().to_rfc3339();
    let id = match &input.id {
        Some(id) => {
            let status: String = conn
                .query_row(
                    "SELECT status FROM quotes WHERE id = ?1",
                    params![id],
                    |row| row.get(0),
                )
                .optional()
                .map_err(db_error)?
                .ok_or_else(|| "quote not found".to_string())?;
            if status != "draft" {
                return Err("only draft quotes can be edited".to_string());
            }
            conn.execute(
                "UPDATE quotes SET customer_id = ?1, valid_until = ?2, notes = ?3, draft_json = ?4,
                   taxable_base_cents = ?5, tax_cents = ?6, withholding_cents = ?7, total_cents = ?8, updated_at = ?9
                 WHERE id = ?10",
                params![
                    draft.customer_id,
                    input.valid_until,
                    input.notes,
                    draft_json,
                    computed.totals.taxable_base_cents,
                    computed.totals.tax_cents,
                    computed.totals.withholding_cents,
                    computed.totals.total_cents,
                    now,
                    id
                ],
            )
            .map_err(db_error)?;
            id.clone()
        }
        None => {
            let year = today.year();
            let number: i64 = conn
                .query_row(
                    "SELECT COALESCE(MAX(number), 0) + 1 FROM quotes WHERE company_id = ?1 AND fiscal_year = ?2",
                    params![draft.company_id, year],
                    |row| row.get(0),
                )
                .map_err(db_error)?;
            let id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO quotes (id, company_id, customer_id, fiscal_year, number, status, valid_until, notes, draft_json,
                   taxable_base_cents, tax_cents, withholding_cents, total_cents, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, 'draft', ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?13)",
                params![
                    id,
                    draft.company_id,
                    draft.customer_id,
                    year,
                    number,
                    input.valid_until,
                    input.notes,
                    draft_json,
                    computed.totals.taxable_base_cents,
                    computed.totals.tax_cents,
                    computed.totals.withholding_cents,
                    computed.totals.total_cents,
                    now
                ],
            )
            .map_err(db_error)?;
            id
        }
    };
    audit(conn, "quote", &id, "quote_saved", &draft_json)?;
    get_quote(conn, &id)
}

fn get_quote(conn: &Connection, id: &str) -> Result<Quote, String> {
    list_quotes(conn, None)?
        .into_iter()
        .find(|quote| quote.id == id)
        .ok_or_else(|| "quote not found".to_string())
}

pub fn list_quotes(conn: &Connection, company_id: Option<&str>) -> Result<Vec<Quote>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, company_id, customer_id, fiscal_year, number, status, valid_until, notes,
                    taxable_base_cents, tax_cents, withholding_cents, total_cents, invoice_id, created_at, draft_json
             FROM quotes WHERE (?1 IS NULL OR company_id = ?1) ORDER BY fiscal_year DESC, number DESC",
        )
        .map_err(db_error)?;
    let rows = stmt
        .query_map(params![company_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i32>(3)?,
                row.get::<_, i64>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, Option<String>>(6)?,
                row.get::<_, String>(7)?,
                (
                    row.get::<_, i64>(8)?,
                    row.get::<_, i64>(9)?,
                    row.get::<_, i64>(10)?,
                    row.get::<_, i64>(11)?,
                ),
                row.get::<_, Option<String>>(12)?,
                row.get::<_, String>(13)?,
                row.get::<_, String>(14)?,
            ))
        })
        .map_err(db_error)?;
    let mut out = Vec::new();
    for row in rows {
        let (
            id,
            company_id,
            customer_id,
            year,
            number,
            status,
            valid_until,
            notes,
            totals,
            invoice_id,
            created_at,
            json,
        ) = row.map_err(db_error)?;
        out.push(Quote {
            id,
            company_id,
            customer_id,
            fiscal_year: year,
            number,
            code: quote_code(year, number),
            status,
            valid_until,
            notes,
            taxable_base_cents: totals.0,
            tax_cents: totals.1,
            withholding_cents: totals.2,
            total_cents: totals.3,
            invoice_id,
            created_at,
            draft: serde_json::from_str(&json).map_err(|err| format!("draft json error: {err}"))?,
        });
    }
    Ok(out)
}

pub fn set_quote_status(conn: &Connection, id: &str, status: &str) -> Result<Quote, String> {
    let current = get_quote(conn, id)?;
    let allowed = matches!(
        (current.status.as_str(), status),
        ("draft", "sent")
            | ("draft", "accepted")
            | ("draft", "rejected")
            | ("sent", "accepted")
            | ("sent", "rejected")
            | ("rejected", "draft")
    );
    if !allowed {
        return Err(format!(
            "invalid quote transition {} -> {status}",
            current.status
        ));
    }
    conn.execute(
        "UPDATE quotes SET status = ?1, updated_at = ?2 WHERE id = ?3",
        params![status, Utc::now().to_rfc3339(), id],
    )
    .map_err(db_error)?;
    audit(conn, "quote", id, &format!("quote_{status}"), status)?;
    get_quote(conn, id)
}

/// Convierte un presupuesto en BORRADOR de factura con las mismas lineas (ejercicio actual).
pub fn convert_quote_to_invoice(
    conn: &mut Connection,
    id: &str,
    today: NaiveDate,
) -> Result<Invoice, String> {
    let quote = get_quote(conn, id)?;
    if matches!(quote.status.as_str(), "rejected" | "invoiced") {
        return Err(format!(
            "quote in status {} cannot be invoiced",
            quote.status
        ));
    }
    let mut draft = quote.draft.clone();
    draft.fiscal_year = today.year();
    draft.number = None;
    let invoice = Invoice::draft(draft)?;
    insert_invoice_draft(conn, &invoice)?;
    conn.execute(
        "UPDATE quotes SET status = 'invoiced', invoice_id = ?1, updated_at = ?2 WHERE id = ?3",
        params![invoice.id, Utc::now().to_rfc3339(), id],
    )
    .map_err(db_error)?;
    audit(conn, "quote", id, "quote_invoiced", &invoice.id)?;
    Ok(invoice)
}

// ───────────────────────────── Configuracion SMTP ─────────────────────────────

const EMAIL_SETTINGS_KEY: &str = "email";

pub fn get_email_settings(
    conn: &Connection,
) -> Result<crate::services::email::EmailSettings, String> {
    let raw: Option<String> = conn
        .query_row(
            "SELECT value FROM app_settings WHERE key = ?1",
            params![EMAIL_SETTINGS_KEY],
            |row| row.get(0),
        )
        .optional()
        .map_err(db_error)?;
    match raw {
        Some(value) => {
            serde_json::from_str(&value).map_err(|err| format!("email settings json error: {err}"))
        }
        None => Ok(Default::default()),
    }
}

pub fn save_email_settings(
    conn: &Connection,
    settings: &crate::services::email::EmailSettings,
) -> Result<(), String> {
    settings.validate()?;
    let value = serde_json::to_string(settings)
        .map_err(|err| format!("email settings json error: {err}"))?;
    conn.execute(
        "INSERT INTO app_settings (key, value, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        params![EMAIL_SETTINGS_KEY, value, Utc::now().to_rfc3339()],
    )
    .map_err(db_error)?;
    Ok(())
}

// ───────────────────────────── Registro de emails ─────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmailLogEntry {
    pub id: String,
    pub invoice_id: Option<String>,
    pub kind: String,
    pub recipient: String,
    pub subject: String,
    pub status: String,
    pub error: Option<String>,
    pub sent_at: String,
}

pub fn insert_email_log(conn: &Connection, entry: &EmailLogEntry) -> Result<(), String> {
    conn.execute(
        "INSERT INTO email_log (id, invoice_id, kind, recipient, subject, status, error, sent_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            entry.id,
            entry.invoice_id,
            entry.kind,
            entry.recipient,
            entry.subject,
            entry.status,
            entry.error,
            entry.sent_at
        ],
    )
    .map_err(db_error)?;
    if let Some(invoice_id) = &entry.invoice_id {
        audit(
            conn,
            "invoice",
            invoice_id,
            &format!("email_{}_{}", entry.kind, entry.status),
            &entry.recipient,
        )?;
    }
    Ok(())
}

pub fn list_email_log(
    conn: &Connection,
    invoice_id: Option<&str>,
) -> Result<Vec<EmailLogEntry>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, invoice_id, kind, recipient, subject, status, error, sent_at
             FROM email_log WHERE (?1 IS NULL OR invoice_id = ?1) ORDER BY sent_at DESC LIMIT 200",
        )
        .map_err(db_error)?;
    let rows = stmt
        .query_map(params![invoice_id], |row| {
            Ok(EmailLogEntry {
                id: row.get(0)?,
                invoice_id: row.get(1)?,
                kind: row.get(2)?,
                recipient: row.get(3)?,
                subject: row.get(4)?,
                status: row.get(5)?,
                error: row.get(6)?,
                sent_at: row.get(7)?,
            })
        })
        .map_err(db_error)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(db_error)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{apply_migrations, insert_company, upsert_customer};
    use crate::domain::company::{Company, CompanyInput};
    use crate::domain::customer::{Customer, CustomerInput, CustomerKind};
    use crate::domain::invoice::{InvoiceKind, InvoiceLineInput};
    use crate::domain::tax::TerritoryFlag;

    fn setup() -> (Connection, InvoiceDraftInput) {
        let conn = Connection::open_in_memory().expect("memory db");
        conn.pragma_update(None, "foreign_keys", "ON").expect("fk");
        apply_migrations(&conn).expect("migrations");
        let company = Company::from_input(CompanyInput {
            legal_name: "Demo SL".to_string(),
            tax_id: "B00000000".to_string(),
            address: "Calle 1".to_string(),
            postal_code: "28001".to_string(),
            municipality: "Madrid".to_string(),
            province: "Madrid".to_string(),
            country_code: "ES".to_string(),
            default_series: Some("A".to_string()),
        });
        insert_company(&conn, &company).expect("company");
        let customer = Customer::from_input(CustomerInput {
            id: None,
            display_name: "Cliente".to_string(),
            tax_id: "00000000T".to_string(),
            kind: CustomerKind::Business,
            address: "Calle 2".to_string(),
            postal_code: "28002".to_string(),
            municipality: "Madrid".to_string(),
            province: "Madrid".to_string(),
            country_code: "ES".to_string(),
            email: None,
        });
        upsert_customer(&conn, &customer).expect("customer");
        let draft = InvoiceDraftInput {
            company_id: company.id,
            customer_id: customer.id,
            fiscal_year: 2026,
            series: "A".to_string(),
            number: None,
            kind: InvoiceKind::Complete,
            territory_flags: vec![TerritoryFlag::CommonTerritory, TerritoryFlag::VeriFactu],
            lines: vec![InvoiceLineInput {
                description: "Cuota mensual".to_string(),
                quantity: 1,
                unit_price_cents: 10_000,
                discount_rate_basis_points: None,
                tax_rate_basis_points: 2_100,
                withholding_rate_basis_points: None,
            }],
            rectifies_invoice_id: None,
            rectification_reason_code: None,
            rectification_method: None,
        };
        (conn, draft)
    }

    fn issued_invoice(conn: &mut Connection, draft: &InvoiceDraftInput) -> String {
        let invoice = Invoice::draft(draft.clone()).expect("draft");
        insert_invoice_draft(conn, &invoice).expect("insert");
        conn.execute(
            "UPDATE invoices SET status = 'Issued', number = 1, issued_at = '2026-10-01T10:00:00Z' WHERE id = ?1",
            params![invoice.id],
        )
        .expect("issue");
        invoice.id
    }

    fn day(value: &str) -> NaiveDate {
        parse_date(value).unwrap()
    }

    #[test]
    fn collection_status_rules() {
        let today = day("2026-10-19");
        assert_eq!(
            collection_status(100, 100, None, today).0,
            CollectionStatus::Paid
        );
        assert_eq!(
            collection_status(100, 40, Some(day("2026-11-01")), today).0,
            CollectionStatus::Partial
        );
        assert_eq!(
            collection_status(100, 0, Some(day("2026-11-01")), today).0,
            CollectionStatus::Pending
        );
        let (status, days) = collection_status(100, 40, Some(day("2026-10-09")), today);
        assert_eq!((status, days), (CollectionStatus::Overdue, 10));
    }

    #[test]
    fn payments_flow_and_receivables() {
        let (mut conn, draft) = setup();
        let invoice_id = issued_invoice(&mut conn, &draft);
        set_invoice_due_date(&conn, &invoice_id, Some("2026-10-31")).expect("due");
        register_payment(
            &conn,
            PaymentInput {
                invoice_id: invoice_id.clone(),
                amount_cents: 5_000,
                paid_at: "2026-10-10".to_string(),
                method: "transfer".to_string(),
                reference: Some("TRF-1".to_string()),
            },
        )
        .expect("payment");
        let list = list_receivables(&conn, None, day("2026-10-19")).expect("receivables");
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].paid_cents, 5_000);
        assert_eq!(list[0].outstanding_cents, 7_100);
        assert_eq!(list[0].status, CollectionStatus::Partial);

        let overpay = register_payment(
            &conn,
            PaymentInput {
                invoice_id: invoice_id.clone(),
                amount_cents: 9_000,
                paid_at: "2026-10-11".to_string(),
                method: "cash".to_string(),
                reference: None,
            },
        );
        assert!(overpay.is_err());

        let payments = list_payments(&conn, &invoice_id).expect("payments");
        delete_payment(&conn, &payments[0].id).expect("delete");
        let list = list_receivables(&conn, None, day("2026-11-05")).expect("receivables");
        assert_eq!(list[0].status, CollectionStatus::Overdue);
        assert_eq!(list[0].days_overdue, 5);
    }

    #[test]
    fn payments_require_issued_invoice() {
        let (mut conn, draft) = setup();
        let invoice = Invoice::draft(draft).expect("draft");
        insert_invoice_draft(&mut conn, &invoice).expect("insert");
        let err = register_payment(
            &conn,
            PaymentInput {
                invoice_id: invoice.id,
                amount_cents: 100,
                paid_at: "2026-10-10".to_string(),
                method: "cash".to_string(),
                reference: None,
            },
        );
        assert!(err.is_err());
    }

    #[test]
    fn recurring_generates_one_draft_per_due_period() {
        let (mut conn, draft) = setup();
        let item = upsert_recurring(
            &conn,
            RecurringInput {
                id: None,
                label: "Cuota mantenimiento".to_string(),
                frequency: "monthly".to_string(),
                next_run_date: "2026-09-01".to_string(),
                end_date: Some("2026-10-15".to_string()),
                draft,
            },
        )
        .expect("recurring");
        assert_eq!(item.total_cents, 12_100);

        let runs = generate_due_recurring(&mut conn, day("2026-10-19")).expect("runs");
        assert_eq!(runs.len(), 1);
        assert_eq!(runs[0].run_date, "2026-09-01");
        let runs = generate_due_recurring(&mut conn, day("2026-10-19")).expect("runs");
        assert_eq!(runs.len(), 1);
        assert_eq!(runs[0].run_date, "2026-10-01");
        // Siguiente periodo (2026-11-01) supera end_date: queda inactiva y no genera mas.
        let runs = generate_due_recurring(&mut conn, day("2026-12-19")).expect("runs");
        assert!(runs.is_empty());
        let saved = list_recurring(&conn, None).expect("list");
        assert!(!saved[0].active);
        let drafts: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM invoices WHERE status = 'Draft'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(drafts, 2);
    }

    #[test]
    fn quotes_number_transition_and_convert() {
        let (mut conn, draft) = setup();
        let today = day("2026-10-19");
        let quote = upsert_quote(
            &conn,
            QuoteInput {
                id: None,
                valid_until: Some("2026-11-19".to_string()),
                notes: "Oferta".to_string(),
                draft: draft.clone(),
            },
            today,
        )
        .expect("quote");
        assert_eq!(quote.code, "P2026-0001");
        assert_eq!(quote.total_cents, 12_100);
        let second = upsert_quote(
            &conn,
            QuoteInput {
                id: None,
                valid_until: None,
                notes: String::new(),
                draft,
            },
            today,
        )
        .expect("quote 2");
        assert_eq!(second.code, "P2026-0002");

        set_quote_status(&conn, &quote.id, "sent").expect("sent");
        assert!(upsert_quote(
            &conn,
            QuoteInput {
                id: Some(quote.id.clone()),
                valid_until: None,
                notes: String::new(),
                draft: quote.draft.clone()
            },
            today
        )
        .is_err());
        set_quote_status(&conn, &quote.id, "accepted").expect("accepted");
        let invoice = convert_quote_to_invoice(&mut conn, &quote.id, today).expect("convert");
        assert_eq!(invoice.totals.total_cents, 12_100);
        let converted = list_quotes(&conn, None)
            .unwrap()
            .into_iter()
            .find(|q| q.id == quote.id)
            .unwrap();
        assert_eq!(converted.status, "invoiced");
        assert_eq!(converted.invoice_id.as_deref(), Some(invoice.id.as_str()));
        assert!(convert_quote_to_invoice(&mut conn, &quote.id, today).is_err());
    }

    #[test]
    fn operational_changes_extend_audit_chain() {
        let (mut conn, draft) = setup();
        let invoice_id = issued_invoice(&mut conn, &draft);
        set_invoice_due_date(&conn, &invoice_id, Some("2026-10-31")).expect("due");
        set_invoice_due_date(&conn, &invoice_id, None).expect("clear due");
        let events: Vec<(Option<String>, String)> = conn
            .prepare("SELECT previous_hash, hash FROM audit_events ORDER BY rowid")
            .unwrap()
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(events.len(), 2);
        assert_eq!(events[1].0.as_deref(), Some(events[0].1.as_str()));
    }
}
