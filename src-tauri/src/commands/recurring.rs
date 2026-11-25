//! IPC facturas recurrentes: plantillas, vista previa y generación de borradores vencidos.
//!
//! Solo crea borradores; nunca emite ni reserva número (la emisión sigue en `invoice_issue`).
//! `today` llega de la UI solo en pruebas; por defecto es la fecha civil peninsular (Europe/Madrid).

use crate::db::{
    self, AppState, RecurringGenerateResult, RecurringInvoice, RecurringInvoiceInput,
    RecurringPreviewItem,
};
use chrono::{DateTime, Datelike, Duration, NaiveDate, Utc};
use tauri::State;

fn today_or(value: Option<String>) -> Result<NaiveDate, String> {
    match value {
        Some(value) => db::parse_iso_date(&value, "today"),
        None => Ok(madrid_date(Utc::now())),
    }
}

/// Fecha civil en Europe/Madrid de un instante UTC (no la UTC ni la del equipo).
/// shortcut: regla UE de horario de verano fija (último domingo de marzo/octubre, 01:00 UTC);
/// pasar a una base de zonas horarias si la UE cambia la regla.
pub(crate) fn madrid_date(now: DateTime<Utc>) -> NaiveDate {
    let last_sunday_1utc = |month: u32| {
        let last = NaiveDate::from_ymd_opt(now.year(), month + 1, 1)
            .and_then(|d| d.pred_opt())
            .expect("mes válido");
        let sunday = last - Duration::days(last.weekday().num_days_from_sunday().into());
        sunday.and_hms_opt(1, 0, 0).expect("hora válida").and_utc()
    };
    let summer = now >= last_sunday_1utc(3) && now < last_sunday_1utc(10);
    (now + Duration::hours(if summer { 2 } else { 1 })).date_naive()
}

#[tauri::command]
pub fn recurring_list(
    state: State<'_, AppState>,
    company_id: Option<String>,
) -> Result<Vec<RecurringInvoice>, String> {
    let conn = state.lock()?;
    db::list_recurring(&conn, company_id.as_deref())
}

#[tauri::command]
pub fn recurring_save(
    state: State<'_, AppState>,
    input: RecurringInvoiceInput,
) -> Result<RecurringInvoice, String> {
    let mut conn = state.lock()?;
    db::save_recurring(&mut conn, input, today_or(None)?)
}

#[tauri::command]
pub fn recurring_set_active(
    state: State<'_, AppState>,
    id: String,
    active: bool,
) -> Result<RecurringInvoice, String> {
    let mut conn = state.lock()?;
    db::set_recurring_active(&mut conn, &id, active, today_or(None)?)
}

#[tauri::command]
pub fn recurring_delete(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let mut conn = state.lock()?;
    db::delete_recurring(&mut conn, &id)
}

#[tauri::command]
pub fn recurring_generate_due(
    state: State<'_, AppState>,
    today: Option<String>,
) -> Result<RecurringGenerateResult, String> {
    let today = today_or(today)?;
    let mut conn = state.lock()?;
    db::generate_due_recurring(&mut conn, today)
}

/// Con `input` calcula sin guardar (editor de plantilla nueva); si no, usa la plantilla `id`.
#[tauri::command]
pub fn recurring_preview(
    state: State<'_, AppState>,
    id: Option<String>,
    count: u32,
    input: Option<RecurringInvoiceInput>,
) -> Result<Vec<RecurringPreviewItem>, String> {
    let conn = state.lock()?;
    db::preview_recurring(&conn, id.as_deref(), input, count)
}

#[cfg(test)]
mod tests {
    use super::madrid_date;
    use chrono::{DateTime, NaiveDate};

    fn at(utc: &str) -> NaiveDate {
        madrid_date(DateTime::parse_from_rfc3339(utc).unwrap().to_utc())
    }

    fn day(value: &str) -> NaiveDate {
        NaiveDate::parse_from_str(value, "%Y-%m-%d").unwrap()
    }

    #[test]
    fn entre_las_0_y_las_2_hora_de_madrid_ya_es_el_dia_siguiente() {
        // Caso del gate: 20/11 00:31 en Madrid (invierno, UTC+1) = 19/11 23:31 UTC.
        assert_eq!(at("2026-11-19T23:31:00Z"), day("2026-11-20"));
        assert_eq!(at("2026-11-20T00:31:00Z"), day("2026-11-20"));
        assert_eq!(at("2026-11-19T22:59:00Z"), day("2026-11-19"));
        // Verano (UTC+2): 20/07 00:30 en Madrid = 19/07 22:30 UTC.
        assert_eq!(at("2026-07-19T22:30:00Z"), day("2026-07-20"));
        assert_eq!(at("2026-07-19T21:59:00Z"), day("2026-07-19"));
    }

    #[test]
    fn cambios_de_hora_2026() {
        // Último domingo de marzo (29/03) y de octubre (25/10), a las 01:00 UTC.
        assert_eq!(at("2026-03-28T22:59:00Z"), day("2026-03-28"));
        assert_eq!(at("2026-03-28T23:00:00Z"), day("2026-03-29"));
        assert_eq!(at("2026-10-24T21:59:00Z"), day("2026-10-24"));
        assert_eq!(at("2026-10-24T22:00:00Z"), day("2026-10-25"));
        assert_eq!(at("2026-12-31T23:00:00Z"), day("2027-01-01"));
    }
}
