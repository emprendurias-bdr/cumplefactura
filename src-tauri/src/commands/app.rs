//! Paths seguros de la app (data dir / export) vía APIs Tauri — sin hardcode de usuario.

use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// Defaults de rutas (backup, PDF, XML, JSON, CSV, auditoría) con stamp temporal.
#[derive(Debug, Clone, Serialize)]
pub struct AppDefaults {
    pub app_data_dir: String,
    pub export_dir: String,
    pub default_backup_path: String,
    pub default_pdf_path: String,
    pub default_verifactu_xml_path: String,
    pub default_cancel_xml_path: String,
    pub default_signed_xml_path: String,
    pub default_json_export_path: String,
    pub default_csv_export_path: String,
    pub default_audit_export_path: String,
    pub generated_at: String,
    pub notes: Vec<String>,
}

/// Resuelve y crea la carpeta export; devuelve paths por defecto para la UI.
#[tauri::command]
pub fn app_defaults_get(app: AppHandle) -> Result<AppDefaults, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("cannot resolve app data dir: {err}"))?;
    let export_dir = resolve_export_dir(&app, &app_data_dir)?;
    fs::create_dir_all(&export_dir).map_err(|err| format!("cannot create export dir: {err}"))?;

    let stamp = chrono::Utc::now().format("%Y%m%d-%H%M%S").to_string();
    Ok(AppDefaults {
        app_data_dir: path_string(app_data_dir),
        export_dir: path_string(export_dir.clone()),
        default_backup_path: path_string(
            export_dir.join(format!("cumplefactura-backup-{stamp}.sqlite3")),
        ),
        default_pdf_path: path_string(
            export_dir.join(format!("cumplefactura-factura-{stamp}.pdf")),
        ),
        default_verifactu_xml_path: path_string(
            export_dir.join(format!("cumplefactura-verifactu-{stamp}.xml")),
        ),
        default_cancel_xml_path: path_string(
            export_dir.join(format!("cumplefactura-verifactu-anulacion-{stamp}.xml")),
        ),
        default_signed_xml_path: path_string(
            export_dir.join(format!("cumplefactura-verifactu-firmado-{stamp}.xml")),
        ),
        default_json_export_path: path_string(
            export_dir.join(format!("cumplefactura-factura-{stamp}.json")),
        ),
        default_csv_export_path: path_string(
            export_dir.join(format!("cumplefactura-facturas-{stamp}.csv")),
        ),
        default_audit_export_path: path_string(
            export_dir.join(format!("cumplefactura-auditoria-{stamp}.json")),
        ),
        generated_at: chrono::Utc::now().to_rfc3339(),
        notes: vec![
            "Default export paths are resolved from the local app/document directory.".to_string(),
            "No user-specific absolute path is hardcoded in the UI.".to_string(),
        ],
    })
}

fn resolve_export_dir(app: &AppHandle, app_data_dir: &PathBuf) -> Result<PathBuf, String> {
    match app.path().document_dir() {
        Ok(document_dir) => Ok(document_dir.join("CumpleFactura")),
        Err(_) => Ok(app_data_dir.join("exports")),
    }
}

fn path_string(path: PathBuf) -> String {
    path.to_string_lossy().to_string()
}
