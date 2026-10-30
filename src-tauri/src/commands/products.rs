//! IPC catálogo de productos/servicios por empresa.

use crate::db::{self, AppState};
use crate::domain::product::{Product, ProductInput};
use tauri::State;

/// Upsert producto (SKU único por company).
#[tauri::command]
pub fn product_upsert(state: State<'_, AppState>, input: ProductInput) -> Result<Product, String> {
    input.validate()?;
    let product = Product::from_input(input);
    let conn = state
        .conn
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;
    db::upsert_product(&conn, &product)?;
    Ok(product)
}

/// Lista productos de una empresa.
#[tauri::command]
pub fn product_list(
    state: State<'_, AppState>,
    company_id: String,
) -> Result<Vec<Product>, String> {
    if company_id.trim().is_empty() {
        return Err("company_id is required".to_string());
    }
    let conn = state
        .conn
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;
    db::list_products(&conn, &company_id)
}
