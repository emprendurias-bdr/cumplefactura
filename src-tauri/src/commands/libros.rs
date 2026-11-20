//! IPC de libros registro: exporta el de facturas expedidas a CSV (ver `services::libro_registro`).

use crate::commands::fiscal::ExportResult;
use crate::db::AppState;
use crate::domain::require;
use crate::services::{export, libro_registro};
use tauri::State;

/// Periodo `from`..`to` en `AAAA-MM-DD` (incluidos). No sobrescribe un fichero existente.
#[tauri::command]
pub fn libro_expedidas_export(
    state: State<'_, AppState>,
    company_id: String,
    from: String,
    to: String,
    target_path: String,
) -> Result<ExportResult, String> {
    require("company_id", &company_id)?;
    require("target_path", &target_path)?;
    let conn = state.lock()?;
    let (csv, resumen) = libro_registro::libro_expedidas_csv(&conn, &company_id, &from, &to)?;
    export::write_new_file(&target_path, &csv)?;
    Ok(ExportResult {
        target_path,
        status: "created".to_string(),
        notes: vec![format!(
            "{} facturas, {} filas (una por tipo impositivo). Anuladas y borradores no se incluyen.",
            resumen.facturas, resumen.filas
        )],
    })
}
