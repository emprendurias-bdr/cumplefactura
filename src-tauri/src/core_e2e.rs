use crate::db;
use crate::domain::company::{Company, CompanyInput, InvoiceSeriesConfigInput};
use crate::domain::customer::{Customer, CustomerInput, CustomerKind};
use crate::domain::invoice::{
    Invoice, InvoiceDraftInput, InvoiceIssueInput, InvoiceKind, InvoiceLineInput,
};
use crate::domain::tax::TerritoryFlag;
use crate::services::{audit::AuditEvent, export, fiscal_chain, pdf, submission, verifactu};
use rusqlite::Connection;
use serde_json::json;
use std::fs;
use std::path::PathBuf;

#[test]
fn real_sqlite_verifactu_core_workflow_generates_evidence() {
    let mut conn = memory_conn();
    let app_root = app_root();
    let evidence_dir = app_root.join("tests").join("regulatory").join("evidence");
    let write_evidence = std::env::var("CUMPLEFACTURA_WRITE_CORE_E2E_EVIDENCE")
        .ok()
        .as_deref()
        == Some("1");

    let company = Company::from_input(CompanyInput {
        legal_name: "Demo CumpleFactura SL".to_string(),
        tax_id: "B00000000".to_string(),
        address: "Calle Fiscal 1".to_string(),
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
        address: "Calle Cliente 2".to_string(),
        postal_code: "28002".to_string(),
        municipality: "Madrid".to_string(),
        province: "Madrid".to_string(),
        country_code: "ES".to_string(),
        email: None,
    });
    db::insert_company(&conn, &company).expect("company insert");
    db::upsert_customer(&conn, &customer).expect("customer insert");
    let series_config = db::upsert_invoice_series_config(
        &mut conn,
        InvoiceSeriesConfigInput {
            company_id: company.id.clone(),
            label: "Vendingsaiz Aragon".to_string(),
            series_code: "VENDI".to_string(),
            fiscal_year: 2026,
            include_year: true,
            separator: "".to_string(),
            padding: 2,
            next_number: 7,
            is_default: true,
        },
    )
    .expect("series config");

    let draft_input = InvoiceDraftInput {
        company_id: company.id.clone(),
        customer_id: customer.id.clone(),
        fiscal_year: 2026,
        series: series_config.resolved_series.clone(),
        number: None,
        kind: InvoiceKind::Complete,
        territory_flags: vec![TerritoryFlag::CommonTerritory, TerritoryFlag::VeriFactu],
        rectifies_invoice_id: None,
        rectification_reason_code: None,
        rectification_method: None,
        lines: vec![InvoiceLineInput {
            description: "Servicio profesional".to_string(),
            quantity: 1,
            unit_price_cents: 10_000,
            discount_rate_basis_points: None,
            tax_rate_basis_points: 2_100,
            withholding_rate_basis_points: None,
        }],
    };
    let draft = Invoice::draft(draft_input.clone()).expect("draft invoice");
    db::insert_invoice_draft(&mut conn, &draft).expect("draft persistence");

    let issued_at = "2026-05-31T10:00:00+02:00".to_string();
    let reserved_number =
        db::reserve_invoice_number(&mut conn, &company.id, 2026, &series_config.resolved_series)
            .expect("reserved number");
    let (issued, _) = Invoice::issue(InvoiceIssueInput {
        draft: draft_input,
        number: reserved_number,
        issued_at: issued_at.clone(),
        actor: "core-e2e".to_string(),
        previous_audit_hash: db::latest_audit_hash(&conn).expect("previous audit hash"),
    })
    .expect("issued invoice");

    let previous_fiscal_hash = db::latest_fiscal_record_hash_for_company(&conn, &company.id)
        .expect("previous fiscal hash");
    let invoice_type =
        verifactu::registro_alta_invoice_type_for_kind("Complete", None).expect("invoice type");
    let fiscal_hash = verifactu::calculate_issued_invoice_registro_alta_hash_with_type(
        &company.tax_id,
        &issued.series,
        issued.number.expect("issued number"),
        issued.issued_at.as_deref().expect("issued_at"),
        issued.totals.tax_cents,
        issued.totals.total_cents,
        invoice_type,
        previous_fiscal_hash.as_deref(),
    )
    .expect("AEAT fiscal hash");
    let audit_event = AuditEvent::invoice_issued(
        issued.id.clone(),
        "core-e2e".to_string(),
        fiscal_hash.clone(),
        db::latest_audit_hash(&conn).expect("audit hash"),
    );
    let audit_hash = audit_event.chain_hash();
    db::insert_issued_invoice(
        &mut conn,
        &issued,
        &fiscal_hash,
        previous_fiscal_hash.as_deref(),
        &audit_event,
        &audit_hash,
    )
    .expect("issued invoice persistence");

    let invoice_data = db::invoice_pdf_data(&conn, &issued.id).expect("invoice data");
    let assets = verifactu::dev_verifactu_xsd_assets().expect("dev XSD assets");
    let xml_path = if write_evidence {
        evidence_dir.join("latest-core-e2e-verifactu.xml")
    } else {
        std::env::temp_dir().join(format!(
            "cumplefactura-core-e2e-{}.xml",
            uuid::Uuid::new_v4()
        ))
    };
    remove_if_exists(&xml_path);
    verifactu::write_verifactu_xml_draft_validated(
        xml_path.to_str().expect("xml utf8"),
        &invoice_data,
        None,
        &assets,
    )
    .expect("XSD-valid VERI*FACTU XML");

    let pdf_path = if write_evidence {
        evidence_dir.join("latest-core-e2e-invoice.pdf")
    } else {
        std::env::temp_dir().join(format!(
            "cumplefactura-core-e2e-{}.pdf",
            uuid::Uuid::new_v4()
        ))
    };
    remove_if_exists(&pdf_path);
    pdf::write_invoice_pdf(
        pdf_path.to_str().expect("pdf utf8"),
        &invoice_data,
        crate::services::qr::QrEnvironment::Test,
    )
    .expect("PDF export");

    let json_path = if write_evidence {
        evidence_dir.join("latest-core-e2e-invoice.json")
    } else {
        std::env::temp_dir().join(format!(
            "cumplefactura-core-e2e-{}.json",
            uuid::Uuid::new_v4()
        ))
    };
    remove_if_exists(&json_path);
    export::write_invoice_json(json_path.to_str().expect("json utf8"), &invoice_data)
        .expect("JSON export");

    let csv_path = if write_evidence {
        evidence_dir.join("latest-core-e2e-invoices.csv")
    } else {
        std::env::temp_dir().join(format!(
            "cumplefactura-core-e2e-{}.csv",
            uuid::Uuid::new_v4()
        ))
    };
    remove_if_exists(&csv_path);
    export::write_invoice_csv(
        csv_path.to_str().expect("csv utf8"),
        &db::list_invoices(&conn).expect("invoice list for csv"),
    )
    .expect("CSV export");

    let audit_export_path = if write_evidence {
        evidence_dir.join("latest-core-e2e-audit.json")
    } else {
        std::env::temp_dir().join(format!(
            "cumplefactura-core-e2e-audit-{}.json",
            uuid::Uuid::new_v4()
        ))
    };
    remove_if_exists(&audit_export_path);
    export::write_fiscal_audit_json(
        audit_export_path.to_str().expect("audit json utf8"),
        db::list_invoices(&conn).expect("invoice list for audit export"),
        db::list_audit_events(&conn).expect("audit list for audit export"),
        db::list_fiscal_records(&conn).expect("fiscal list for audit export"),
        fiscal_chain::verify(&conn).expect("chain verification for audit export"),
    )
    .expect("Fiscal audit export");

    let mut package = submission::prepare_unsigned_verifactu_package(
        issued.id.clone(),
        "pending".to_string(),
        xml_path.to_str().expect("xml utf8").to_string(),
    )
    .expect("signature package");
    let export_id = db::insert_fiscal_export(
        &conn,
        &issued.id,
        &package.provider,
        &package.environment,
        &package.payload_version,
        &package.xml_sha256,
        "prepared_for_signature",
    )
    .expect("fiscal export");
    package.export_id = export_id.clone();

    let chain = fiscal_chain::verify(&conn).expect("fiscal chain");
    assert!(chain.valid);
    assert_eq!(chain.total_records, 1);
    assert_eq!(chain.issue_count, 0);
    assert_eq!(fiscal_hash.len(), 64);
    assert!(xml_path.exists());
    assert!(pdf_path.exists());
    assert!(json_path.exists());
    assert!(csv_path.exists());
    assert!(audit_export_path.exists());
    assert!(package.xml_bytes > 1000);
    assert_eq!(package.signature_status, "pending_xades");
    assert_eq!(package.transmission_status, "not_submitted");
    assert_eq!(db::list_companies(&conn).expect("companies").len(), 1);
    assert_eq!(db::list_customers(&conn).expect("customers").len(), 1);
    assert_eq!(db::list_invoices(&conn).expect("invoices").len(), 2);
    assert_eq!(db::list_audit_events(&conn).expect("audit").len(), 1);
    assert_eq!(
        db::list_fiscal_records(&conn)
            .expect("fiscal records")
            .len(),
        1
    );
    assert_eq!(
        db::next_invoice_number_preview(&conn, &company.id, 2026, &series_config.resolved_series)
            .expect("next preview"),
        8
    );

    if write_evidence {
        fs::create_dir_all(&evidence_dir).expect("evidence dir");
        let evidence = json!({
            "app": "CumpleFactura",
            "status": "passed",
            "generated_at": chrono::Utc::now().to_rfc3339(),
            "source_workspace": "C:\\03 LEGISLACION",
            "flow": "SQLite real -> company/customer -> draft -> reserved sequence -> issued invoice -> AEAT hash -> audit/fiscal chain -> VERI*FACTU XML XSD -> PDF/JSON/CSV/audit export -> prepared_for_signature export",
            "checks": {
                "sqlite_real": true,
                "company_customer_persisted": true,
                "draft_persisted": true,
                "issued_invoice_persisted": true,
                "aeat_hash_len": fiscal_hash.len(),
                "fiscal_chain_valid": chain.valid,
                "fiscal_records": chain.total_records,
                "xml_xsd_validated": true,
                "pdf_created": true,
                "json_export_created": true,
                "csv_export_created": true,
                "audit_export_created": true,
                "invoice_series_preview": series_config.preview,
                "next_number_preview": db::next_invoice_number_preview(&conn, &company.id, 2026, &series_config.resolved_series).expect("next preview"),
                "signature_status": package.signature_status,
                "transmission_status": package.transmission_status,
                "fiscal_export_id": export_id
            },
            "artifacts": {
                "xml": xml_path,
                "pdf": pdf_path,
                "json": json_path,
                "csv": csv_path,
                "audit": audit_export_path
            },
            "limits": [
                "Core E2E uses in-memory SQLite and local files.",
                "It exercises Rust domain/db/services, not the Tauri window event loop.",
                "It does not perform XAdES signing, SOAP AEAT transport, certificate use, AEAT CSV retrieval or external acceptance."
            ]
        });
        fs::write(
            evidence_dir.join("latest-core-e2e.json"),
            serde_json::to_string_pretty(&evidence).expect("evidence json"),
        )
        .expect("write evidence");
    } else {
        remove_if_exists(&xml_path);
        remove_if_exists(&pdf_path);
        remove_if_exists(&json_path);
        remove_if_exists(&csv_path);
        remove_if_exists(&audit_export_path);
    }
}

fn memory_conn() -> Connection {
    let conn = Connection::open_in_memory().expect("memory db");
    conn.pragma_update(None, "foreign_keys", "ON")
        .expect("foreign keys");
    db::apply_migrations(&conn).expect("migrations");
    conn
}

fn app_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("app root")
        .to_path_buf()
}

fn remove_if_exists(path: &PathBuf) {
    if path.exists() {
        fs::remove_file(path).expect("remove previous artifact");
    }
}
