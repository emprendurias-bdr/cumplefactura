//! QR tributario VERI*FACTU (RD 1619/2012 art. 6.5; Orden HAC/1177/2024 arts. 20 y 21).
//!
//! Qué hace: construye la URL de cotejo de la AEAT para una factura emitida y la
//! convierte en una matriz QR (ISO/IEC 18004, nivel de corrección M: Orden art. 21.1)
//! que `pdf` dibuja como vectores. `verifactu_qr_url` es la única función que forma la
//! URL (Orden art. 21.2: NIF, serie y número, fecha de expedición e importe total).
//!
//! Entorno: el host de cotejo sigue al puerto SOAP del sidecar: el del último envío de
//! la factura o, si aún no se envió, `AppSettings::verifactu_endpoint_name`
//! (`commands::invoices::pdf_qr_environment`). Pruebas mientras se envíe a pruebas y
//! producción cuando S3 abra producción.
//!
//! Qué no hace nunca: generar QR para borradores (sin número ni fecha no hay nada que
//! cotejar) ni producir imágenes: `qrcode` va sin features, solo da la matriz.
//!
//! Por qué los formateadores de `verifactu`: el número de serie, la fecha
//! `dd-mm-aaaa` y el importe con punto son los mismos del `RegistroAlta`, así que lo
//! que coteja el receptor coincide byte a byte con lo registrado.

use crate::db::InvoicePdfData;
use crate::services::verifactu::{aeat_date, format_invoice_number, money};
use fiscal_contract::endpoints::EndpointName;
use qrcode::{EcLevel, QrCode};

const AEAT_QR_PRODUCTION: &str = "https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR";
const AEAT_QR_TEST: &str = "https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR";

/// Leyenda junto al QR en facturas de sistemas VERI*FACTU (RD 1619/2012 art. 6.5.b;
/// Orden HAC/1177/2024 art. 20.1.b).
pub const VERIFACTU_LEGEND: &str = "Factura verificable en la sede electrónica de la AEAT";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum QrEnvironment {
    /// Entorno de pruebas AEAT (prewww2). Por defecto mientras no haya homologación.
    #[default]
    Test,
    Production,
}

impl QrEnvironment {
    /// `test` o `production`, como se guarda en `AppSettings::qr_environment`.
    pub fn parse(value: &str) -> Result<Self, String> {
        match value {
            "test" => Ok(Self::Test),
            "production" => Ok(Self::Production),
            other => Err(format!("unsupported qr_environment: {other}")),
        }
    }

    /// Entorno del QR para el puerto SOAP configurado: los puertos `*Pruebas` van a
    /// pruebas; los demás, a producción.
    pub fn for_endpoint(endpoint: EndpointName) -> Self {
        match endpoint {
            EndpointName::SistemaVerifactuPruebas | EndpointName::SistemaVerifactuSelloPruebas => {
                Self::Test
            }
            EndpointName::SistemaVerifactu | EndpointName::SistemaVerifactuSello => {
                Self::Production
            }
        }
    }

    /// Entorno del QR a partir del nombre guardado en `AppSettings::verifactu_endpoint_name`.
    pub fn for_endpoint_name(name: &str) -> Result<Self, String> {
        EndpointName::parse(name)
            .map(Self::for_endpoint)
            .ok_or_else(|| format!("unsupported VERI*FACTU endpoint: {name}"))
    }

    fn base_url(self) -> &'static str {
        match self {
            Self::Test => AEAT_QR_TEST,
            Self::Production => AEAT_QR_PRODUCTION,
        }
    }
}

/// URL de cotejo de una factura emitida. Falla si no tiene número o fecha (borrador).
pub fn verifactu_qr_url(invoice: &InvoicePdfData, env: QrEnvironment) -> Result<String, String> {
    let number = invoice
        .number
        .ok_or_else(|| "QR requires an issued invoice number".to_string())?;
    let issued_at = invoice
        .issued_at
        .as_deref()
        .ok_or_else(|| "QR requires issued_at".to_string())?;
    Ok(format!(
        "{}?nif={}&numserie={}&fecha={}&importe={}",
        env.base_url(),
        percent_encode(invoice.company_tax_id.trim()),
        percent_encode(&format_invoice_number(&invoice.series, number)),
        percent_encode(&aeat_date(issued_at)?),
        percent_encode(&money(invoice.total_cents)),
    ))
}

/// Matriz QR (`true` = módulo oscuro) con corrección de errores M (ISO/IEC 18004).
pub fn qr_matrix(data: &str) -> Result<Vec<Vec<bool>>, String> {
    let code = QrCode::with_error_correction_level(data.as_bytes(), EcLevel::M)
        .map_err(|err| format!("QR encode error: {err}"))?;
    Ok(code
        .to_colors()
        .chunks(code.width())
        .map(|row| row.iter().map(|c| *c == qrcode::Color::Dark).collect())
        .collect())
}

/// Codificación de componente URL (RFC 3986): solo quedan sin escapar los no reservados.
fn percent_encode(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(byte as char)
            }
            _ => out.push_str(&format!("%{byte:02X}")),
        }
    }
    out
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::db::InvoicePdfLine;
    use crate::services::verifactu::build_verifactu_xml_draft;

    pub(crate) fn issued_invoice() -> InvoicePdfData {
        InvoicePdfData {
            id: "i1".to_string(),
            company_id: "c1".to_string(),
            company_legal_name: "Demo SL".to_string(),
            company_tax_id: "B12345678".to_string(),
            customer_display_name: "Cliente".to_string(),
            customer_tax_id: "00000000T".to_string(),
            fiscal_year: 2026,
            series: "A&B".to_string(),
            number: Some(7),
            kind: "Complete".to_string(),
            status: "Issued".to_string(),
            rectifies_invoice_id: None,
            rectification_reason_code: None,
            rectification_method: None,
            taxable_base_cents: 20_000,
            tax_cents: 4_200,
            total_cents: 24_140,
            fiscal_hash: Some("A".repeat(64)),
            issued_at: Some("2026-09-01T10:00:00+02:00".to_string()),
            lines: vec![InvoicePdfLine {
                description: "Servicio".to_string(),
                quantity: 1,
                unit_price_cents: 20_000,
                discount_rate_basis_points: 0,
                tax_rate_basis_points: 2_100,
                taxable_base_cents: 20_000,
                tax_cents: 4_200,
                ..Default::default()
            }],
            rectified_invoice: None,
            ..Default::default()
        }
    }

    /// Valor de `<sf:tag>` en el XML.
    fn xml_value<'a>(xml: &'a str, tag: &str) -> &'a str {
        let open = format!("<sf:{tag}>");
        let start = xml.find(&open).expect(tag) + open.len();
        &xml[start..start + xml[start..].find('<').unwrap()]
    }

    #[test]
    fn builds_aeat_qr_url_with_encoded_params() {
        let url = verifactu_qr_url(&issued_invoice(), QrEnvironment::Production).expect("url");
        assert_eq!(
            url,
            "https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR?nif=B12345678&numserie=A%26B-7&fecha=01-09-2026&importe=241.40"
        );
        let test = verifactu_qr_url(&issued_invoice(), QrEnvironment::Test).expect("url");
        assert!(test.starts_with("https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?"));
    }

    #[test]
    fn url_matches_the_registro_alta_formatters() {
        let mut invoice = issued_invoice();
        invoice.series = "A".to_string();
        let xml = build_verifactu_xml_draft(&invoice, None).expect("xml");
        let url = verifactu_qr_url(&invoice, QrEnvironment::Test).expect("url");
        let expected = format!(
            "nif={}&numserie={}&fecha={}&importe={}",
            xml_value(&xml, "IDEmisorFactura"),
            xml_value(&xml, "NumSerieFactura"),
            xml_value(&xml, "FechaExpedicionFactura"),
            xml_value(&xml, "ImporteTotal"),
        );
        assert!(url.ends_with(&expected), "{url} vs {expected}");
    }

    #[test]
    fn drafts_have_no_qr_url() {
        let mut draft = issued_invoice();
        draft.number = None;
        assert!(verifactu_qr_url(&draft, QrEnvironment::Test).is_err());
        let mut undated = issued_invoice();
        undated.issued_at = None;
        assert!(verifactu_qr_url(&undated, QrEnvironment::Test).is_err());
    }

    #[test]
    fn matrix_is_square_with_finder_patterns() {
        let url = verifactu_qr_url(&issued_invoice(), QrEnvironment::Production).expect("url");
        let matrix = qr_matrix(&url).expect("matrix");
        assert!(matrix.len() >= 21);
        assert!(matrix.iter().all(|row| row.len() == matrix.len()));
        // Esquina superior izquierda: patrón de localización (7x7, borde oscuro).
        assert!(matrix[0][..7].iter().all(|m| *m));
        assert!(matrix[6][..7].iter().all(|m| *m));
    }

    /// Parámetros de la URL ya decodificados (inverso de `percent_encode`).
    fn query(url: &str) -> Vec<(String, String)> {
        let decode = |v: &str| {
            let bytes = v.as_bytes();
            let mut out = Vec::new();
            let mut i = 0;
            while i < bytes.len() {
                if bytes[i] == b'%' {
                    out.push(u8::from_str_radix(&v[i + 1..i + 3], 16).unwrap());
                    i += 3;
                } else {
                    out.push(bytes[i]);
                    i += 1;
                }
            }
            String::from_utf8(out).unwrap()
        };
        url.split_once('?')
            .unwrap()
            .1
            .split('&')
            .map(|kv| {
                let (k, v) = kv.split_once('=').unwrap();
                (k.to_string(), decode(v))
            })
            .collect()
    }

    #[test]
    fn url_encodes_special_characters_and_keeps_param_order() {
        let mut invoice = issued_invoice();
        invoice.company_tax_id = " B12345678 ".to_string();
        invoice.series = "F/2026 #1+?=%ñ".to_string();
        invoice.number = Some(12);
        let url = verifactu_qr_url(&invoice, QrEnvironment::Test).expect("url");
        // Orden 21.2.b: solo NIF, serie y número, fecha e importe, en ese orden.
        assert_eq!(
            url,
            "https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?nif=B12345678\
             &numserie=F%2F2026%20%231%2B%3F%3D%25%C3%B1-12&fecha=01-09-2026&importe=241.40"
        );
        // Ningún carácter reservado queda sin escapar dentro de un valor.
        assert_eq!(url.matches('&').count(), 3);
        assert_eq!(url.matches('=').count(), 4);
        assert_eq!(url.matches('?').count(), 1);
        let params = query(&url);
        assert_eq!(
            params,
            vec![
                ("nif".into(), "B12345678".into()),
                ("numserie".into(), "F/2026 #1+?=%ñ-12".into()),
                ("fecha".into(), "01-09-2026".into()),
                ("importe".into(), "241.40".into()),
            ]
        );
    }

    #[test]
    fn url_amount_has_dot_and_two_decimals() {
        let cases = [
            (0, "0.00"),
            (5, "0.05"),
            (100, "1.00"),
            (123_456_789, "1234567.89"),
            (-1_230, "-12.30"),
        ];
        for (cents, expected) in cases {
            let mut invoice = issued_invoice();
            invoice.total_cents = cents;
            let url = verifactu_qr_url(&invoice, QrEnvironment::Production).expect("url");
            assert!(url.ends_with(&format!("&importe={expected}")), "{url}");
        }
    }

    #[test]
    fn url_date_is_issue_day_as_dd_mm_yyyy() {
        let cases = [
            ("2026-01-05T09:00:00+01:00", "05-01-2026"),
            // Fecha local de expedición, no la UTC (que ya sería 01-01-2027).
            ("2026-12-31T23:30:00-01:00", "31-12-2026"),
            ("2027-01-01T00:15:00+01:00", "01-01-2027"),
        ];
        for (issued_at, expected) in cases {
            let mut invoice = issued_invoice();
            invoice.issued_at = Some(issued_at.to_string());
            let url = verifactu_qr_url(&invoice, QrEnvironment::Test).expect("url");
            assert!(url.contains(&format!("&fecha={expected}&")), "{url}");
        }
        let mut invoice = issued_invoice();
        invoice.issued_at = Some("01/09/2026".to_string());
        assert!(verifactu_qr_url(&invoice, QrEnvironment::Test).is_err());
    }

    #[test]
    fn matrix_uses_error_correction_level_m() {
        let url = verifactu_qr_url(&issued_invoice(), QrEnvironment::Production).expect("url");
        let matrix = qr_matrix(&url).expect("matrix");
        let with = |level| {
            let code = QrCode::with_error_correction_level(url.as_bytes(), level).unwrap();
            code.to_colors()
                .chunks(code.width())
                .map(|row| row.iter().map(|c| *c == qrcode::Color::Dark).collect())
                .collect::<Vec<Vec<bool>>>()
        };
        assert_eq!(matrix, with(EcLevel::M));
        for other in [EcLevel::L, EcLevel::Q, EcLevel::H] {
            assert_ne!(matrix, with(other));
        }
    }

    #[test]
    fn environment_follows_the_sidecar_endpoint() {
        use QrEnvironment::{Production, Test};
        let cases = [
            ("SistemaVerifactuPruebas", Test),
            ("SistemaVerifactuSelloPruebas", Test),
            ("SistemaVerifactu", Production),
            ("SistemaVerifactuSello", Production),
        ];
        for (name, env) in cases {
            assert_eq!(
                QrEnvironment::for_endpoint_name(name).unwrap(),
                env,
                "{name}"
            );
        }
        assert!(QrEnvironment::for_endpoint_name("Produccion").is_err());
        assert_eq!(
            QrEnvironment::for_endpoint(fiscal_contract::endpoints::DEFAULT_ENDPOINT),
            Test
        );
    }

    #[test]
    fn parses_environment_setting() {
        assert_eq!(
            QrEnvironment::parse("production").unwrap(),
            QrEnvironment::Production
        );
        assert_eq!(QrEnvironment::parse("test").unwrap(), QrEnvironment::Test);
        assert!(QrEnvironment::parse("prod").is_err());
    }
}
