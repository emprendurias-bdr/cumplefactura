use crate::db::{AuditSummary, FiscalRecordSummary, InvoicePdfData, InvoiceSummary};
use crate::services::fiscal_chain::FiscalChainVerification;
use serde::Serialize;
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize)]
pub struct FiscalAuditExport {
    pub generated_at: String,
    pub invoices: Vec<InvoiceSummary>,
    pub audit_events: Vec<AuditSummary>,
    pub fiscal_records: Vec<FiscalRecordSummary>,
    pub chain_verification: FiscalChainVerification,
    pub limits: Vec<String>,
}

pub fn write_invoice_json(path: &str, invoice: &InvoicePdfData) -> Result<(), String> {
    write_new_file(
        path,
        &serde_json::to_string_pretty(invoice).map_err(|err| format!("json error: {err}"))?,
    )
}

pub fn write_invoice_csv(path: &str, invoices: &[InvoiceSummary]) -> Result<(), String> {
    let mut csv = String::from(
        "id,company_id,customer_id,fiscal_year,series,number,kind,status,total_cents,fiscal_hash,created_at,issued_at\n",
    );
    for invoice in invoices {
        csv.push_str(&format!(
            "{},{},{},{},{},{},{},{},{},{},{},{}\n",
            cell(&invoice.id),
            cell(&invoice.company_id),
            cell(&invoice.customer_id),
            invoice.fiscal_year,
            cell(&invoice.series),
            invoice
                .number
                .map(|value| value.to_string())
                .unwrap_or_default(),
            cell(&invoice.kind),
            cell(&invoice.status),
            invoice.total_cents,
            cell(invoice.fiscal_hash.as_deref().unwrap_or("")),
            cell(&invoice.created_at),
            cell(invoice.issued_at.as_deref().unwrap_or(""))
        ));
    }
    write_new_file(path, &csv)
}

pub fn write_fiscal_audit_json(
    path: &str,
    invoices: Vec<InvoiceSummary>,
    audit_events: Vec<AuditSummary>,
    fiscal_records: Vec<FiscalRecordSummary>,
    chain_verification: FiscalChainVerification,
) -> Result<(), String> {
    let payload = FiscalAuditExport {
        generated_at: chrono::Utc::now().to_rfc3339(),
        invoices,
        audit_events,
        fiscal_records,
        chain_verification,
        limits: vec![
            "Local audit export only; not legal certification.".to_string(),
            "No external AEAT/FACe/SII/foral call is performed.".to_string(),
        ],
    };
    write_new_file(
        path,
        &serde_json::to_string_pretty(&payload).map_err(|err| format!("json error: {err}"))?,
    )
}

pub fn validate_restore_source(path: &str) -> Result<(), String> {
    let source = Path::new(path);
    if !source.exists() {
        return Err("backup source does not exist".to_string());
    }
    if !source.is_file() {
        return Err("backup source must be a file".to_string());
    }
    if source
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| {
            !matches!(
                value.to_ascii_lowercase().as_str(),
                "sqlite" | "sqlite3" | "db"
            )
        })
        .unwrap_or(true)
    {
        return Err("backup source must use .sqlite, .sqlite3 or .db extension".to_string());
    }
    Ok(())
}

fn write_new_file(path: &str, contents: &str) -> Result<(), String> {
    let target = Path::new(path);
    if target.exists() {
        return Err("target file already exists".to_string());
    }
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|err| format!("export directory error: {err}"))?;
    }
    fs::write(target, contents).map_err(|err| format!("export write error: {err}"))
}

fn cell(value: &str) -> String {
    let escaped = value.replace('"', "\"\"");
    format!("\"{escaped}\"")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_restore_source_extension() {
        let target = std::env::temp_dir().join(format!(
            "cumplefactura-backup-{}.sqlite3",
            uuid::Uuid::new_v4()
        ));
        fs::write(&target, b"SQLite placeholder").expect("write backup");

        validate_restore_source(target.to_str().expect("utf8")).expect("valid backup");

        fs::remove_file(target).expect("cleanup");
    }

    #[test]
    fn writes_invoice_csv_without_overwriting() {
        let target =
            std::env::temp_dir().join(format!("cumplefactura-export-{}.csv", uuid::Uuid::new_v4()));
        let invoice = InvoiceSummary {
            id: "invoice-1".to_string(),
            company_id: "company-1".to_string(),
            customer_id: "customer-1".to_string(),
            fiscal_year: 2026,
            series: "A".to_string(),
            number: Some(1),
            kind: "Complete".to_string(),
            status: "Issued".to_string(),
            rectifies_invoice_id: None,
            rectification_reason_code: None,
            rectification_method: None,
            taxable_base_cents: 10000,
            total_cents: 12100,
            fiscal_hash: Some("A".repeat(64)),
            created_at: "2026-06-02T00:00:00Z".to_string(),
            issued_at: Some("2026-06-02T00:00:00Z".to_string()),
        };

        write_invoice_csv(target.to_str().expect("utf8"), &[invoice]).expect("csv");
        let contents = fs::read_to_string(&target).expect("read csv");

        assert!(contents.contains("\"invoice-1\""));
        assert!(write_invoice_csv(target.to_str().expect("utf8"), &[]).is_err());
        fs::remove_file(target).expect("cleanup");
    }

    #[test]
    fn writes_fiscal_audit_json_with_chain_verification() {
        let target =
            std::env::temp_dir().join(format!("cumplefactura-audit-{}.json", uuid::Uuid::new_v4()));
        let chain = FiscalChainVerification {
            valid: true,
            total_records: 0,
            issue_count: 0,
            last_hash_by_company: vec![],
            issues: vec![],
        };

        write_fiscal_audit_json(
            target.to_str().expect("utf8"),
            vec![],
            vec![],
            vec![],
            chain,
        )
        .expect("audit json");
        let contents = fs::read_to_string(&target).expect("read audit json");
        let payload: serde_json::Value = serde_json::from_str(&contents).expect("json");

        assert_eq!(payload["chain_verification"]["valid"], true);
        assert_eq!(payload["chain_verification"]["total_records"], 0);
        fs::remove_file(target).expect("cleanup");
    }
}
