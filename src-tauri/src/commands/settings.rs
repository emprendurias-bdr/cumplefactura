//! Onboarding / settings persistidos (`app_settings` singleton en SQLite).

use crate::db::{self, AppState};
use crate::domain::settings::{AppSettings, AppSettingsInput};
use crate::services::sidecar_process::SidecarManager;
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
/// Si cambia el envío a la AEAT (encendido o entorno), lo audita aparte y para el sidecar:
/// el siguiente uso lo arranca con las banderas nuevas.
#[tauri::command]
pub fn app_settings_update(
    state: State<'_, AppState>,
    sidecar: State<'_, SidecarManager>,
    input: AppSettingsInput,
) -> Result<AppSettings, String> {
    if let Some(path) = &input.export_dir {
        fs::create_dir_all(Path::new(path))
            .map_err(|err| format!("cannot create export dir: {err}"))?;
    }
    let conn = state.lock()?;
    let before = db::get_app_settings(&conn)?;
    let settings = db::update_app_settings(&conn, input)?;
    db::audit_change(&conn, "app_settings", "app", "settings_updated", &settings)?;
    let sending = |s: &AppSettings| (s.aeat_sending_enabled, s.verifactu_environment.clone());
    if sending(&before) != sending(&settings) {
        db::audit_change(
            &conn,
            "app_settings",
            "app",
            "aeat_sending_changed",
            &serde_json::json!({
                "aeat_sending_enabled": settings.aeat_sending_enabled,
                "verifactu_environment": settings.verifactu_environment,
                "endpoint_name": settings.effective_endpoint().as_str(),
            }),
        )?;
        // Sin la base bloqueada: `SidecarManager::client` toma su lock y luego el de la base.
        drop(conn);
        sidecar.shutdown();
    }
    Ok(settings)
}
