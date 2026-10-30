//! Persistencia SQLite: migraciones, `AppState` y acceso a entidades fiscales.
//!
//! Schema versionado en `migrations/*.sql`. Numeración y hashes se escriben en
//! transacciones de emisión; listados soportan filtros + `ListPagination`.

use crate::domain::company::{
    format_invoice_number, Company, CompanyUpdateInput, InvoiceSeriesConfig,
    InvoiceSeriesConfigInput,
};
use crate::domain::customer::Customer;
use crate::domain::invoice::{Invoice, InvoiceLine};
use crate::domain::product::Product;
use crate::domain::settings::{AppSettings, AppSettingsInput};
use crate::services::audit::AuditEvent;
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};
use std::error::Error;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Manager;

pub struct AppState {
    pub conn: Mutex<Connection>,
}

pub struct Migration {
    pub version: i64,
    pub name: &'static str,
    pub sql: &'static str,
}

pub fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            name: "initial",
            sql: include_str!("migrations/001_initial.sql"),
        },
        Migration {
            version: 2,
            name: "fiscal_records",
            sql: include_str!("migrations/002_fiscal_records.sql"),
        },
        Migration {
            version: 3,
            name: "rectification_metadata",
            sql: include_str!("migrations/003_rectification_metadata.sql"),
        },
        Migration {
            version: 4,
            name: "next_mvp_indexes",
            sql: include_str!("migrations/004_next_mvp.sql"),
        },
        Migration {
            version: 5,
            name: "invoice_series_config",
            sql: include_str!("migrations/005_invoice_series_config.sql"),
        },
        Migration {
            version: 6,
            name: "invoice_line_discounts",
            sql: include_str!("migrations/006_invoice_line_discounts.sql"),
        },
        Migration {
            version: 7,
            name: "app_settings",
            sql: include_str!("migrations/007_app_settings.sql"),
        },
        Migration {
            version: 8,
            name: "products_catalog",
            sql: include_str!("migrations/008_products_catalog.sql"),
        },
    ]
}

pub fn init_app_state(app: &tauri::App) -> Result<AppState, Box<dyn Error>> {
    let app_data_dir = app.path().app_data_dir()?;
    fs::create_dir_all(&app_data_dir)?;
    let db_path = app_data_dir.join("cumplefactura.sqlite3");
    let conn = Connection::open(db_path)?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    apply_migrations(&conn)?;
    Ok(AppState {
        conn: Mutex::new(conn),
    })
}

const APP_SETTINGS_KEY: &str = "app";

pub fn get_app_settings(conn: &Connection) -> Result<AppSettings, String> {
    let raw: Option<String> = conn
        .query_row(
            "SELECT value FROM app_settings WHERE key = ?1",
            params![APP_SETTINGS_KEY],
            |row| row.get(0),
        )
        .optional()
        .map_err(db_error)?;
    match raw {
        Some(value) => {
            serde_json::from_str(&value).map_err(|err| format!("settings json error: {err}"))
        }
        None => Ok(AppSettings::default()),
    }
}

pub fn update_app_settings(
    conn: &Connection,
    input: AppSettingsInput,
) -> Result<AppSettings, String> {
    input.validate()?;
    let settings = AppSettings {
        export_dir: input
            .export_dir
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty()),
        default_territory_flags: input.default_territory_flags,
        onboarding_completed: input.onboarding_completed,
        updated_at: chrono::Utc::now().to_rfc3339(),
    };
    let value =
        serde_json::to_string(&settings).map_err(|err| format!("settings json error: {err}"))?;
    conn.execute(
        "INSERT INTO app_settings (key, value, updated_at)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        params![APP_SETTINGS_KEY, value, settings.updated_at],
    )
    .map_err(db_error)?;
    Ok(settings)
}

pub fn insert_company(conn: &Connection, company: &Company) -> Result<(), String> {
    conn.execute(
        "INSERT INTO companies (id, legal_name, tax_id, address, postal_code, municipality, province, country_code, default_series, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            company.id,
            company.legal_name,
            company.tax_id,
            company.address,
            company.postal_code,
            company.municipality,
            company.province,
            company.country_code,
            company.default_series,
            company.created_at,
        ],
    )
    .map(|_| ())
    .map_err(db_error)
}

pub fn update_company(conn: &Connection, input: &CompanyUpdateInput) -> Result<Company, String> {
    input.validate()?;
    let default_series = input.normalized_default_series();
    let created_at: String = conn
        .query_row(
            "SELECT created_at FROM companies WHERE id = ?1",
            params![input.id],
            |row| row.get(0),
        )
        .optional()
        .map_err(db_error)?
        .ok_or_else(|| format!("company not found: {}", input.id))?;

    conn.execute(
        "UPDATE companies
         SET legal_name = ?2, tax_id = ?3, address = ?4, postal_code = ?5,
             municipality = ?6, province = ?7, country_code = ?8, default_series = ?9
         WHERE id = ?1",
        params![
            input.id,
            input.legal_name,
            input.tax_id,
            input.address,
            input.postal_code,
            input.municipality,
            input.province,
            input.country_code,
            default_series,
        ],
    )
    .map_err(db_error)?;

    Ok(Company {
        id: input.id.clone(),
        legal_name: input.legal_name.clone(),
        tax_id: input.tax_id.clone(),
        address: input.address.clone(),
        postal_code: input.postal_code.clone(),
        municipality: input.municipality.clone(),
        province: input.province.clone(),
        country_code: input.country_code.clone(),
        default_series,
        created_at,
    })
}

pub fn upsert_customer(conn: &Connection, customer: &Customer) -> Result<(), String> {
    conn.execute(
        "INSERT INTO customers (id, display_name, tax_id, kind, address, postal_code, municipality, province, country_code, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
         ON CONFLICT(id) DO UPDATE SET
           display_name = excluded.display_name,
           tax_id = excluded.tax_id,
           kind = excluded.kind,
           address = excluded.address,
           postal_code = excluded.postal_code,
           municipality = excluded.municipality,
           province = excluded.province,
           country_code = excluded.country_code,
           updated_at = excluded.updated_at",
        params![
            customer.id,
            customer.display_name,
            customer.tax_id,
            format!("{:?}", customer.kind),
            customer.address,
            customer.postal_code,
            customer.municipality,
            customer.province,
            customer.country_code,
            customer.updated_at,
        ],
    )
    .map(|_| ())
    .map_err(db_error)
}

pub fn upsert_product(conn: &Connection, product: &Product) -> Result<(), String> {
    require_company(conn, &product.company_id)?;
    conn.execute(
        "INSERT INTO products (
           id, company_id, sku, name, description, kind, unit_price_cents,
           tax_rate_basis_points, withholding_rate_basis_points, discount_rate_basis_points,
           active, updated_at
         )
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
         ON CONFLICT(id) DO UPDATE SET
           sku = excluded.sku,
           name = excluded.name,
           description = excluded.description,
           kind = excluded.kind,
           unit_price_cents = excluded.unit_price_cents,
           tax_rate_basis_points = excluded.tax_rate_basis_points,
           withholding_rate_basis_points = excluded.withholding_rate_basis_points,
           discount_rate_basis_points = excluded.discount_rate_basis_points,
           active = excluded.active,
           updated_at = excluded.updated_at",
        params![
            product.id,
            product.company_id,
            product.sku,
            product.name,
            product.description,
            format!("{:?}", product.kind),
            product.unit_price_cents,
            product.tax_rate_basis_points,
            product.withholding_rate_basis_points,
            product.discount_rate_basis_points,
            if product.active { 1 } else { 0 },
            product.updated_at,
        ],
    )
    .map(|_| ())
    .map_err(db_error)
}

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
    audit_hash: &str,
) -> Result<(), String> {
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

pub fn insert_anulacion_record(
    conn: &mut Connection,
    invoice_id: &str,
    fiscal_hash: &str,
    previous_fiscal_hash: Option<&str>,
    generated_at: &str,
    xml_path: &str,
    audit_event: &AuditEvent,
    audit_hash: &str,
) -> Result<(), String> {
    let tx = conn.transaction().map_err(db_error)?;
    let company_id: String = tx
        .query_row(
            "SELECT company_id FROM invoices WHERE id = ?1",
            params![invoice_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(db_error)?
        .ok_or_else(|| format!("invoice not found: {invoice_id}"))?;

    tx.execute(
        "UPDATE invoices SET status = 'Void' WHERE id = ?1 AND status = 'Issued'",
        params![invoice_id],
    )
    .map_err(db_error)
    .and_then(|updated| {
        if updated == 1 {
            Ok(())
        } else {
            Err("invoice must be issued to create anulacion".to_string())
        }
    })?;

    insert_fiscal_record_tx(
        &tx,
        &FiscalRecordInput {
            id: uuid::Uuid::new_v4().to_string(),
            company_id,
            invoice_id: invoice_id.to_string(),
            record_type: "Anulacion".to_string(),
            generated_at: generated_at.to_string(),
            fiscal_hash: fiscal_hash.to_string(),
            previous_fiscal_hash: previous_fiscal_hash.map(str::to_string),
            xml_path: Some(xml_path.to_string()),
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

pub fn latest_audit_hash(conn: &Connection) -> Result<Option<String>, String> {
    conn.query_row(
        "SELECT hash FROM audit_events ORDER BY occurred_at DESC, rowid DESC LIMIT 1",
        [],
        |row| row.get(0),
    )
    .optional()
    .map_err(db_error)
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

pub fn upsert_invoice_series_config(
    conn: &mut Connection,
    input: InvoiceSeriesConfigInput,
) -> Result<InvoiceSeriesConfig, String> {
    input.validate()?;
    require_company(conn, &input.company_id)?;

    let series_code = input.normalized_series_code();
    let separator = input.normalized_separator();
    let label = input.normalized_label();
    let resolved_series = input.resolved_series();
    let max_existing =
        max_invoice_number(conn, &input.company_id, input.fiscal_year, &resolved_series)?;
    if input.next_number <= max_existing {
        return Err(format!(
            "next_number must be greater than existing max invoice number {max_existing}"
        ));
    }

    let existing_id: Option<String> = conn
        .query_row(
            "SELECT id FROM invoice_series_configs
             WHERE company_id = ?1 AND fiscal_year = ?2 AND series_code = ?3",
            params![input.company_id, input.fiscal_year, series_code],
            |row| row.get(0),
        )
        .optional()
        .map_err(db_error)?;
    let id = existing_id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let created_at = chrono::Utc::now().to_rfc3339();
    let tx = conn.transaction().map_err(db_error)?;

    if input.is_default {
        tx.execute(
            "UPDATE invoice_series_configs SET is_default = 0
             WHERE company_id = ?1 AND fiscal_year = ?2",
            params![input.company_id, input.fiscal_year],
        )
        .map_err(db_error)?;
        tx.execute(
            "UPDATE companies SET default_series = ?2 WHERE id = ?1",
            params![input.company_id, resolved_series],
        )
        .map_err(db_error)?;
    }

    tx.execute(
        "INSERT INTO invoice_series_configs
         (id, company_id, label, series_code, fiscal_year, include_year, separator, padding, next_number, is_default, active, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 1, ?11)
         ON CONFLICT(company_id, fiscal_year, series_code) DO UPDATE SET
           label = excluded.label,
           include_year = excluded.include_year,
           separator = excluded.separator,
           padding = excluded.padding,
           next_number = excluded.next_number,
           is_default = excluded.is_default,
           active = 1",
        params![
            id,
            input.company_id,
            label,
            series_code,
            input.fiscal_year,
            if input.include_year { 1 } else { 0 },
            separator,
            input.padding,
            input.next_number,
            if input.is_default { 1 } else { 0 },
            created_at,
        ],
    )
    .map_err(db_error)?;

    tx.execute(
        "INSERT INTO invoice_sequences (company_id, fiscal_year, series, next_number)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(company_id, fiscal_year, series) DO UPDATE SET next_number = excluded.next_number",
        params![
            input.company_id,
            input.fiscal_year,
            resolved_series,
            input.next_number,
        ],
    )
    .map_err(db_error)?;
    tx.commit().map_err(db_error)?;

    let configs = list_invoice_series_configs(conn, &input.company_id, input.fiscal_year)?;
    configs
        .into_iter()
        .find(|config| config.series_code == series_code)
        .ok_or_else(|| "invoice series config not found after save".to_string())
}

pub fn list_invoice_series_configs(
    conn: &Connection,
    company_id: &str,
    fiscal_year: i32,
) -> Result<Vec<InvoiceSeriesConfig>, String> {
    require_company(conn, company_id)?;
    let mut stmt = conn
        .prepare(
            "SELECT cfg.id, cfg.company_id, cfg.label, cfg.series_code, cfg.fiscal_year,
                    cfg.include_year, cfg.separator, cfg.padding,
                    COALESCE(seq.next_number, cfg.next_number) AS next_number,
                    cfg.is_default, cfg.active, cfg.created_at
             FROM invoice_series_configs cfg
             LEFT JOIN invoice_sequences seq
               ON seq.company_id = cfg.company_id
              AND seq.fiscal_year = cfg.fiscal_year
              AND seq.series = CASE
                WHEN cfg.include_year = 1 THEN cfg.series_code || cfg.fiscal_year
                ELSE cfg.series_code
              END
             WHERE cfg.company_id = ?1 AND cfg.fiscal_year = ?2 AND cfg.active = 1
             ORDER BY cfg.is_default DESC, cfg.series_code ASC",
        )
        .map_err(db_error)?;
    let rows = stmt
        .query_map(params![company_id, fiscal_year], |row| {
            let series_code: String = row.get(3)?;
            let fiscal_year: i32 = row.get(4)?;
            let include_year = row.get::<_, i64>(5)? == 1;
            let separator: String = row.get(6)?;
            let padding: i32 = row.get(7)?;
            let next_number: i64 = row.get(8)?;
            let resolved_series =
                crate::domain::company::resolve_series(&series_code, fiscal_year, include_year);
            Ok(InvoiceSeriesConfig {
                id: row.get(0)?,
                company_id: row.get(1)?,
                label: row.get(2)?,
                series_code,
                fiscal_year,
                include_year,
                separator: separator.clone(),
                padding,
                next_number,
                is_default: row.get::<_, i64>(9)? == 1,
                active: row.get::<_, i64>(10)? == 1,
                preview: format_invoice_number(&resolved_series, &separator, padding, next_number),
                resolved_series,
                created_at: row.get(11)?,
            })
        })
        .map_err(db_error)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(db_error)
}

fn max_invoice_number(
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

pub fn company_tax_id(conn: &Connection, company_id: &str) -> Result<String, String> {
    conn.query_row(
        "SELECT tax_id FROM companies WHERE id = ?1",
        params![company_id],
        |row| row.get(0),
    )
    .optional()
    .map_err(db_error)?
    .ok_or_else(|| format!("company not found: {company_id}"))
}

fn require_company(conn: &Connection, company_id: &str) -> Result<(), String> {
    conn.query_row(
        "SELECT 1 FROM companies WHERE id = ?1",
        params![company_id],
        |_| Ok(()),
    )
    .optional()
    .map_err(db_error)?
    .ok_or_else(|| format!("company not found: {company_id}"))
}

#[derive(Debug, Clone, Serialize)]
pub struct CompanySummary {
    pub id: String,
    pub legal_name: String,
    pub tax_id: String,
    pub address: String,
    pub postal_code: String,
    pub municipality: String,
    pub province: String,
    pub country_code: String,
    pub default_series: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct CustomerSummary {
    pub id: String,
    pub display_name: String,
    pub tax_id: String,
    pub kind: String,
    pub address: String,
    pub postal_code: String,
    pub municipality: String,
    pub province: String,
    pub country_code: String,
    pub updated_at: String,
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

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ListPagination {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

impl ListPagination {
    pub fn normalized(self) -> Result<Self, String> {
        let limit = self.limit.unwrap_or(50);
        let offset = self.offset.unwrap_or(0);
        if !(1..=500).contains(&limit) {
            return Err("pagination limit must be between 1 and 500".to_string());
        }
        if offset < 0 {
            return Err("pagination offset cannot be negative".to_string());
        }
        Ok(Self {
            limit: Some(limit),
            offset: Some(offset),
        })
    }

    fn limit(&self) -> i64 {
        self.limit.unwrap_or(50)
    }

    fn offset(&self) -> i64 {
        self.offset.unwrap_or(0)
    }
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

#[derive(Debug, Clone, Serialize)]
pub struct AuditSummary {
    pub id: String,
    pub entity_id: String,
    pub action: String,
    pub actor: String,
    pub occurred_at: String,
    pub payload_hash: String,
    pub previous_hash: Option<String>,
    pub hash: String,
}

#[derive(Debug, Clone)]
pub struct FiscalRecordInput {
    pub id: String,
    pub company_id: String,
    pub invoice_id: String,
    pub record_type: String,
    pub generated_at: String,
    pub fiscal_hash: String,
    pub previous_fiscal_hash: Option<String>,
    pub xml_path: Option<String>,
    pub status: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct FiscalRecordSummary {
    pub id: String,
    pub company_id: String,
    pub invoice_id: String,
    pub record_type: String,
    pub generated_at: String,
    pub fiscal_hash: String,
    pub previous_fiscal_hash: Option<String>,
    pub xml_path: Option<String>,
    pub status: String,
}

#[derive(Debug, Clone)]
pub struct FiscalRecordVerificationRow {
    pub id: String,
    pub company_id: String,
    pub company_tax_id: String,
    pub invoice_id: String,
    pub invoice_kind: String,
    pub invoice_rectification_reason_code: Option<String>,
    pub invoice_series: String,
    pub invoice_number: Option<i64>,
    pub invoice_status: String,
    pub invoice_tax_cents: i64,
    pub invoice_total_cents: i64,
    pub invoice_fiscal_hash: Option<String>,
    pub invoice_issued_at: Option<String>,
    pub record_type: String,
    pub generated_at: String,
    pub fiscal_hash: String,
    pub previous_fiscal_hash: Option<String>,
    pub xml_path: Option<String>,
}

pub fn list_companies(conn: &Connection) -> Result<Vec<CompanySummary>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, legal_name, tax_id, address, postal_code, municipality, province, country_code, default_series, created_at
             FROM companies ORDER BY created_at DESC",
        )
        .map_err(db_error)?;
    let rows = stmt
        .query_map([], |row| {
            Ok(CompanySummary {
                id: row.get(0)?,
                legal_name: row.get(1)?,
                tax_id: row.get(2)?,
                address: row.get(3)?,
                postal_code: row.get(4)?,
                municipality: row.get(5)?,
                province: row.get(6)?,
                country_code: row.get(7)?,
                default_series: row.get(8)?,
                created_at: row.get(9)?,
            })
        })
        .map_err(db_error)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(db_error)
}

pub fn list_customers(conn: &Connection) -> Result<Vec<CustomerSummary>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, display_name, tax_id, kind, address, postal_code, municipality, province, country_code, updated_at
             FROM customers ORDER BY updated_at DESC",
        )
        .map_err(db_error)?;
    let rows = stmt
        .query_map([], |row| {
            Ok(CustomerSummary {
                id: row.get(0)?,
                display_name: row.get(1)?,
                tax_id: row.get(2)?,
                kind: row.get(3)?,
                address: row.get(4)?,
                postal_code: row.get(5)?,
                municipality: row.get(6)?,
                province: row.get(7)?,
                country_code: row.get(8)?,
                updated_at: row.get(9)?,
            })
        })
        .map_err(db_error)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(db_error)
}

pub fn list_products(conn: &Connection, company_id: &str) -> Result<Vec<Product>, String> {
    require_company(conn, company_id)?;
    let mut stmt = conn
        .prepare(
            "SELECT id, company_id, sku, name, description, kind, unit_price_cents,
                    tax_rate_basis_points, withholding_rate_basis_points, discount_rate_basis_points,
                    active, updated_at
             FROM products
             WHERE company_id = ?1
             ORDER BY active DESC, updated_at DESC, name ASC",
        )
        .map_err(db_error)?;
    let rows = stmt
        .query_map(params![company_id], |row| {
            let kind: String = row.get(5)?;
            Ok(Product {
                id: row.get(0)?,
                company_id: row.get(1)?,
                sku: row.get(2)?,
                name: row.get(3)?,
                description: row.get(4)?,
                kind: match kind.as_str() {
                    "Product" => crate::domain::product::ProductKind::Product,
                    _ => crate::domain::product::ProductKind::Service,
                },
                unit_price_cents: row.get(6)?,
                tax_rate_basis_points: row.get(7)?,
                withholding_rate_basis_points: row.get(8)?,
                discount_rate_basis_points: row.get(9)?,
                active: row.get::<_, i64>(10)? == 1,
                updated_at: row.get(11)?,
            })
        })
        .map_err(db_error)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(db_error)
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

pub fn list_audit_events(conn: &Connection) -> Result<Vec<AuditSummary>, String> {
    list_audit_events_paginated(conn, ListPagination::default())
}

pub fn list_audit_events_paginated(
    conn: &Connection,
    pagination: ListPagination,
) -> Result<Vec<AuditSummary>, String> {
    let pagination = pagination.normalized()?;
    let mut stmt = conn
        .prepare(
            "SELECT id, entity_id, action, actor, occurred_at, payload_hash, previous_hash, hash
             FROM audit_events ORDER BY occurred_at DESC, rowid DESC
             LIMIT ?1 OFFSET ?2",
        )
        .map_err(db_error)?;
    let rows = stmt
        .query_map(params![pagination.limit(), pagination.offset()], |row| {
            Ok(AuditSummary {
                id: row.get(0)?,
                entity_id: row.get(1)?,
                action: row.get(2)?,
                actor: row.get(3)?,
                occurred_at: row.get(4)?,
                payload_hash: row.get(5)?,
                previous_hash: row.get(6)?,
                hash: row.get(7)?,
            })
        })
        .map_err(db_error)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(db_error)
}

pub fn list_fiscal_records(conn: &Connection) -> Result<Vec<FiscalRecordSummary>, String> {
    list_fiscal_records_paginated(conn, ListPagination::default())
}

pub fn list_fiscal_records_paginated(
    conn: &Connection,
    pagination: ListPagination,
) -> Result<Vec<FiscalRecordSummary>, String> {
    let pagination = pagination.normalized()?;
    let mut stmt = conn
        .prepare(
            "SELECT id, company_id, invoice_id, record_type, generated_at, fiscal_hash, previous_fiscal_hash, xml_path, status
             FROM fiscal_records ORDER BY generated_at DESC, rowid DESC
             LIMIT ?1 OFFSET ?2",
        )
        .map_err(db_error)?;
    let rows = stmt
        .query_map(params![pagination.limit(), pagination.offset()], |row| {
            Ok(FiscalRecordSummary {
                id: row.get(0)?,
                company_id: row.get(1)?,
                invoice_id: row.get(2)?,
                record_type: row.get(3)?,
                generated_at: row.get(4)?,
                fiscal_hash: row.get(5)?,
                previous_fiscal_hash: row.get(6)?,
                xml_path: row.get(7)?,
                status: row.get(8)?,
            })
        })
        .map_err(db_error)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(db_error)
}

pub fn list_fiscal_records_for_verification(
    conn: &Connection,
) -> Result<Vec<FiscalRecordVerificationRow>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT fr.id, fr.company_id, c.tax_id, fr.invoice_id, i.kind, i.rectification_reason_code, i.series, i.number, i.status,
                    i.tax_cents, i.total_cents, i.fiscal_hash, i.issued_at, fr.record_type,
                    fr.generated_at, fr.fiscal_hash, fr.previous_fiscal_hash, fr.xml_path
             FROM fiscal_records fr
             JOIN companies c ON c.id = fr.company_id
             JOIN invoices i ON i.id = fr.invoice_id
             ORDER BY fr.company_id ASC, fr.generated_at ASC, fr.rowid ASC",
        )
        .map_err(db_error)?;
    let rows = stmt
        .query_map([], |row| {
            Ok(FiscalRecordVerificationRow {
                id: row.get(0)?,
                company_id: row.get(1)?,
                company_tax_id: row.get(2)?,
                invoice_id: row.get(3)?,
                invoice_kind: row.get(4)?,
                invoice_rectification_reason_code: row.get(5)?,
                invoice_series: row.get(6)?,
                invoice_number: row.get(7)?,
                invoice_status: row.get(8)?,
                invoice_tax_cents: row.get(9)?,
                invoice_total_cents: row.get(10)?,
                invoice_fiscal_hash: row.get(11)?,
                invoice_issued_at: row.get(12)?,
                record_type: row.get(13)?,
                generated_at: row.get(14)?,
                fiscal_hash: row.get(15)?,
                previous_fiscal_hash: row.get(16)?,
                xml_path: row.get(17)?,
            })
        })
        .map_err(db_error)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(db_error)
}

pub fn insert_fiscal_export(
    conn: &Connection,
    invoice_id: &str,
    provider: &str,
    environment: &str,
    payload_version: &str,
    payload_hash: &str,
    status: &str,
) -> Result<String, String> {
    let id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO fiscal_exports (id, invoice_id, provider, environment, payload_version, payload_hash, status, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            id,
            invoice_id,
            provider,
            environment,
            payload_version,
            payload_hash,
            status,
            chrono::Utc::now().to_rfc3339(),
        ],
    )
    .map_err(db_error)?;
    Ok(id)
}

pub fn backup_database(conn: &Connection, target_path: &str) -> Result<(), String> {
    let path = PathBuf::from(target_path);
    if path.exists() {
        return Err("target backup file already exists".to_string());
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| format!("backup directory error: {err}"))?;
    }
    let target = path
        .to_str()
        .ok_or_else(|| "target path is not valid UTF-8".to_string())?;
    conn.execute("VACUUM INTO ?1", params![target])
        .map(|_| ())
        .map_err(db_error)
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

#[derive(Debug, Clone, Serialize)]
pub struct PreviousInvoiceLink {
    pub company_tax_id: String,
    pub series: String,
    pub number: i64,
    pub issued_at: String,
    pub fiscal_hash: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct RectifiedInvoiceLink {
    pub company_tax_id: String,
    pub series: String,
    pub number: i64,
    pub issued_at: String,
    pub taxable_base_cents: i64,
    pub tax_cents: i64,
}

pub fn latest_fiscal_record_hash_for_company(
    conn: &Connection,
    company_id: &str,
) -> Result<Option<String>, String> {
    conn.query_row(
        "SELECT fiscal_hash FROM fiscal_records
         WHERE company_id = ?1
         ORDER BY generated_at DESC, rowid DESC
         LIMIT 1",
        params![company_id],
        |row| row.get(0),
    )
    .optional()
    .map_err(db_error)
}

pub fn latest_fiscal_record_link_for_company(
    conn: &Connection,
    company_id: &str,
) -> Result<Option<PreviousInvoiceLink>, String> {
    conn.query_row(
        "SELECT c.tax_id, i.series, i.number, i.issued_at, fr.fiscal_hash
         FROM fiscal_records fr
         JOIN invoices i ON i.id = fr.invoice_id
         JOIN companies c ON c.id = fr.company_id
         WHERE fr.company_id = ?1
           AND i.number IS NOT NULL
           AND i.issued_at IS NOT NULL
         ORDER BY fr.generated_at DESC, fr.rowid DESC
         LIMIT 1",
        params![company_id],
        |row| {
            Ok(PreviousInvoiceLink {
                company_tax_id: row.get(0)?,
                series: row.get(1)?,
                number: row.get(2)?,
                issued_at: row.get(3)?,
                fiscal_hash: row.get(4)?,
            })
        },
    )
    .optional()
    .map_err(db_error)
}

pub fn previous_fiscal_record_link_for_invoice(
    conn: &Connection,
    invoice_id: &str,
    record_type: &str,
) -> Result<Option<PreviousInvoiceLink>, String> {
    conn.query_row(
        "SELECT c.tax_id, i.series, i.number, i.issued_at, prev.fiscal_hash
         FROM fiscal_records cur
         JOIN fiscal_records prev ON prev.fiscal_hash = cur.previous_fiscal_hash
         JOIN invoices i ON i.id = prev.invoice_id
         JOIN companies c ON c.id = prev.company_id
         WHERE cur.invoice_id = ?1
           AND cur.record_type = ?2
           AND i.number IS NOT NULL
           AND i.issued_at IS NOT NULL
         ORDER BY cur.generated_at DESC, cur.rowid DESC
         LIMIT 1",
        params![invoice_id, record_type],
        |row| {
            Ok(PreviousInvoiceLink {
                company_tax_id: row.get(0)?,
                series: row.get(1)?,
                number: row.get(2)?,
                issued_at: row.get(3)?,
                fiscal_hash: row.get(4)?,
            })
        },
    )
    .optional()
    .map_err(db_error)
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

pub fn rectified_invoice_link(
    conn: &Connection,
    invoice_id: &str,
) -> Result<RectifiedInvoiceLink, String> {
    conn.query_row(
        "SELECT c.tax_id, i.series, i.number, i.issued_at, i.taxable_base_cents, i.tax_cents
         FROM invoices i
         JOIN companies c ON c.id = i.company_id
         WHERE i.id = ?1
           AND i.number IS NOT NULL
           AND i.issued_at IS NOT NULL
           AND i.fiscal_hash IS NOT NULL",
        params![invoice_id],
        |row| {
            Ok(RectifiedInvoiceLink {
                company_tax_id: row.get(0)?,
                series: row.get(1)?,
                number: row.get(2)?,
                issued_at: row.get(3)?,
                taxable_base_cents: row.get(4)?,
                tax_cents: row.get(5)?,
            })
        },
    )
    .optional()
    .map_err(db_error)?
    .ok_or_else(|| format!("rectified invoice not found or not issued: {invoice_id}"))
}
pub fn previous_issued_invoice_link(
    conn: &Connection,
    invoice_id: &str,
) -> Result<Option<PreviousInvoiceLink>, String> {
    conn.query_row(
        "SELECT c.tax_id, p.series, p.number, p.issued_at, p.fiscal_hash
         FROM invoices cur
         JOIN invoices p ON p.company_id = cur.company_id
         JOIN companies c ON c.id = p.company_id
         WHERE cur.id = ?1
           AND p.id <> cur.id
           AND p.status = 'Issued'
           AND p.number IS NOT NULL
           AND p.issued_at IS NOT NULL
           AND p.fiscal_hash IS NOT NULL
           AND (
                p.issued_at < cur.issued_at
                OR (p.issued_at = cur.issued_at AND p.rowid < cur.rowid)
           )
         ORDER BY p.issued_at DESC, p.rowid DESC
         LIMIT 1",
        params![invoice_id],
        |row| {
            Ok(PreviousInvoiceLink {
                company_tax_id: row.get(0)?,
                series: row.get(1)?,
                number: row.get(2)?,
                issued_at: row.get(3)?,
                fiscal_hash: row.get(4)?,
            })
        },
    )
    .optional()
    .map_err(db_error)
}

pub(crate) fn apply_migrations(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );",
    )?;

    for migration in migrations() {
        let applied = conn
            .query_row(
                "SELECT 1 FROM schema_migrations WHERE version = ?1",
                params![migration.version],
                |_| Ok(()),
            )
            .optional()?;
        if applied.is_none() {
            conn.execute_batch(migration.sql)?;
            conn.execute(
                "INSERT INTO schema_migrations (version, name) VALUES (?1, ?2)",
                params![migration.version, migration.name],
            )?;
        }
    }

    Ok(())
}

fn insert_invoice(
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

fn reserve_invoice_number_tx(
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

fn insert_line(
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

fn insert_fiscal_record_tx(tx: &Transaction<'_>, record: &FiscalRecordInput) -> Result<(), String> {
    tx.execute(
        "INSERT INTO fiscal_records (id, company_id, invoice_id, record_type, generated_at, fiscal_hash, previous_fiscal_hash, xml_path, status, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            record.id,
            record.company_id,
            record.invoice_id,
            record.record_type,
            record.generated_at,
            record.fiscal_hash,
            record.previous_fiscal_hash,
            record.xml_path,
            record.status,
            record.created_at,
        ],
    )
    .map(|_| ())
    .map_err(db_error)
}

fn db_error(err: rusqlite::Error) -> String {
    format!("database error: {err}")
}

fn clean_optional(value: Option<String>) -> Option<String> {
    value
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::company::{
        Company, CompanyInput, CompanyUpdateInput, InvoiceSeriesConfigInput,
    };
    use crate::domain::customer::{Customer, CustomerInput, CustomerKind};
    use crate::domain::invoice::{
        Invoice, InvoiceDraftInput, InvoiceIssueInput, InvoiceKind, InvoiceLineInput,
        InvoiceStatus, RectificationMethod, RectificationReasonCode,
    };
    use crate::domain::settings::AppSettingsInput;
    use crate::domain::tax::TerritoryFlag;

    fn memory_conn() -> Connection {
        let conn = Connection::open_in_memory().expect("memory db");
        conn.pragma_update(None, "foreign_keys", "ON")
            .expect("foreign keys");
        apply_migrations(&conn).expect("migrations");
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
        assert_eq!(
            defaults.default_territory_flags,
            vec!["CommonTerritory", "VeriFactu"]
        );

        let saved = update_app_settings(
            &conn,
            AppSettingsInput {
                export_dir: Some("C:\\CumpleFactura\\Exports".to_string()),
                default_territory_flags: vec![
                    "CommonTerritory".to_string(),
                    "VeriFactu".to_string(),
                ],
                onboarding_completed: true,
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
        insert_issued_invoice(
            &mut conn,
            &issued,
            &alta_hash,
            None,
            &audit_event,
            &audit_hash,
        )
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
        let anulacion_audit_hash = anulacion_event.chain_hash();
        insert_anulacion_record(
            &mut conn,
            &issued.id,
            &anulacion_hash,
            Some(&alta_hash),
            "2026-05-28T10:05:00Z",
            "C:\\tmp\\anulacion.xml",
            &anulacion_event,
            &anulacion_audit_hash,
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
        let audit_hash = audit_event.chain_hash();
        insert_issued_invoice(
            &mut conn,
            &issued,
            &alta_hash,
            None,
            &audit_event,
            &audit_hash,
        )
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
        insert_issued_invoice(
            &mut conn,
            &source,
            &source_hash,
            None,
            &source_event,
            &source_audit_hash,
        )
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
        let rectifying_audit_hash = rectifying_event.chain_hash();
        insert_issued_invoice(
            &mut conn,
            &rectifying,
            &rectifying_hash,
            Some(&source_hash),
            &rectifying_event,
            &rectifying_audit_hash,
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
    fn fiscal_export_records_prepared_signature_package() {
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
        let audit_hash = audit_event.chain_hash();
        insert_issued_invoice(
            &mut conn,
            &issued,
            &"F".repeat(64),
            None,
            &audit_event,
            &audit_hash,
        )
        .expect("issued");

        let export_id = insert_fiscal_export(
            &conn,
            &issued.id,
            "AEAT-VERIFACTU",
            "local-dev",
            "verifactu-unsigned-v1",
            &"A".repeat(64),
            "prepared_for_signature",
        )
        .expect("fiscal export");

        let status: String = conn
            .query_row(
                "SELECT status FROM fiscal_exports WHERE id = ?1",
                params![export_id],
                |row| row.get(0),
            )
            .expect("export status");
        assert_eq!(status, "prepared_for_signature");
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
}
