//! Resolución y validación de los recursos XSD locales de VERI*FACTU.
//!
//! Este módulo solo ejecuta el validador local; no firma XML ni realiza envíos
//! a AEAT.

use std::path::{Path, PathBuf};
use std::process::Command;

/// Rutas al script PowerShell y al directorio `resources/xsd/verifactu`.
#[derive(Debug, Clone)]
pub struct VerifactuXsdAssets {
    pub script_path: PathBuf,
    pub schema_dir: PathBuf,
}

impl VerifactuXsdAssets {
    /// Comprueba que existan el script, el dir de schemas y `SuministroLR.xsd`.
    pub fn new(script_path: PathBuf, schema_dir: PathBuf) -> Result<Self, String> {
        if !script_path.exists() {
            return Err(format!(
                "VERI*FACTU XSD validator script not found: {}",
                script_path.display()
            ));
        }
        if !schema_dir.exists() {
            return Err(format!(
                "VERI*FACTU XSD schema directory not found: {}",
                schema_dir.display()
            ));
        }
        let root_schema = schema_dir.join("SuministroLR.xsd");
        if !root_schema.exists() {
            return Err(format!(
                "VERI*FACTU XSD root schema not found: {}",
                root_schema.display()
            ));
        }

        Ok(Self {
            script_path,
            schema_dir,
        })
    }
}

/// Invoca el validador PowerShell local contra el XSD bundled.
pub fn validate_verifactu_xml_file(path: &Path, assets: &VerifactuXsdAssets) -> Result<(), String> {
    if !path.exists() {
        return Err(format!("VERI*FACTU XML not found: {}", path.display()));
    }

    let output = Command::new("powershell")
        .arg("-NoProfile")
        .arg("-ExecutionPolicy")
        .arg("Bypass")
        .arg("-File")
        .arg(&assets.script_path)
        .arg("-XmlPath")
        .arg(path)
        .arg("-SchemaDir")
        .arg(&assets.schema_dir)
        .output()
        .map_err(|err| format!("VERI*FACTU XSD validator error: {err}"))?;

    if output.status.success() {
        return Ok(());
    }

    Err(format!(
        "VERI*FACTU XSD validation failed\nstdout:\n{}\nstderr:\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    ))
}

/// Resuelve assets en árbol de desarrollo (`tools/` + `resources/xsd/verifactu`).
pub fn dev_verifactu_xsd_assets() -> Result<VerifactuXsdAssets, String> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let app_root = manifest_dir
        .parent()
        .ok_or_else(|| "cannot resolve CumpleFactura app root".to_string())?;
    VerifactuXsdAssets::new(
        app_root.join("tools").join("validate-verifactu-xsd.ps1"),
        manifest_dir.join("resources").join("xsd").join("verifactu"),
    )
}
