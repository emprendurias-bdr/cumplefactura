//! Cálculo de huellas y material canónico VERI*FACTU.
//!
//! Este módulo mantiene aisladas las reglas de encadenado SHA-256 de la
//! construcción del XML. Las funciones se reexportan desde `verifactu`.

use super::{aeat_date, format_invoice_number, money, registro_alta_invoice_type};
use crate::db::{InvoicePdfData, PreviousInvoiceLink};
use sha2::{Digest, Sha256};

pub fn calculate_invoice_registro_alta_hash(
    invoice: &InvoicePdfData,
    previous: Option<&PreviousInvoiceLink>,
) -> Result<String, String> {
    let number = invoice
        .number
        .ok_or_else(|| "VERI*FACTU hash requires an issued invoice number".to_string())?;
    let issued_at = invoice
        .issued_at
        .as_deref()
        .ok_or_else(|| "VERI*FACTU hash requires issued_at".to_string())?;
    calculate_issued_invoice_registro_alta_hash_with_type(
        &invoice.company_tax_id,
        &invoice.series,
        number,
        issued_at,
        invoice.tax_cents,
        invoice.total_cents,
        registro_alta_invoice_type(invoice)?,
        previous.map(|item| item.fiscal_hash.as_str()),
    )
}

/// Huella Alta para factura ya emitida (tipo de factura inferido del kind).
#[allow(dead_code)]
pub fn calculate_issued_invoice_registro_alta_hash(
    issuer_tax_id: &str,
    series: &str,
    number: i64,
    issued_at: &str,
    tax_cents: i64,
    total_cents: i64,
    previous_hash: Option<&str>,
) -> Result<String, String> {
    calculate_issued_invoice_registro_alta_hash_with_type(
        issuer_tax_id,
        series,
        number,
        issued_at,
        tax_cents,
        total_cents,
        "F1",
        previous_hash,
    )
}

/// Igual que issued, forzando el `TipoFactura` AEAT explÃ­cito.
pub fn calculate_issued_invoice_registro_alta_hash_with_type(
    issuer_tax_id: &str,
    series: &str,
    number: i64,
    issued_at: &str,
    tax_cents: i64,
    total_cents: i64,
    invoice_type: &str,
    previous_hash: Option<&str>,
) -> Result<String, String> {
    let expedition_date = aeat_date(issued_at)?;
    Ok(calculate_registro_alta_hash(
        issuer_tax_id,
        &format_invoice_number(series, number),
        &expedition_date,
        invoice_type,
        &money(tax_cents),
        &money(total_cents),
        previous_hash,
        issued_at,
    ))
}

/// SHA-256 del material canÃ³nico de RegistroAlta (nÃºcleo del encadenado).
pub fn calculate_registro_alta_hash(
    issuer_tax_id: &str,
    invoice_number: &str,
    expedition_date: &str,
    invoice_type: &str,
    tax_total: &str,
    invoice_total: &str,
    previous_hash: Option<&str>,
    generated_at: &str,
) -> String {
    let material = registro_alta_hash_material(
        issuer_tax_id,
        invoice_number,
        expedition_date,
        invoice_type,
        tax_total,
        invoice_total,
        previous_hash,
        generated_at,
    );
    let digest = Sha256::digest(material.as_bytes());
    hex::encode(digest).to_uppercase()
}

/// Huella AnulaciÃ³n desde factura + previo.
pub fn calculate_invoice_registro_anulacion_hash(
    invoice: &InvoicePdfData,
    previous_hash: &str,
    generated_at: &str,
) -> Result<String, String> {
    let number = invoice
        .number
        .ok_or_else(|| "VERI*FACTU anulacion hash requires an issued invoice number".to_string())?;
    let issued_at = invoice
        .issued_at
        .as_deref()
        .ok_or_else(|| "VERI*FACTU anulacion hash requires issued_at".to_string())?;
    calculate_issued_invoice_registro_anulacion_hash(
        &invoice.company_tax_id,
        &invoice.series,
        number,
        issued_at,
        previous_hash,
        generated_at,
    )
}

/// Huella AnulaciÃ³n para factura emitida.
pub fn calculate_issued_invoice_registro_anulacion_hash(
    issuer_tax_id: &str,
    series: &str,
    number: i64,
    issued_at: &str,
    previous_hash: &str,
    generated_at: &str,
) -> Result<String, String> {
    let expedition_date = aeat_date(issued_at)?;
    Ok(calculate_registro_anulacion_hash(
        issuer_tax_id,
        &format_invoice_number(series, number),
        &expedition_date,
        previous_hash,
        generated_at,
    ))
}

/// SHA-256 del material canÃ³nico de RegistroAnulacion.
pub fn calculate_registro_anulacion_hash(
    issuer_tax_id: &str,
    invoice_number: &str,
    expedition_date: &str,
    previous_hash: &str,
    generated_at: &str,
) -> String {
    let material = registro_anulacion_hash_material(
        issuer_tax_id,
        invoice_number,
        expedition_date,
        previous_hash,
        generated_at,
    );
    let digest = Sha256::digest(material.as_bytes());
    hex::encode(digest).to_uppercase()
}

/// Cadena canÃ³nica (campos ordenados) que se hashea en anulaciÃ³n.
pub fn registro_anulacion_hash_material(
    issuer_tax_id: &str,
    invoice_number: &str,
    expedition_date: &str,
    previous_hash: &str,
    generated_at: &str,
) -> String {
    format!(
        "IDEmisorFacturaAnulada={}&NumSerieFacturaAnulada={}&FechaExpedicionFacturaAnulada={}&Huella={}&FechaHoraHusoGenRegistro={}",
        issuer_tax_id.trim(),
        invoice_number.trim(),
        expedition_date.trim(),
        previous_hash.trim().to_uppercase(),
        generated_at.trim()
    )
}

/// Cadena canÃ³nica (campos ordenados) que se hashea en alta.
pub fn registro_alta_hash_material(
    issuer_tax_id: &str,
    invoice_number: &str,
    expedition_date: &str,
    invoice_type: &str,
    tax_total: &str,
    invoice_total: &str,
    previous_hash: Option<&str>,
    generated_at: &str,
) -> String {
    format!(
        "IDEmisorFactura={}&NumSerieFactura={}&FechaExpedicionFactura={}&TipoFactura={}&CuotaTotal={}&ImporteTotal={}&Huella={}&FechaHoraHusoGenRegistro={}",
        issuer_tax_id.trim(),
        invoice_number.trim(),
        expedition_date.trim(),
        invoice_type.trim(),
        tax_total.trim(),
        invoice_total.trim(),
        previous_hash.unwrap_or("").trim().to_uppercase(),
        generated_at.trim()
    )
}
