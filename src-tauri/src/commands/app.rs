//! Carpetas de la app (datos y exportación) vía APIs Tauri, sin rutas de usuario fijas.
//!
//! La UI deriva de `export_dir` los nombres de cada exportación (`lib/format.ts`,
//! `exportPaths`), así que aquí solo se resuelven las carpetas.

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize)]
pub struct AppDefaults {
    pub app_data_dir: String,
    pub export_dir: String,
    pub generated_at: String,
    pub notes: Vec<String>,
}

/// Resuelve y crea la carpeta de exportación por defecto.
#[tauri::command]
pub fn app_defaults_get(app: AppHandle) -> Result<AppDefaults, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("cannot resolve app data dir: {err}"))?;
    let export_dir = resolve_export_dir(&app, &app_data_dir);
    fs::create_dir_all(&export_dir).map_err(|err| format!("cannot create export dir: {err}"))?;
    Ok(AppDefaults {
        app_data_dir: app_data_dir.to_string_lossy().to_string(),
        export_dir: export_dir.to_string_lossy().to_string(),
        generated_at: chrono::Utc::now().to_rfc3339(),
        notes: vec![
            "Export dir resolved from the local documents or app data directory.".to_string(),
            "No user-specific absolute path is hardcoded in the UI.".to_string(),
        ],
    })
}

/// `Documentos/CumpleFactura`, o `<datos de la app>/exports` si no hay carpeta de documentos.
fn resolve_export_dir(app: &AppHandle, app_data_dir: &Path) -> PathBuf {
    app.path()
        .document_dir()
        .map(|dir| dir.join("CumpleFactura"))
        .unwrap_or_else(|_| app_data_dir.join("exports"))
}
