//! Verificación local de la cadena de registros fiscales (huellas encadenadas por empresa).
//!
//! Recorre SQLite en orden, comprueba forma del registro, enlace con el hash previo,
//! unicidad y recomputa el hash VERI*FACTU (`verifactu::*`) para detectar manipulación.
//! También verifica la cadena de `audit_events` (eslabón previo y hash recalculado).
//! Evidencia local: no es homologación ni aceptación AEAT.

use crate::db::{self, FiscalRecordVerificationRow};
use crate::services::verifactu;
use chrono::DateTime;
use rusqlite::Connection;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::path::Path;

/// Informe agregado: validez, cabezas de cadena por empresa e issues.
#[derive(Debug, Clone, Serialize)]
pub struct FiscalChainVerification {
    pub valid: bool,
    pub total_records: usize,
    /// Eventos de auditoría recorridos; sus incidencias usan códigos `AUDIT_*`.
    pub audit_total_events: usize,
    pub issue_count: usize,
    pub last_hash_by_company: Vec<FiscalCompanyChainHead>,
    pub issues: Vec<FiscalChainIssue>,
}

/// Último `fiscal_hash` conocido por `company_id` tras el recorrido.
#[derive(Debug, Clone, Serialize)]
pub struct FiscalCompanyChainHead {
    pub company_id: String,
    pub last_hash: String,
}

/// Incidencia detectada en un registro (severidad + código estable).
/// En incidencias `AUDIT_*`, `record_id` es el evento e `invoice_id` su `entity_id`.
#[derive(Debug, Clone, Serialize)]
pub struct FiscalChainIssue {
    pub record_id: String,
    pub invoice_id: String,
    pub severity: String,
    pub code: String,
    pub message: String,
}

/// Punto de entrada: valida toda la cadena fiscal persistida y devuelve el informe.
pub fn verify(conn: &Connection) -> Result<FiscalChainVerification, String> {
    let records = db::list_fiscal_records_for_verification(conn)?;
    let mut issues = Vec::new();
    let mut previous_by_company: HashMap<String, String> = HashMap::new();
    let mut seen_hashes = HashSet::new();

    for record in &records {
        validate_record_shape(record, &mut issues);
        validate_chain_link(record, &previous_by_company, &mut issues);
        validate_hash_uniqueness(record, &mut seen_hashes, &mut issues);
        validate_recomputed_hash(record, &mut issues);
        previous_by_company.insert(record.company_id.clone(), record.fiscal_hash.clone());
    }

    let audit_total_events = verify_audit_chain(conn, &records, &mut issues)?;

    let mut last_hash_by_company = previous_by_company
        .into_iter()
        .map(|(company_id, last_hash)| FiscalCompanyChainHead {
            company_id,
            last_hash,
        })
        .collect::<Vec<_>>();
    last_hash_by_company.sort_by(|a, b| a.company_id.cmp(&b.company_id));

    Ok(FiscalChainVerification {
        valid: issues.is_empty(),
        total_records: records.len(),
        audit_total_events,
        issue_count: issues.len(),
        last_hash_by_company,
        issues,
    })
}

/// Recorre `audit_events` en orden: cada evento enlaza con el hash del anterior y su hash
/// guardado coincide con el recalculado. Además, cada registro fiscal tiene su evento
/// (`payload_hash = fiscal_hash`): así se detecta que alguien borre la cola de la cadena,
/// que por sí sola seguiría enlazando. Devuelve el número de eventos.
fn verify_audit_chain(
    conn: &Connection,
    records: &[FiscalRecordVerificationRow],
    issues: &mut Vec<FiscalChainIssue>,
) -> Result<usize, String> {
    let events = db::list_audit_events_for_verification(conn)?;
    let audited: HashSet<&str> = events
        .iter()
        .map(|(event, _)| event.payload_hash.as_str())
        .collect();
    for record in records {
        if !audited.contains(record.fiscal_hash.as_str()) {
            push_issue(
                issues,
                record,
                "error",
                "AUDIT_MISSING_EVENT",
                "fiscal record has no audit event: the audit chain may have been truncated",
            );
        }
    }
    let mut previous: Option<&str> = None;
    for (event, stored_hash) in &events {
        let mut issue = |code: &str, message: &str| {
            issues.push(FiscalChainIssue {
                record_id: event.id.clone(),
                invoice_id: event.entity_id.clone(),
                severity: "error".to_string(),
                code: code.to_string(),
                message: message.to_string(),
            })
        };
        if event.previous_hash.as_deref() != previous {
            issue(
                "AUDIT_BROKEN_CHAIN",
                "audit previous_hash does not match the prior audit event",
            );
        }
        if event.chain_hash() != *stored_hash {
            issue(
                "AUDIT_HASH_MISMATCH",
                "audit event hash does not match its recomputed content",
            );
        }
        previous = Some(stored_hash);
    }
    Ok(events.len())
}

/// Comprueba formato de hash, fechas, número emitido y campos obligatorios del registro.
fn validate_record_shape(record: &FiscalRecordVerificationRow, issues: &mut Vec<FiscalChainIssue>) {
    if !is_upper_hex_sha256(&record.fiscal_hash) {
        push_issue(
            issues,
            record,
            "error",
            "INVALID_HASH_FORMAT",
            "fiscal_hash must be uppercase SHA-256 hex with 64 chars",
        );
    }

    if DateTime::parse_from_rfc3339(&record.generated_at).is_err() {
        push_issue(
            issues,
            record,
            "error",
            "INVALID_GENERATED_AT",
            "generated_at is not valid RFC3339",
        );
    }

    if record.invoice_number.is_none() {
        push_issue(
            issues,
            record,
            "error",
            "MISSING_INVOICE_NUMBER",
            "fiscal record invoice has no issued number",
        );
    }

    if record.invoice_issued_at.is_none() {
        push_issue(
            issues,
            record,
            "error",
            "MISSING_ISSUED_AT",
            "fiscal record invoice has no issued_at",
        );
    }

    if record.record_type == "Alta" {
        if record.invoice_fiscal_hash.as_deref() != Some(record.fiscal_hash.as_str()) {
            push_issue(
                issues,
                record,
                "error",
                "INVOICE_HASH_MISMATCH",
                "invoice fiscal_hash does not match Alta fiscal record",
            );
        }
    } else if record.record_type == "Anulacion" {
        // Una anulación rechazada por la AEAT sigue en la cadena, pero la factura no está anulada.
        if record.record_status != "rejected"
            && !matches!(record.invoice_status.as_str(), "Void" | "VoidPending")
        {
            push_issue(
                issues,
                record,
                "error",
                "ANULACION_STATUS_MISMATCH",
                "Anulacion record requires invoice status Void or VoidPending",
            );
        }
        match record.xml_path.as_deref() {
            Some(path) if Path::new(path).exists() => {}
            Some(_) => push_issue(
                issues,
                record,
                "warning",
                "ANULACION_XML_MISSING",
                "Anulacion XML path is recorded but the file is not present",
            ),
            None => push_issue(
                issues,
                record,
                "warning",
                "ANULACION_XML_NOT_RECORDED",
                "Anulacion record has no XML evidence path",
            ),
        }
    } else {
        push_issue(
            issues,
            record,
            "error",
            "UNKNOWN_RECORD_TYPE",
            "record_type must be Alta or Anulacion",
        );
    }
}

/// Verifica que `previous_hash` coincida con la cabeza previa de esa empresa (o sea None al inicio).
fn validate_chain_link(
    record: &FiscalRecordVerificationRow,
    previous_by_company: &HashMap<String, String>,
    issues: &mut Vec<FiscalChainIssue>,
) {
    let expected_previous = previous_by_company.get(&record.company_id);
    match (expected_previous, record.previous_fiscal_hash.as_deref()) {
        (None, None) => {}
        (None, Some(_)) => push_issue(
            issues,
            record,
            "error",
            "UNEXPECTED_PREVIOUS_HASH",
            "first fiscal record for company should not have previous_fiscal_hash",
        ),
        (Some(expected), Some(actual)) if actual == expected => {}
        (Some(_), Some(_)) => push_issue(
            issues,
            record,
            "error",
            "BROKEN_CHAIN",
            "previous_fiscal_hash does not match prior fiscal record for company",
        ),
        (Some(_), None) => push_issue(
            issues,
            record,
            "error",
            "MISSING_PREVIOUS_HASH",
            "non-first fiscal record has no previous_fiscal_hash",
        ),
    }
}

/// Detecta reutilización de `fiscal_hash` entre registros.
fn validate_hash_uniqueness(
    record: &FiscalRecordVerificationRow,
    seen_hashes: &mut HashSet<String>,
    issues: &mut Vec<FiscalChainIssue>,
) {
    if !seen_hashes.insert(record.fiscal_hash.clone()) {
        push_issue(
            issues,
            record,
            "error",
            "DUPLICATE_HASH",
            "fiscal_hash appears more than once",
        );
    }
}

/// Recalcula huella alta/anulación con `verifactu` y la compara con la persistida.
fn validate_recomputed_hash(
    record: &FiscalRecordVerificationRow,
    issues: &mut Vec<FiscalChainIssue>,
) {
    let Some(number) = record.invoice_number else {
        return;
    };
    let Some(issued_at) = record.invoice_issued_at.as_deref() else {
        return;
    };

    let expected = match record.record_type.as_str() {
        "Alta" => verifactu::registro_alta_invoice_type_for_kind(
            &record.invoice_kind,
            record.invoice_rectification_reason_code.as_deref(),
        )
        .and_then(|invoice_type| {
            verifactu::IssuedAlta {
                issuer_tax_id: &record.company_tax_id,
                series: &record.invoice_series,
                number,
                issued_at,
                tax_cents: record.invoice_tax_cents,
                total_cents: record.invoice_total_cents,
                invoice_type,
                previous_hash: record.previous_fiscal_hash.as_deref(),
            }
            .hash()
        }),
        "Anulacion" => match record.previous_fiscal_hash.as_deref() {
            Some(previous_hash) => verifactu::calculate_issued_invoice_registro_anulacion_hash(
                &record.company_tax_id,
                &record.invoice_series,
                number,
                issued_at,
                previous_hash,
                &record.generated_at,
            ),
            None => {
                push_issue(
                    issues,
                    record,
                    "error",
                    "ANULACION_WITHOUT_PREVIOUS_HASH",
                    "Anulacion requires previous fiscal hash",
                );
                return;
            }
        },
        _ => return,
    };

    match expected {
        Ok(expected_hash) if expected_hash == record.fiscal_hash => {}
        Ok(_) => push_issue(
            issues,
            record,
            "error",
            "HASH_MISMATCH",
            "fiscal_hash does not match recomputed AEAT hash material",
        ),
        Err(err) => push_issue(issues, record, "error", "HASH_RECOMPUTE_ERROR", &err),
    }
}

fn is_upper_hex_sha256(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'A'..=b'F').contains(&byte))
}

/// Acumula un issue tipado ligado al registro actual.
fn push_issue(
    issues: &mut Vec<FiscalChainIssue>,
    record: &FiscalRecordVerificationRow,
    severity: &str,
    code: &str,
    message: &str,
) {
    issues.push(FiscalChainIssue {
        record_id: record.id.clone(),
        invoice_id: record.invoice_id.clone(),
        severity: severity.to_string(),
        code: code.to_string(),
        message: message.to_string(),
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::company::{Company, CompanyInput};
    use crate::domain::customer::{Customer, CustomerInput, CustomerKind};
    use crate::domain::invoice::{
        Invoice, InvoiceDraftInput, InvoiceIssueInput, InvoiceKind, InvoiceLineInput,
    };
    use crate::domain::tax::TerritoryFlag;
    use crate::services::audit::AuditEvent;
    use rusqlite::{params, Connection};

    fn company() -> Company {
        Company::from_input(CompanyInput {
            legal_name: "Demo SL".to_string(),
            tax_id: "B00000000".to_string(),
            address: "Calle Demo 1".to_string(),
            postal_code: "28001".to_string(),
            municipality: "Madrid".to_string(),
            province: "Madrid".to_string(),
            country_code: "ES".to_string(),
            default_series: Some("A".to_string()),
        })
    }

    fn customer() -> Customer {
        Customer::from_input(CustomerInput {
            id: None,
            display_name: "Cliente Demo".to_string(),
            tax_id: "00000000T".to_string(),
            kind: CustomerKind::Business,
            address: "Calle Cliente 1".to_string(),
            postal_code: "28002".to_string(),
            municipality: "Madrid".to_string(),
            province: "Madrid".to_string(),
            country_code: "ES".to_string(),
        })
    }

    fn issued_invoice(
        company_id: String,
        customer_id: String,
        number: i64,
        issued_at: &str,
    ) -> Invoice {
        let input = InvoiceIssueInput {
            draft: InvoiceDraftInput {
                company_id,
                customer_id,
                fiscal_year: 2026,
                series: "A".to_string(),
                number: None,
                kind: InvoiceKind::Complete,
                territory_flags: vec![TerritoryFlag::CommonTerritory, TerritoryFlag::VeriFactu],
                lines: vec![InvoiceLineInput {
                    description: "Servicio".to_string(),
                    quantity: 1,
                    unit_price_cents: 10_000,
                    discount_rate_basis_points: None,
                    tax_rate_basis_points: 2_100,
                    withholding_rate_basis_points: None,
                    price_pending: None,
                }],
                rectifies_invoice_id: None,
                rectification_reason_code: None,
                rectification_method: None,
                notes: String::new(),
            },
            number,
            issued_at: issued_at.to_string(),
            actor: "tester".to_string(),
            previous_audit_hash: None,
        };
        Invoice::issue(input).expect("issued invoice").0
    }

    fn insert_issued(
        conn: &mut Connection,
        invoice: &Invoice,
        previous_hash: Option<&str>,
    ) -> String {
        let issued_at = invoice.issued_at.as_deref().expect("issued_at");
        let number = invoice.number.expect("number");
        let fiscal_hash = verifactu::IssuedAlta {
            issuer_tax_id: "B00000000",
            series: &invoice.series,
            number,
            issued_at,
            tax_cents: invoice.totals.tax_cents,
            total_cents: invoice.totals.total_cents,
            invoice_type: "F1",
            previous_hash,
        }
        .hash()
        .expect("alta hash");
        let audit_event = AuditEvent::invoice_issued(
            invoice.id.clone(),
            "tester".to_string(),
            fiscal_hash.clone(),
            db::latest_audit_hash(conn).expect("audit head"),
        );
        db::insert_issued_invoice(conn, invoice, &fiscal_hash, previous_hash, &audit_event)
            .expect("insert issued");
        fiscal_hash
    }

    #[test]
    fn verifies_valid_alta_anulacion_chain() {
        let mut conn = db::test_conn();
        let company = company();
        let customer = customer();
        db::insert_company(&conn, &company).expect("company");
        db::upsert_customer(&conn, &customer).expect("customer");

        let invoice = issued_invoice(
            company.id.clone(),
            customer.id.clone(),
            1,
            "2026-05-28T10:00:00Z",
        );
        let alta_hash = insert_issued(&mut conn, &invoice, None);
        let generated_at = "2026-05-28T10:05:00Z";
        let anulacion_hash = verifactu::calculate_issued_invoice_registro_anulacion_hash(
            "B00000000",
            &invoice.series,
            invoice.number.expect("number"),
            invoice.issued_at.as_deref().expect("issued_at"),
            &alta_hash,
            generated_at,
        )
        .expect("anulacion hash");
        let event = AuditEvent::invoice_voided(
            invoice.id.clone(),
            "tester".to_string(),
            anulacion_hash.clone(),
            db::latest_audit_hash(&conn).expect("audit head"),
        );
        let target = std::env::temp_dir().join(format!(
            "cumplefactura-anulacion-{}.xml",
            uuid::Uuid::new_v4()
        ));
        std::fs::write(&target, "<xml/>").expect("xml evidence");
        db::insert_anulacion_record(
            &mut conn,
            &invoice.id,
            &anulacion_hash,
            Some(&alta_hash),
            generated_at,
            target.to_str().expect("utf8"),
            &event,
            "Factura duplicada",
        )
        .expect("insert anulacion");

        let result = verify(&conn).expect("verify");
        let _ = std::fs::remove_file(target);

        assert!(result.valid, "{:?}", result.issues);
        assert_eq!(result.total_records, 2);
        assert_eq!(result.issue_count, 0);
    }

    #[test]
    fn detects_row_tampering_in_both_chains() {
        let mut conn = db::test_conn();
        let company = company();
        let customer = customer();
        db::insert_company(&conn, &company).expect("company");
        db::upsert_customer(&conn, &customer).expect("customer");
        let invoice = issued_invoice(
            company.id.clone(),
            customer.id.clone(),
            1,
            "2026-05-28T10:00:00Z",
        );
        insert_issued(&mut conn, &invoice, None);
        audit_company(&conn, &company, "company_updated");
        let before = verify(&conn).expect("verify");
        assert!(before.valid, "{:?}", before.issues);
        assert_eq!(before.audit_total_events, 2);

        // Solo en este test: sin triggers de inalterabilidad, se manipula una fila de cada cadena.
        conn.execute_batch(
            "DROP TRIGGER fiscal_records_no_update;
             DROP TRIGGER audit_events_no_update;
             UPDATE fiscal_records SET fiscal_hash = '0000000000000000000000000000000000000000000000000000000000000000';
             UPDATE audit_events SET actor = 'intruso' WHERE action = 'company_updated';",
        )
        .expect("tamper rows");

        let result = verify(&conn).expect("verify");
        assert!(!result.valid);
        let codes: Vec<&str> = result
            .issues
            .iter()
            .map(|issue| issue.code.as_str())
            .collect();
        assert!(codes.contains(&"HASH_MISMATCH"), "{codes:?}");
        assert!(codes.contains(&"AUDIT_HASH_MISMATCH"), "{codes:?}");
    }

    #[test]
    fn detects_broken_audit_link() {
        let conn = db::test_conn();
        let company = company();
        db::insert_company(&conn, &company).expect("company");
        audit_company(&conn, &company, "company_created");
        let orphan =
            AuditEvent::operational("company", &company.id, "company_updated", "h".into(), None);
        conn.execute(
            "INSERT INTO audit_events (id, entity_type, entity_id, action, actor, occurred_at, payload_hash, previous_hash, hash)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                orphan.id,
                orphan.entity_type,
                orphan.entity_id,
                orphan.action,
                orphan.actor,
                orphan.occurred_at,
                orphan.payload_hash,
                orphan.previous_hash,
                orphan.chain_hash(),
            ],
        )
        .expect("orphan event");

        let result = verify(&conn).expect("verify");
        assert!(!result.valid);
        assert!(result
            .issues
            .iter()
            .any(|issue| issue.code == "AUDIT_BROKEN_CHAIN"));
    }

    /// Evento de auditoría como lo guardan los comandos: dentro de `write_tx`.
    fn audit_company(conn: &Connection, company: &Company, action: &str) {
        let tx = db::write_tx(conn).expect("tx");
        db::audit_change(&tx, "company", &company.id, action, company).expect("audit change");
        tx.commit().expect("commit");
    }

    #[test]
    fn audit_chain_follows_insertion_order_when_clock_goes_back() {
        let conn = db::test_conn();
        let tx = db::write_tx(&conn).expect("tx");
        for (action, occurred_at) in [
            ("company_created", "2026-11-27T10:00:00+00:00"),
            ("company_updated", "2026-11-27T09:00:00+00:00"),
        ] {
            let mut event = AuditEvent::operational(
                "company",
                "c1",
                action,
                "h".into(),
                db::latest_audit_hash(&tx).expect("head"),
            );
            event.occurred_at = occurred_at.to_string();
            db::insert_audit_event(&tx, &event).expect("insert");
        }
        let second_head = db::latest_audit_hash(&tx).expect("head");
        tx.commit().expect("commit");

        let result = verify(&conn).expect("verify");
        assert!(result.valid, "{:?}", result.issues);
        assert_eq!(result.audit_total_events, 2);
        // El siguiente evento enlaza con el último insertado, no con el de fecha mayor.
        let tx = db::write_tx(&conn).expect("tx");
        db::audit_change(&tx, "company", "c1", "company_updated", &"x").expect("third");
        tx.commit().expect("commit");
        let events = db::list_audit_events_for_verification(&conn).expect("events");
        assert_eq!(events[2].0.previous_hash, second_head);
        assert!(verify(&conn).expect("verify").valid);
    }

    #[test]
    fn detects_truncated_audit_tail() {
        let mut conn = db::test_conn();
        let company = company();
        let customer = customer();
        db::insert_company(&conn, &company).expect("company");
        db::upsert_customer(&conn, &customer).expect("customer");
        let invoice = issued_invoice(
            company.id.clone(),
            customer.id.clone(),
            1,
            "2026-05-28T10:00:00Z",
        );
        insert_issued(&mut conn, &invoice, None);
        assert!(verify(&conn).expect("verify").valid);

        // Solo en este test: sin trigger de borrado, se quita el último evento (la cola).
        conn.execute_batch(
            "DROP TRIGGER audit_events_no_delete;
             DELETE FROM audit_events WHERE rowid = (SELECT MAX(rowid) FROM audit_events);",
        )
        .expect("truncate tail");

        let result = verify(&conn).expect("verify");
        assert!(!result.valid);
        assert!(result
            .issues
            .iter()
            .any(|issue| issue.code == "AUDIT_MISSING_EVENT" && issue.invoice_id == invoice.id));
    }

    #[test]
    fn detects_invoice_tampering_after_fiscal_record() {
        let mut conn = db::test_conn();
        let company = company();
        let customer = customer();
        db::insert_company(&conn, &company).expect("company");
        db::upsert_customer(&conn, &customer).expect("customer");
        let invoice = issued_invoice(
            company.id.clone(),
            customer.id.clone(),
            1,
            "2026-05-28T10:00:00Z",
        );
        insert_issued(&mut conn, &invoice, None);

        conn.execute(
            "UPDATE invoices SET total_cents = total_cents + 1 WHERE id = ?1",
            params![&invoice.id],
        )
        .expect("tamper invoice");

        let result = verify(&conn).expect("verify");

        assert!(!result.valid);
        assert!(result
            .issues
            .iter()
            .any(|issue| issue.code == "HASH_MISMATCH"));
    }

    #[test]
    fn detects_broken_previous_hash_link() {
        let mut conn = db::test_conn();
        let company = company();
        let customer = customer();
        db::insert_company(&conn, &company).expect("company");
        db::upsert_customer(&conn, &customer).expect("customer");
        let first = issued_invoice(
            company.id.clone(),
            customer.id.clone(),
            1,
            "2026-05-28T10:00:00Z",
        );
        let second = issued_invoice(
            company.id.clone(),
            customer.id.clone(),
            2,
            "2026-05-28T10:10:00Z",
        );
        insert_issued(&mut conn, &first, None);
        insert_issued(&mut conn, &second, Some(&"F".repeat(64)));

        let result = verify(&conn).expect("verify");

        assert!(!result.valid);
        assert!(result
            .issues
            .iter()
            .any(|issue| issue.code == "BROKEN_CHAIN"));
    }
}
