//! Generación mínima de PDF de factura (Helvetica Type1, sin plantillas externas).
//!
//! Salida local para el usuario; no es el artefacto fiscal (huella/XML viven aparte).

use crate::db::InvoicePdfData;
use std::fs;
use std::path::PathBuf;

/// Escribe un PDF A4 nuevo con cabecera, líneas, totales y huella fiscal (si existe).
pub fn write_invoice_pdf(target_path: &str, invoice: &InvoicePdfData) -> Result<(), String> {
    let path = PathBuf::from(target_path);
    if path.exists() {
        return Err("target PDF already exists".to_string());
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| format!("PDF directory error: {err}"))?;
    }

    let mut content = String::new();
    content.push_str("BT\n/F1 16 Tf\n50 790 Td\n");
    content.push_str(&format!("({}) Tj\n", escape(&invoice.title())));
    content.push_str("/F1 10 Tf\n0 -24 Td\n");
    content.push_str(&format!(
        "(Emisor: {} - {}) Tj\n",
        escape(&invoice.company_legal_name),
        escape(&invoice.company_tax_id)
    ));
    content.push_str("0 -16 Td\n");
    content.push_str(&format!(
        "(Cliente: {} - {}) Tj\n",
        escape(&invoice.customer_display_name),
        escape(&invoice.customer_tax_id)
    ));
    content.push_str("0 -16 Td\n");
    content.push_str(&format!(
        "(Estado: {}   Fecha: {}) Tj\n",
        escape(&invoice.status),
        escape(invoice.issued_at.as_deref().unwrap_or("sin emitir"))
    ));
    content.push_str("0 -16 Td\n");
    content.push_str(&format!("(ID interno: {}) Tj\n", escape(&invoice.id)));
    content.push_str("0 -28 Td\n");
    content.push_str("(Lineas) Tj\n");

    for line in &invoice.lines {
        content.push_str("0 -16 Td\n");
        content.push_str(&format!(
            "({} x{}  PVP {}  Dto {}%  Base {}  IVA {}) Tj\n",
            escape(&line.description),
            line.quantity,
            cents(line.unit_price_cents),
            line.discount_rate_basis_points as f64 / 100.0,
            cents(line.taxable_base_cents),
            cents(line.tax_cents),
        ));
    }

    content.push_str("0 -28 Td\n");
    content.push_str(&format!(
        "(Base: {}   IVA: {}   Total: {}) Tj\n",
        cents(invoice.taxable_base_cents),
        cents(invoice.tax_cents),
        cents(invoice.total_cents)
    ));
    content.push_str("0 -16 Td\n");
    content.push_str(&format!(
        "(Huella fiscal: {}) Tj\n",
        escape(invoice.fiscal_hash.as_deref().unwrap_or("pendiente"))
    ));
    content.push_str("ET\n");

    let pdf = build_pdf(&content);
    fs::write(path, pdf).map_err(|err| format!("PDF write error: {err}"))
}

/// Ensambla objetos PDF 1.4 (Catalog/Pages/Page/Font/Contents) alrededor del stream de texto.
fn build_pdf(content: &str) -> Vec<u8> {
    let objects = vec![
        "<< /Type /Catalog /Pages 2 0 R >>".to_string(),
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>".to_string(),
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>".to_string(),
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>".to_string(),
        format!("<< /Length {} >>\nstream\n{}endstream", content.as_bytes().len(), content),
    ];

    let mut bytes = Vec::new();
    bytes.extend_from_slice(b"%PDF-1.4\n");
    let mut offsets = vec![0usize];
    for (index, object) in objects.iter().enumerate() {
        offsets.push(bytes.len());
        bytes.extend_from_slice(format!("{} 0 obj\n{}\nendobj\n", index + 1, object).as_bytes());
    }
    let startxref = bytes.len();
    bytes.extend_from_slice(format!("xref\n0 {}\n", objects.len() + 1).as_bytes());
    bytes.extend_from_slice(b"0000000000 65535 f \n");
    for offset in offsets.iter().skip(1) {
        bytes.extend_from_slice(format!("{offset:010} 00000 n \n").as_bytes());
    }
    bytes.extend_from_slice(
        format!(
            "trailer << /Size {} /Root 1 0 R >>\nstartxref\n{}\n%%EOF\n",
            objects.len() + 1,
            startxref
        )
        .as_bytes(),
    );
    bytes
}

/// Escapa `( ) \` para literales PDF.
fn escape(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('(', "\\(")
        .replace(')', "\\)")
}

/// Formatea céntimos como importe decimal con 2 decimales.
fn cents(value: i64) -> String {
    format!("{:.2} EUR", value as f64 / 100.0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{InvoicePdfData, InvoicePdfLine};

    #[test]
    fn writes_minimal_pdf() {
        let target =
            std::env::temp_dir().join(format!("cumplefactura-test-{}.pdf", uuid::Uuid::new_v4()));
        let target_str = target.to_str().expect("utf8 target").to_string();
        let invoice = InvoicePdfData {
            id: "i1".to_string(),
            company_id: "c1".to_string(),
            company_legal_name: "Demo SL".to_string(),
            company_tax_id: "B00000000".to_string(),
            customer_display_name: "Cliente".to_string(),
            customer_tax_id: "00000000T".to_string(),
            fiscal_year: 2026,
            series: "A".to_string(),
            number: Some(1),
            kind: "Complete".to_string(),
            status: "Issued".to_string(),
            rectifies_invoice_id: None,
            rectification_reason_code: None,
            rectification_method: None,
            taxable_base_cents: 10_000,
            tax_cents: 2_100,
            total_cents: 12_100,
            fiscal_hash: Some("hash".to_string()),
            issued_at: Some("2026-05-28T00:00:00Z".to_string()),
            lines: vec![InvoicePdfLine {
                description: "Servicio".to_string(),
                quantity: 1,
                unit_price_cents: 10_000,
                discount_rate_basis_points: 0,
                tax_rate_basis_points: 2_100,
                taxable_base_cents: 10_000,
                tax_cents: 2_100,
            }],
            rectified_invoice: None,
        };

        write_invoice_pdf(&target_str, &invoice).expect("pdf");
        let bytes = std::fs::read(&target).expect("read pdf");
        assert!(bytes.starts_with(b"%PDF-1.4"));
        std::fs::remove_file(target).expect("cleanup");
    }
}
