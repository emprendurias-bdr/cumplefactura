//! IPC facturas recurrentes: plantillas, vista previa y generación de borradores vencidos.
//!
//! Solo crea borradores; nunca emite ni reserva número (la emisión sigue en `invoice_issue`).
//! `today` llega de la UI solo en pruebas; por defecto es la fecha local del equipo.

use crate::db::{
    self, AppState, RecurringGenerateResult, RecurringInvoice, RecurringInvoiceInput,
    RecurringPreviewItem,
};
use chrono::{Local, NaiveDate};
use tauri::State;

fn today_or(value: Option<String>) -> Result<NaiveDate, String> {
    match value {
        Some(value) => db::parse_iso_date(&value, "today"),
        None => Ok(Local::now().date_naive()),
    }
}

#[tauri::command]
pub fn recurring_list(
    state: State<'_, AppState>,
    company_id: Option<String>,
) -> Result<Vec<RecurringInvoice>, String> {
    let conn = state.lock()?;
    db::list_recurring(&conn, company_id.as_deref())
}

#[tauri::command]
pub fn recurring_save(
    state: State<'_, AppState>,
    input: RecurringInvoiceInput,
) -> Result<RecurringInvoice, String> {
    let mut conn = state.lock()?;
    db::save_recurring(&mut conn, input, today_or(None)?)
}

#[tauri::command]
pub fn recurring_set_active(
    state: State<'_, AppState>,
    id: String,
    active: bool,
) -> Result<RecurringInvoice, String> {
    let mut conn = state.lock()?;
    db::set_recurring_active(&mut conn, &id, active, today_or(None)?)
}

#[tauri::command]
pub fn recurring_delete(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let mut conn = state.lock()?;
    db::delete_recurring(&mut conn, &id)
}

#[tauri::command]
pub fn recurring_generate_due(
    state: State<'_, AppState>,
    today: Option<String>,
) -> Result<RecurringGenerateResult, String> {
    let today = today_or(today)?;
    let mut conn = state.lock()?;
    db::generate_due_recurring(&mut conn, today)
}

/// Con `input` calcula sin guardar (editor de plantilla nueva); si no, usa la plantilla `id`.
#[tauri::command]
pub fn recurring_preview(
    state: State<'_, AppState>,
    id: Option<String>,
    count: u32,
    input: Option<RecurringInvoiceInput>,
) -> Result<Vec<RecurringPreviewItem>, String> {
    let conn = state.lock()?;
    db::preview_recurring(&conn, id.as_deref(), input, count)
}
