//! Comandos Tauri de gestion: cobros, recurrentes, presupuestos y email.

use crate::db::business::{
    self, EmailLogEntry, Payment, PaymentInput, Quote, QuoteInput, Receivable, RecurringInput,
    RecurringInvoice, RecurringRun,
};
use crate::db::{self, AppState, InvoicePdfData};
use crate::domain::invoice::Invoice;
use crate::services::email::{self, EmailSettings, InvoiceMailContext};
use crate::services::pdf;
use crate::services::qr::QrEnvironment;
use chrono::{Local, NaiveDate};
use rusqlite::Connection;
use std::sync::MutexGuard;
use tauri::State;

fn lock<'a>(state: &'a State<'_, AppState>) -> Result<MutexGuard<'a, Connection>, String> {
    state
        .conn
        .lock()
        .map_err(|_| "database lock poisoned".to_string())
}

fn today() -> NaiveDate {
    Local::now().date_naive()
}

// ── Cobros y vencimientos ──

#[tauri::command]
pub fn invoice_due_date_set(
    state: State<'_, AppState>,
    invoice_id: String,
    due_date: Option<String>,
) -> Result<(), String> {
    let conn = lock(&state)?;
    business::set_invoice_due_date(
        &conn,
        &invoice_id,
        due_date.as_deref().filter(|d| !d.trim().is_empty()),
    )
}

#[tauri::command]
pub fn payment_register(
    state: State<'_, AppState>,
    input: PaymentInput,
) -> Result<Payment, String> {
    business::register_payment(&*lock(&state)?, input)
}

#[tauri::command]
pub fn payment_delete(state: State<'_, AppState>, payment_id: String) -> Result<(), String> {
    business::delete_payment(&*lock(&state)?, &payment_id)
}

#[tauri::command]
pub fn payment_list(
    state: State<'_, AppState>,
    invoice_id: String,
) -> Result<Vec<Payment>, String> {
    business::list_payments(&*lock(&state)?, &invoice_id)
}

#[tauri::command]
pub fn receivables_list(
    state: State<'_, AppState>,
    company_id: Option<String>,
) -> Result<Vec<Receivable>, String> {
    business::list_receivables(&*lock(&state)?, company_id.as_deref(), today())
}

// ── Facturas recurrentes ──

#[tauri::command]
pub fn recurring_upsert(
    state: State<'_, AppState>,
    input: RecurringInput,
) -> Result<RecurringInvoice, String> {
    business::upsert_recurring(&*lock(&state)?, input)
}

#[tauri::command]
pub fn recurring_list(
    state: State<'_, AppState>,
    company_id: Option<String>,
) -> Result<Vec<RecurringInvoice>, String> {
    business::list_recurring(&*lock(&state)?, company_id.as_deref())
}

#[tauri::command]
pub fn recurring_set_active(
    state: State<'_, AppState>,
    id: String,
    active: bool,
) -> Result<(), String> {
    business::set_recurring_active(&*lock(&state)?, &id, active)
}

#[tauri::command]
pub fn recurring_generate_due(state: State<'_, AppState>) -> Result<Vec<RecurringRun>, String> {
    business::generate_due_recurring(&mut *lock(&state)?, today())
}

// ── Presupuestos ──

#[tauri::command]
pub fn quote_upsert(state: State<'_, AppState>, input: QuoteInput) -> Result<Quote, String> {
    business::upsert_quote(&*lock(&state)?, input, today())
}

#[tauri::command]
pub fn quote_list(
    state: State<'_, AppState>,
    company_id: Option<String>,
) -> Result<Vec<Quote>, String> {
    business::list_quotes(&*lock(&state)?, company_id.as_deref())
}

#[tauri::command]
pub fn quote_set_status(
    state: State<'_, AppState>,
    id: String,
    status: String,
) -> Result<Quote, String> {
    business::set_quote_status(&*lock(&state)?, &id, &status)
}

#[tauri::command]
pub fn quote_convert(state: State<'_, AppState>, id: String) -> Result<Invoice, String> {
    business::convert_quote_to_invoice(&mut *lock(&state)?, &id, today())
}

// ── Email ──

#[derive(Debug, serde::Serialize)]
pub struct EmailSettingsView {
    pub settings: EmailSettings,
    pub configured: bool,
    pub password_saved: bool,
}

#[tauri::command]
pub fn email_settings_get(state: State<'_, AppState>) -> Result<EmailSettingsView, String> {
    let settings = business::get_email_settings(&*lock(&state)?)?;
    let password_saved =
        settings.is_configured() && email::load_password(&settings).ok().flatten().is_some();
    Ok(EmailSettingsView {
        configured: settings.is_configured(),
        password_saved,
        settings,
    })
}

#[tauri::command]
pub fn email_settings_update(
    state: State<'_, AppState>,
    settings: EmailSettings,
) -> Result<EmailSettingsView, String> {
    business::save_email_settings(&*lock(&state)?, &settings)?;
    email_settings_get(state)
}

/// Guarda la contrasena SMTP en el almacen de credenciales del sistema (no en SQLite).
#[tauri::command]
pub fn email_password_set(state: State<'_, AppState>, password: String) -> Result<(), String> {
    let settings = business::get_email_settings(&*lock(&state)?)?;
    settings.validate()?;
    email::store_password(&settings, &password)
}

#[tauri::command]
pub fn email_log_list(
    state: State<'_, AppState>,
    invoice_id: Option<String>,
) -> Result<Vec<EmailLogEntry>, String> {
    business::list_email_log(&*lock(&state)?, invoice_id.as_deref())
}

#[tauri::command]
pub fn email_send_test(state: State<'_, AppState>, to: String) -> Result<EmailLogEntry, String> {
    let conn = lock(&state)?;
    let settings = business::get_email_settings(&conn)?;
    let subject = "Prueba de envio desde CumpleFactura";
    let message = email::build_message(
        &settings,
        &to,
        subject,
        "La configuracion SMTP funciona correctamente.",
        None,
    )?;
    deliver(&conn, &settings, &message, None, "test", &to, subject)
}

#[tauri::command]
pub fn email_send_invoice(
    state: State<'_, AppState>,
    invoice_id: String,
    to: String,
    subject: Option<String>,
    body: Option<String>,
) -> Result<EmailLogEntry, String> {
    let conn = lock(&state)?;
    send_invoice_mail(&conn, &invoice_id, &to, subject, body, MailKind::Invoice)
}

#[tauri::command]
pub fn email_send_reminder(
    state: State<'_, AppState>,
    invoice_id: String,
    to: String,
    subject: Option<String>,
    body: Option<String>,
) -> Result<EmailLogEntry, String> {
    let conn = lock(&state)?;
    send_invoice_mail(&conn, &invoice_id, &to, subject, body, MailKind::Reminder)
}

enum MailKind {
    Invoice,
    Reminder,
}

fn send_invoice_mail(
    conn: &Connection,
    invoice_id: &str,
    to: &str,
    subject: Option<String>,
    body: Option<String>,
    kind: MailKind,
) -> Result<EmailLogEntry, String> {
    let settings = business::get_email_settings(conn)?;
    settings.validate()?;
    let invoice = db::invoice_pdf_data(conn, invoice_id)?;
    let number = invoice
        .number
        .map(|n| format!("{}-{}", invoice.series, n))
        .ok_or_else(|| "only issued invoices can be emailed".to_string())?;
    let receivable = business::list_receivables(conn, Some(&invoice.company_id), today())?
        .into_iter()
        .find(|r| r.invoice_id == invoice_id);
    let issued_date = display_date(invoice.issued_at.as_deref());
    let total = money(invoice.total_cents);
    let due = receivable
        .as_ref()
        .and_then(|r| r.due_date.clone())
        .map(|d| display_date(Some(&d)));
    let ctx = InvoiceMailContext {
        company_name: &invoice.company_legal_name,
        customer_name: &invoice.customer_display_name,
        invoice_number: &number,
        issued_date: &issued_date,
        total: &total,
        due_date: due.as_deref(),
    };
    let (default_subject, default_body, kind_name) = match kind {
        MailKind::Invoice => (
            email::default_invoice_subject(&ctx),
            email::default_invoice_body(&ctx),
            "invoice",
        ),
        MailKind::Reminder => {
            let receivable = receivable
                .as_ref()
                .ok_or_else(|| "invoice has no receivable".to_string())?;
            if receivable.outstanding_cents <= 0 {
                return Err("invoice is fully paid; no reminder needed".to_string());
            }
            (
                email::default_reminder_subject(&ctx),
                email::default_reminder_body(
                    &ctx,
                    &money(receivable.outstanding_cents),
                    receivable.days_overdue,
                ),
                "reminder",
            )
        }
    };
    let subject = subject
        .filter(|s| !s.trim().is_empty())
        .unwrap_or(default_subject);
    let body = body
        .filter(|b| !b.trim().is_empty())
        .unwrap_or(default_body);
    let pdf_bytes = render_pdf(conn, &invoice)?;
    let filename = format!("Factura-{number}.pdf");
    let message =
        email::build_message(&settings, to, &subject, &body, Some((&filename, pdf_bytes)))?;
    deliver(
        conn,
        &settings,
        &message,
        Some(invoice_id),
        kind_name,
        to,
        &subject,
    )
}

fn render_pdf(conn: &Connection, invoice: &InvoicePdfData) -> Result<Vec<u8>, String> {
    let env = QrEnvironment::parse(&db::get_app_settings(conn)?.qr_environment)?;
    pdf::render_invoice_pdf(invoice, env)
}

/// Envia y registra el resultado (exito o error) en email_log; devuelve error si fallo el envio.
fn deliver(
    conn: &Connection,
    settings: &EmailSettings,
    message: &lettre::Message,
    invoice_id: Option<&str>,
    kind: &str,
    to: &str,
    subject: &str,
) -> Result<EmailLogEntry, String> {
    let result = email::send(settings, message);
    let entry = EmailLogEntry {
        id: uuid::Uuid::new_v4().to_string(),
        invoice_id: invoice_id.map(str::to_string),
        kind: kind.to_string(),
        recipient: to.trim().to_string(),
        subject: subject.to_string(),
        status: if result.is_ok() { "sent" } else { "failed" }.to_string(),
        error: result.as_ref().err().cloned(),
        sent_at: chrono::Utc::now().to_rfc3339(),
    };
    business::insert_email_log(conn, &entry)?;
    result.map(|_| entry)
}

fn display_date(value: Option<&str>) -> String {
    match value {
        Some(v) if v.len() == 10 => business::parse_date(v)
            .map(|d| d.format("%d/%m/%Y").to_string())
            .unwrap_or_else(|_| v.to_string()),
        Some(v) => chrono::DateTime::parse_from_rfc3339(v)
            .map(|d| d.format("%d/%m/%Y").to_string())
            .unwrap_or_else(|_| v.to_string()),
        None => "-".to_string(),
    }
}

fn money(cents: i64) -> String {
    pdf::es_money(cents)
}
