//! PDF de factura y de documentos comerciales (plantilla D1), sin librerías: Helvetica WinAnsi.
//!
//! Misma plantilla para todo: cabecera con logo, emisor y cliente, tabla de líneas (descripción,
//! cantidad, precio, descuento, IVA, IRPF, importe) con saltos de página, totales con desglose
//! por tipo, observaciones y pie con página. Salida local para el usuario: no es el artefacto
//! fiscal (huella y XML viven aparte) y las observaciones nunca salen de aquí hacia el registro.
//! Las facturas emitidas llevan arriba a la derecha el QR tributario VERI*FACTU (35 mm, módulos
//! vectoriales) y la leyenda `qr::VERIFACTU_LEGEND`; los borradores no llevan QR. Presupuestos,
//! proformas y albaranes salen sin QR ni huella y con «Documento sin valor fiscal».
//! El logo (JPEG o PNG sin alpha, `services::logo`) se incrusta como XObject sin recodificar.

use crate::db::{CommercialDocumentPdfData, InvoicePdfData};
use crate::domain::invoice::build_line;
use crate::services::logo::{self, LogoImage};
use crate::services::qr::{self, QrEnvironment, VERIFACTU_LEGEND};
use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;

/// Lado del QR: 35 mm en puntos PDF.
const QR_SIZE: f64 = 99.2;
/// Margen derecho y superior del QR (A4 = 595 x 842 pt).
const QR_RIGHT: f64 = 545.0;
const QR_TOP: f64 = 800.0;
const LEFT: f64 = 40.0;
const RIGHT: f64 = 555.0;
const TOP: f64 = 802.0;
/// Por debajo de aquí solo va el pie.
const BOTTOM: f64 = 70.0;
const LOGO_MAX_W: f64 = 170.0;
const LOGO_MAX_H: f64 = 60.0;

/// Escribe un PDF A4 nuevo de la factura (borrador o emitida).
pub fn write_invoice_pdf(
    target_path: &str,
    invoice: &InvoicePdfData,
    qr_environment: QrEnvironment,
) -> Result<(), String> {
    let path = new_target(target_path)?;
    let pdf = render(&invoice_sheet(invoice, qr_environment)?);
    fs::write(path, pdf).map_err(|err| format!("PDF write error: {err}"))
}

/// PDF de presupuesto, proforma o albarán. Devuelve el SHA-256 del fichero escrito.
pub fn write_commercial_document_pdf(
    target_path: &str,
    data: &CommercialDocumentPdfData,
) -> Result<String, String> {
    let path = new_target(target_path)?;
    let pdf = render(&commercial_sheet(data)?);
    fs::write(path, &pdf).map_err(|err| format!("PDF write error: {err}"))?;
    Ok(fiscal_contract::sha256_hex(&pdf))
}

fn new_target(target_path: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(target_path);
    if path.exists() {
        return Err("target PDF already exists".to_string());
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| format!("PDF directory error: {err}"))?;
    }
    Ok(path)
}

struct Party {
    label: &'static str,
    name: String,
    tax_id: String,
    address: String,
}

struct Row {
    description: String,
    quantity: i64,
    unit_price_cents: i64,
    discount_bp: i64,
    tax_bp: i64,
    withholding_bp: i64,
    amount_cents: i64,
    tax_cents: i64,
    withholding_cents: i64,
    pending: bool,
}

impl Row {
    /// «Albarán AL-… · fecha» de la recapitulativa: fila de texto, sin importes.
    fn is_text(&self) -> bool {
        self.unit_price_cents == 0 && !self.pending && self.description.starts_with("Albarán ")
    }
}

struct Sheet {
    heading: String,
    heading_size: f64,
    subtitle: Vec<String>,
    parties: [Party; 2],
    logo: Option<LogoImage>,
    details: Vec<String>,
    rows: Vec<Row>,
    show_prices: bool,
    /// Base, IRPF y total del documento (el IVA se desglosa por tipo desde las filas).
    totals: Option<(i64, i64, i64)>,
    notes: String,
    footer: Vec<String>,
    qr: Option<(Vec<Vec<bool>>, QrEnvironment)>,
}

fn invoice_sheet(invoice: &InvoicePdfData, env: QrEnvironment) -> Result<Sheet, String> {
    // Emitida = tiene número y fecha; un borrador no tiene nada que cotejar.
    let issued = invoice.number.is_some() && invoice.issued_at.is_some();
    let heading = match (issued, invoice.kind.as_str()) {
        (false, _) => "Borrador de factura".to_string(),
        (true, "Rectifying") => "Factura rectificativa".to_string(),
        (true, "Simplified") => "Factura simplificada".to_string(),
        (true, _) => "Factura".to_string(),
    };
    let mut subtitle = vec![match invoice.number {
        Some(number) => format!(
            "Nº {}-{} · Fecha {}",
            invoice.series,
            number,
            spanish_date(invoice.issued_at.as_deref().unwrap_or_default())
        ),
        None => format!("Serie {} · sin número hasta emitir", invoice.series),
    }];
    if !issued {
        subtitle.push("Sin valor fiscal hasta su emisión".to_string());
    }
    let mut details = Vec::new();
    if invoice.status == "Void" {
        details.push("ANULADA".to_string());
    }
    if let Some(source) = &invoice.rectified_invoice {
        details.push(format!(
            "Rectifica a la factura {}-{} de {}",
            source.series,
            source.number,
            spanish_date(&source.issued_at)
        ));
    }
    if invoice.is_recapitulative {
        details.push("Factura recapitulativa de albaranes".to_string());
    }
    if let Some(due) = &invoice.due_date {
        details.push(format!("Vencimiento: {}", spanish_date(due)));
    }
    let qr = if issued {
        Some((qr::qr_matrix(&qr::verifactu_qr_url(invoice, env)?)?, env))
    } else {
        None
    };
    let mut footer = Vec::new();
    match &invoice.fiscal_hash {
        Some(hash) => footer.push(format!("Huella: {hash}")),
        None => footer.push("Borrador: sin huella ni registro fiscal".to_string()),
    }
    Ok(Sheet {
        heading,
        heading_size: 20.0,
        subtitle,
        parties: [
            Party {
                label: "EMISOR",
                name: invoice.company_legal_name.clone(),
                tax_id: invoice.company_tax_id.clone(),
                address: invoice.company_address.clone(),
            },
            Party {
                label: "CLIENTE",
                name: invoice.customer_display_name.clone(),
                tax_id: invoice.customer_tax_id.clone(),
                address: invoice.customer_address.clone(),
            },
        ],
        logo: load_logo(invoice.company_logo_path.as_deref()),
        details,
        rows: invoice
            .lines
            .iter()
            .map(|line| Row {
                description: line.description.clone(),
                quantity: line.quantity,
                unit_price_cents: line.unit_price_cents,
                discount_bp: line.discount_rate_basis_points,
                tax_bp: line.tax_rate_basis_points,
                withholding_bp: line.withholding_rate_basis_points,
                amount_cents: line.taxable_base_cents,
                tax_cents: line.tax_cents,
                withholding_cents: line.withholding_cents,
                pending: line.price_pending,
            })
            .collect(),
        show_prices: true,
        totals: Some((
            invoice.taxable_base_cents,
            invoice.withholding_cents,
            invoice.total_cents,
        )),
        notes: invoice.notes.clone(),
        footer,
        qr,
    })
}

fn commercial_sheet(data: &CommercialDocumentPdfData) -> Result<Sheet, String> {
    let doc = &data.document.header;
    let number = doc.display_number.as_deref().unwrap_or("borrador");
    let (heading, heading_size, mut subtitle) = match doc.kind.as_str() {
        // La proforma lo dice en grande en la cabecera; el número va debajo.
        "proforma" => (
            "Factura proforma · sin valor fiscal".to_string(),
            18.0,
            vec![number.to_string()],
        ),
        "quote" => (format!("Presupuesto {number}"), 20.0, Vec::new()),
        _ => (format!("Albarán {number}"), 20.0, Vec::new()),
    };
    subtitle.push("Documento sin valor fiscal".to_string());
    let mut details = vec![format!("Fecha: {}", spanish_date(&doc.issue_date))];
    if let Some(valid_until) = &doc.valid_until {
        details.push(format!("Válido hasta: {}", spanish_date(valid_until)));
    }
    if let Some(delivery_date) = &doc.delivery_date {
        details.push(format!("Fecha de entrega: {}", spanish_date(delivery_date)));
    }
    let rows = data
        .document
        .lines
        .iter()
        .map(|item| {
            let built = build_line(item.line.clone(), false)?;
            Ok(Row {
                description: built.description,
                quantity: built.quantity,
                unit_price_cents: built.unit_price_cents,
                discount_bp: built.discount_rate_basis_points.into(),
                tax_bp: built.tax_rate_basis_points.into(),
                withholding_bp: built.withholding_rate_basis_points.into(),
                amount_cents: built.taxable_base_cents,
                tax_cents: built.tax_cents,
                withholding_cents: built.withholding_cents,
                pending: false,
            })
        })
        .collect::<Result<Vec<_>, String>>()?;
    Ok(Sheet {
        heading,
        heading_size,
        subtitle,
        parties: [
            Party {
                label: "EMISOR",
                name: data.company_legal_name.clone(),
                tax_id: data.company_tax_id.clone(),
                address: data.company_address.clone(),
            },
            Party {
                label: "CLIENTE",
                name: data.customer_display_name.clone(),
                tax_id: data.customer_tax_id.clone(),
                address: data.customer_address.clone(),
            },
        ],
        logo: load_logo(data.company_logo_path.as_deref()),
        details,
        rows,
        show_prices: doc.show_prices,
        totals: doc.show_prices.then_some((
            doc.taxable_base_cents,
            doc.withholding_cents,
            doc.total_cents,
        )),
        notes: doc.notes.clone(),
        footer: vec!["Documento sin valor fiscal".to_string()],
        qr: None,
    })
}

/// shortcut: un logo ilegible o borrado se omite sin error para no bloquear el PDF; se valida al
/// guardarlo (`company_logo_set`), así que solo pasa si alguien toca la carpeta a mano.
fn load_logo(path: Option<&str>) -> Option<LogoImage> {
    logo::parse_logo(&fs::read(path?).ok()?).ok()
}

/// Columnas: (cabecera, borde derecho). La descripción ocupa de `LEFT` a `DESC_RIGHT`.
const DESC_RIGHT: f64 = 236.0;
const PRICE_COLUMNS: [(&str, f64); 6] = [
    ("Cant.", 276.0),
    ("Precio", 338.0),
    ("Dto.", 378.0),
    ("IVA", 418.0),
    ("IRPF", 460.0),
    ("Importe", RIGHT),
];

/// Contenido por página; el pie se añade al final, cuando ya se sabe cuántas hay.
struct Pages {
    pages: Vec<String>,
    y: f64,
}

impl Pages {
    fn current(&mut self) -> &mut String {
        self.pages.last_mut().expect("at least one page")
    }

    fn text(&mut self, x: f64, y: f64, size: f64, bold: bool, value: &str) {
        let font = if bold { "F2" } else { "F1" };
        let line = format!(
            "BT\n/{font} {size} Tf\n{x:.2} {y:.2} Td\n({}) Tj\nET\n",
            escape(value)
        );
        self.current().push_str(&line);
    }

    fn text_right(&mut self, right: f64, y: f64, size: f64, bold: bool, value: &str) {
        self.text(right - text_width(value, size), y, size, bold, value);
    }

    fn gray(&mut self, level: f64) {
        self.current().push_str(&format!("{level} g\n"));
    }

    fn rule(&mut self, y: f64) {
        let line = format!("0.8 G 0.5 w {LEFT:.2} {y:.2} m {RIGHT:.2} {y:.2} l S\n");
        self.current().push_str(&line);
    }

    fn new_page(&mut self) {
        self.pages.push(String::new());
        self.y = TOP;
    }

    /// Salta de página si no caben `height` puntos más.
    fn ensure(&mut self, height: f64, show_prices: bool) -> bool {
        if self.y - height < BOTTOM {
            self.new_page();
            table_header(self, show_prices);
            return true;
        }
        false
    }
}

fn table_header(pages: &mut Pages, show_prices: bool) {
    let y = pages.y;
    let band = format!(
        "0.93 g {LEFT:.2} {:.2} {:.2} 16 re f 0 g\n",
        y - 16.0,
        RIGHT - LEFT
    );
    pages.current().push_str(&band);
    pages.text(LEFT + 4.0, y - 11.5, 8.0, true, "Descripción");
    if show_prices {
        for (title, right) in PRICE_COLUMNS {
            pages.text_right(right - 2.0, y - 11.5, 8.0, true, title);
        }
    } else {
        pages.text_right(RIGHT - 2.0, y - 11.5, 8.0, true, "Cantidad");
    }
    pages.y = y - 28.0;
}

fn render(sheet: &Sheet) -> Vec<u8> {
    let mut pages = Pages {
        pages: vec![String::new()],
        y: TOP,
    };

    // Cabecera: logo a la izquierda y QR (emitidas) a la derecha.
    let mut header_bottom = TOP;
    if let Some(logo) = &sheet.logo {
        let scale = (LOGO_MAX_W / logo.width as f64).min(LOGO_MAX_H / logo.height as f64);
        let (w, h) = (logo.width as f64 * scale, logo.height as f64 * scale);
        let draw = format!(
            "q {w:.2} 0 0 {h:.2} {LEFT:.2} {:.2} cm /Im1 Do Q\n",
            TOP - h
        );
        pages.current().push_str(&draw);
        header_bottom = TOP - h - 14.0;
    }
    let mut right_bottom = TOP;
    if let Some((matrix, env)) = &sheet.qr {
        let (x, y) = (QR_RIGHT - QR_SIZE, QR_TOP - QR_SIZE);
        push_qr(pages.current(), x, y, matrix);
        pages.text(QR_RIGHT - 172.0, y - 8.0, 6.5, false, VERIFACTU_LEGEND);
        right_bottom = y - 8.0;
        if *env == QrEnvironment::Test {
            pages.text(
                QR_RIGHT - 172.0,
                y - 17.0,
                6.5,
                false,
                "Entorno de pruebas AEAT",
            );
            right_bottom = y - 17.0;
        }
    }
    let mut y = header_bottom - sheet.heading_size;
    // Sin QR el título va a la derecha, como en `DocPreview`; con QR, bajo el logo.
    let title_right = sheet.qr.is_none() && sheet.logo.is_some();
    if title_right {
        y = TOP - sheet.heading_size;
    }
    let max_title = if sheet.qr.is_some() {
        380.0
    } else {
        RIGHT - LEFT
    };
    let mut size = sheet.heading_size;
    while text_width(&sheet.heading, size) > max_title && size > 10.0 {
        size -= 1.0;
    }
    if title_right {
        pages.text_right(RIGHT, y, size, true, &sheet.heading);
    } else {
        pages.text(LEFT, y, size, true, &sheet.heading);
    }
    for line in &sheet.subtitle {
        y -= 15.0;
        if title_right {
            pages.text_right(RIGHT, y, 10.0, false, line);
        } else {
            pages.text(LEFT, y, 10.0, false, line);
        }
    }

    // Emisor y cliente en dos columnas.
    let top = y.min(header_bottom).min(right_bottom) - 30.0;
    let mut lowest = top;
    for (index, party) in sheet.parties.iter().enumerate() {
        let x = LEFT + index as f64 * 262.0;
        let mut py = top;
        pages.gray(0.45);
        pages.text(x, py, 7.5, true, party.label);
        pages.gray(0.0);
        for (line_index, line) in wrap(&party.name, 245.0, 10.0).iter().enumerate() {
            py -= if line_index == 0 { 14.0 } else { 12.0 };
            pages.text(x, py, 10.0, true, line);
        }
        py -= 12.0;
        pages.text(x, py, 9.0, false, &format!("NIF {}", party.tax_id));
        for line in wrap(&party.address, 245.0, 9.0) {
            py -= 11.0;
            pages.text(x, py, 9.0, false, &line);
        }
        lowest = lowest.min(py);
    }
    pages.y = lowest - 20.0;
    for line in &sheet.details {
        pages.text(LEFT, pages.y, 9.0, false, line);
        pages.y -= 12.0;
    }
    pages.y -= 8.0;

    // Tabla de líneas.
    table_header(&mut pages, sheet.show_prices);
    let desc_width = if sheet.show_prices {
        DESC_RIGHT - LEFT - 4.0
    } else {
        RIGHT - LEFT - 70.0
    };
    for row in &sheet.rows {
        let mut description = row.description.clone();
        if row.pending {
            description.push_str(" (pendiente de precio)");
        }
        let lines = wrap(&description, desc_width, 9.0);
        let height = lines.len() as f64 * 11.0 + 6.0;
        pages.ensure(height, sheet.show_prices);
        let first = pages.y;
        for (index, line) in lines.iter().enumerate() {
            pages.text(
                LEFT + 4.0,
                first - index as f64 * 11.0,
                9.0,
                row.is_text(),
                line,
            );
        }
        if !row.is_text() {
            let values: Vec<String> = if sheet.show_prices {
                vec![
                    row.quantity.to_string(),
                    if row.pending {
                        "—".to_string()
                    } else {
                        money(row.unit_price_cents)
                    },
                    optional_rate(row.discount_bp),
                    rate(row.tax_bp),
                    optional_rate(row.withholding_bp),
                    money(row.amount_cents),
                ]
            } else {
                vec![row.quantity.to_string()]
            };
            let rights: Vec<f64> = if sheet.show_prices {
                PRICE_COLUMNS.iter().map(|(_, right)| *right).collect()
            } else {
                vec![RIGHT]
            };
            for (value, right) in values.iter().zip(rights) {
                pages.text_right(right - 2.0, first, 9.0, false, value);
            }
        }
        pages.y = first - height + 6.0;
        pages.rule(pages.y + 2.0);
        pages.y -= 10.0;
    }

    // Totales con IVA e IRPF desglosados por tipo.
    if let Some((base, withholding, total)) = sheet.totals {
        let mut taxes: BTreeMap<i64, i64> = BTreeMap::new();
        let mut withholdings: BTreeMap<i64, i64> = BTreeMap::new();
        for row in &sheet.rows {
            if !row.is_text() {
                *taxes.entry(row.tax_bp).or_default() += row.tax_cents;
                if row.withholding_cents != 0 {
                    *withholdings.entry(row.withholding_bp).or_default() += row.withholding_cents;
                }
            }
        }
        let mut lines = vec![("Base imponible".to_string(), money(base), false)];
        lines.extend(
            taxes
                .iter()
                .map(|(bp, cents)| (format!("IVA {}", rate(*bp)), money(*cents), false)),
        );
        lines.extend(
            withholdings
                .iter()
                .map(|(bp, cents)| (format!("IRPF {}", rate(*bp)), money(-*cents), false)),
        );
        if withholdings.is_empty() && withholding != 0 {
            lines.push(("IRPF".to_string(), money(-withholding), false));
        }
        lines.push(("Total".to_string(), money(total), true));
        pages.ensure(lines.len() as f64 * 15.0 + 20.0, sheet.show_prices);
        pages.y -= 6.0;
        for (label, value, bold) in lines {
            let size = if bold { 12.0 } else { 9.5 };
            if bold {
                pages.y -= 4.0;
                let line = format!(
                    "0 G 0.8 w 360 {:.2} m {RIGHT:.2} {:.2} l S\n",
                    pages.y + 13.0,
                    pages.y + 13.0
                );
                pages.current().push_str(&line);
            }
            pages.text(362.0, pages.y, size, bold, &label);
            pages.text_right(RIGHT - 2.0, pages.y, size, bold, &value);
            pages.y -= 15.0;
        }
    }

    // Observaciones.
    if !sheet.notes.trim().is_empty() {
        let lines = wrap(sheet.notes.trim(), RIGHT - LEFT, 9.0);
        pages.y -= 12.0;
        pages.ensure(26.0, sheet.show_prices);
        pages.text(LEFT, pages.y, 9.5, true, "Observaciones");
        pages.y -= 13.0;
        for line in lines {
            if pages.ensure(12.0, sheet.show_prices) {
                pages.y -= 4.0;
            }
            pages.text(LEFT, pages.y, 9.0, false, &line);
            pages.y -= 11.0;
        }
    }

    // Pie de cada página.
    let count = pages.pages.len();
    for index in 0..count {
        let mut footer = Pages {
            pages: vec![String::new()],
            y: 0.0,
        };
        footer.rule(52.0);
        footer.gray(0.45);
        let mut fy = 42.0;
        for line in &sheet.footer {
            footer.text(LEFT, fy, 7.0, false, line);
            fy -= 9.0;
        }
        footer.text_right(
            RIGHT,
            42.0,
            7.0,
            false,
            &format!("Página {} de {}", index + 1, count),
        );
        footer.gray(0.0);
        let text = footer.pages.remove(0);
        pages.pages[index].push_str(&text);
    }
    build_pdf(&pages.pages, sheet.logo.as_ref())
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

/// Ensambla un PDF 1.4: Catalog, Pages, Helvetica y Helvetica-Bold, logo opcional y una
/// pareja Page/Contents por página.
fn build_pdf(pages: &[String], image: Option<&LogoImage>) -> Vec<u8> {
    let first_page = if image.is_some() { 6 } else { 5 };
    let kids = (0..pages.len())
        .map(|index| format!("{} 0 R", first_page + index * 2))
        .collect::<Vec<_>>()
        .join(" ");
    let xobject = if image.is_some() {
        " /XObject << /Im1 5 0 R >>"
    } else {
        ""
    };
    let mut objects: Vec<Vec<u8>> = vec![
        b"<< /Type /Catalog /Pages 2 0 R >>".to_vec(),
        format!("<< /Type /Pages /Kids [{kids}] /Count {} >>", pages.len()).into_bytes(),
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"
            .to_vec(),
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"
            .to_vec(),
    ];
    if let Some(image) = image {
        let parms = image
            .decode_parms
            .as_deref()
            .map(|parms| format!(" /DecodeParms {parms}"))
            .unwrap_or_default();
        let mut object = format!(
            "<< /Type /XObject /Subtype /Image /Width {} /Height {} /ColorSpace /{} /BitsPerComponent 8 /Filter /{}{parms} /Length {} >>\nstream\n",
            image.width, image.height, image.color_space, image.filter, image.data.len()
        )
        .into_bytes();
        object.extend_from_slice(&image.data);
        object.extend_from_slice(b"\nendstream");
        objects.push(object);
    }
    for (index, content) in pages.iter().enumerate() {
        objects.push(
            format!(
                "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>{xobject} >> /Contents {} 0 R >>",
                first_page + index * 2 + 1
            )
            .into_bytes(),
        );
        objects.push(
            format!(
                "<< /Length {} >>\nstream\n{}endstream",
                content.len(),
                content
            )
            .into_bytes(),
        );
    }

    let mut bytes = Vec::new();
    bytes.extend_from_slice(b"%PDF-1.4\n");
    let mut offsets = Vec::new();
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

/// Anchos AFM de Helvetica (1/1000 em) para ASCII 32..126.
const HELVETICA_WIDTHS: [u16; 95] = [
    278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
    556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667,
    611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
    667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500,
    222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

/// Ancho aproximado en puntos (la negrita se mide como la normal: en cifras es igual).
fn text_width(value: &str, size: f64) -> f64 {
    let units: u32 = value
        .chars()
        .map(|ch| match ch {
            ' '..='~' => u32::from(HELVETICA_WIDTHS[ch as usize - 32]),
            'í' | 'ì' | 'Í' | '·' => 278,
            '—' => 1000,
            _ => 556,
        })
        .sum();
    f64::from(units) * size / 1000.0
}

/// Corta en palabras para que cada línea quepa en `width`; respeta saltos de línea.
fn wrap(value: &str, width: f64, size: f64) -> Vec<String> {
    let mut out = Vec::new();
    for paragraph in value.lines() {
        let mut line = String::new();
        for word in paragraph.split_whitespace() {
            let candidate = if line.is_empty() {
                word.to_string()
            } else {
                format!("{line} {word}")
            };
            if text_width(&candidate, size) <= width {
                line = candidate;
                continue;
            }
            if !line.is_empty() {
                out.push(std::mem::take(&mut line));
            }
            // Palabra más larga que la columna: se parte por caracteres.
            for ch in word.chars() {
                if text_width(&format!("{line}{ch}"), size) > width && !line.is_empty() {
                    out.push(std::mem::take(&mut line));
                }
                line.push(ch);
            }
        }
        out.push(line);
    }
    if out.is_empty() {
        out.push(String::new());
    }
    out
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
            '\u{2014}' => out.push_str("\\227"),
            _ => out.push('?'),
        }
    }
    out
}

/// `1.234,56 €`.
fn money(cents: i64) -> String {
    let sign = if cents < 0 { "-" } else { "" };
    let abs = cents.unsigned_abs();
    let units = (abs / 100).to_string();
    let mut grouped = String::new();
    for (index, ch) in units.chars().enumerate() {
        if index > 0 && (units.len() - index).is_multiple_of(3) {
            grouped.push('.');
        }
        grouped.push(ch);
    }
    format!("{sign}{grouped},{:02} €", abs % 100)
}

/// `21 %`, `10,5 %`.
fn rate(basis_points: i64) -> String {
    let text = format!("{:.2}", basis_points as f64 / 100.0).replace('.', ",");
    format!("{} %", text.trim_end_matches('0').trim_end_matches(','))
}

fn optional_rate(basis_points: i64) -> String {
    if basis_points == 0 {
        String::new()
    } else {
        rate(basis_points)
    }
}

/// ISO o RFC 3339 → `dd/mm/aaaa`; si no se entiende, tal cual.
fn spanish_date(value: &str) -> String {
    chrono::NaiveDate::parse_from_str(value.get(..10).unwrap_or(value), "%Y-%m-%d")
        .map(|date| date.format("%d/%m/%Y").to_string())
        .unwrap_or_else(|_| value.to_string())
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::db::{InvoicePdfData, InvoicePdfLine};

    pub(crate) fn sample_invoice() -> InvoicePdfData {
        InvoicePdfData {
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
            taxable_base_cents: 10_000,
            tax_cents: 2_100,
            total_cents: 12_100,
            fiscal_hash: Some("hash".to_string()),
            issued_at: Some("2026-05-28T00:00:00Z".to_string()),
            lines: vec![InvoicePdfLine {
                description: "Servicio".to_string(),
                quantity: 1,
                unit_price_cents: 10_000,
                tax_rate_basis_points: 2_100,
                taxable_base_cents: 10_000,
                tax_cents: 2_100,
                ..Default::default()
            }],
            ..Default::default()
        }
    }

    fn temp_target() -> (PathBuf, String) {
        let target =
            std::env::temp_dir().join(format!("cumplefactura-test-{}.pdf", uuid::Uuid::new_v4()));
        let target_str = target.to_str().expect("utf8 target").to_string();
        (target, target_str)
    }

    #[test]
    fn writes_minimal_pdf() {
        let (target, target_str) = temp_target();
        let invoice = sample_invoice();

        write_invoice_pdf(&target_str, &invoice, QrEnvironment::Test).expect("pdf");
        let bytes = std::fs::read(&target).expect("read pdf");
        assert!(bytes.starts_with(b"%PDF-1.4"));
        let text = String::from_utf8(bytes).expect("ASCII PDF");
        assert!(text.contains("(Factura verificable en la sede electr\\363nica de la AEAT) Tj"));
        assert!(text.contains("(Entorno de pruebas AEAT) Tj"));
        assert!(text.matches(" re\n").count() > 100, "QR modules drawn");
        assert!(text.contains("(Importe) Tj") && text.contains("(Total) Tj"));
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
    fn embeds_logo_xobject_and_prints_notes_pending_and_page_breaks() {
        let dir = std::env::temp_dir().join(format!("cumplefactura-logo-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).expect("dir");
        let png = dir.join("logo.png");
        std::fs::write(&png, logo::tests::png(8, 4, 2, &[200, 30, 30])).expect("png");
        let jpg = dir.join("logo.jpg");
        std::fs::write(&jpg, logo::tests::jpeg_header(300, 100, 3)).expect("jpg");

        for (path, filter) in [(&png, "/FlateDecode /DecodeParms << /Predictor 15 /Colors 3 /BitsPerComponent 8 /Columns 8 >>"), (&jpg, "/DCTDecode")] {
            let mut invoice = sample_invoice();
            invoice.company_logo_path = Some(path.to_string_lossy().into_owned());
            invoice.notes = "Pago por transferencia".to_string();
            invoice.lines[0].price_pending = true;
            invoice.lines = std::iter::repeat_n(invoice.lines[0].clone(), 70).collect();
            let (target, target_str) = temp_target();
            write_invoice_pdf(&target_str, &invoice, QrEnvironment::Test).expect("pdf");
            let bytes = std::fs::read(&target).expect("read");
            std::fs::remove_file(&target).expect("cleanup");
            let text = String::from_utf8_lossy(&bytes);
            assert!(text.contains("/Subtype /Image"), "image XObject");
            assert!(text.contains(filter), "{filter}");
            assert!(text.contains("/Im1 Do"));
            assert!(text.contains("(Observaciones) Tj"));
            assert!(text.contains("(Pago por transferencia) Tj"));
            assert!(text.contains("\\(pendiente de precio\\)"));
            assert!(text.contains("/Count 2") || text.contains("/Count 3"), "page break");
            assert!(text.contains("(P\\341gina 2 de "));
        }
        std::fs::remove_dir_all(dir).expect("cleanup");
    }

    #[test]
    fn formats_money_rates_and_wraps() {
        assert_eq!(money(123_456), "1.234,56 €");
        assert_eq!(money(-5), "-0,05 €");
        assert_eq!(rate(2_100), "21 %");
        assert_eq!(rate(1_050), "10,5 %");
        let lines = wrap("uno dos tres cuatro cinco seis", 40.0, 9.0);
        assert!(lines.len() > 1 && lines.iter().all(|line| text_width(line, 9.0) <= 40.0));
    }

    #[test]
    fn escapes_pdf_literals_as_winansi() {
        assert_eq!(escape("a(b)\\"), "a\\(b\\)\\\\");
        assert_eq!(escape("Ñandú €"), "\\321and\\372 \\200");
    }
}
