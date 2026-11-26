//! Onboarding / settings persistidos (`app_settings` singleton en SQLite).

use crate::db::{self, AppState};
use crate::domain::settings::{AppSettings, AppSettingsInput};
use std::fs;
use std::path::Path;
use tauri::State;

/// Lee settings (export dir, flags fiscales, onboarding).
#[tauri::command]
pub fn app_settings_get(state: State<'_, AppState>) -> Result<AppSettings, String> {
    let conn = state.lock()?;
    db::get_app_settings(&conn)
}

/// Actualiza settings; crea la carpeta export si viene en el input.
#[tauri::command]
pub fn app_settings_update(
    state: State<'_, AppState>,
    input: AppSettingsInput,
) -> Result<AppSettings, String> {
    if let Some(path) = &input.export_dir {
        fs::create_dir_all(Path::new(path))
            .map_err(|err| format!("cannot create export dir: {err}"))?;
    }
    let conn = state.lock()?;
    let tx = db::write_tx(&conn)?;
    let settings = db::update_app_settings(&tx, input)?;
    db::audit_change(&tx, "app_settings", "app", "settings_updated", &settings)?;
    tx.commit().map_err(|err| err.to_string())?;
    Ok(settings)
}
