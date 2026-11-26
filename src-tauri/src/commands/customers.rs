//! IPC clientes (upsert por id opcional / ON CONFLICT en db).

use crate::db::{self, AppState, CustomerSummary};
use crate::domain::customer::{Customer, CustomerInput};
use tauri::State;

/// Crea o actualiza cliente tras validar dominio.
#[tauri::command]
pub fn customer_upsert(
    state: State<'_, AppState>,
    input: CustomerInput,
) -> Result<Customer, String> {
    input.validate()?;
    let action = if input.id.is_some() {
        "customer_updated"
    } else {
        "customer_created"
    };
    let customer = Customer::from_input(input);
    let conn = state.lock()?;
    let tx = db::write_tx(&conn)?;
    db::upsert_customer(&tx, &customer)?;
    db::audit_change(&tx, "customer", &customer.id, action, &customer)?;
    tx.commit().map_err(|err| err.to_string())?;
    Ok(customer)
}

/// Listado resumen de clientes.
#[tauri::command]
pub fn customer_list(state: State<'_, AppState>) -> Result<Vec<CustomerSummary>, String> {
    let conn = state.lock()?;
    db::list_customers(&conn)
}
