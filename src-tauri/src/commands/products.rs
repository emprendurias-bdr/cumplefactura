//! IPC catálogo de productos/servicios por empresa.

use crate::db::{self, AppState};
use crate::domain::product::{Product, ProductInput};
use crate::domain::require;
use tauri::State;

/// Upsert producto (SKU único por company).
#[tauri::command]
pub fn product_upsert(state: State<'_, AppState>, input: ProductInput) -> Result<Product, String> {
    input.validate()?;
    let product = Product::from_input(input);
    let conn = state.lock()?;
    db::upsert_product(&conn, &product)?;
    Ok(product)
}

/// Lista productos de una empresa.
#[tauri::command]
pub fn product_list(
    state: State<'_, AppState>,
    company_id: String,
) -> Result<Vec<Product>, String> {
    require("company_id", &company_id)?;
    let conn = state.lock()?;
    db::list_products(&conn, &company_id)
}
