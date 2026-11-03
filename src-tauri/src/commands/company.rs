//! IPC empresa emisora, configuración de series de numeración y logo del PDF.

use crate::db::{self, AppState, CompanySummary};
use crate::domain::company::{
    Company, CompanyInput, CompanyUpdateInput, InvoiceSeriesConfig, InvoiceSeriesConfigInput,
};
use crate::domain::require;
use tauri::{AppHandle, Manager, State};

/// Alta de empresa (valida dominio → insert SQLite).
#[tauri::command]
pub fn company_create(state: State<'_, AppState>, input: CompanyInput) -> Result<Company, String> {
    input.validate()?;
    let company = Company::from_input(input);
    let conn = state.lock()?;
    db::insert_company(&conn, &company)?;
    Ok(company)
}

/// Edición de empresa existente por id.
#[tauri::command]
pub fn company_update(
    state: State<'_, AppState>,
    input: CompanyUpdateInput,
) -> Result<Company, String> {
    let conn = state.lock()?;
    db::update_company(&conn, &input)
}

/// Listado resumen de empresas.
#[tauri::command]
pub fn company_list(state: State<'_, AppState>) -> Result<Vec<CompanySummary>, String> {
    let conn = state.lock()?;
    db::list_companies(&conn)
}

/// Upsert serie (seed de `invoice_sequences` en db).
#[tauri::command]
pub fn company_series_configure(
    state: State<'_, AppState>,
    input: InvoiceSeriesConfigInput,
) -> Result<InvoiceSeriesConfig, String> {
    let mut conn = state.lock()?;
    db::upsert_invoice_series_config(&mut conn, input)
}

/// Series activas/configuradas de una empresa y año fiscal.
#[tauri::command]
pub fn company_series_list(
    state: State<'_, AppState>,
    company_id: String,
    fiscal_year: i32,
) -> Result<Vec<InvoiceSeriesConfig>, String> {
    require("company_id", &company_id)?;
    let conn = state.lock()?;
    db::list_invoice_series_configs(&conn, &company_id, fiscal_year)
}

/// Copia el logo (JPEG o PNG sin transparencia, ≤ 1 MB) a `<app data>/logos/` y devuelve la ruta.
#[tauri::command]
pub fn company_logo_set(
    app: AppHandle,
    state: State<'_, AppState>,
    company_id: String,
    source_path: String,
) -> Result<String, String> {
    require("company_id", &company_id)?;
    require("source_path", &source_path)?;
    let logos_dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("app data dir error: {err}"))?
        .join("logos");
    let mut conn = state.lock()?;
    db::set_company_logo(
        &mut conn,
        &company_id,
        std::path::Path::new(&source_path),
        &logos_dir,
    )
}

#[tauri::command]
pub fn company_logo_clear(state: State<'_, AppState>, company_id: String) -> Result<(), String> {
    require("company_id", &company_id)?;
    let mut conn = state.lock()?;
    db::clear_company_logo(&mut conn, &company_id)
}
