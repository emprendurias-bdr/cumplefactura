//! Resolución de los scripts y esquemas XSD usados para validar VERI*FACTU.
//!
//! Primero busca los recursos empaquetados por Tauri y, si no están disponibles,
//! utiliza los recursos del árbol de desarrollo.

use crate::services::verifactu;
use tauri::{AppHandle, Manager};

/// Localiza los assets XSD de VERI*FACTU en producción o desarrollo.
pub(crate) fn resolve_verifactu_xsd_assets(
    app: &AppHandle,
) -> Result<verifactu::VerifactuXsdAssets, String> {
    let mut errors = Vec::new();

    if let Ok(resource_dir) = app.path().resource_dir() {
        let candidates = [
            (
                resource_dir
                    .join("tools")
                    .join("validate-verifactu-xsd.ps1"),
                resource_dir.join("xsd").join("verifactu"),
            ),
            (
                resource_dir.join("validate-verifactu-xsd.ps1"),
                resource_dir.join("resources").join("xsd").join("verifactu"),
            ),
        ];

        for (script_path, schema_dir) in candidates {
            match verifactu::VerifactuXsdAssets::new(script_path, schema_dir) {
                Ok(assets) => return Ok(assets),
                Err(err) => errors.push(err),
            }
        }
    }

    match verifactu::dev_verifactu_xsd_assets() {
        Ok(assets) => Ok(assets),
        Err(err) => {
            errors.push(err);
            Err(format!(
                "cannot resolve VERI*FACTU XSD assets: {}",
                errors.join(" | ")
            ))
        }
    }
}
