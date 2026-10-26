//! Non-fiscal UI preferences stored under a separate key in the existing SQLite table.
use crate::db::AppState;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    #[default]
    System,
    Light,
    Dark,
}
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Density {
    Compact,
    #[default]
    Comfortable,
}
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct UiPreferences {
    pub theme: Theme,
    pub density: Density,
}
fn load(conn: &Connection) -> Result<UiPreferences, String> {
    let raw: Option<String> = conn
        .query_row(
            "SELECT value FROM app_settings WHERE key = 'ui_preferences'",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    match raw {
        Some(raw) => serde_json::from_str(&raw).map_err(|e| e.to_string()),
        None => Ok(UiPreferences::default()),
    }
}
fn save(conn: &Connection, input: UiPreferences) -> Result<UiPreferences, String> {
    let json = serde_json::to_string(&input).map_err(|e| e.to_string())?;
    conn.execute("INSERT INTO app_settings (key,value,updated_at) VALUES ('ui_preferences',?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",params![json,chrono::Utc::now().to_rfc3339()]).map_err(|e| e.to_string())?;
    Ok(input)
}
#[tauri::command]
pub fn ui_preferences_get(state: State<'_, AppState>) -> Result<UiPreferences, String> {
    let conn = state
        .conn
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;
    load(&conn)
}
#[tauri::command]
pub fn ui_preferences_update(
    state: State<'_, AppState>,
    input: UiPreferences,
) -> Result<UiPreferences, String> {
    let conn = state
        .conn
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;
    save(&conn, input)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn preferences_round_trip_without_overwriting_onboarding() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(include_str!("../db/migrations/007_app_settings.sql"))
            .unwrap();
        assert_eq!(load(&conn).unwrap(), UiPreferences::default());
        conn.execute("INSERT INTO app_settings (key,value,updated_at) VALUES ('onboarding-test','unchanged','now')",[]).unwrap();
        let input = UiPreferences {
            theme: Theme::Dark,
            density: Density::Compact,
        };
        save(&conn, input.clone()).unwrap();
        assert_eq!(load(&conn).unwrap(), input);
        let other: String = conn
            .query_row(
                "SELECT value FROM app_settings WHERE key='onboarding-test'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(other, "unchanged");
        assert!(serde_json::from_str::<UiPreferences>(
            r#"{"theme":"invalid","density":"compact"}"#
        )
        .is_err());
    }
}
