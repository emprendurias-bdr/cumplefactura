//! PDF de factura generado sin dependencias: texto Helvetica (WinAnsi) y graficos vectoriales.
//!
//! Incluye el QR tributario VERI*FACTU al inicio de la factura (35 mm, nivel M)
//! cuando la factura esta emitida. Los borradores se marcan como tales y no llevan QR.

use crate::db::InvoicePdfData;
use crate::services::qr::{self, QrEnvironment, VERIFACTU_LEGEND};
use std::fs;
use std::path::PathBuf;

const PAGE_W: f64 = 595.0;
const PAGE_H: f64 = 842.0;
const MARGIN: f64 = 48.0;
const QR_SIZE: f64 = 99.2; // 35 mm
const ACCENT: (f64, f64, f64) = (0.275, 0.341, 0.490); // azul fiscal RSA #46577D
const LINES_FIRST_PAGE: usize = 22;
const LINES_NEXT_PAGES: usize = 38;

#[derive(Clone, Copy)]
enum Font {
    Regular,
    Bold,
}

/// Operaciones de dibujo de una pagina (content stream PDF).
struct Canvas {
    ops: Vec<u8>,
}

impl Canvas {
    fn new() -> Self {
        Self { ops: Vec::new() }
    }

    fn raw(&mut self, value: &str) {
        self.ops.extend_from_slice(value.as_bytes());
    }

    fn text(&mut self, x: f64, y: f64, font: Font, size: f64, value: &str) {
        let name = match font {
            Font::Regular => "F1",
            Font::Bold => "F2",
        };
        self.raw(&format!("BT /{name} {size:.1} Tf {x:.2} {y:.2} Td ("));
        self.ops.extend_from_slice(&pdf_string(value));
        self.raw(") Tj ET\n");
    }

    fn text_right(&mut self, right: f64, y: f64, font: Font, size: f64, value: &str) {
        let width = text_width(value, font, size);
        self.text(right - width, y, font, size, value);
    }

    fn fill_rect(&mut self, x: f64, y: f64, w: f64, h: f64, rgb: (f64, f64, f64)) {
        self.raw(&format!(
            "{:.3} {:.3} {:.3} rg {x:.2} {y:.2} {w:.2} {h:.2} re f 0 g\n",
            rgb.0, rgb.1, rgb.2
        ));
    }

    fn hline(&mut self, x1: f64, x2: f64, y: f64, width: f64, rgb: (f64, f64, f64)) {
        self.raw(&format!(
            "{:.3} {:.3} {:.3} RG {width:.2} w {x1:.2} {y:.2} m {x2:.2} {y:.2} l S 0 G\n",
            rgb.0, rgb.1, rgb.2
        ));
    }

    /// Dibuja la matriz QR como modulos negros; (x, y) es la esquina inferior izquierda.
    fn qr(&mut self, x: f64, y: f64, size: f64, matrix: &[Vec<bool>]) {
        let quiet = 4.0; // zona de silencio de 4 modulos
        let modules = matrix.len() as f64 + quiet * 2.0;
        let cell = size / modules;
        self.raw("0 g\n");
        for (row_index, row) in matrix.iter().enumerate() {
            for (col_index, dark) in row.iter().enumerate() {
                if *dark {
                    let cx = x + (col_index as f64 + quiet) * cell;
                    let cy = y + size - (row_index as f64 + quiet + 1.0) * cell;
                    self.raw(&format!("{cx:.3} {cy:.3} {cell:.3} {cell:.3} re\n"));
                }
            }
        }
        self.raw("f\n");
    }
}

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
    let bytes = render_invoice_pdf(invoice, qr_environment)?;
    fs::write(path, bytes).map_err(|err| format!("PDF write error: {err}"))
}

/// PDF en memoria (para adjuntar por email sin ficheros temporales).
pub fn render_invoice_pdf(
    invoice: &InvoicePdfData,
    qr_environment: QrEnvironment,
) -> Result<Vec<u8>, String> {
    Ok(build_pdf(&render_invoice_pages(invoice, qr_environment)?))
}

fn render_invoice_pages(
    invoice: &InvoicePdfData,
    env: QrEnvironment,
) -> Result<Vec<Vec<u8>>, String> {
    let issued = invoice.number.is_some() && invoice.issued_at.is_some();
    let qr_matrix = if issued {
        Some(qr::qr_matrix(&qr::verifactu_qr_url(invoice, env)?)?)
    } else {
        None
    };

    let mut pages = Vec::new();
    let mut canvas = Canvas::new();
    let right = PAGE_W - MARGIN;

    // Cabecera: emisor a la izquierda, QR tributario a la derecha (al inicio de la factura).
    let top = PAGE_H - MARGIN;
    canvas.fill_rect(MARGIN, top - 3.0, 36.0, 3.0, ACCENT);
    canvas.text(
        MARGIN,
        top - 24.0,
        Font::Bold,
        15.0,
        &invoice.company_legal_name,
    );
    canvas.text(
        MARGIN,
        top - 40.0,
        Font::Regular,
        9.5,
        &format!("NIF {}", invoice.company_tax_id),
    );

    if let Some(matrix) = &qr_matrix {
        let qr_x = right - QR_SIZE;
        let qr_y = top - QR_SIZE - 12.0;
        canvas.text(qr_x, top - 6.0, Font::Bold, 7.5, "QR tributario:");
        canvas.qr(qr_x, qr_y, QR_SIZE, matrix);
        canvas.text_right(right, qr_y - 10.0, Font::Regular, 6.5, VERIFACTU_LEGEND);
        if env == QrEnvironment::Test {
            canvas.text_right(
                right,
                qr_y - 19.0,
                Font::Bold,
                6.5,
                "Entorno de pruebas AEAT",
            );
        }
    }

    // Titulo y datos del documento.
    let title_y = top - 84.0;
    let doc_kind = match (issued, invoice.rectifies_invoice_id.is_some()) {
        (false, _) => "BORRADOR",
        (true, true) => "FACTURA RECTIFICATIVA",
        (true, false) => "FACTURA",
    };
    canvas.text(MARGIN, title_y, Font::Bold, 20.0, doc_kind);
    let number = match invoice.number {
        Some(n) => format!("{}-{}", invoice.series, n),
        None => format!("{} (sin numerar)", invoice.series),
    };
    canvas.text(
        MARGIN,
        title_y - 18.0,
        Font::Regular,
        10.0,
        &format!("Número: {number}"),
    );
    canvas.text(
        MARGIN,
        title_y - 32.0,
        Font::Regular,
        10.0,
        &format!(
            "Fecha de expedición: {}",
            display_date(invoice.issued_at.as_deref())
        ),
    );
    if let Some(link) = &invoice.rectified_invoice {
        canvas.text(
            MARGIN,
            title_y - 46.0,
            Font::Regular,
            9.0,
            &format!(
                "Rectifica a: {}-{}  Causa {}  Método {}",
                link.series,
                link.number,
                invoice.rectification_reason_code.as_deref().unwrap_or("-"),
                invoice.rectification_method.as_deref().unwrap_or("-")
            ),
        );
    }

    // Cliente.
    let client_y = title_y - 72.0;
    canvas.fill_rect(
        MARGIN,
        client_y - 34.0,
        right - MARGIN,
        46.0,
        (0.957, 0.965, 0.941),
    );
    canvas.text(MARGIN + 10.0, client_y, Font::Bold, 7.5, "CLIENTE");
    canvas.text(
        MARGIN + 10.0,
        client_y - 14.0,
        Font::Bold,
        10.5,
        &invoice.customer_display_name,
    );
    canvas.text(
        MARGIN + 10.0,
        client_y - 27.0,
        Font::Regular,
        9.0,
        &format!("NIF {}", invoice.customer_tax_id),
    );

    // Tabla de lineas (pagina 1 y siguientes).
    let mut y = client_y - 62.0;
    let mut remaining: Vec<_> = invoice.lines.iter().collect();
    let mut capacity = LINES_FIRST_PAGE;
    loop {
        table_header(&mut canvas, y);
        y -= 18.0;
        let take = remaining.len().min(capacity);
        for line in remaining.drain(..take) {
            let description = truncate_to_width(&line.description, Font::Regular, 8.5, 210.0);
            canvas.text(MARGIN + 6.0, y, Font::Regular, 8.5, &description);
            canvas.text_right(
                MARGIN + 262.0,
                y,
                Font::Regular,
                8.5,
                &line.quantity.to_string(),
            );
            canvas.text_right(
                MARGIN + 322.0,
                y,
                Font::Regular,
                8.5,
                &es_money(line.unit_price_cents),
            );
            canvas.text_right(
                MARGIN + 362.0,
                y,
                Font::Regular,
                8.5,
                &percent(line.discount_rate_basis_points),
            );
            canvas.text_right(
                MARGIN + 422.0,
                y,
                Font::Regular,
                8.5,
                &es_money(line.taxable_base_cents),
            );
            canvas.text_right(
                MARGIN + 445.0,
                y,
                Font::Regular,
                8.5,
                &percent(line.tax_rate_basis_points),
            );
            canvas.text_right(
                right - 6.0,
                y,
                Font::Regular,
                8.5,
                &es_money(line.tax_cents),
            );
            canvas.hline(MARGIN, right, y - 5.0, 0.4, (0.86, 0.88, 0.85));
            y -= 16.0;
        }
        if remaining.is_empty() {
            break;
        }
        footer(&mut canvas, invoice, pages.len() + 1);
        pages.push(std::mem::replace(&mut canvas, Canvas::new()).ops);
        y = PAGE_H - MARGIN - 10.0;
        capacity = LINES_NEXT_PAGES;
    }

    // Totales.
    let box_x = right - 200.0;
    let mut ty = y - 14.0;
    let withholding = invoice.taxable_base_cents + invoice.tax_cents - invoice.total_cents;
    let mut rows = vec![
        ("Base imponible", es_money(invoice.taxable_base_cents)),
        ("Cuota IVA", es_money(invoice.tax_cents)),
    ];
    if withholding != 0 {
        rows.push(("Retención IRPF", format!("-{}", es_money(withholding))));
    }
    for (label, value) in rows {
        canvas.text(box_x, ty, Font::Regular, 9.5, label);
        canvas.text_right(right, ty, Font::Regular, 9.5, &value);
        ty -= 15.0;
    }
    ty -= 8.0;
    canvas.fill_rect(box_x - 8.0, ty - 8.0, right - box_x + 8.0, 24.0, ACCENT);
    canvas.raw("1 g\n");
    canvas.text(box_x, ty, Font::Bold, 11.0, "TOTAL");
    canvas.text_right(
        right - 6.0,
        ty,
        Font::Bold,
        11.0,
        &es_money(invoice.total_cents),
    );
    canvas.raw("0 g\n");

    footer(&mut canvas, invoice, pages.len() + 1);
    pages.push(canvas.ops);
    Ok(pages)
}

fn table_header(canvas: &mut Canvas, y: f64) {
    let right = PAGE_W - MARGIN;
    canvas.fill_rect(MARGIN, y - 6.0, right - MARGIN, 18.0, (0.957, 0.965, 0.941));
    canvas.text(MARGIN + 6.0, y, Font::Bold, 7.5, "DESCRIPCIÓN");
    canvas.text_right(MARGIN + 262.0, y, Font::Bold, 7.5, "CANT.");
    canvas.text_right(MARGIN + 322.0, y, Font::Bold, 7.5, "PRECIO");
    canvas.text_right(MARGIN + 362.0, y, Font::Bold, 7.5, "DTO");
    canvas.text_right(MARGIN + 422.0, y, Font::Bold, 7.5, "BASE");
    canvas.text_right(MARGIN + 445.0, y, Font::Bold, 7.5, "IVA");
    canvas.text_right(right - 6.0, y, Font::Bold, 7.5, "CUOTA");
}

fn footer(canvas: &mut Canvas, invoice: &InvoicePdfData, page: usize) {
    let right = PAGE_W - MARGIN;
    canvas.hline(MARGIN, right, MARGIN + 22.0, 0.5, (0.80, 0.82, 0.79));
    canvas.text(
        MARGIN,
        MARGIN + 10.0,
        Font::Regular,
        7.0,
        &format!(
            "Huella: {}",
            invoice
                .fiscal_hash
                .as_deref()
                .unwrap_or("pendiente de emision")
        ),
    );
    canvas.text(
        MARGIN,
        MARGIN,
        Font::Regular,
        7.0,
        &format!("ID interno: {}", invoice.id),
    );
    canvas.text_right(
        right,
        MARGIN,
        Font::Regular,
        7.0,
        &format!("Generado con CumpleFactura · pág. {page}"),
    );
}

fn build_pdf(pages: &[Vec<u8>]) -> Vec<u8> {
    // Objetos: 1 catalogo, 2 paginas, 3 Helvetica, 4 Helvetica-Bold, luego (pagina, contenido) por pagina.
    let page_count = pages.len();
    let kids: Vec<String> = (0..page_count)
        .map(|i| format!("{} 0 R", 5 + i * 2))
        .collect();
    let mut objects: Vec<Vec<u8>> = vec![
        b"<< /Type /Catalog /Pages 2 0 R >>".to_vec(),
        format!(
            "<< /Type /Pages /Kids [{}] /Count {page_count} >>",
            kids.join(" ")
        )
        .into_bytes(),
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"
            .to_vec(),
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"
            .to_vec(),
    ];
    for (index, content) in pages.iter().enumerate() {
        let content_id = 6 + index * 2;
        objects.push(
            format!(
                "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {PAGE_W} {PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents {content_id} 0 R >>"
            )
            .into_bytes(),
        );
        let mut stream = format!("<< /Length {} >>\nstream\n", content.len()).into_bytes();
        stream.extend_from_slice(content);
        stream.extend_from_slice(b"endstream");
        objects.push(stream);
    }

    let mut bytes = Vec::new();
    bytes.extend_from_slice(b"%PDF-1.4\n");
    let mut offsets = Vec::with_capacity(objects.len());
    for (index, object) in objects.iter().enumerate() {
        offsets.push(bytes.len());
        bytes.extend_from_slice(format!("{} 0 obj\n", index + 1).as_bytes());
        bytes.extend_from_slice(object);
        bytes.extend_from_slice(b"\nendobj\n");
    }
    let startxref = bytes.len();
    bytes.extend_from_slice(format!("xref\n0 {}\n", objects.len() + 1).as_bytes());
    bytes.extend_from_slice(b"0000000000 65535 f \n");
    for offset in offsets {
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

/// Texto -> bytes WinAnsi (cp1252) escapados para un literal de cadena PDF.
fn pdf_string(value: &str) -> Vec<u8> {
    let mut out = Vec::with_capacity(value.len());
    for ch in value.chars() {
        let byte = match ch {
            '€' => 0x80,
            '\u{20}'..='\u{7e}' | '\u{a0}'..='\u{ff}' => ch as u32 as u8,
            _ => b'?',
        };
        if matches!(byte, b'\\' | b'(' | b')') {
            out.push(b'\\');
        }
        out.push(byte);
    }
    out
}

/// Ancho aproximado con metricas AFM de Helvetica (suficiente para alinear importes).
fn text_width(value: &str, font: Font, size: f64) -> f64 {
    let units: f64 = value.chars().map(helvetica_width).sum();
    let factor = match font {
        Font::Regular => 1.0,
        Font::Bold => 1.05,
    };
    units * size / 1000.0 * factor
}

fn helvetica_width(ch: char) -> f64 {
    match ch {
        ' ' | '!' | ',' | '.' | '/' | ':' | ';' | '[' | ']' | '\\' | 'f' | 't' | 'I' => 278.0,
        'i' | 'j' | 'l' => 222.0,
        '(' | ')' | '-' | 'r' | '`' => 333.0,
        '0'..='9'
        | '$'
        | '#'
        | '?'
        | '_'
        | 'a'
        | 'b'
        | 'd'
        | 'e'
        | 'g'
        | 'h'
        | 'n'
        | 'o'
        | 'p'
        | 'q'
        | 'u'
        | 'L'
        | '€' => 556.0,
        'c' | 'k' | 's' | 'v' | 'x' | 'y' | 'z' | 'J' => 500.0,
        'm' | 'M' => 833.0,
        'w' | 'C' | 'D' | 'H' | 'N' | 'R' | 'U' => 722.0,
        'G' | 'O' | 'Q' => 778.0,
        'W' => 944.0,
        '%' => 889.0,
        'F' | 'T' | 'Z' => 611.0,
        '+' | '<' | '=' | '>' | '~' => 584.0,
        _ => 667.0,
    }
}

fn truncate_to_width(value: &str, font: Font, size: f64, max: f64) -> String {
    if text_width(value, font, size) <= max {
        return value.to_string();
    }
    let mut out = String::new();
    for ch in value.chars() {
        if text_width(&format!("{out}{ch}..."), font, size) > max {
            break;
        }
        out.push(ch);
    }
    format!("{out}...")
}

/// Importe en formato espanol: 1.234,56 €
pub(crate) fn es_money(cents: i64) -> String {
    let sign = if cents < 0 { "-" } else { "" };
    let abs = cents.unsigned_abs();
    let units = (abs / 100).to_string();
    let mut grouped = String::new();
    for (index, ch) in units.chars().enumerate() {
        if index > 0 && (units.len() - index) % 3 == 0 {
            grouped.push('.');
        }
        grouped.push(ch);
    }
    format!("{sign}{grouped},{:02} €", abs % 100)
}

fn percent(basis_points: i64) -> String {
    if basis_points % 100 == 0 {
        format!("{}%", basis_points / 100)
    } else {
        format!("{},{:02}%", basis_points / 100, (basis_points % 100).abs())
    }
}

fn display_date(issued_at: Option<&str>) -> String {
    issued_at
        .and_then(|value| chrono::DateTime::parse_from_rfc3339(value).ok())
        .map(|dt| dt.format("%d/%m/%Y").to_string())
        .unwrap_or_else(|| "sin emitir".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{InvoicePdfData, InvoicePdfLine};

    fn sample(number: Option<i64>, lines: usize) -> InvoicePdfData {
        InvoicePdfData {
            id: "i1".to_string(),
            company_id: "c1".to_string(),
            company_legal_name: "Demo Facturación SL".to_string(),
            company_tax_id: "B00000000".to_string(),
            customer_display_name: "Cliente".to_string(),
            customer_tax_id: "00000000T".to_string(),
            fiscal_year: 2026,
            series: "A".to_string(),
            number,
            kind: "Complete".to_string(),
            status: if number.is_some() { "Issued" } else { "Draft" }.to_string(),
            rectifies_invoice_id: None,
            rectification_reason_code: None,
            rectification_method: None,
            taxable_base_cents: 10_000,
            tax_cents: 2_100,
            total_cents: 12_100,
            fiscal_hash: number.map(|_| "hash".to_string()),
            issued_at: number.map(|_| "2026-05-28T00:00:00Z".to_string()),
            lines: (0..lines)
                .map(|i| InvoicePdfLine {
                    description: format!("Servicio {i}"),
                    quantity: 1,
                    unit_price_cents: 10_000,
                    discount_rate_basis_points: 0,
                    tax_rate_basis_points: 2_100,
                    taxable_base_cents: 10_000,
                    tax_cents: 2_100,
                })
                .collect(),
            rectified_invoice: None,
        }
    }

    fn write(invoice: &InvoicePdfData) -> Vec<u8> {
        let target =
            std::env::temp_dir().join(format!("cumplefactura-test-{}.pdf", uuid::Uuid::new_v4()));
        let target_str = target.to_str().expect("utf8 target").to_string();
        write_invoice_pdf(&target_str, invoice, QrEnvironment::Test).expect("pdf");
        let bytes = std::fs::read(&target).expect("read pdf");
        std::fs::remove_file(target).expect("cleanup");
        bytes
    }

    fn contains(haystack: &[u8], needle: &[u8]) -> bool {
        haystack
            .windows(needle.len())
            .any(|window| window == needle)
    }

    #[test]
    fn issued_invoice_has_qr_and_legend() {
        let bytes = write(&sample(Some(1), 1));
        assert!(bytes.starts_with(b"%PDF-1.4"));
        assert!(contains(&bytes, b"QR tributario:"));
        assert!(contains(&bytes, &pdf_string(VERIFACTU_LEGEND)));
        assert!(contains(&bytes, b"/WinAnsiEncoding"));
        // "Facturación" en cp1252: la o con tilde es 0xF3.
        assert!(contains(&bytes, b"Facturaci\xf3n"));
    }

    #[test]
    fn draft_has_no_qr() {
        let bytes = write(&sample(None, 1));
        assert!(contains(&bytes, b"BORRADOR"));
        assert!(!contains(&bytes, b"QR tributario:"));
    }

    #[test]
    fn long_invoices_paginate() {
        let bytes = write(&sample(Some(2), 70));
        assert!(contains(&bytes, b"/Count 3"));
    }

    #[test]
    fn formats_spanish_money() {
        assert_eq!(es_money(123_456), "1.234,56 €");
        assert_eq!(es_money(-500), "-5,00 €");
        assert_eq!(percent(2_100), "21%");
        assert_eq!(percent(550), "5,50%");
    }
}
