//! Cobros y vencimiento: `invoice_payments` (de una factura o de una proforma) e `invoices.due_date`.
//!
//! Gestión operativa: nunca toca `fiscal_records`, numeración, huella ni XML. Cada cobro apunta a
//! una factura **o** a una proforma (CHECK en la tabla). El anticipo de una proforma pasa al
//! borrador al convertirla y a la factura emitida al emitir (`invoices::consume_draft`).
//! Alta, borrado y vencimiento quedan en `audit_events`.
//!
//! Regla de proforma pagada: `commercial_document_set_status(paid)` exige al menos un cobro
//! (`payment_required`), y no se puede borrar el último cobro de una proforma `paid`.

use super::*;
use chrono::{Local, NaiveDate, Utc};

const METHODS: [&str; 6] = [
    "transferencia",
    "tarjeta",
    "efectivo",
    "domiciliacion",
    "bizum",
    "otros",
];

/// Exactamente uno de `invoice_id` / `commercial_document_id`.
#[derive(Debug, Clone, Deserialize)]
pub struct PaymentInput {
    pub invoice_id: Option<String>,
    pub commercial_document_id: Option<String>,
    pub amount_cents: i64,
    pub paid_at: String,
    pub method: String,
    pub reference: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Payment {
    pub id: String,
    pub invoice_id: Option<String>,
    pub commercial_document_id: Option<String>,
    pub amount_cents: i64,
    pub paid_at: String,
    pub method: String,
    pub reference: Option<String>,
    pub created_at: String,
}

/// `paid` si no queda nada pendiente; `overdue` solo con `due_date` pasado (sin vencimiento no
/// hay mora); `partial` con algún cobro; si no, `unpaid`.
pub fn payment_status(
    total_cents: i64,
    paid_cents: i64,
    due_date: Option<&str>,
    today: &str,
) -> &'static str {
    if total_cents - paid_cents <= 0 {
        "paid"
    } else if due_date.is_some_and(|due| due < today) {
        "overdue"
    } else if paid_cents > 0 {
        "partial"
    } else {
        "unpaid"
    }
}

pub(crate) fn today_iso() -> String {
    Local::now().date_naive().format("%Y-%m-%d").to_string()
}

pub fn register_payment(conn: &mut Connection, input: PaymentInput) -> Result<Payment, String> {
    let invoice_id = clean_optional(input.invoice_id);
    let document_id = clean_optional(input.commercial_document_id);
    if invoice_id.is_some() == document_id.is_some() {
        return Err("validation_error:target".to_string());
    }
    if input.amount_cents <= 0 {
        return Err("validation_error:amount_cents".to_string());
    }
    if !METHODS.contains(&input.method.as_str()) {
        return Err("validation_error:method".to_string());
    }
    parse_payment_date(&input.paid_at, "paid_at")?;
    let tx = conn.transaction().map_err(db_error)?;
    let (entity_type, entity_id, total, paid) = match (&invoice_id, &document_id) {
        (Some(id), _) => {
            let (status, total): (String, i64) = tx
                .query_row(
                    "SELECT status, total_cents FROM invoices WHERE id = ?1",
                    params![id],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .optional()
                .map_err(db_error)?
                .ok_or_else(|| "not_found".to_string())?;
            // Un borrador solo recibe cobros heredados de su proforma.
            if !matches!(status.as_str(), "Issued" | "Rectified") {
                return Err("invoice_not_issued".to_string());
            }
            ("invoice", id, total, invoice_paid_cents(&tx, id)?)
        }
        (None, Some(id)) => {
            let (kind, status, total): (String, String, i64) = tx
                .query_row(
                    "SELECT kind, status, total_cents FROM commercial_documents WHERE id = ?1",
                    params![id],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
                )
                .optional()
                .map_err(db_error)?
                .ok_or_else(|| "not_found".to_string())?;
            if kind != "proforma" || !matches!(status.as_str(), "sent" | "paid") {
                return Err("payment_not_allowed".to_string());
            }
            (
                "commercial_document",
                id,
                total,
                document_paid_cents(&tx, id)?,
            )
        }
        (None, None) => unreachable!("checked above"),
    };
    if paid + input.amount_cents > total {
        return Err(format!("payment_exceeds_total:{}", (total - paid).max(0)));
    }
    let payment = Payment {
        id: uuid::Uuid::new_v4().to_string(),
        invoice_id: invoice_id.clone(),
        commercial_document_id: document_id.clone(),
        amount_cents: input.amount_cents,
        paid_at: input.paid_at.trim().to_string(),
        method: input.method,
        reference: clean_optional(input.reference),
        created_at: Utc::now().to_rfc3339(),
    };
    tx.execute(
        "INSERT INTO invoice_payments (id, invoice_id, commercial_document_id, amount_cents, paid_at, method, reference, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            payment.id,
            payment.invoice_id,
            payment.commercial_document_id,
            payment.amount_cents,
            payment.paid_at,
            payment.method,
            payment.reference,
            payment.created_at
        ],
    )
    .map_err(db_error)?;
    let payload = format!(
        "{}|{}|{}|{}",
        payment.id, payment.amount_cents, payment.paid_at, payment.method
    );
    operational_audit(&tx, entity_type, entity_id, "payment_registered", &payload)?;
    tx.commit().map_err(db_error)?;
    Ok(payment)
}

pub fn list_payments(
    conn: &Connection,
    invoice_id: Option<&str>,
    commercial_document_id: Option<&str>,
) -> Result<Vec<Payment>, String> {
    if invoice_id.is_some() == commercial_document_id.is_some() {
        return Err("validation_error:target".to_string());
    }
    let mut stmt = conn
        .prepare(
            "SELECT id, invoice_id, commercial_document_id, amount_cents, paid_at, method, reference, created_at
             FROM invoice_payments
             WHERE (?1 IS NOT NULL AND invoice_id = ?1) OR (?2 IS NOT NULL AND commercial_document_id = ?2)
             ORDER BY paid_at, created_at",
        )
        .map_err(db_error)?;
    let rows = stmt
        .query_map(params![invoice_id, commercial_document_id], |row| {
            Ok(Payment {
                id: row.get(0)?,
                invoice_id: row.get(1)?,
                commercial_document_id: row.get(2)?,
                amount_cents: row.get(3)?,
                paid_at: row.get(4)?,
                method: row.get(5)?,
                reference: row.get(6)?,
                created_at: row.get(7)?,
            })
        })
        .map_err(db_error)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(db_error)
}

pub fn delete_payment(conn: &mut Connection, payment_id: &str) -> Result<(), String> {
    let tx = conn.transaction().map_err(db_error)?;
    let (invoice_id, document_id): (Option<String>, Option<String>) = tx
        .query_row(
            "SELECT invoice_id, commercial_document_id FROM invoice_payments WHERE id = ?1",
            params![payment_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(db_error)?
        .ok_or_else(|| "not_found".to_string())?;
    if let Some(document_id) = &document_id {
        let status: String = tx
            .query_row(
                "SELECT status FROM commercial_documents WHERE id = ?1",
                params![document_id],
                |row| row.get(0),
            )
            .map_err(db_error)?;
        let count: i64 = tx
            .query_row(
                "SELECT COUNT(*) FROM invoice_payments WHERE commercial_document_id = ?1",
                params![document_id],
                |row| row.get(0),
            )
            .map_err(db_error)?;
        if status == "paid" && count == 1 {
            return Err("payment_required".to_string());
        }
    }
    tx.execute(
        "DELETE FROM invoice_payments WHERE id = ?1",
        params![payment_id],
    )
    .map_err(db_error)?;
    let (entity_type, entity_id) = match (&invoice_id, &document_id) {
        (Some(id), _) => ("invoice", id),
        (None, Some(id)) => ("commercial_document", id),
        (None, None) => return Err("not_found".to_string()),
    };
    operational_audit(&tx, entity_type, entity_id, "payment_deleted", payment_id)?;
    tx.commit().map_err(db_error)
}

/// Vencimiento de cualquier factura (borrador o emitida): no forma parte del registro fiscal.
pub fn set_invoice_due_date(
    conn: &mut Connection,
    invoice_id: &str,
    due_date: Option<&str>,
) -> Result<(), String> {
    let due_date = due_date.map(str::trim).filter(|value| !value.is_empty());
    if let Some(value) = due_date {
        parse_payment_date(value, "due_date")?;
    }
    let tx = conn.transaction().map_err(db_error)?;
    let changed = tx
        .execute(
            "UPDATE invoices SET due_date = ?2 WHERE id = ?1",
            params![invoice_id, due_date],
        )
        .map_err(db_error)?;
    if changed == 0 {
        return Err("not_found".to_string());
    }
    operational_audit(
        &tx,
        "invoice",
        invoice_id,
        "due_date_set",
        due_date.unwrap_or("none"),
    )?;
    tx.commit().map_err(db_error)
}

pub(crate) fn invoice_paid_cents(conn: &Connection, invoice_id: &str) -> Result<i64, String> {
    conn.query_row(
        "SELECT COALESCE(SUM(amount_cents), 0) FROM invoice_payments WHERE invoice_id = ?1",
        params![invoice_id],
        |row| row.get(0),
    )
    .map_err(db_error)
}

pub(crate) fn document_paid_cents(conn: &Connection, document_id: &str) -> Result<i64, String> {
    conn.query_row(
        "SELECT COALESCE(SUM(amount_cents), 0) FROM invoice_payments WHERE commercial_document_id = ?1",
        params![document_id],
        |row| row.get(0),
    )
    .map_err(db_error)
}

/// Evento operativo encadenado al último hash (mismo formato que el resto de módulos).
pub(crate) fn operational_audit(
    conn: &Connection,
    entity_type: &str,
    entity_id: &str,
    action: &str,
    payload: &str,
) -> Result<(), String> {
    let event = AuditEvent::operational(
        entity_type,
        entity_id,
        action,
        fiscal_contract::sha256_hex(payload.as_bytes()),
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

fn parse_payment_date(value: &str, field: &str) -> Result<NaiveDate, String> {
    NaiveDate::parse_from_str(value.trim(), "%Y-%m-%d")
        .map_err(|_| format!("validation_error:{field}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn payment_status_rules() {
        let today = "2026-11-03";
        assert_eq!(payment_status(100, 0, None, today), "unpaid");
        assert_eq!(payment_status(100, 40, None, today), "partial");
        assert_eq!(payment_status(100, 100, Some("2026-01-01"), today), "paid");
        assert_eq!(
            payment_status(100, 40, Some("2026-11-02"), today),
            "overdue"
        );
        assert_eq!(payment_status(100, 0, Some("2026-11-03"), today), "unpaid");
    }
}
