use crate::db::{self, FiscalRecordVerificationRow};
use crate::services::verifactu;
use chrono::DateTime;
use rusqlite::Connection;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::path::Path;

#[derive(Debug, Clone, Serialize)]
pub struct FiscalChainVerification {
    pub valid: bool,
    pub total_records: usize,
    pub issue_count: usize,
    pub last_hash_by_company: Vec<FiscalCompanyChainHead>,
    pub issues: Vec<FiscalChainIssue>,
}

#[derive(Debug, Clone, Serialize)]
pub struct FiscalCompanyChainHead {
    pub company_id: String,
    pub last_hash: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct FiscalChainIssue {
    pub record_id: String,
    pub invoice_id: String,
    pub severity: String,
    pub code: String,
    pub message: String,
}

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
        issue_count: issues.len(),
        last_hash_by_company,
        issues,
    })
}

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
        if record.invoice_status != "Void" {
            push_issue(
                issues,
                record,
                "error",
                "ANULACION_STATUS_MISMATCH",
                "Anulacion record requires invoice status Void",
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
            verifactu::calculate_issued_invoice_registro_alta_hash_with_type(
                &record.company_tax_id,
                &record.invoice_series,
                number,
                issued_at,
                record.invoice_tax_cents,
                record.invoice_total_cents,
                invoice_type,
                record.previous_fiscal_hash.as_deref(),
            )
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

    fn memory_conn() -> Connection {
        let conn = Connection::open_in_memory().expect("memory db");
        conn.pragma_update(None, "foreign_keys", "ON")
            .expect("foreign keys");
        for migration in db::migrations() {
            conn.execute_batch(migration.sql).expect("migration");
        }
        conn
    }

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
            email: None,
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
                }],
                rectifies_invoice_id: None,
                rectification_reason_code: None,
                rectification_method: None,
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
        let fiscal_hash = verifactu::calculate_issued_invoice_registro_alta_hash(
            "B00000000",
            &invoice.series,
            number,
            issued_at,
            invoice.totals.tax_cents,
            invoice.totals.total_cents,
            previous_hash,
        )
        .expect("alta hash");
        let audit_event = AuditEvent::invoice_issued(
            invoice.id.clone(),
            "tester".to_string(),
            fiscal_hash.clone(),
            None,
        );
        let audit_hash = audit_event.chain_hash();
        db::insert_issued_invoice(
            conn,
            invoice,
            &fiscal_hash,
            previous_hash,
            &audit_event,
            &audit_hash,
        )
        .expect("insert issued");
        fiscal_hash
    }

    #[test]
    fn verifies_valid_alta_anulacion_chain() {
        let mut conn = memory_conn();
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
            None,
        );
        let event_hash = event.chain_hash();
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
            &event_hash,
        )
        .expect("insert anulacion");

        let result = verify(&conn).expect("verify");
        let _ = std::fs::remove_file(target);

        assert!(result.valid, "{:?}", result.issues);
        assert_eq!(result.total_records, 2);
        assert_eq!(result.issue_count, 0);
    }

    #[test]
    fn detects_invoice_tampering_after_fiscal_record() {
        let mut conn = memory_conn();
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
        let mut conn = memory_conn();
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
