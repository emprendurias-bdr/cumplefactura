//! IPC cobros y vencimiento (D6): solo gestión operativa.
//!
//! Nunca toca numeración, `fiscal_records`, huella ni XML. Delegan en `db::payments`.

use crate::db::{self, AppState, Payment, PaymentInput};
use tauri::State;

/// Cobro de una factura emitida o de una proforma enviada/pagada (anticipo).
#[tauri::command]
pub fn payment_register(
    state: State<'_, AppState>,
    input: PaymentInput,
) -> Result<Payment, String> {
    let mut conn = state.lock()?;
    db::register_payment(&mut conn, input)
}

/// Cobros de una factura **o** de una proforma (exactamente uno de los dos).
#[tauri::command]
pub fn payment_list(
    state: State<'_, AppState>,
    invoice_id: Option<String>,
    commercial_document_id: Option<String>,
) -> Result<Vec<Payment>, String> {
    let conn = state.lock()?;
    db::list_payments(
        &conn,
        invoice_id.as_deref(),
        commercial_document_id.as_deref(),
    )
}

#[tauri::command]
pub fn payment_delete(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let mut conn = state.lock()?;
    db::delete_payment(&mut conn, &id)
}

/// `due_date` vacío o `null` lo quita.
#[tauri::command]
pub fn invoice_due_date_set(
    state: State<'_, AppState>,
    invoice_id: String,
    due_date: Option<String>,
) -> Result<(), String> {
    let mut conn = state.lock()?;
    db::set_invoice_due_date(&mut conn, &invoice_id, due_date.as_deref())
}
