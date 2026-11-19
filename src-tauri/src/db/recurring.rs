//! Facturas recurrentes: plantillas, cálculo de periodos y generación idempotente de borradores.
//!
//! Cada periodo vencido de una plantilla activa crea UN borrador de factura (misma ruta que
//! `invoice_draft_create`) y su fila en `recurring_runs`, en la misma transacción. La clave
//! `recurring_id + period_key` impide duplicados aunque la generación se lance dos veces.
//!
//! Nunca emite ni toca `invoice_sequences`, `fiscal_records`, huellas ni XML: emitir sigue siendo
//! manual (`invoice_issue`). Borrar una plantilla es lógico (`deleted_at`) y no borra sus facturas.

use super::*;
use crate::domain::invoice::{InvoiceDraftInput, InvoiceKind, InvoiceLineInput};
use crate::domain::tax::TerritoryFlag;
use chrono::{Datelike, Months, NaiveDate, Utc};
use sha2::{Digest, Sha256};

const DATE_FORMAT: &str = "%Y-%m-%d";

/// Contenido que se copia en cada borrador: mismas líneas que `InvoiceLineInput`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecurringTemplate {
    pub lines: Vec<InvoiceLineInput>,
    #[serde(default)]
    pub notes: String,
}

/// Entrada de `recurring_save`: sin `id` crea, con `id` actualiza.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecurringInvoiceInput {
    pub id: Option<String>,
    pub company_id: String,
    pub customer_id: String,
    pub label: String,
    pub series_code: String,
    pub frequency: String,
    pub day_of_period: u32,
    pub start_date: String,
    pub end_date: Option<String>,
    pub template: RecurringTemplate,
}

#[derive(Debug, Clone, Serialize)]
pub struct RecurringInvoice {
    pub id: String,
    pub company_id: String,
    pub customer_id: String,
    pub label: String,
    pub series_code: String,
    pub frequency: String,
    pub day_of_period: u32,
    pub start_date: String,
    pub end_date: Option<String>,
    pub next_run_date: String,
    pub template: RecurringTemplate,
    pub active: bool,
    pub created_at: String,
    pub updated_at: String,
    pub last_period_key: Option<String>,
    pub total_cents: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct RecurringPreviewItem {
    pub period_key: String,
    pub run_date: String,
    pub total_cents: i64,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct RecurringGenerateResult {
    pub created: Vec<String>,
    pub skipped: Vec<String>,
}

pub fn parse_iso_date(value: &str, field: &str) -> Result<NaiveDate, String> {
    NaiveDate::parse_from_str(value.trim(), DATE_FORMAT)
        .map_err(|_| format!("validation_error:{field}"))
}

fn frequency_months(frequency: &str) -> Result<u32, String> {
    match frequency {
        "monthly" => Ok(1),
        "quarterly" => Ok(3),
        "yearly" => Ok(12),
        _ => Err("validation_error:frequency".to_string()),
    }
}

fn advance(date: NaiveDate, frequency: &str) -> Result<NaiveDate, String> {
    date.checked_add_months(Months::new(frequency_months(frequency)?))
        .ok_or_else(|| "validation_error:next_run_date".to_string())
}

/// `2026-11` mensual, `2026-T4` trimestral (trimestre natural), `2026` anual.
pub fn period_key(date: NaiveDate, frequency: &str) -> Result<String, String> {
    Ok(match frequency_months(frequency)? {
        1 => format!("{}-{:02}", date.year(), date.month()),
        3 => format!("{}-T{}", date.year(), (date.month() - 1) / 3 + 1),
        _ => date.year().to_string(),
    })
}

/// Primera fecha `day_of_period` en o después de `start`; los periodos siguen el mes de inicio.
pub fn first_run_date(start: NaiveDate, day: u32, frequency: &str) -> Result<NaiveDate, String> {
    let candidate = start
        .with_day(day)
        .ok_or_else(|| "validation_error:day_of_period".to_string())?;
    if candidate < start {
        advance(candidate, frequency)
    } else {
        Ok(candidate)
    }
}

/// Salta periodos ya pasados, pero conserva el del periodo en curso si ya venció.
fn catch_up(mut date: NaiveDate, frequency: &str, today: NaiveDate) -> Result<NaiveDate, String> {
    while advance(date, frequency)? <= today {
        date = advance(date, frequency)?;
    }
    Ok(date)
}

fn draft_input(
    item: &RecurringInvoice,
    fiscal_year: i32,
    territory_flags: Vec<TerritoryFlag>,
) -> InvoiceDraftInput {
    InvoiceDraftInput {
        company_id: item.company_id.clone(),
        customer_id: item.customer_id.clone(),
        fiscal_year,
        series: item.series_code.clone(),
        number: None,
        kind: InvoiceKind::Complete,
        territory_flags,
        lines: item.template.lines.clone(),
        rectifies_invoice_id: None,
        rectification_reason_code: None,
        rectification_method: None,
        notes: item.template.notes.clone(),
    }
}

fn exists(conn: &Connection, sql: &str, id: &str) -> Result<bool, String> {
    conn.query_row(sql, params![id], |_| Ok(()))
        .optional()
        .map(|row| row.is_some())
        .map_err(db_error)
}

/// Valida la entrada y la devuelve como plantilla (sin guardar). `next_run_date` = primer periodo.
fn validated(conn: &Connection, input: RecurringInvoiceInput) -> Result<RecurringInvoice, String> {
    let company_id = input.company_id.trim().to_string();
    if !exists(conn, "SELECT 1 FROM companies WHERE id = ?1", &company_id)? {
        return Err("validation_error:company_id".to_string());
    }
    let customer_id = input.customer_id.trim().to_string();
    if !exists(conn, "SELECT 1 FROM customers WHERE id = ?1", &customer_id)? {
        return Err("validation_error:customer_id".to_string());
    }
    let label = input.label.trim().to_string();
    if label.is_empty() {
        return Err("validation_error:label".to_string());
    }
    let series_code = input.series_code.trim().to_string();
    if series_code.is_empty() {
        return Err("validation_error:series_code".to_string());
    }
    frequency_months(&input.frequency)?;
    if !(1..=28).contains(&input.day_of_period) {
        return Err("validation_error:day_of_period".to_string());
    }
    let start = parse_iso_date(&input.start_date, "start_date")?;
    let end_date = clean_optional(input.end_date);
    if let Some(end) = &end_date {
        if parse_iso_date(end, "end_date")? < start {
            return Err("validation_error:end_date".to_string());
        }
    }
    let next = first_run_date(start, input.day_of_period, &input.frequency)?;
    let mut item = RecurringInvoice {
        id: input.id.unwrap_or_default(),
        company_id,
        customer_id,
        label,
        series_code,
        frequency: input.frequency,
        day_of_period: input.day_of_period,
        start_date: start.format(DATE_FORMAT).to_string(),
        end_date,
        next_run_date: next.format(DATE_FORMAT).to_string(),
        template: input.template,
        active: true,
        created_at: String::new(),
        updated_at: String::new(),
        last_period_key: None,
        total_cents: 0,
    };
    item.total_cents = template_total_cents(&item).map_err(|_| "validation_error:lines")?;
    Ok(item)
}

/// Total de un periodo con el mismo cálculo que la factura; el año no influye en el importe.
fn template_total_cents(item: &RecurringInvoice) -> Result<i64, String> {
    Invoice::draft(draft_input(item, 2026, Vec::new())).map(|draft| draft.totals.total_cents)
}

fn audit_tx(
    conn: &Connection,
    entity_type: &str,
    entity_id: &str,
    action: &str,
    payload: &str,
) -> Result<(), String> {
    let payload_hash = fiscal_contract::to_hex(&Sha256::digest(payload.as_bytes()));
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
    .map(|_| ())
    .map_err(db_error)
}

fn template_json(item: &RecurringInvoice) -> Result<String, String> {
    serde_json::to_string(&item.template).map_err(|err| format!("template json error: {err}"))
}

pub fn list_recurring(
    conn: &Connection,
    company_id: Option<&str>,
) -> Result<Vec<RecurringInvoice>, String> {
    query_recurring(conn, company_id, None)
}

pub fn get_recurring(conn: &Connection, id: &str) -> Result<RecurringInvoice, String> {
    query_recurring(conn, None, Some(id))?
        .pop()
        .ok_or_else(|| "not_found".to_string())
}

fn query_recurring(
    conn: &Connection,
    company_id: Option<&str>,
    id: Option<&str>,
) -> Result<Vec<RecurringInvoice>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT t.id, t.company_id, t.customer_id, t.label, t.series_code, t.frequency, t.day_of_period,
                    t.start_date, t.end_date, t.next_run_date, t.template_json, t.active, t.created_at, t.updated_at,
                    (SELECT r.period_key FROM recurring_runs r WHERE r.recurring_id = t.id
                     ORDER BY r.run_date DESC LIMIT 1)
             FROM recurring_invoices t
             WHERE t.deleted_at IS NULL
               AND (?1 IS NULL OR t.company_id = ?1)
               AND (?2 IS NULL OR t.id = ?2)
             ORDER BY t.next_run_date, t.label",
        )
        .map_err(db_error)?;
    let rows = stmt
        .query_map(params![company_id, id], |row| {
            Ok((
                RecurringInvoice {
                    id: row.get(0)?,
                    company_id: row.get(1)?,
                    customer_id: row.get(2)?,
                    label: row.get(3)?,
                    series_code: row.get(4)?,
                    frequency: row.get(5)?,
                    day_of_period: row.get(6)?,
                    start_date: row.get(7)?,
                    end_date: row.get(8)?,
                    next_run_date: row.get(9)?,
                    template: RecurringTemplate {
                        lines: Vec::new(),
                        notes: String::new(),
                    },
                    active: row.get::<_, i64>(11)? == 1,
                    created_at: row.get(12)?,
                    updated_at: row.get(13)?,
                    last_period_key: row.get(14)?,
                    total_cents: 0,
                },
                row.get::<_, String>(10)?,
            ))
        })
        .map_err(db_error)?;
    let mut items = Vec::new();
    for row in rows {
        let (mut item, json) = row.map_err(db_error)?;
        item.template =
            serde_json::from_str(&json).map_err(|err| format!("template json error: {err}"))?;
        item.total_cents = template_total_cents(&item)?;
        items.push(item);
    }
    Ok(items)
}

/// Crea o actualiza. Si cambia el calendario, el próximo periodo se recalcula desde hoy.
pub fn save_recurring(
    conn: &mut Connection,
    input: RecurringInvoiceInput,
    today: NaiveDate,
) -> Result<RecurringInvoice, String> {
    let mut item = validated(conn, input)?;
    let json = template_json(&item)?;
    let now = Utc::now().to_rfc3339();
    let tx = conn.transaction().map_err(db_error)?;
    let action = if item.id.trim().is_empty() {
        item.id = uuid::Uuid::new_v4().to_string();
        tx.execute(
            "INSERT INTO recurring_invoices (id, company_id, customer_id, label, series_code, frequency, day_of_period,
                start_date, end_date, next_run_date, template_json, active, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 1, ?12, ?12)",
            params![
                item.id,
                item.company_id,
                item.customer_id,
                item.label,
                item.series_code,
                item.frequency,
                item.day_of_period,
                item.start_date,
                item.end_date,
                item.next_run_date,
                json,
                now,
            ],
        )
        .map_err(db_error)?;
        "recurring_created"
    } else {
        let current = get_recurring(&tx, &item.id)?;
        let schedule_changed = current.frequency != item.frequency
            || current.day_of_period != item.day_of_period
            || current.start_date != item.start_date;
        let next_run_date = if schedule_changed {
            let first = parse_iso_date(&item.next_run_date, "next_run_date")?;
            catch_up(first, &item.frequency, today)?
                .format(DATE_FORMAT)
                .to_string()
        } else {
            current.next_run_date
        };
        tx.execute(
            "UPDATE recurring_invoices SET company_id = ?2, customer_id = ?3, label = ?4, series_code = ?5,
                frequency = ?6, day_of_period = ?7, start_date = ?8, end_date = ?9, next_run_date = ?10,
                template_json = ?11, updated_at = ?12
             WHERE id = ?1 AND deleted_at IS NULL",
            params![
                item.id,
                item.company_id,
                item.customer_id,
                item.label,
                item.series_code,
                item.frequency,
                item.day_of_period,
                item.start_date,
                item.end_date,
                next_run_date,
                json,
                now,
            ],
        )
        .map_err(db_error)?;
        "recurring_updated"
    };
    let saved = get_recurring(&tx, &item.id)?;
    let payload = serde_json::to_string(&saved).map_err(|err| err.to_string())?;
    audit_tx(&tx, "recurring_invoice", &saved.id, action, &payload)?;
    tx.commit().map_err(db_error)?;
    Ok(saved)
}

/// Pausar no borra historial. Al reactivar no se recuperan los periodos de la pausa.
pub fn set_recurring_active(
    conn: &mut Connection,
    id: &str,
    active: bool,
    today: NaiveDate,
) -> Result<RecurringInvoice, String> {
    let tx = conn.transaction().map_err(db_error)?;
    let current = get_recurring(&tx, id)?;
    let mut next = parse_iso_date(&current.next_run_date, "next_run_date")?;
    if active && !current.active {
        next = catch_up(next, &current.frequency, today)?;
    }
    tx.execute(
        "UPDATE recurring_invoices SET active = ?2, next_run_date = ?3, updated_at = ?4 WHERE id = ?1",
        params![
            id,
            active as i64,
            next.format(DATE_FORMAT).to_string(),
            Utc::now().to_rfc3339()
        ],
    )
    .map_err(db_error)?;
    let action = if active {
        "recurring_activated"
    } else {
        "recurring_paused"
    };
    audit_tx(&tx, "recurring_invoice", id, action, id)?;
    let saved = get_recurring(&tx, id)?;
    tx.commit().map_err(db_error)?;
    Ok(saved)
}

/// Borrado lógico: conserva `recurring_runs` y las facturas generadas.
pub fn delete_recurring(conn: &mut Connection, id: &str) -> Result<(), String> {
    let tx = conn.transaction().map_err(db_error)?;
    let changed = tx
        .execute(
            "UPDATE recurring_invoices SET deleted_at = ?2, active = 0, updated_at = ?2
             WHERE id = ?1 AND deleted_at IS NULL",
            params![id, Utc::now().to_rfc3339()],
        )
        .map_err(db_error)?;
    if changed == 0 {
        return Err("not_found".to_string());
    }
    audit_tx(&tx, "recurring_invoice", id, "recurring_deleted", id)?;
    tx.commit().map_err(db_error)
}

/// Un borrador por periodo vencido (de `next_run_date` a `today`, sin pasar `end_date`).
pub fn generate_due_recurring(
    conn: &mut Connection,
    today: NaiveDate,
) -> Result<RecurringGenerateResult, String> {
    let flags: Vec<TerritoryFlag> =
        serde_json::to_value(get_app_settings(conn)?.default_territory_flags)
            .and_then(serde_json::from_value)
            .map_err(|err| format!("settings json error: {err}"))?;
    let mut result = RecurringGenerateResult::default();
    for item in list_recurring(conn, None)?.into_iter().filter(|t| t.active) {
        let end = item
            .end_date
            .as_deref()
            .map(|value| parse_iso_date(value, "end_date"))
            .transpose()?;
        let mut run = parse_iso_date(&item.next_run_date, "next_run_date")?;
        while run <= today && end.is_none_or(|end| run <= end) {
            let key = period_key(run, &item.frequency)?;
            let next = advance(run, &item.frequency)?;
            let tx = conn.transaction().map_err(db_error)?;
            let done = tx
                .query_row(
                    "SELECT 1 FROM recurring_runs WHERE recurring_id = ?1 AND period_key = ?2",
                    params![item.id, key],
                    |_| Ok(()),
                )
                .optional()
                .map_err(db_error)?
                .is_some();
            if done {
                result.skipped.push(key);
            } else {
                let invoice = Invoice::draft(draft_input(&item, run.year(), flags.clone()))?;
                insert_invoice(&tx, &invoice, None)?;
                tx.execute(
                    "INSERT INTO recurring_runs (recurring_id, period_key, run_date, invoice_id, created_at)
                     VALUES (?1, ?2, ?3, ?4, ?5)",
                    params![
                        item.id,
                        key,
                        run.format(DATE_FORMAT).to_string(),
                        invoice.id,
                        invoice.created_at
                    ],
                )
                .map_err(db_error)?;
                let payload = format!("{}|{}|{}", item.id, key, invoice.id);
                audit_tx(
                    &tx,
                    "invoice",
                    &invoice.id,
                    "recurring_draft_generated",
                    &payload,
                )?;
                result.created.push(invoice.id);
            }
            tx.execute(
                "UPDATE recurring_invoices SET next_run_date = ?2, updated_at = ?3 WHERE id = ?1",
                params![
                    item.id,
                    next.format(DATE_FORMAT).to_string(),
                    Utc::now().to_rfc3339()
                ],
            )
            .map_err(db_error)?;
            tx.commit().map_err(db_error)?;
            run = next;
        }
    }
    Ok(result)
}

/// Próximos `count` periodos (≤ 12) de una plantilla guardada o de una entrada sin guardar.
pub fn preview_recurring(
    conn: &Connection,
    id: Option<&str>,
    input: Option<RecurringInvoiceInput>,
    count: u32,
) -> Result<Vec<RecurringPreviewItem>, String> {
    if count > 12 {
        return Err("validation_error:count".to_string());
    }
    let item = match (input, id) {
        (Some(input), _) => validated(conn, input)?,
        (None, Some(id)) => get_recurring(conn, id)?,
        (None, None) => return Err("validation_error:id".to_string()),
    };
    let end = item
        .end_date
        .as_deref()
        .map(|value| parse_iso_date(value, "end_date"))
        .transpose()?;
    let mut run = parse_iso_date(&item.next_run_date, "next_run_date")?;
    let mut items = Vec::new();
    while items.len() < count as usize && end.is_none_or(|end| run <= end) {
        items.push(RecurringPreviewItem {
            period_key: period_key(run, &item.frequency)?,
            run_date: run.format(DATE_FORMAT).to_string(),
            total_cents: item.total_cents,
        });
        run = advance(run, &item.frequency)?;
    }
    Ok(items)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::company::{Company, CompanyInput};
    use crate::domain::customer::{Customer, CustomerInput, CustomerKind};

    fn day(value: &str) -> NaiveDate {
        parse_iso_date(value, "test").expect("date")
    }

    fn setup() -> (Connection, RecurringInvoiceInput) {
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
        let customer = Customer::from_input(CustomerInput {
            id: None,
            display_name: "Cliente Demo".to_string(),
            tax_id: "00000000T".to_string(),
            kind: CustomerKind::Business,
            address: "Calle Cliente 1".to_string(),
            postal_code: "28002".to_string(),
            municipality: "Madrid".to_string(),
            province: "Madrid".to_string(),
            country_code: "ES".to_string(),
        });
        insert_company(&conn, &company).expect("company");
        upsert_customer(&conn, &customer).expect("customer");
        let input = RecurringInvoiceInput {
            id: None,
            company_id: company.id,
            customer_id: customer.id,
            label: "Cuota mantenimiento".to_string(),
            series_code: "R".to_string(),
            frequency: "monthly".to_string(),
            day_of_period: 5,
            start_date: "2026-11-01".to_string(),
            end_date: None,
            template: RecurringTemplate {
                lines: vec![InvoiceLineInput {
                    description: "Mantenimiento web".to_string(),
                    quantity: 1,
                    unit_price_cents: 10_000,
                    discount_rate_basis_points: None,
                    tax_rate_basis_points: 2_100,
                    withholding_rate_basis_points: None,
                    price_pending: None,
                }],
                notes: "Pago por transferencia".to_string(),
            },
        };
        (conn, input)
    }

    fn count(conn: &Connection, sql: &str) -> i64 {
        conn.query_row(sql, [], |row| row.get(0)).expect("count")
    }

    #[test]
    fn period_keys_and_month_math() {
        assert_eq!(period_key(day("2026-11-05"), "monthly").unwrap(), "2026-11");
        assert_eq!(period_key(day("2026-01-28"), "monthly").unwrap(), "2026-01");
        assert_eq!(
            period_key(day("2026-03-31"), "quarterly").unwrap(),
            "2026-T1"
        );
        assert_eq!(
            period_key(day("2026-04-01"), "quarterly").unwrap(),
            "2026-T2"
        );
        assert_eq!(
            period_key(day("2026-12-31"), "quarterly").unwrap(),
            "2026-T4"
        );
        assert_eq!(period_key(day("2026-07-01"), "yearly").unwrap(), "2026");
        assert!(period_key(day("2026-07-01"), "weekly").is_err());
        // Día 28 en febrero y cambio de año sin recortes.
        assert_eq!(
            advance(day("2027-01-28"), "monthly").unwrap(),
            day("2027-02-28")
        );
        assert_eq!(
            advance(day("2026-11-15"), "quarterly").unwrap(),
            day("2027-02-15")
        );
        assert_eq!(
            advance(day("2028-02-28"), "yearly").unwrap(),
            day("2029-02-28")
        );
        // Si el día ya pasó en el mes de inicio, el primer periodo es el siguiente.
        assert_eq!(
            first_run_date(day("2026-11-10"), 5, "monthly").unwrap(),
            day("2026-12-05")
        );
        assert_eq!(
            first_run_date(day("2026-11-10"), 5, "quarterly").unwrap(),
            day("2027-02-05")
        );
        assert_eq!(
            first_run_date(day("2026-11-05"), 5, "yearly").unwrap(),
            day("2026-11-05")
        );
        assert_eq!(
            catch_up(day("2026-08-05"), "monthly", day("2026-11-03")).unwrap(),
            day("2026-10-05")
        );
    }

    #[test]
    fn save_validates_fields() {
        let (mut conn, input) = setup();
        let today = day("2026-11-03");
        type Mutate = fn(&mut RecurringInvoiceInput);
        let cases: Vec<(Mutate, &str)> = vec![
            (|i| i.label = " ".to_string(), "validation_error:label"),
            (
                |i| i.series_code = String::new(),
                "validation_error:series_code",
            ),
            (
                |i| i.frequency = "weekly".to_string(),
                "validation_error:frequency",
            ),
            (|i| i.day_of_period = 29, "validation_error:day_of_period"),
            (|i| i.day_of_period = 0, "validation_error:day_of_period"),
            (
                |i| i.start_date = "2026-13-01".to_string(),
                "validation_error:start_date",
            ),
            (
                |i| i.end_date = Some("2026-10-01".to_string()),
                "validation_error:end_date",
            ),
            (
                |i| i.customer_id = "nope".to_string(),
                "validation_error:customer_id",
            ),
            (|i| i.template.lines.clear(), "validation_error:lines"),
        ];
        for (mutate, expected) in cases {
            let mut bad = input.clone();
            mutate(&mut bad);
            assert_eq!(save_recurring(&mut conn, bad, today).unwrap_err(), expected);
        }
        let saved = save_recurring(&mut conn, input, today).expect("save");
        assert_eq!(saved.next_run_date, "2026-11-05");
        assert_eq!(saved.total_cents, 12_100);
        assert_eq!(saved.template.notes, "Pago por transferencia");
        assert!(saved.active && saved.last_period_key.is_none());
    }

    #[test]
    fn generate_twice_same_day_creates_once() {
        let (mut conn, input) = setup();
        save_recurring(&mut conn, input, day("2026-11-03")).expect("save");
        let first = generate_due_recurring(&mut conn, day("2026-11-05")).expect("first");
        assert_eq!(first.created.len(), 1);
        let second = generate_due_recurring(&mut conn, day("2026-11-05")).expect("second");
        assert!(second.created.is_empty());
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM invoices"), 1);
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM recurring_runs"), 1);

        // Aunque next_run_date vuelva atrás, la clave de periodo impide el duplicado.
        conn.execute(
            "UPDATE recurring_invoices SET next_run_date = '2026-11-05'",
            [],
        )
        .unwrap();
        let again = generate_due_recurring(&mut conn, day("2026-11-05")).expect("again");
        assert!(again.created.is_empty());
        assert_eq!(again.skipped, vec!["2026-11".to_string()]);
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM invoices"), 1);
    }

    #[test]
    fn generated_draft_carries_template_notes_and_recurring_origin() {
        let (mut conn, input) = setup();
        save_recurring(&mut conn, input, day("2026-11-03")).expect("save");
        let created = generate_due_recurring(&mut conn, day("2026-11-05")).expect("generate");
        let draft_id = &created.created[0];

        let detail = get_invoice_detail(&conn, draft_id).expect("detail");
        assert_eq!(detail.invoice.notes, "Pago por transferencia");
        assert_eq!(
            detail.recurring_label.as_deref(),
            Some("Cuota mantenimiento")
        );
        assert_eq!(detail.recurring_period_key.as_deref(), Some("2026-11"));
        let row = list_invoices(&conn).expect("list").remove(0);
        assert_eq!(row.recurring_label.as_deref(), Some("Cuota mantenimiento"));
        assert_eq!(row.recurring_period_key.as_deref(), Some("2026-11"));
        assert_eq!((row.payment_status.as_str(), row.paid_cents), ("unpaid", 0));

        // Al emitir, el periodo pasa a la factura emitida y el origen se sigue viendo.
        let item = list_recurring(&conn, None).expect("list").remove(0);
        let (issued, hash) = Invoice::issue(crate::domain::invoice::InvoiceIssueInput {
            draft: draft_input(&item, 2026, Vec::new()),
            number: 1,
            issued_at: "2026-11-05T10:00:00Z".to_string(),
            actor: "test".to_string(),
            previous_audit_hash: None,
        })
        .expect("issue");
        let event = AuditEvent::invoice_issued(issued.id.clone(), "t".into(), hash.clone(), None);
        insert_issued_invoice_from_draft(&mut conn, &issued, &hash, None, &event, Some(draft_id))
            .expect("insert");
        let detail = get_invoice_detail(&conn, &issued.id).expect("issued detail");
        assert_eq!(detail.recurring_period_key.as_deref(), Some("2026-11"));
        assert_eq!(detail.invoice.notes, "Pago por transferencia");
    }

    #[test]
    fn three_missed_periods_create_three_drafts_with_their_dates() {
        let (mut conn, input) = setup();
        let saved = save_recurring(&mut conn, input, day("2026-11-01")).expect("save");
        let result = generate_due_recurring(&mut conn, day("2027-01-20")).expect("generate");
        assert_eq!(result.created.len(), 3);
        let runs: Vec<(String, String, i32, String, Option<i64>)> = conn
            .prepare(
                "SELECT r.period_key, r.run_date, i.fiscal_year, i.series, i.number
                 FROM recurring_runs r JOIN invoices i ON i.id = r.invoice_id ORDER BY r.run_date",
            )
            .unwrap()
            .query_map([], |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                ))
            })
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        let keys: Vec<_> = runs
            .iter()
            .map(|r| (r.0.as_str(), r.1.as_str(), r.2))
            .collect();
        assert_eq!(
            keys,
            vec![
                ("2026-11", "2026-11-05", 2026),
                ("2026-12", "2026-12-05", 2026),
                ("2027-01", "2027-01-05", 2027),
            ]
        );
        assert!(runs.iter().all(|r| r.3 == "R" && r.4.is_none()));
        let after = get_recurring(&conn, &saved.id).expect("get");
        assert_eq!(after.next_run_date, "2027-02-05");
        assert_eq!(after.last_period_key.as_deref(), Some("2027-01"));
    }

    #[test]
    fn end_date_quarterly_and_paused_templates() {
        let (mut conn, mut input) = setup();
        input.frequency = "quarterly".to_string();
        input.start_date = "2026-02-01".to_string();
        input.day_of_period = 15;
        input.end_date = Some("2026-08-15".to_string());
        let quarterly = save_recurring(&mut conn, input.clone(), day("2026-02-01")).expect("q");
        let result = generate_due_recurring(&mut conn, day("2027-06-01")).expect("generate");
        assert_eq!(result.created.len(), 3); // feb, may, ago; nov pasa de end_date
        let keys: Vec<String> = conn
            .prepare("SELECT period_key FROM recurring_runs ORDER BY run_date")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(keys, vec!["2026-T1", "2026-T2", "2026-T3"]);
        assert!(preview_recurring(&conn, Some(&quarterly.id), None, 3)
            .unwrap()
            .is_empty());

        // Pausada no genera; al reactivar salta lo vencido en la pausa salvo el periodo en curso.
        input.frequency = "monthly".to_string();
        input.end_date = None;
        input.start_date = "2026-09-01".to_string();
        let paused = save_recurring(&mut conn, input, day("2026-09-01")).expect("m");
        set_recurring_active(&mut conn, &paused.id, false, day("2026-09-01")).expect("pause");
        let none = generate_due_recurring(&mut conn, day("2026-11-20")).expect("generate");
        assert!(none.created.is_empty());
        let resumed =
            set_recurring_active(&mut conn, &paused.id, true, day("2026-11-20")).expect("resume");
        assert_eq!(resumed.next_run_date, "2026-11-15");
        let one = generate_due_recurring(&mut conn, day("2026-11-20")).expect("generate");
        assert_eq!(one.created.len(), 1);
    }

    #[test]
    fn preview_from_saved_and_unsaved_template() {
        let (mut conn, input) = setup();
        let unsaved = preview_recurring(&conn, None, Some(input.clone()), 3).expect("preview");
        let dates: Vec<_> = unsaved
            .iter()
            .map(|p| (p.period_key.as_str(), p.run_date.as_str()))
            .collect();
        assert_eq!(
            dates,
            vec![
                ("2026-11", "2026-11-05"),
                ("2026-12", "2026-12-05"),
                ("2027-01", "2027-01-05")
            ]
        );
        assert!(unsaved.iter().all(|p| p.total_cents == 12_100));
        let saved = save_recurring(&mut conn, input, day("2026-11-01")).expect("save");
        assert_eq!(
            preview_recurring(&conn, Some(&saved.id), None, 12)
                .unwrap()
                .len(),
            12
        );
        assert_eq!(
            preview_recurring(&conn, Some(&saved.id), None, 13).unwrap_err(),
            "validation_error:count"
        );
        assert_eq!(
            preview_recurring(&conn, Some("nope"), None, 3).unwrap_err(),
            "not_found"
        );
    }

    #[test]
    fn update_delete_audit_and_no_fiscal_writes() {
        let (mut conn, input) = setup();
        let today = day("2026-11-03");
        let saved = save_recurring(&mut conn, input.clone(), today).expect("save");
        let mut edit = input;
        edit.id = Some(saved.id.clone());
        edit.label = "Cuota nueva".to_string();
        let edited = save_recurring(&mut conn, edit.clone(), today).expect("edit");
        assert_eq!(edited.label, "Cuota nueva");
        assert_eq!(edited.next_run_date, saved.next_run_date);
        assert_eq!(edited.created_at, saved.created_at);
        // Cambiar el día recalcula desde hoy (periodo en curso).
        edit.day_of_period = 1;
        let moved = save_recurring(&mut conn, edit.clone(), today).expect("move");
        assert_eq!(moved.next_run_date, "2026-11-01");

        let generated = generate_due_recurring(&mut conn, today).expect("generate");
        assert_eq!(generated.created.len(), 1);
        delete_recurring(&mut conn, &saved.id).expect("delete");
        assert!(list_recurring(&conn, None).unwrap().is_empty());
        assert_eq!(
            delete_recurring(&mut conn, &saved.id).unwrap_err(),
            "not_found"
        );
        assert_eq!(
            save_recurring(&mut conn, edit, today).unwrap_err(),
            "not_found"
        );
        assert!(generate_due_recurring(&mut conn, day("2027-06-01"))
            .unwrap()
            .created
            .is_empty());
        // El borrador y su periodo siguen tras borrar la plantilla.
        assert_eq!(
            count(&conn, "SELECT COUNT(*) FROM invoices WHERE status = 'Draft' AND number IS NULL AND fiscal_hash IS NULL"),
            1
        );
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM recurring_runs"), 1);

        let actions: Vec<String> = conn
            .prepare("SELECT action FROM audit_events ORDER BY rowid")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(
            actions,
            vec![
                "recurring_created",
                "recurring_updated",
                "recurring_updated",
                "recurring_draft_generated",
                "recurring_deleted"
            ]
        );
        for table in [
            "invoice_sequences",
            "fiscal_records",
            "fiscal_exports",
            "verifactu_submissions",
        ] {
            assert_eq!(
                count(&conn, &format!("SELECT COUNT(*) FROM {table}")),
                0,
                "{table}"
            );
        }
    }
}
