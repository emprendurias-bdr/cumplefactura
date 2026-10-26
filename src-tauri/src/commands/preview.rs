use crate::db::{self, AppState};
use crate::services::pdf;
use rusqlite::Connection;
use tauri::State;

/// Accepts an invoice identifier, never a client-supplied path or arbitrary document.
pub(crate) fn render_preview(conn: &Connection, invoice_id: &str) -> Result<Vec<u8>, String> {
    if invoice_id.trim().is_empty() {
        return Err("invoice_id is required".to_string());
    }
    let invoice = db::invoice_pdf_data(conn, invoice_id)?;
    let bytes = pdf::render_invoice_pdf(&invoice);
    if bytes.len() > 2 * 1024 * 1024 {
        return Err("PDF preview exceeds 2 MiB; use the local export".to_string());
    }
    Ok(bytes)
}

#[tauri::command]
pub fn invoice_pdf_preview(
    state: State<'_, AppState>,
    invoice_id: String,
) -> Result<Vec<u8>, String> {
    let conn = state
        .conn
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;
    render_preview(&conn, &invoice_id)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_empty_and_missing_invoice_without_accessing_a_file_path() {
        let conn = Connection::open_in_memory().unwrap();
        crate::db::apply_migrations(&conn).unwrap();
        for id in ["", " ", "not-an-invoice", "../../private-file"] {
            assert!(render_preview(&conn, id).is_err(), "must reject {id:?}");
        }
    }
}
