//! Tests de persistencia SQLite (migraciones reales en memoria).

use super::*;
use crate::domain::company::{Company, CompanyInput, CompanyUpdateInput, InvoiceSeriesConfigInput};
use crate::domain::customer::{Customer, CustomerInput, CustomerKind};
use crate::domain::invoice::{
    Invoice, InvoiceDraftInput, InvoiceIssueInput, InvoiceKind, InvoiceLineInput, InvoiceStatus,
    RectificationMethod, RectificationReasonCode,
};
use crate::domain::settings::AppSettingsInput;
use crate::domain::tax::TerritoryFlag;

fn memory_conn() -> Connection {
    super::test_conn()
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
    })
}

fn invoice(company_id: String, customer_id: String) -> Invoice {
    Invoice::draft(InvoiceDraftInput {
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
    })
    .expect("draft")
}

#[test]
fn persists_company_customer_and_invoice_draft() {
    let mut conn = memory_conn();
    let company = company();
    let customer = customer();
    insert_company(&conn, &company).expect("company insert");
    upsert_customer(&conn, &customer).expect("customer upsert");
    let invoice = invoice(company.id.clone(), customer.id.clone());
    insert_invoice_draft(&mut conn, &invoice).expect("invoice draft insert");

    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM invoices", [], |row| row.get(0))
        .expect("invoice count");
    assert_eq!(count, 1);
}

#[test]
fn audit_events_are_append_only() {
    let conn = memory_conn();
    conn.execute(
        "INSERT INTO audit_events (id, entity_type, entity_id, action, actor, occurred_at, payload_hash, previous_hash, hash)
         VALUES ('a1', 'invoice', 'i1', 'invoice_issued', 'tester', '2026-05-28T00:00:00Z', 'payload', NULL, 'hash')",
        [],
    )
    .expect("audit insert");

    let update = conn.execute(
        "UPDATE audit_events SET actor = 'other' WHERE id = 'a1'",
        [],
    );
    let delete = conn.execute("DELETE FROM audit_events WHERE id = 'a1'", []);

    assert!(update.is_err());
    assert!(delete.is_err());
}
#[test]
fn lists_persisted_records() {
    let mut conn = memory_conn();
    let company = company();
    let customer = customer();
    insert_company(&conn, &company).expect("company insert");
    upsert_customer(&conn, &customer).expect("customer upsert");
    let invoice = invoice(company.id.clone(), customer.id.clone());
    insert_invoice_draft(&mut conn, &invoice).expect("invoice draft insert");

    assert_eq!(list_companies(&conn).expect("companies").len(), 1);
    assert_eq!(list_customers(&conn).expect("customers").len(), 1);
    assert_eq!(list_invoices(&conn).expect("invoices").len(), 1);
}

#[test]
fn filters_invoices_by_series_kind_status_and_search() {
    let mut conn = memory_conn();
    let company = company();
    let customer = customer();
    let other_customer = Customer::from_input(CustomerInput {
        id: None,
        display_name: "Alquileres Norte".to_string(),
        tax_id: "11111111H".to_string(),
        kind: CustomerKind::Business,
        address: "Calle Norte 2".to_string(),
        postal_code: "28003".to_string(),
        municipality: "Madrid".to_string(),
        province: "Madrid".to_string(),
        country_code: "ES".to_string(),
    });
    insert_company(&conn, &company).expect("company insert");
    upsert_customer(&conn, &customer).expect("customer upsert");
    upsert_customer(&conn, &other_customer).expect("other customer upsert");

    let complete = invoice(company.id.clone(), customer.id.clone());
    let simplified = Invoice::draft(InvoiceDraftInput {
        company_id: company.id.clone(),
        customer_id: other_customer.id.clone(),
        fiscal_year: 2026,
        series: "AL".to_string(),
        number: None,
        kind: InvoiceKind::Simplified,
        territory_flags: vec![TerritoryFlag::CommonTerritory, TerritoryFlag::VeriFactu],
        lines: vec![InvoiceLineInput {
            description: "Alquiler mensual".to_string(),
            quantity: 1,
            unit_price_cents: 20_000,
            discount_rate_basis_points: None,
            tax_rate_basis_points: 2_100,
            withholding_rate_basis_points: None,
        }],
        rectifies_invoice_id: None,
        rectification_reason_code: None,
        rectification_method: None,
    })
    .expect("simplified draft");
    insert_invoice_draft(&mut conn, &complete).expect("complete insert");
    insert_invoice_draft(&mut conn, &simplified).expect("simplified insert");

    let by_series = list_invoices_filtered(
        &conn,
        InvoiceListFilters {
            series: Some("AL".to_string()),
            ..InvoiceListFilters::default()
        },
    )
    .expect("series filter");
    assert_eq!(by_series.len(), 1);
    assert_eq!(by_series[0].customer_id, other_customer.id.clone());

    let by_kind = list_invoices_filtered(
        &conn,
        InvoiceListFilters {
            kind: Some("Simplified".to_string()),
            ..InvoiceListFilters::default()
        },
    )
    .expect("kind filter");
    assert_eq!(by_kind.len(), 1);
    assert_eq!(by_kind[0].series, "AL");

    let by_status = list_invoices_filtered(
        &conn,
        InvoiceListFilters {
            status: Some("Draft".to_string()),
            ..InvoiceListFilters::default()
        },
    )
    .expect("status filter");
    assert_eq!(by_status.len(), 2);

    let by_search = list_invoices_filtered(
        &conn,
        InvoiceListFilters {
            search: Some("alquileres".to_string()),
            ..InvoiceListFilters::default()
        },
    )
    .expect("search filter");
    assert_eq!(by_search.len(), 1);
    assert_eq!(by_search[0].customer_id, other_customer.id);
}

#[test]
fn paginates_invoice_audit_and_fiscal_lists() {
    let mut conn = memory_conn();
    let company = company();
    let customer = customer();
    insert_company(&conn, &company).expect("company insert");
    upsert_customer(&conn, &customer).expect("customer upsert");

    for index in 0..3 {
        let mut item = invoice(company.id.clone(), customer.id.clone());
        item.id = format!("invoice-{index}");
        item.series = format!("S{index}");
        insert_invoice_draft(&mut conn, &item).expect("invoice insert");
        conn.execute(
            "INSERT INTO audit_events (id, entity_type, entity_id, action, actor, occurred_at, payload_hash, previous_hash, hash)
             VALUES (?1, 'invoice', ?2, 'test', 'tester', ?3, ?4, NULL, ?5)",
            params![
                format!("audit-{index}"),
                item.id,
                format!("2026-06-04T00:00:0{index}Z"),
                format!("payload-{index}"),
                format!("hash-{index}"),
            ],
        )
        .expect("audit insert");
        conn.execute(
            "INSERT INTO fiscal_records (id, company_id, invoice_id, record_type, generated_at, fiscal_hash, previous_fiscal_hash, xml_path, status, created_at)
             VALUES (?1, ?2, ?3, 'Alta', ?4, ?5, NULL, NULL, 'created', ?4)",
            params![
                format!("fiscal-{index}"),
                company.id.clone(),
                format!("invoice-{index}"),
                format!("2026-06-04T00:00:0{index}Z"),
                format!("fiscal-hash-{index}"),
            ],
        )
        .expect("fiscal insert");
    }

    let page = ListPagination {
        limit: Some(2),
        offset: Some(1),
    };
    assert_eq!(
        list_invoices_filtered_paginated(&conn, InvoiceListFilters::default(), page.clone())
            .expect("invoice page")
            .len(),
        2
    );
    assert_eq!(
        list_audit_events_paginated(&conn, page.clone())
            .expect("audit page")
            .len(),
        2
    );
    assert_eq!(
        list_fiscal_records_paginated(&conn, page)
            .expect("fiscal page")
            .len(),
        2
    );
}

#[test]
fn updates_company_without_recreating_it() {
    let conn = memory_conn();
    let company = company();
    insert_company(&conn, &company).expect("company insert");

    let updated = update_company(
        &conn,
        &CompanyUpdateInput {
            id: company.id.clone(),
            legal_name: "Demo Actualizada SL".to_string(),
            tax_id: "B11111111".to_string(),
            address: "Calle Nueva 9".to_string(),
            postal_code: "50001".to_string(),
            municipality: "Zaragoza".to_string(),
            province: "Zaragoza".to_string(),
            country_code: "ES".to_string(),
            default_series: Some("VENDI2026".to_string()),
        },
    )
    .expect("company update");

    let rows = list_companies(&conn).expect("companies");
    assert_eq!(rows.len(), 1);
    assert_eq!(updated.id, company.id);
    assert_eq!(rows[0].legal_name, "Demo Actualizada SL");
    assert_eq!(rows[0].municipality, "Zaragoza");
    assert_eq!(rows[0].default_series, "VENDI2026");
}

#[test]
fn persists_app_settings_for_onboarding() {
    let conn = memory_conn();

    let defaults = get_app_settings(&conn).expect("default settings");
    assert!(!defaults.onboarding_completed);
    assert_eq!(defaults.verifactu_endpoint_name, "SistemaVerifactuPruebas");
    assert_eq!(
        defaults.default_territory_flags,
        vec!["CommonTerritory", "VeriFactu"]
    );

    let saved = update_app_settings(
        &conn,
        AppSettingsInput {
            export_dir: Some("C:\\CumpleFactura\\Exports".to_string()),
            default_territory_flags: vec!["CommonTerritory".to_string(), "VeriFactu".to_string()],
            onboarding_completed: true,
            verifactu_endpoint_name: "SistemaVerifactuSelloPruebas".to_string(),
            certificate_password_mode: "env".to_string(),
        },
    )
    .expect("save settings");
    let loaded = get_app_settings(&conn).expect("loaded settings");

    assert!(saved.onboarding_completed);
    assert_eq!(
        loaded.export_dir.as_deref(),
        Some("C:\\CumpleFactura\\Exports")
    );
    assert_eq!(
        loaded.default_territory_flags,
        saved.default_territory_flags
    );
    assert_eq!(
        loaded.verifactu_endpoint_name,
        "SistemaVerifactuSelloPruebas"
    );
    assert_eq!(loaded.certificate_password_mode, "env");
    assert!(!loaded.sends_certificate_password());
    assert_eq!(defaults.certificate_password_mode, "session");
    assert!(defaults.sends_certificate_password());

    let legacy: AppSettings = serde_json::from_str(
        r#"{"export_dir":null,"default_territory_flags":["VeriFactu"],"onboarding_completed":true,"updated_at":"x"}"#,
    )
    .expect("settings saved before the endpoint field still load");
    assert_eq!(legacy.verifactu_endpoint_name, "SistemaVerifactuPruebas");
    assert_eq!(legacy.certificate_password_mode, "session");
    let old_input: AppSettingsInput = serde_json::from_str(
        r#"{"export_dir":null,"default_territory_flags":["VeriFactu"],"onboarding_completed":true}"#,
    )
    .expect("old UI input without the new fields still deserializes");
    assert_eq!(old_input.certificate_password_mode, "session");
    let keychain = AppSettingsInput {
        certificate_password_mode: "keychain".to_string(),
        ..old_input.clone()
    };
    let saved = update_app_settings(&conn, keychain).expect("keychain accepted");
    assert_eq!(saved.certificate_password_mode, "keychain");
    assert!(
        saved.sends_certificate_password(),
        "keychain behaves as session"
    );
    let invalid = AppSettingsInput {
        verifactu_endpoint_name: "https://otro.example".to_string(),
        ..old_input.clone()
    };
    assert!(update_app_settings(&conn, invalid).is_err());
    let invalid_mode = AppSettingsInput {
        certificate_password_mode: "disk".to_string(),
        ..old_input
    };
    assert!(update_app_settings(&conn, invalid_mode).is_err());
}

#[test]
fn upserts_and_lists_company_products() {
    let conn = memory_conn();
    let company = company();
    insert_company(&conn, &company).expect("company insert");

    let product =
        crate::domain::product::Product::from_input(crate::domain::product::ProductInput {
            id: None,
            company_id: company.id.clone(),
            sku: "svc-consultoria".to_string(),
            name: "Consultoria".to_string(),
            description: "Servicio profesional".to_string(),
            kind: crate::domain::product::ProductKind::Service,
            unit_price_cents: 12500,
            tax_rate_basis_points: 2100,
            withholding_rate_basis_points: Some(1500),
            discount_rate_basis_points: Some(500),
            active: true,
        });
    upsert_product(&conn, &product).expect("product insert");

    let mut edited = product.clone();
    edited.name = "Consultoria senior".to_string();
    edited.unit_price_cents = 15000;
    upsert_product(&conn, &edited).expect("product update");

    let rows = list_products(&conn, &company.id).expect("products");
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].sku, "SVC-CONSULTORIA");
    assert_eq!(rows[0].name, "Consultoria senior");
    assert_eq!(rows[0].unit_price_cents, 15000);
    assert_eq!(rows[0].tax_rate_basis_points, 2100);
    assert_eq!(rows[0].withholding_rate_basis_points, Some(1500));
    assert_eq!(rows[0].discount_rate_basis_points, Some(500));
}

#[test]
fn upserts_customer_by_id_without_replace_delete() {
    let conn = memory_conn();
    let first = customer();
    upsert_customer(&conn, &first).expect("customer insert");

    let updated = Customer::from_input(CustomerInput {
        id: Some(first.id.clone()),
        display_name: "Cliente Editado".to_string(),
        tax_id: "11111111H".to_string(),
        kind: CustomerKind::Individual,
        address: "Calle Editada 2".to_string(),
        postal_code: "28003".to_string(),
        municipality: "Madrid".to_string(),
        province: "Madrid".to_string(),
        country_code: "ES".to_string(),
    });
    upsert_customer(&conn, &updated).expect("customer update");

    let rows = list_customers(&conn).expect("customers");
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].id, first.id);
    assert_eq!(rows[0].display_name, "Cliente Editado");
    assert_eq!(rows[0].kind, "Individual");
}

#[test]
fn reserves_invoice_numbers_by_company_year_and_series() {
    let mut conn = memory_conn();
    let company = company();
    insert_company(&conn, &company).expect("company insert");

    assert_eq!(
        next_invoice_number_preview(&conn, &company.id, 2026, "A").expect("preview"),
        1
    );
    assert_eq!(
        reserve_invoice_number(&mut conn, &company.id, 2026, "A").expect("first"),
        1
    );
    assert_eq!(
        reserve_invoice_number(&mut conn, &company.id, 2026, "A").expect("second"),
        2
    );
    assert_eq!(
        next_invoice_number_preview(&conn, &company.id, 2026, "A").expect("preview"),
        3
    );
    assert_eq!(
        reserve_invoice_number(&mut conn, &company.id, 2026, "B").expect("other series"),
        1
    );
}

#[test]
fn configures_invoice_series_and_initial_sequence() {
    let mut conn = memory_conn();
    let company = company();
    insert_company(&conn, &company).expect("company insert");

    let config = upsert_invoice_series_config(
        &mut conn,
        InvoiceSeriesConfigInput {
            company_id: company.id.clone(),
            label: "Vending Saiz Aragon".to_string(),
            series_code: "vendi".to_string(),
            fiscal_year: 2026,
            include_year: true,
            separator: "".to_string(),
            padding: 2,
            next_number: 7,
            is_default: true,
        },
    )
    .expect("series config");

    assert_eq!(config.series_code, "VENDI");
    assert_eq!(config.resolved_series, "VENDI2026");
    assert_eq!(config.preview, "VENDI202607");
    assert_eq!(
        next_invoice_number_preview(&conn, &company.id, 2026, "VENDI2026").expect("preview"),
        7
    );
    assert_eq!(
        list_companies(&conn).expect("companies")[0].default_series,
        "VENDI2026"
    );
}

#[test]
fn rejects_series_next_number_not_after_existing_invoice() {
    let mut conn = memory_conn();
    let company = company();
    let customer = customer();
    insert_company(&conn, &company).expect("company insert");
    upsert_customer(&conn, &customer).expect("customer upsert");

    let mut issued = invoice(company.id.clone(), customer.id.clone());
    issued.series = "AL".to_string();
    issued.number = Some(10);
    issued.status = InvoiceStatus::Issued;
    issued.issued_at = Some("2026-06-03T10:00:00Z".to_string());
    insert_invoice_draft(&mut conn, &issued).expect("issued insert");

    let result = upsert_invoice_series_config(
        &mut conn,
        InvoiceSeriesConfigInput {
            company_id: company.id.clone(),
            label: "Alquiler".to_string(),
            series_code: "AL".to_string(),
            fiscal_year: 2026,
            include_year: false,
            separator: "-".to_string(),
            padding: 3,
            next_number: 10,
            is_default: true,
        },
    );

    assert!(result
        .expect_err("must reject duplicate-prone sequence")
        .contains("greater than existing max invoice number 10"));
}

#[test]
fn backup_database_creates_sqlite_file() {
    let conn = memory_conn();
    let target = std::env::temp_dir().join(format!(
        "cumplefactura-test-{}.sqlite3",
        uuid::Uuid::new_v4()
    ));
    let target_str = target.to_str().expect("utf8 target").to_string();

    backup_database(&conn, &target_str).expect("backup");

    assert!(target.exists());
    assert!(std::fs::metadata(&target).expect("metadata").len() > 0);
    std::fs::remove_file(target).expect("cleanup");
}

#[test]
fn fiscal_records_track_issued_and_voided_chain() {
    let mut conn = memory_conn();
    let company = company();
    let customer = customer();
    insert_company(&conn, &company).expect("company insert");
    upsert_customer(&conn, &customer).expect("customer upsert");

    let mut issued = invoice(company.id.clone(), customer.id.clone());
    issued.number = Some(1);
    issued.status = InvoiceStatus::Issued;
    issued.issued_at = Some("2026-05-28T10:00:00Z".to_string());

    let alta_hash = "A".repeat(64);
    let audit_event = AuditEvent::invoice_issued(
        issued.id.clone(),
        "tester".to_string(),
        alta_hash.clone(),
        None,
    );
    let audit_hash = audit_event.chain_hash();
    insert_issued_invoice(&mut conn, &issued, &alta_hash, None, &audit_event)
        .expect("issued invoice");

    let records = list_fiscal_records(&conn).expect("fiscal records");
    assert_eq!(records.len(), 1);
    assert_eq!(records[0].record_type, "Alta");
    assert_eq!(
        latest_fiscal_record_hash_for_company(&conn, &company.id).expect("latest hash"),
        Some(alta_hash.clone())
    );

    let anulacion_hash = "B".repeat(64);
    let anulacion_event = AuditEvent::invoice_voided(
        issued.id.clone(),
        "tester".to_string(),
        anulacion_hash.clone(),
        Some(audit_hash),
    );
    insert_anulacion_record(
        &mut conn,
        &issued.id,
        &anulacion_hash,
        Some(&alta_hash),
        "2026-05-28T10:05:00Z",
        "C:\\tmp\\anulacion.xml",
        &anulacion_event,
    )
    .expect("anulacion record");

    let status: String = conn
        .query_row(
            "SELECT status FROM invoices WHERE id = ?1",
            params![&issued.id],
            |row| row.get(0),
        )
        .expect("invoice status");
    assert_eq!(status, "Void");

    let records = list_fiscal_records(&conn).expect("fiscal records after anulacion");
    assert_eq!(records.len(), 2);
    assert_eq!(records[0].record_type, "Anulacion");
    assert_eq!(records[0].previous_fiscal_hash, Some(alta_hash.clone()));
    assert_eq!(
        latest_fiscal_record_hash_for_company(&conn, &company.id).expect("latest hash"),
        Some(anulacion_hash)
    );

    let previous = previous_fiscal_record_link_for_invoice(&conn, &issued.id, "Anulacion")
        .expect("previous fiscal link")
        .expect("link");
    assert_eq!(previous.fiscal_hash, alta_hash);
}

#[test]
fn fiscal_records_are_append_only() {
    let mut conn = memory_conn();
    let company = company();
    let customer = customer();
    insert_company(&conn, &company).expect("company insert");
    upsert_customer(&conn, &customer).expect("customer upsert");

    let mut issued = invoice(company.id.clone(), customer.id.clone());
    issued.number = Some(1);
    issued.status = InvoiceStatus::Issued;
    issued.issued_at = Some("2026-05-28T10:00:00Z".to_string());

    let alta_hash = "C".repeat(64);
    let audit_event = AuditEvent::invoice_issued(
        issued.id.clone(),
        "tester".to_string(),
        alta_hash.clone(),
        None,
    );
    insert_issued_invoice(&mut conn, &issued, &alta_hash, None, &audit_event)
        .expect("issued invoice");

    let update = conn.execute(
        "UPDATE fiscal_records SET status = 'changed' WHERE fiscal_hash = ?1",
        params![alta_hash],
    );
    let delete = conn.execute("DELETE FROM fiscal_records", []);

    assert!(update.is_err());
    assert!(delete.is_err());
}

#[test]
fn rectifying_invoice_marks_source_rectified_and_keeps_link() {
    let mut conn = memory_conn();
    let company = company();
    let customer = customer();
    insert_company(&conn, &company).expect("company insert");
    upsert_customer(&conn, &customer).expect("customer upsert");

    let mut source = invoice(company.id.clone(), customer.id.clone());
    source.number = Some(1);
    source.status = InvoiceStatus::Issued;
    source.issued_at = Some("2026-05-28T10:00:00Z".to_string());
    let source_hash = "D".repeat(64);
    let source_event = AuditEvent::invoice_issued(
        source.id.clone(),
        "tester".to_string(),
        source_hash.clone(),
        None,
    );
    let source_audit_hash = source_event.chain_hash();
    insert_issued_invoice(&mut conn, &source, &source_hash, None, &source_event)
        .expect("source issued");

    let (rectifying, _) = Invoice::issue(InvoiceIssueInput {
        draft: InvoiceDraftInput {
            company_id: company.id.clone(),
            customer_id: customer.id.clone(),
            fiscal_year: 2026,
            series: "A".to_string(),
            number: None,
            kind: InvoiceKind::Rectifying,
            territory_flags: vec![TerritoryFlag::CommonTerritory, TerritoryFlag::VeriFactu],
            lines: vec![InvoiceLineInput {
                description: "Rectificacion parcial".to_string(),
                quantity: 1,
                unit_price_cents: -1_000,
                discount_rate_basis_points: None,
                tax_rate_basis_points: 2_100,
                withholding_rate_basis_points: None,
            }],
            rectifies_invoice_id: Some(source.id.clone()),
            rectification_reason_code: Some(RectificationReasonCode::R4),
            rectification_method: Some(RectificationMethod::I),
        },
        number: 2,
        issued_at: "2026-05-28T10:10:00Z".to_string(),
        actor: "tester".to_string(),
        previous_audit_hash: None,
    })
    .expect("rectifying invoice");
    let rectifying_hash = "E".repeat(64);
    let rectifying_event = AuditEvent::invoice_issued(
        rectifying.id.clone(),
        "tester".to_string(),
        rectifying_hash.clone(),
        Some(source_audit_hash),
    );
    insert_issued_invoice(
        &mut conn,
        &rectifying,
        &rectifying_hash,
        Some(&source_hash),
        &rectifying_event,
    )
    .expect("rectifying insert");

    let source_status: String = conn
        .query_row(
            "SELECT status FROM invoices WHERE id = ?1",
            params![&source.id],
            |row| row.get(0),
        )
        .expect("source status");
    assert_eq!(source_status, "Rectified");

    let data = invoice_pdf_data(&conn, &rectifying.id).expect("rectifying pdf data");
    assert_eq!(data.kind, "Rectifying");
    assert_eq!(data.rectification_reason_code.as_deref(), Some("R4"));
    assert_eq!(data.rectification_method.as_deref(), Some("I"));
    assert_eq!(data.rectified_invoice.expect("rectified link").number, 1);
    assert_eq!(list_fiscal_records(&conn).expect("records").len(), 2);
}

#[test]
fn fiscal_export_and_aeat_submission_are_recorded_once() {
    let mut conn = memory_conn();
    let company = company();
    let customer = customer();
    insert_company(&conn, &company).expect("company insert");
    upsert_customer(&conn, &customer).expect("customer upsert");

    let mut issued = invoice(company.id.clone(), customer.id.clone());
    issued.number = Some(1);
    issued.status = InvoiceStatus::Issued;
    issued.issued_at = Some("2026-05-28T10:00:00Z".to_string());
    let audit_event = AuditEvent::invoice_issued(
        issued.id.clone(),
        "tester".to_string(),
        "F".repeat(64),
        None,
    );
    insert_issued_invoice(&mut conn, &issued, &"F".repeat(64), None, &audit_event).expect("issued");

    let hash = "A".repeat(64);
    let export_id = insert_fiscal_export(
        &conn,
        &issued.id,
        "AEAT-VERIFACTU",
        "local",
        "verifactu-xml-v1",
        &hash,
        "xml_exported",
    )
    .expect("fiscal export");
    assert!(fiscal_export_matches(&conn, &export_id, &issued.id, &hash.to_lowercase()).unwrap());
    assert!(!fiscal_export_matches(&conn, &export_id, &issued.id, &"B".repeat(64)).unwrap());
    assert!(!fiscal_export_matches(&conn, &export_id, "otra", &hash).unwrap());

    let mut response = fiscal_contract::messages::InvokeSubmitResponse {
        xml_sha256: hash.clone(),
        endpoint_name: "SistemaVerifactuPruebas".to_string(),
        operation: "RegFactuSistemaFacturacion".to_string(),
        status: "rejected".to_string(),
        http_status: Some(200),
        csv: None,
        estado_envio: Some("Incorrecto".to_string()),
        estado_registro: Some("Incorrecto".to_string()),
        codigo_error: Some("1100".to_string()),
        descripcion_error: None,
        tiempo_espera_envio_seconds: Some(60),
        soap_fault: None,
        external_call_performed: true,
    };
    fn record<'a>(
        invoice_id: &'a str,
        fiscal_export_id: &'a str,
        response: &'a fiscal_contract::messages::InvokeSubmitResponse,
    ) -> VerifactuSubmissionRecord<'a> {
        VerifactuSubmissionRecord {
            invoice_id,
            fiscal_export_id,
            response,
        }
    }
    insert_verifactu_submission(&conn, record(&issued.id, &export_id, &response))
        .expect("rejected recorded");
    assert!(!verifactu_xml_already_accepted(&conn, &hash).unwrap());

    response.status = "accepted".to_string();
    response.csv = Some("A-CSV".to_string());
    insert_verifactu_submission(&conn, record(&issued.id, &export_id, &response))
        .expect("accepted recorded");
    assert!(verifactu_xml_already_accepted(&conn, &hash.to_lowercase()).unwrap());
    assert!(
        insert_verifactu_submission(&conn, record(&issued.id, &export_id, &response)).is_err(),
        "a second acceptance of the same XML must be refused by the unique index"
    );
}

/// Empresa, cliente, factura emitida y exportación XML. Devuelve (factura, exportación).
pub(crate) fn issued_invoice_with_export(conn: &mut Connection) -> (String, String) {
    let company = company();
    let customer = customer();
    insert_company(conn, &company).expect("company insert");
    upsert_customer(conn, &customer).expect("customer upsert");
    let mut issued = invoice(company.id.clone(), customer.id.clone());
    issued.number = Some(1);
    issued.status = InvoiceStatus::Issued;
    issued.issued_at = Some("2026-05-28T10:00:00Z".to_string());
    let audit_event = AuditEvent::invoice_issued(
        issued.id.clone(),
        "tester".to_string(),
        "F".repeat(64),
        None,
    );
    insert_issued_invoice(conn, &issued, &"F".repeat(64), None, &audit_event).expect("issued");
    let export_id = insert_fiscal_export(
        conn,
        &issued.id,
        "AEAT-VERIFACTU",
        "local",
        "verifactu-xml-v1",
        &"A".repeat(64),
        "xml_exported",
    )
    .expect("fiscal export");
    (issued.id, export_id)
}

#[test]
fn transport_errors_are_stored_listed_newest_first_and_allow_retry() {
    let mut conn = memory_conn();
    let (invoice_id, export_id) = issued_invoice_with_export(&mut conn);
    let response = fiscal_contract::messages::InvokeSubmitResponse {
        xml_sha256: "A".repeat(64),
        endpoint_name: "SistemaVerifactuPruebas".to_string(),
        operation: "RegFactuSistemaFacturacion".to_string(),
        status: "transport_error".to_string(),
        http_status: None,
        csv: None,
        estado_envio: None,
        estado_registro: None,
        codigo_error: None,
        descripcion_error: Some("timeout".to_string()),
        tiempo_espera_envio_seconds: None,
        soap_fault: None,
        external_call_performed: true,
    };
    let record = |response| VerifactuSubmissionRecord {
        invoice_id: &invoice_id,
        fiscal_export_id: &export_id,
        response,
    };
    let first = insert_verifactu_submission(&conn, record(&response)).expect("transport_error");
    assert!(!verifactu_xml_already_accepted(&conn, &"A".repeat(64)).unwrap());
    assert_eq!(
        latest_verifactu_wait(&conn, &invoice_id, "SistemaVerifactuPruebas").unwrap(),
        None
    );
    let mut retry = response.clone();
    retry.status = "accepted".to_string();
    retry.csv = Some("CSV-1".to_string());
    retry.tiempo_espera_envio_seconds = Some(60);
    let second = insert_verifactu_submission(&conn, record(&retry)).expect("retry accepted");

    let all = list_verifactu_submissions(&conn, None).unwrap();
    assert_eq!(
        all.iter().map(|row| row.id.as_str()).collect::<Vec<_>>(),
        vec![second.as_str(), first.as_str()]
    );
    assert_eq!(all[0].csv.as_deref(), Some("CSV-1"));
    assert_eq!(all[0].tiempo_espera_envio_seconds, Some(60));
    assert_eq!(all[1].status, "transport_error");
    assert_eq!(all[1].descripcion_error.as_deref(), Some("timeout"));
    assert_eq!(
        list_verifactu_submissions(&conn, Some(&invoice_id))
            .unwrap()
            .len(),
        2
    );
    assert!(list_verifactu_submissions(&conn, Some("otra"))
        .unwrap()
        .is_empty());
    let (submitted_at, seconds) =
        latest_verifactu_wait(&conn, &invoice_id, "SistemaVerifactuPruebas")
            .unwrap()
            .expect("wait");
    assert_eq!((submitted_at, seconds), (all[0].submitted_at.clone(), 60));
}

#[test]
fn loads_invoice_pdf_data() {
    let mut conn = memory_conn();
    let company = company();
    let customer = customer();
    insert_company(&conn, &company).expect("company insert");
    upsert_customer(&conn, &customer).expect("customer upsert");
    let invoice = invoice(company.id.clone(), customer.id.clone());
    insert_invoice_draft(&mut conn, &invoice).expect("invoice draft insert");

    let data = invoice_pdf_data(&conn, &invoice.id).expect("pdf data");

    assert_eq!(data.company_tax_id, company.tax_id);
    assert_eq!(data.customer_tax_id, customer.tax_id);
    assert_eq!(data.lines.len(), 1);
}
