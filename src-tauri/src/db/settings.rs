//! Ajustes de la app (`app_settings`): carpeta de exportación, territorios, onboarding y entorno VERI*FACTU.

use super::*;

const APP_SETTINGS_KEY: &str = "app";

pub fn get_app_settings(conn: &Connection) -> Result<AppSettings, String> {
    let raw: Option<String> = conn
        .query_row(
            "SELECT value FROM app_settings WHERE key = ?1",
            params![APP_SETTINGS_KEY],
            |row| row.get(0),
        )
        .optional()
        .map_err(db_error)?;
    match raw {
        Some(value) => {
            serde_json::from_str(&value).map_err(|err| format!("settings json error: {err}"))
        }
        None => Ok(AppSettings::default()),
    }
}

pub fn update_app_settings(
    conn: &Connection,
    input: AppSettingsInput,
) -> Result<AppSettings, String> {
    input.validate()?;
    let settings = AppSettings {
        export_dir: input
            .export_dir
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty()),
        default_territory_flags: input.default_territory_flags,
        onboarding_completed: input.onboarding_completed,
        verifactu_endpoint_name: input.verifactu_endpoint_name,
        certificate_password_mode: input.certificate_password_mode,
        updated_at: chrono::Utc::now().to_rfc3339(),
    };
    let value =
        serde_json::to_string(&settings).map_err(|err| format!("settings json error: {err}"))?;
    conn.execute(
        "INSERT INTO app_settings (key, value, updated_at)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        params![APP_SETTINGS_KEY, value, settings.updated_at],
    )
    .map_err(db_error)?;
    Ok(settings)
}
