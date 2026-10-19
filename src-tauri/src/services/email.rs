//! Envio de facturas y recordatorios de cobro por SMTP propio del usuario.
//!
//! - La configuracion (host, puerto, usuario, remitente, seguridad) se guarda en `app_settings`.
//! - La contrasena SMTP NUNCA se guarda en SQLite ni se devuelve a la UI: va al almacen de
//!   credenciales del sistema (Windows Credential Manager / Keychain / keyutils en Linux).
//! - Solo se envian facturas emitidas, con el PDF (y su QR tributario) adjunto.

use lettre::message::header::ContentType;
use lettre::message::{Attachment, Mailbox, MultiPart, SinglePart};
use lettre::transport::smtp::authentication::Credentials;
use lettre::{Message, SmtpTransport, Transport};
use serde::{Deserialize, Serialize};
use std::time::Duration;

const KEYRING_SERVICE: &str = "CumpleFactura-SMTP";

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct EmailSettings {
    pub smtp_host: String,
    pub smtp_port: u16,
    /// "starttls" (587, recomendado), "tls" (465) o "none" (solo pruebas locales).
    pub smtp_security: String,
    pub smtp_username: String,
    pub from_email: String,
    pub from_name: String,
}

impl EmailSettings {
    pub fn validate(&self) -> Result<(), String> {
        if self.smtp_host.trim().is_empty() {
            return Err("smtp_host is required".to_string());
        }
        if self.smtp_port == 0 {
            return Err("smtp_port is required".to_string());
        }
        if !matches!(self.smtp_security.as_str(), "starttls" | "tls" | "none") {
            return Err(format!("unsupported smtp_security: {}", self.smtp_security));
        }
        self.from_mailbox()?;
        Ok(())
    }

    pub fn is_configured(&self) -> bool {
        self.validate().is_ok()
    }

    fn from_mailbox(&self) -> Result<Mailbox, String> {
        let name = self.from_name.trim();
        let raw = if name.is_empty() {
            self.from_email.trim().to_string()
        } else {
            format!("{name} <{}>", self.from_email.trim())
        };
        raw.parse::<Mailbox>()
            .map_err(|err| format!("invalid sender address: {err}"))
    }

    fn keyring_account(&self) -> String {
        format!("{}@{}", self.smtp_username.trim(), self.smtp_host.trim())
    }
}

/// Datos minimos para componer el email de una factura.
pub struct InvoiceMailContext<'a> {
    pub company_name: &'a str,
    pub customer_name: &'a str,
    pub invoice_number: &'a str,
    pub issued_date: &'a str,
    pub total: &'a str,
    pub due_date: Option<&'a str>,
}

pub fn default_invoice_subject(ctx: &InvoiceMailContext) -> String {
    format!("Factura {} de {}", ctx.invoice_number, ctx.company_name)
}

pub fn default_invoice_body(ctx: &InvoiceMailContext) -> String {
    let due = ctx
        .due_date
        .map(|d| format!("\nFecha de vencimiento: {d}"))
        .unwrap_or_default();
    format!(
        "Hola {},\n\nAdjuntamos la factura {} con fecha {} por importe de {}.{due}\n\n\
         La factura incluye el codigo QR tributario para su verificacion en la sede electronica de la AEAT.\n\n\
         Un saludo,\n{}",
        ctx.customer_name, ctx.invoice_number, ctx.issued_date, ctx.total, ctx.company_name
    )
}

pub fn default_reminder_subject(ctx: &InvoiceMailContext) -> String {
    format!(
        "Recordatorio de pago: factura {} de {}",
        ctx.invoice_number, ctx.company_name
    )
}

pub fn default_reminder_body(
    ctx: &InvoiceMailContext,
    outstanding: &str,
    days_overdue: i64,
) -> String {
    let overdue = if days_overdue > 0 {
        format!(" y vencio hace {days_overdue} dia(s)")
    } else {
        String::new()
    };
    format!(
        "Hola {},\n\nTe recordamos que la factura {} del {} tiene un importe pendiente de {}{overdue}.\n\
         Adjuntamos de nuevo la factura. Si ya has realizado el pago, por favor ignora este mensaje.\n\n\
         Un saludo,\n{}",
        ctx.customer_name, ctx.invoice_number, ctx.issued_date, outstanding, ctx.company_name
    )
}

/// Compone el mensaje (texto + PDF adjunto). No envia nada.
pub fn build_message(
    settings: &EmailSettings,
    to: &str,
    subject: &str,
    body: &str,
    attachment: Option<(&str, Vec<u8>)>,
) -> Result<Message, String> {
    let recipient = to
        .trim()
        .parse::<Mailbox>()
        .map_err(|err| format!("invalid recipient address: {err}"))?;
    let builder = Message::builder()
        .from(settings.from_mailbox()?)
        .to(recipient)
        .subject(subject.trim());
    let text = SinglePart::plain(body.to_string());
    let message = match attachment {
        Some((filename, bytes)) => {
            builder.multipart(MultiPart::mixed().singlepart(text).singlepart(
                Attachment::new(filename.to_string()).body(
                    bytes,
                    ContentType::parse("application/pdf").expect("static content type"),
                ),
            ))
        }
        None => builder.singlepart(text),
    };
    message.map_err(|err| format!("email build error: {err}"))
}

pub fn send(settings: &EmailSettings, message: &Message) -> Result<(), String> {
    settings.validate()?;
    let host = settings.smtp_host.trim();
    let builder = match settings.smtp_security.as_str() {
        "starttls" => {
            SmtpTransport::starttls_relay(host).map_err(|err| format!("SMTP error: {err}"))?
        }
        "tls" => SmtpTransport::relay(host).map_err(|err| format!("SMTP error: {err}"))?,
        _ => SmtpTransport::builder_dangerous(host),
    };
    let mut builder = builder
        .port(settings.smtp_port)
        .timeout(Some(Duration::from_secs(30)));
    if !settings.smtp_username.trim().is_empty() {
        let password = load_password(settings)?
            .ok_or_else(|| "SMTP password not set: save it in Ajustes > Email".to_string())?;
        builder = builder.credentials(Credentials::new(
            settings.smtp_username.trim().to_string(),
            password,
        ));
    }
    builder
        .build()
        .send(message)
        .map(|_| ())
        .map_err(|err| format!("SMTP send error: {err}"))
}

fn keyring_entry(settings: &EmailSettings) -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, &settings.keyring_account())
        .map_err(|err| format!("keyring error: {err}"))
}

pub fn store_password(settings: &EmailSettings, password: &str) -> Result<(), String> {
    if password.is_empty() {
        return Err("password is required".to_string());
    }
    keyring_entry(settings)?
        .set_password(password)
        .map_err(|err| format!("keyring error: {err}"))
}

pub fn load_password(settings: &EmailSettings) -> Result<Option<String>, String> {
    match keyring_entry(settings)?.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(err) => Err(format!("keyring error: {err}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn settings() -> EmailSettings {
        EmailSettings {
            smtp_host: "smtp.example.com".to_string(),
            smtp_port: 587,
            smtp_security: "starttls".to_string(),
            smtp_username: "facturas@example.com".to_string(),
            from_email: "facturas@example.com".to_string(),
            from_name: "Demo SL".to_string(),
        }
    }

    fn ctx() -> InvoiceMailContext<'static> {
        InvoiceMailContext {
            company_name: "Demo SL",
            customer_name: "Cliente",
            invoice_number: "A-42",
            issued_date: "19/10/2026",
            total: "1.431,00 €",
            due_date: Some("18/11/2026"),
        }
    }

    #[test]
    fn validates_settings() {
        assert!(settings().validate().is_ok());
        let mut bad = settings();
        bad.smtp_security = "ssl".to_string();
        assert!(bad.validate().is_err());
        let mut bad = settings();
        bad.from_email = "no-es-un-email".to_string();
        assert!(bad.validate().is_err());
        assert!(!EmailSettings::default().is_configured());
    }

    #[test]
    fn builds_invoice_message_with_pdf_attachment() {
        let message = build_message(
            &settings(),
            "cliente@example.org",
            &default_invoice_subject(&ctx()),
            &default_invoice_body(&ctx()),
            Some(("Factura-A-42.pdf", b"%PDF-1.4 fake".to_vec())),
        )
        .expect("message");
        let raw = String::from_utf8_lossy(&message.formatted()).to_string();
        assert!(raw.contains("To: cliente@example.org"));
        assert!(
            raw.contains("From: \"Demo SL\" <facturas@example.com>")
                || raw.contains("From: Demo SL <facturas@example.com>")
        );
        assert!(raw.contains("Subject: Factura A-42 de Demo SL"));
        assert!(raw.contains("Content-Type: application/pdf"));
        assert!(raw.contains("Factura-A-42.pdf"));
    }

    #[test]
    fn rejects_invalid_recipient() {
        assert!(build_message(&settings(), "sin-arroba", "s", "b", None).is_err());
    }

    #[test]
    fn reminder_mentions_outstanding_and_overdue_days() {
        let body = default_reminder_body(&ctx(), "500,00 €", 12);
        assert!(body.contains("500,00 €"));
        assert!(body.contains("hace 12 dia(s)"));
        assert!(default_reminder_subject(&ctx()).starts_with("Recordatorio de pago: factura A-42"));
    }
}

/// Prueba manual contra un SMTP local (no corre en CI):
///   python -m aiosmtpd -n -l 127.0.0.1:2525 &
///   CF_SMTP_TEST_PORT=2525 cargo test --lib smtp_roundtrip -- --ignored
#[cfg(test)]
mod smtp_integration {
    use super::*;

    #[test]
    #[ignore]
    fn smtp_roundtrip_against_local_server() {
        let port: u16 = std::env::var("CF_SMTP_TEST_PORT")
            .expect("CF_SMTP_TEST_PORT")
            .parse()
            .unwrap();
        let settings = EmailSettings {
            smtp_host: "127.0.0.1".to_string(),
            smtp_port: port,
            smtp_security: "none".to_string(),
            smtp_username: String::new(),
            from_email: "facturas@example.com".to_string(),
            from_name: "Demo SL".to_string(),
        };
        let message = build_message(
            &settings,
            "cliente@example.org",
            "Factura A-1 de Demo SL",
            "Adjunta.",
            Some(("Factura-A-1.pdf", b"%PDF-1.4 test".to_vec())),
        )
        .expect("message");
        send(&settings, &message).expect("send");
    }
}
