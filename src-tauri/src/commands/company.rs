//! IPC empresa emisora y configuración de series de numeración.

use crate::db::{self, AppState, CompanySummary};
use crate::domain::company::{
    Company, CompanyInput, CompanyUpdateInput, InvoiceSeriesConfig, InvoiceSeriesConfigInput,
};
use tauri::State;

/// Alta de empresa (valida dominio → insert SQLite).
#[tauri::command]
pub fn company_create(state: State<'_, AppState>, input: CompanyInput) -> Result<Company, String> {
    input.validate()?;
    let company = Company::from_input(input);
    let conn = state
        .conn
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;
    db::insert_company(&conn, &company)?;
    Ok(company)
}

/// Edición de empresa existente por id.
#[tauri::command]
pub fn company_update(
    state: State<'_, AppState>,
    input: CompanyUpdateInput,
) -> Result<Company, String> {
    let conn = state
        .conn
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;
    db::update_company(&conn, &input)
}

/// Listado resumen de empresas.
#[tauri::command]
pub fn company_list(state: State<'_, AppState>) -> Result<Vec<CompanySummary>, String> {
    let conn = state
        .conn
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;
    db::list_companies(&conn)
}

/// Upsert serie (seed de `invoice_sequences` en db).
#[tauri::command]
pub fn company_series_configure(
    state: State<'_, AppState>,
    input: InvoiceSeriesConfigInput,
) -> Result<InvoiceSeriesConfig, String> {
    let mut conn = state
        .conn
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;
    db::upsert_invoice_series_config(&mut conn, input)
}

/// Series activas/configuradas de una empresa y año fiscal.
#[tauri::command]
pub fn company_series_list(
    state: State<'_, AppState>,
    company_id: String,
    fiscal_year: i32,
) -> Result<Vec<InvoiceSeriesConfig>, String> {
    if company_id.trim().is_empty() {
        return Err("company_id is required".to_string());
    }
    let conn = state
        .conn
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;
    db::list_invoice_series_configs(&conn, &company_id, fiscal_year)
}
