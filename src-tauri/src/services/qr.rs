//! QR tributario VERI*FACTU (Orden HAC/1177/2024 y especificaciones AEAT del QR).
//!
//! La URL de cotejo usa los mismos formateadores que el XML RegistroAlta
//! (numero de serie, fecha dd-mm-aaaa e importe con punto), de modo que lo que
//! el receptor coteja coincide byte a byte con lo registrado.

use crate::db::InvoicePdfData;
use crate::services::verifactu::{aeat_date, format_invoice_number, money};
use qrcode::{EcLevel, QrCode};
use serde::{Deserialize, Serialize};

const AEAT_QR_PRODUCTION: &str = "https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR";
const AEAT_QR_TEST: &str = "https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR";

/// Leyenda obligatoria junto al QR en facturas de sistemas VERI*FACTU.
pub const VERIFACTU_LEGEND: &str = "Factura verificable en la sede electrónica de la AEAT";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum QrEnvironment {
    /// Entorno de pruebas AEAT (prewww2). Por defecto mientras no haya homologacion.
    #[default]
    Test,
    Production,
}

impl QrEnvironment {
    pub fn parse(value: &str) -> Result<Self, String> {
        match value {
            "test" => Ok(Self::Test),
            "production" => Ok(Self::Production),
            other => Err(format!("unsupported qr_environment: {other}")),
        }
    }

    fn base_url(self) -> &'static str {
        match self {
            Self::Test => AEAT_QR_TEST,
            Self::Production => AEAT_QR_PRODUCTION,
        }
    }
}

/// URL de cotejo para una factura emitida. Falla si la factura no tiene numero o fecha.
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

/// Matriz QR (true = modulo oscuro) con correccion de errores M (ISO/IEC 18004).
pub fn qr_matrix(data: &str) -> Result<Vec<Vec<bool>>, String> {
    let code = QrCode::with_error_correction_level(data.as_bytes(), EcLevel::M)
        .map_err(|err| format!("QR encode error: {err}"))?;
    let width = code.width();
    let colors = code.to_colors();
    Ok(colors
        .chunks(width)
        .map(|row| row.iter().map(|c| *c == qrcode::Color::Dark).collect())
        .collect())
}

/// Codificacion de componente URL (RFC 3986): solo se dejan sin escapar los no reservados.
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
mod tests {
    use super::*;
    use crate::db::InvoicePdfData;

    fn invoice() -> InvoicePdfData {
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
            fiscal_hash: Some("hash".to_string()),
            issued_at: Some("2026-09-01T10:00:00+02:00".to_string()),
            lines: vec![],
            rectified_invoice: None,
        }
    }

    #[test]
    fn builds_aeat_qr_url_with_encoded_params() {
        let url = verifactu_qr_url(&invoice(), QrEnvironment::Production).expect("url");
        assert_eq!(
            url,
            "https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR?nif=B12345678&numserie=A%26B-7&fecha=01-09-2026&importe=241.40"
        );
    }

    #[test]
    fn test_environment_uses_preproduction_host() {
        let url = verifactu_qr_url(&invoice(), QrEnvironment::Test).expect("url");
        assert!(url.starts_with("https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?"));
    }

    #[test]
    fn drafts_have_no_qr() {
        let mut draft = invoice();
        draft.number = None;
        assert!(verifactu_qr_url(&draft, QrEnvironment::Test).is_err());
    }

    #[test]
    fn matrix_is_square_with_finder_patterns() {
        let url = verifactu_qr_url(&invoice(), QrEnvironment::Production).expect("url");
        let matrix = qr_matrix(&url).expect("matrix");
        assert!(matrix.len() >= 21);
        assert!(matrix.iter().all(|row| row.len() == matrix.len()));
        // Esquina superior izquierda: patron de localizacion (7x7, borde oscuro).
        assert!(matrix[0][..7].iter().all(|m| *m));
        assert!(matrix[6][..7].iter().all(|m| *m));
    }

    #[test]
    fn parses_environment_setting() {
        assert_eq!(
            QrEnvironment::parse("production").unwrap(),
            QrEnvironment::Production
        );
        assert!(QrEnvironment::parse("prod").is_err());
    }
}
