//! Persistencia SQLite: migraciones, `AppState` y acceso a entidades fiscales.
//!
//! Esquema versionado en `migrations/*.sql`. Numeración y huellas se escriben en
//! transacciones de emisión; los listados admiten filtros y `ListPagination`.
//!
//! | Módulo      | Tablas                                                         |
//! |-------------|----------------------------------------------------------------|
//! | `settings`  | `app_settings`                                                 |
//! | `companies` | `companies`, `invoice_series_configs`                          |
//! | `customers` | `customers`                                                    |
//! | `products`  | `products`                                                     |
//! | `invoices`  | `invoices`, `invoice_lines`, numeración                        |
//! | `fiscal`    | `fiscal_records`, `audit_events`, `fiscal_exports`, `verifactu_submissions` |
//! | `commercial_documents` | `commercial_documents`, `commercial_document_lines`, `commercial_sequences` |
//! | `recurring` | `recurring_invoices`, `recurring_runs`                         |
//!
//! Todo se reexporta aquí: el resto de la app usa `db::<función>` sin conocer el módulo.

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
use std::sync::{Mutex, MutexGuard};
use tauri::Manager;

mod commercial_documents;
mod companies;
mod customers;
mod fiscal;
mod invoices;
mod products;
mod recurring;
mod settings;

pub use commercial_documents::*;
pub use companies::*;
pub use customers::*;
pub use fiscal::*;
pub use invoices::*;
pub use products::*;
pub use recurring::*;
pub use settings::*;

pub struct AppState {
    pub conn: Mutex<Connection>,
}

impl AppState {
    /// Conexión SQLite compartida por los comandos Tauri.
    pub fn lock(&self) -> Result<MutexGuard<'_, Connection>, String> {
        self.conn
            .lock()
            .map_err(|_| "database lock poisoned".to_string())
    }
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
        Migration {
            version: 9,
            name: "verifactu_submissions",
            sql: include_str!("migrations/009_verifactu_submissions.sql"),
        },
        Migration {
            version: 10,
            name: "commercial_documents",
            sql: include_str!("migrations/010_commercial_documents.sql"),
        },
        Migration {
            version: 11,
            name: "recurring_invoices",
            sql: include_str!("migrations/011_recurring_invoices.sql"),
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

/// SQLite en memoria con claves foráneas y todas las migraciones. Solo tests.
#[cfg(test)]
pub fn test_conn() -> Connection {
    let conn = Connection::open_in_memory().expect("memory db");
    conn.pragma_update(None, "foreign_keys", "ON")
        .expect("foreign keys");
    apply_migrations(&conn).expect("migrations");
    conn
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
mod tests;
