//! Generación mínima de PDF de factura (Helvetica Type1 WinAnsi, sin plantillas externas).
//!
//! Salida local para el usuario; no es el artefacto fiscal (huella/XML viven aparte).
//! Presupuestos, proformas y albaranes salen sin QR ni huella y con «Documento sin valor fiscal».
//! Las facturas emitidas llevan arriba a la derecha el QR tributario VERI*FACTU
//! (35 mm, dibujado como rectángulos vectoriales) y la leyenda obligatoria
//! (`qr::VERIFACTU_LEGEND`). Los borradores no llevan QR.

use crate::db::{CommercialDocumentPdfData, InvoicePdfData};
use crate::services::qr::{self, QrEnvironment, VERIFACTU_LEGEND};
use std::fs;
use std::path::PathBuf;

/// Lado del QR: 35 mm en puntos PDF.
const QR_SIZE: f64 = 99.2;
/// Margen derecho y superior del QR (A4 = 595 x 842 pt).
const QR_RIGHT: f64 = 545.0;
const QR_TOP: f64 = 800.0;

/// Escribe un PDF A4 nuevo con cabecera, líneas, totales y huella fiscal (si existe).
pub fn write_invoice_pdf(
    target_path: &str,
    invoice: &InvoicePdfData,
    qr_environment: QrEnvironment,
) -> Result<(), String> {
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

    // Emitida = tiene número y fecha; un borrador no tiene nada que cotejar.
    if invoice.number.is_some() && invoice.issued_at.is_some() {
        let matrix = qr::qr_matrix(&qr::verifactu_qr_url(invoice, qr_environment)?)?;
        let x = QR_RIGHT - QR_SIZE;
        let y = QR_TOP - QR_SIZE;
        push_qr(&mut content, x, y, &matrix);
        content.push_str(&format!(
            "BT\n/F1 6.5 Tf\n{:.2} {:.2} Td\n({}) Tj\n",
            QR_RIGHT - 172.0,
            y - 8.0,
            escape(VERIFACTU_LEGEND)
        ));
        if qr_environment == QrEnvironment::Test {
            content.push_str("0 -9 Td\n(Entorno de pruebas AEAT) Tj\n");
        }
        content.push_str("ET\n");
    }

    let pdf = build_pdf(&content);
    fs::write(path, pdf).map_err(|err| format!("PDF write error: {err}"))
}

/// PDF de presupuesto, proforma o albarán. Devuelve el SHA-256 del fichero escrito.
pub fn write_commercial_document_pdf(
    target_path: &str,
    data: &CommercialDocumentPdfData,
) -> Result<String, String> {
    let path = PathBuf::from(target_path);
    if path.exists() {
        return Err("target PDF already exists".to_string());
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| format!("PDF directory error: {err}"))?;
    }

    let doc = &data.document.header;
    let number = doc.display_number.as_deref().unwrap_or("borrador");
    let mut content = String::from("BT\n50 790 Td\n");
    let title = match doc.kind.as_str() {
        "proforma" => {
            // La proforma lo dice en grande en la cabecera; el número va debajo.
            content.push_str(&format!(
                "/F1 20 Tf\n({}) Tj\n/F1 12 Tf\n0 -22 Td\n",
                escape("Factura proforma · sin valor fiscal")
            ));
            number.to_string()
        }
        "quote" => format!("Presupuesto {number}"),
        _ => format!("Albarán {number}"),
    };
    if doc.kind != "proforma" {
        content.push_str("/F1 16 Tf\n");
    }
    content.push_str(&format!("({}) Tj\n", escape(&title)));
    content.push_str("/F1 12 Tf\n0 -20 Td\n(Documento sin valor fiscal) Tj\n/F1 10 Tf\n");
    let mut text = vec![
        format!(
            "Emisor: {} - {}",
            data.company_legal_name, data.company_tax_id
        ),
        format!(
            "Cliente: {} - {}",
            data.customer_display_name, data.customer_tax_id
        ),
        format!("Fecha: {}   Estado: {}", doc.issue_date, doc.status),
    ];
    if let Some(valid_until) = &doc.valid_until {
        text.push(format!("Válido hasta: {valid_until}"));
    }
    if let Some(delivery_date) = &doc.delivery_date {
        text.push(format!("Fecha de entrega: {delivery_date}"));
    }
    text.push(String::new());
    text.push("Líneas".to_string());
    for item in &data.document.lines {
        let line = &item.line;
        text.push(if doc.show_prices {
            format!(
                "{} x{}  PVP {}  Dto {}%  IVA {}%",
                line.description,
                line.quantity,
                cents(line.unit_price_cents),
                line.discount_rate_basis_points.unwrap_or(0) as f64 / 100.0,
                line.tax_rate_basis_points as f64 / 100.0,
            )
        } else {
            format!("{} x{}", line.description, line.quantity)
        });
    }
    if doc.show_prices {
        text.push(String::new());
        text.push(format!(
            "Base: {}   IVA: {}   IRPF: {}   Total: {}",
            cents(doc.taxable_base_cents),
            cents(doc.tax_cents),
            cents(doc.withholding_cents),
            cents(doc.total_cents)
        ));
    }
    if !doc.notes.trim().is_empty() {
        text.push(String::new());
        text.push(format!("Notas: {}", doc.notes.trim()));
    }
    for line in text {
        content.push_str(&format!("0 -16 Td\n({}) Tj\n", escape(&line)));
    }
    content.push_str("ET\n");

    let pdf = build_pdf(&content);
    fs::write(path, &pdf).map_err(|err| format!("PDF write error: {err}"))?;
    Ok(fiscal_contract::sha256_hex(&pdf))
}

/// Módulos oscuros del QR como rectángulos negros; (x, y) es la esquina inferior izquierda.
fn push_qr(content: &mut String, x: f64, y: f64, matrix: &[Vec<bool>]) {
    // Zona de silencio de 4 módulos por lado (ISO/IEC 18004).
    let cell = QR_SIZE / (matrix.len() as f64 + 8.0);
    content.push_str("0 g\n");
    for (row, modules) in matrix.iter().enumerate() {
        for (col, dark) in modules.iter().enumerate() {
            if *dark {
                let cx = x + (col as f64 + 4.0) * cell;
                let cy = y + QR_SIZE - (row as f64 + 5.0) * cell;
                content.push_str(&format!("{cx:.3} {cy:.3} {cell:.3} {cell:.3} re\n"));
            }
        }
    }
    content.push_str("f\n");
}

/// Ensambla objetos PDF 1.4 (Catalog/Pages/Page/Font/Contents) alrededor del stream de texto.
fn build_pdf(content: &str) -> Vec<u8> {
    let objects = ["<< /Type /Catalog /Pages 2 0 R >>".to_string(),
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>".to_string(),
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>".to_string(),
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>".to_string(),
        format!("<< /Length {} >>\nstream\n{}endstream", content.len(), content)];

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

/// Escapa `( ) \` para literales PDF; acentos y `·` en octal WinAnsi (Latin-1), el resto `?`.
fn escape(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for ch in value.chars() {
        match ch {
            '\\' | '(' | ')' => {
                out.push('\\');
                out.push(ch);
            }
            ' '..='~' => out.push(ch),
            '\u{a0}'..='\u{ff}' => out.push_str(&format!("\\{:03o}", ch as u32)),
            '\u{20ac}' => out.push_str("\\200"),
            _ => out.push('?'),
        }
    }
    out
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

        write_invoice_pdf(&target_str, &invoice, QrEnvironment::Test).expect("pdf");
        let bytes = std::fs::read(&target).expect("read pdf");
        assert!(bytes.starts_with(b"%PDF-1.4"));
        let text = String::from_utf8(bytes).expect("ASCII PDF");
        assert!(text.contains("(Factura verificable en la sede electr\\363nica de la AEAT) Tj"));
        assert!(text.contains("(Entorno de pruebas AEAT) Tj"));
        assert!(text.matches(" re\n").count() > 100, "QR modules drawn");
        std::fs::remove_file(&target).expect("cleanup");

        let mut draft = invoice;
        draft.number = None;
        draft.issued_at = None;
        draft.status = "Draft".to_string();
        draft.fiscal_hash = None;
        write_invoice_pdf(&target_str, &draft, QrEnvironment::Production).expect("draft pdf");
        let text = std::fs::read_to_string(&target).expect("read draft pdf");
        assert!(
            !text.contains("Factura verificable"),
            "drafts have no QR legend"
        );
        assert!(!text.contains(" re\n"), "drafts have no QR modules");
        std::fs::remove_file(target).expect("cleanup");
    }

    #[test]
    fn escapes_pdf_literals_as_winansi() {
        assert_eq!(escape("a(b)\\"), "a\\(b\\)\\\\");
        assert_eq!(escape("Ñandú €"), "\\321and\\372 \\200");
    }
}
