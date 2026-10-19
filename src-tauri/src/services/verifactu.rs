use crate::db::{InvoicePdfData, PreviousInvoiceLink};
use chrono::{DateTime, Datelike};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

const NS_SF_LR: &str = "https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR.xsd";
const NS_SF: &str = "https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroInformacion.xsd";
const NS_DS: &str = "http://www.w3.org/2000/09/xmldsig#";

#[derive(Debug, Clone)]
pub struct VerifactuXsdAssets {
    pub script_path: PathBuf,
    pub schema_dir: PathBuf,
}

impl VerifactuXsdAssets {
    pub fn new(script_path: PathBuf, schema_dir: PathBuf) -> Result<Self, String> {
        if !script_path.exists() {
            return Err(format!(
                "VERI*FACTU XSD validator script not found: {}",
                script_path.display()
            ));
        }
        if !schema_dir.exists() {
            return Err(format!(
                "VERI*FACTU XSD schema directory not found: {}",
                schema_dir.display()
            ));
        }
        let root_schema = schema_dir.join("SuministroLR.xsd");
        if !root_schema.exists() {
            return Err(format!(
                "VERI*FACTU XSD root schema not found: {}",
                root_schema.display()
            ));
        }

        Ok(Self {
            script_path,
            schema_dir,
        })
    }
}

pub fn write_verifactu_xml_draft(
    target_path: &str,
    invoice: &InvoicePdfData,
    previous: Option<&PreviousInvoiceLink>,
) -> Result<(), String> {
    let xml = build_verifactu_xml_draft(invoice, previous)?;
    write_xml(target_path, xml)
}

fn write_xml(target_path: &str, xml: String) -> Result<(), String> {
    let path = PathBuf::from(target_path);
    if path.exists() {
        return Err("target XML already exists".to_string());
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| format!("XML directory error: {err}"))?;
    }

    fs::write(path, xml).map_err(|err| format!("XML write error: {err}"))
}

pub fn write_verifactu_xml_draft_validated(
    target_path: &str,
    invoice: &InvoicePdfData,
    previous: Option<&PreviousInvoiceLink>,
    assets: &VerifactuXsdAssets,
) -> Result<(), String> {
    write_verifactu_xml_draft(target_path, invoice, previous)?;
    let path = PathBuf::from(target_path);
    if let Err(err) = validate_verifactu_xml_file(&path, assets) {
        let _ = fs::remove_file(&path);
        return Err(err);
    }
    Ok(())
}

pub fn write_verifactu_anulacion_xml_draft_validated(
    target_path: &str,
    invoice: &InvoicePdfData,
    previous: &PreviousInvoiceLink,
    generated_at: &str,
    assets: &VerifactuXsdAssets,
) -> Result<(), String> {
    let xml = build_verifactu_anulacion_xml_draft(invoice, previous, generated_at)?;
    write_xml(target_path, xml)?;
    let path = PathBuf::from(target_path);
    if let Err(err) = validate_verifactu_xml_file(&path, assets) {
        let _ = fs::remove_file(&path);
        return Err(err);
    }
    Ok(())
}

pub fn validate_verifactu_xml_file(path: &Path, assets: &VerifactuXsdAssets) -> Result<(), String> {
    if !path.exists() {
        return Err(format!("VERI*FACTU XML not found: {}", path.display()));
    }

    let output = Command::new("powershell")
        .arg("-NoProfile")
        .arg("-ExecutionPolicy")
        .arg("Bypass")
        .arg("-File")
        .arg(&assets.script_path)
        .arg("-XmlPath")
        .arg(path)
        .arg("-SchemaDir")
        .arg(&assets.schema_dir)
        .output()
        .map_err(|err| format!("VERI*FACTU XSD validator error: {err}"))?;

    if output.status.success() {
        return Ok(());
    }

    Err(format!(
        "VERI*FACTU XSD validation failed\nstdout:\n{}\nstderr:\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    ))
}

pub fn dev_verifactu_xsd_assets() -> Result<VerifactuXsdAssets, String> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let app_root = manifest_dir
        .parent()
        .ok_or_else(|| "cannot resolve CumpleFactura app root".to_string())?;
    VerifactuXsdAssets::new(
        app_root.join("tools").join("validate-verifactu-xsd.ps1"),
        manifest_dir.join("resources").join("xsd").join("verifactu"),
    )
}

pub fn build_verifactu_xml_draft(
    invoice: &InvoicePdfData,
    previous: Option<&PreviousInvoiceLink>,
) -> Result<String, String> {
    let number = invoice
        .number
        .ok_or_else(|| "VERI*FACTU XML requires an issued invoice number".to_string())?;
    let issued_at = invoice
        .issued_at
        .as_deref()
        .ok_or_else(|| "VERI*FACTU XML requires issued_at".to_string())?;
    let expedition_date = aeat_date(issued_at)?;
    let description = operation_description(invoice);
    let current_invoice_number = format_invoice_number(&invoice.series, number);
    let invoice_type = registro_alta_invoice_type(invoice)?;
    let fiscal_hash = calculate_invoice_registro_alta_hash(invoice, previous)?;
    let mut xml = String::new();

    xml.push_str("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
    xml.push_str(&format!(
        "<sfLR:RegFactuSistemaFacturacion xmlns:sfLR=\"{}\" xmlns:sf=\"{}\" xmlns:ds=\"{}\">\n",
        NS_SF_LR, NS_SF, NS_DS
    ));
    xml.push_str("  <sfLR:Cabecera>\n");
    xml.push_str("    <sf:ObligadoEmision>\n");
    push_text(&mut xml, 6, "sf:NombreRazon", &invoice.company_legal_name);
    push_text(&mut xml, 6, "sf:NIF", &invoice.company_tax_id);
    xml.push_str("    </sf:ObligadoEmision>\n");
    xml.push_str("  </sfLR:Cabecera>\n");
    xml.push_str("  <sfLR:RegistroFactura>\n");
    xml.push_str("    <sf:RegistroAlta>\n");
    push_text(&mut xml, 6, "sf:IDVersion", "1.0");
    xml.push_str("      <sf:IDFactura>\n");
    push_text(&mut xml, 8, "sf:IDEmisorFactura", &invoice.company_tax_id);
    push_text(&mut xml, 8, "sf:NumSerieFactura", &current_invoice_number);
    push_text(&mut xml, 8, "sf:FechaExpedicionFactura", &expedition_date);
    xml.push_str("      </sf:IDFactura>\n");
    push_text(
        &mut xml,
        6,
        "sf:NombreRazonEmisor",
        &invoice.company_legal_name,
    );
    push_text(&mut xml, 6, "sf:TipoFactura", invoice_type);
    push_rectification_info(&mut xml, invoice)?;
    push_text(&mut xml, 6, "sf:FechaOperacion", &expedition_date);
    push_text(&mut xml, 6, "sf:DescripcionOperacion", &description);
    xml.push_str("      <sf:Destinatarios>\n");
    xml.push_str("        <sf:IDDestinatario>\n");
    push_text(
        &mut xml,
        10,
        "sf:NombreRazon",
        &invoice.customer_display_name,
    );
    push_text(&mut xml, 10, "sf:NIF", &invoice.customer_tax_id);
    xml.push_str("        </sf:IDDestinatario>\n");
    xml.push_str("      </sf:Destinatarios>\n");
    push_tax_breakdown(&mut xml, invoice);
    push_text(&mut xml, 6, "sf:CuotaTotal", &money(invoice.tax_cents));
    push_text(&mut xml, 6, "sf:ImporteTotal", &money(invoice.total_cents));
    xml.push_str("      <sf:Encadenamiento>\n");
    if let Some(previous) = previous {
        let previous_date = aeat_date(&previous.issued_at)?;
        xml.push_str("        <sf:RegistroAnterior>\n");
        push_text(&mut xml, 10, "sf:IDEmisorFactura", &previous.company_tax_id);
        push_text(
            &mut xml,
            10,
            "sf:NumSerieFactura",
            &format_invoice_number(&previous.series, previous.number),
        );
        push_text(&mut xml, 10, "sf:FechaExpedicionFactura", &previous_date);
        push_text(
            &mut xml,
            10,
            "sf:Huella",
            &previous.fiscal_hash.to_uppercase(),
        );
        xml.push_str("        </sf:RegistroAnterior>\n");
    } else {
        push_text(&mut xml, 8, "sf:PrimerRegistro", "S");
    }
    xml.push_str("      </sf:Encadenamiento>\n");
    push_system_info(&mut xml, invoice);
    push_text(&mut xml, 6, "sf:FechaHoraHusoGenRegistro", issued_at);
    push_text(&mut xml, 6, "sf:TipoHuella", "01");
    push_text(&mut xml, 6, "sf:Huella", &fiscal_hash);
    xml.push_str("    </sf:RegistroAlta>\n");
    xml.push_str("  </sfLR:RegistroFactura>\n");
    xml.push_str("</sfLR:RegFactuSistemaFacturacion>\n");

    Ok(xml)
}

pub fn build_verifactu_anulacion_xml_draft(
    invoice: &InvoicePdfData,
    previous: &PreviousInvoiceLink,
    generated_at: &str,
) -> Result<String, String> {
    let number = invoice
        .number
        .ok_or_else(|| "VERI*FACTU anulacion XML requires an issued invoice number".to_string())?;
    let issued_at = invoice
        .issued_at
        .as_deref()
        .ok_or_else(|| "VERI*FACTU anulacion XML requires issued_at".to_string())?;
    let expedition_date = aeat_date(issued_at)?;
    let invoice_number = format_invoice_number(&invoice.series, number);
    let previous_date = aeat_date(&previous.issued_at)?;
    let previous_invoice_number = format_invoice_number(&previous.series, previous.number);
    let cancellation_hash =
        calculate_invoice_registro_anulacion_hash(invoice, &previous.fiscal_hash, generated_at)?;
    let mut xml = String::new();

    xml.push_str("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
    xml.push_str(&format!(
        "<sfLR:RegFactuSistemaFacturacion xmlns:sfLR=\"{}\" xmlns:sf=\"{}\" xmlns:ds=\"{}\">\n",
        NS_SF_LR, NS_SF, NS_DS
    ));
    xml.push_str("  <sfLR:Cabecera>\n");
    xml.push_str("    <sf:ObligadoEmision>\n");
    push_text(&mut xml, 6, "sf:NombreRazon", &invoice.company_legal_name);
    push_text(&mut xml, 6, "sf:NIF", &invoice.company_tax_id);
    xml.push_str("    </sf:ObligadoEmision>\n");
    xml.push_str("  </sfLR:Cabecera>\n");
    xml.push_str("  <sfLR:RegistroFactura>\n");
    xml.push_str("    <sf:RegistroAnulacion>\n");
    push_text(&mut xml, 6, "sf:IDVersion", "1.0");
    xml.push_str("      <sf:IDFactura>\n");
    push_text(
        &mut xml,
        8,
        "sf:IDEmisorFacturaAnulada",
        &invoice.company_tax_id,
    );
    push_text(&mut xml, 8, "sf:NumSerieFacturaAnulada", &invoice_number);
    push_text(
        &mut xml,
        8,
        "sf:FechaExpedicionFacturaAnulada",
        &expedition_date,
    );
    xml.push_str("      </sf:IDFactura>\n");
    xml.push_str("      <sf:Encadenamiento>\n");
    xml.push_str("        <sf:RegistroAnterior>\n");
    push_text(&mut xml, 10, "sf:IDEmisorFactura", &previous.company_tax_id);
    push_text(&mut xml, 10, "sf:NumSerieFactura", &previous_invoice_number);
    push_text(&mut xml, 10, "sf:FechaExpedicionFactura", &previous_date);
    push_text(
        &mut xml,
        10,
        "sf:Huella",
        &previous.fiscal_hash.to_uppercase(),
    );
    xml.push_str("        </sf:RegistroAnterior>\n");
    xml.push_str("      </sf:Encadenamiento>\n");
    push_system_info(&mut xml, invoice);
    push_text(&mut xml, 6, "sf:FechaHoraHusoGenRegistro", generated_at);
    push_text(&mut xml, 6, "sf:TipoHuella", "01");
    push_text(&mut xml, 6, "sf:Huella", &cancellation_hash);
    xml.push_str("    </sf:RegistroAnulacion>\n");
    xml.push_str("  </sfLR:RegistroFactura>\n");
    xml.push_str("</sfLR:RegFactuSistemaFacturacion>\n");

    Ok(xml)
}

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

fn push_tax_breakdown(xml: &mut String, invoice: &InvoicePdfData) {
    let mut groups: BTreeMap<i64, (i64, i64)> = BTreeMap::new();
    for line in &invoice.lines {
        let entry = groups.entry(line.tax_rate_basis_points).or_insert((0, 0));
        entry.0 += line.taxable_base_cents;
        entry.1 += line.tax_cents;
    }

    xml.push_str("      <sf:Desglose>\n");
    for (rate, (base, tax)) in groups {
        xml.push_str("        <sf:DetalleDesglose>\n");
        push_text(xml, 10, "sf:Impuesto", "01");
        push_text(xml, 10, "sf:ClaveRegimen", "01");
        push_text(xml, 10, "sf:CalificacionOperacion", "S1");
        push_text(xml, 10, "sf:TipoImpositivo", &rate_value(rate));
        push_text(xml, 10, "sf:BaseImponibleOimporteNoSujeto", &money(base));
        push_text(xml, 10, "sf:CuotaRepercutida", &money(tax));
        xml.push_str("        </sf:DetalleDesglose>\n");
    }
    xml.push_str("      </sf:Desglose>\n");
}

fn push_rectification_info(xml: &mut String, invoice: &InvoicePdfData) -> Result<(), String> {
    if invoice.kind != "Rectifying" {
        return Ok(());
    }
    let source = invoice
        .rectified_invoice
        .as_ref()
        .ok_or_else(|| "rectifying VERI*FACTU XML requires rectified invoice link".to_string())?;
    let rectification_method = invoice
        .rectification_method
        .as_deref()
        .ok_or_else(|| "rectifying VERI*FACTU XML requires rectification method".to_string())?;
    let source_date = aeat_date(&source.issued_at)?;

    push_text(xml, 6, "sf:TipoRectificativa", rectification_method);
    xml.push_str("      <sf:FacturasRectificadas>\n");
    xml.push_str("        <sf:IDFacturaRectificada>\n");
    push_text(xml, 10, "sf:IDEmisorFactura", &source.company_tax_id);
    push_text(
        xml,
        10,
        "sf:NumSerieFactura",
        &format_invoice_number(&source.series, source.number),
    );
    push_text(xml, 10, "sf:FechaExpedicionFactura", &source_date);
    xml.push_str("        </sf:IDFacturaRectificada>\n");
    xml.push_str("      </sf:FacturasRectificadas>\n");
    if rectification_method == "S" {
        xml.push_str("      <sf:ImporteRectificacion>\n");
        push_text(
            xml,
            8,
            "sf:BaseRectificada",
            &money(source.taxable_base_cents),
        );
        push_text(xml, 8, "sf:CuotaRectificada", &money(source.tax_cents));
        xml.push_str("      </sf:ImporteRectificacion>\n");
    }
    Ok(())
}

fn push_system_info(xml: &mut String, invoice: &InvoicePdfData) {
    xml.push_str("      <sf:SistemaInformatico>\n");
    push_text(xml, 8, "sf:NombreRazon", &invoice.company_legal_name);
    push_text(xml, 8, "sf:NIF", &invoice.company_tax_id);
    push_text(xml, 8, "sf:NombreSistemaInformatico", "CumpleFactura");
    push_text(xml, 8, "sf:IdSistemaInformatico", "CF");
    push_text(xml, 8, "sf:Version", env!("CARGO_PKG_VERSION"));
    push_text(
        xml,
        8,
        "sf:NumeroInstalacion",
        &format!("LOCAL-{}", invoice.company_tax_id),
    );
    push_text(xml, 8, "sf:TipoUsoPosibleSoloVerifactu", "N");
    push_text(xml, 8, "sf:TipoUsoPosibleMultiOT", "S");
    push_text(xml, 8, "sf:IndicadorMultiplesOT", "S");
    xml.push_str("      </sf:SistemaInformatico>\n");
}

fn push_text(xml: &mut String, indent: usize, tag: &str, value: &str) {
    xml.push_str(&" ".repeat(indent));
    xml.push('<');
    xml.push_str(tag);
    xml.push('>');
    xml.push_str(&escape_xml(value));
    xml.push_str("</");
    xml.push_str(tag);
    xml.push_str(">\n");
}

fn operation_description(invoice: &InvoicePdfData) -> String {
    let text = if invoice.lines.is_empty() {
        invoice.title()
    } else {
        invoice
            .lines
            .iter()
            .map(|line| line.description.as_str())
            .collect::<Vec<_>>()
            .join("; ")
    };
    text.chars().take(500).collect()
}

pub(crate) fn aeat_date(value: &str) -> Result<String, String> {
    let dt = DateTime::parse_from_rfc3339(value)
        .map_err(|err| format!("invalid issued_at for AEAT date: {err}"))?;
    Ok(format!(
        "{:02}-{:02}-{:04}",
        dt.day(),
        dt.month(),
        dt.year()
    ))
}

pub(crate) fn format_invoice_number(series: &str, number: i64) -> String {
    format!("{}-{}", series, number)
}

pub(crate) fn money(cents: i64) -> String {
    let sign = if cents < 0 { "-" } else { "" };
    let abs = cents.abs();
    format!("{}{}.{:02}", sign, abs / 100, abs % 100)
}

fn rate_value(basis_points: i64) -> String {
    let sign = if basis_points < 0 { "-" } else { "" };
    let abs = basis_points.abs();
    format!("{}{}.{:02}", sign, abs / 100, abs % 100)
}

fn registro_alta_invoice_type(invoice: &InvoicePdfData) -> Result<&'static str, String> {
    registro_alta_invoice_type_for_kind(&invoice.kind, invoice.rectification_reason_code.as_deref())
}

pub fn registro_alta_invoice_type_for_kind(
    kind: &str,
    rectification_reason_code: Option<&str>,
) -> Result<&'static str, String> {
    match kind {
        "Complete" => Ok("F1"),
        "Simplified" => Ok("F2"),
        "Rectifying" => match rectification_reason_code {
            Some("R1") => Ok("R1"),
            Some("R2") => Ok("R2"),
            Some("R3") => Ok("R3"),
            Some("R4") => Ok("R4"),
            Some("R5") => Ok("R5"),
            _ => Err("rectifying VERI*FACTU Alta requires R1-R5 reason code".to_string()),
        },
        other => Err(format!(
            "unsupported invoice kind for VERI*FACTU Alta: {other}"
        )),
    }
}

fn escape_xml(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{InvoicePdfData, InvoicePdfLine, RectifiedInvoiceLink};

    fn invoice() -> InvoicePdfData {
        InvoicePdfData {
            id: "i1".to_string(),
            company_id: "c1".to_string(),
            company_legal_name: "Demo & Test SL".to_string(),
            company_tax_id: "B00000000".to_string(),
            customer_display_name: "Cliente <Uno>".to_string(),
            customer_tax_id: "00000000T".to_string(),
            fiscal_year: 2026,
            series: "A".to_string(),
            number: Some(7),
            kind: "Complete".to_string(),
            status: "Issued".to_string(),
            rectifies_invoice_id: None,
            rectification_reason_code: None,
            rectification_method: None,
            taxable_base_cents: 10_000,
            tax_cents: 2_100,
            total_cents: 12_100,
            fiscal_hash: Some("a".repeat(64)),
            issued_at: Some("2026-05-28T12:00:00Z".to_string()),
            lines: vec![InvoicePdfLine {
                description: "Servicio & soporte".to_string(),
                quantity: 1,
                unit_price_cents: 10_000,
                discount_rate_basis_points: 0,
                taxable_base_cents: 10_000,
                tax_rate_basis_points: 2_100,
                tax_cents: 2_100,
            }],
            rectified_invoice: None,
        }
    }

    fn rectifying_invoice() -> InvoicePdfData {
        let mut invoice = invoice();
        invoice.id = "i2".to_string();
        invoice.number = Some(8);
        invoice.kind = "Rectifying".to_string();
        invoice.rectifies_invoice_id = Some("i1".to_string());
        invoice.rectification_reason_code = Some("R4".to_string());
        invoice.rectification_method = Some("I".to_string());
        invoice.taxable_base_cents = -1_000;
        invoice.tax_cents = -210;
        invoice.total_cents = -1_210;
        invoice.fiscal_hash = None;
        invoice.lines = vec![InvoicePdfLine {
            description: "Rectificacion parcial".to_string(),
            quantity: 1,
            unit_price_cents: -1_000,
            discount_rate_basis_points: 0,
            taxable_base_cents: -1_000,
            tax_rate_basis_points: 2_100,
            tax_cents: -210,
        }];
        invoice.rectified_invoice = Some(RectifiedInvoiceLink {
            company_tax_id: "B00000000".to_string(),
            series: "A".to_string(),
            number: 7,
            issued_at: "2026-05-28T12:00:00Z".to_string(),
            taxable_base_cents: 10_000,
            tax_cents: 2_100,
        });
        invoice
    }

    fn previous_link() -> PreviousInvoiceLink {
        PreviousInvoiceLink {
            company_tax_id: "B00000000".to_string(),
            series: "A".to_string(),
            number: 7,
            issued_at: "2026-05-28T12:00:00Z".to_string(),
            fiscal_hash: "a".repeat(64),
        }
    }

    #[test]
    fn builds_registro_alta_xml_shape() {
        let xml = build_verifactu_xml_draft(&invoice(), None).expect("xml");

        assert!(xml.contains("<sfLR:RegFactuSistemaFacturacion"));
        assert!(xml.contains("<sf:IDVersion>1.0</sf:IDVersion>"));
        assert!(xml.contains("<sf:TipoFactura>F1</sf:TipoFactura>"));
        assert!(xml.contains("<sf:FechaExpedicionFactura>28-05-2026</sf:FechaExpedicionFactura>"));
        assert!(xml.contains("<sf:PrimerRegistro>S</sf:PrimerRegistro>"));
        assert!(xml.contains("Demo &amp; Test SL"));
        assert!(xml.contains("Cliente &lt;Uno&gt;"));
        assert!(xml.contains("<sf:TipoHuella>01</sf:TipoHuella>"));
    }

    #[test]
    fn calculates_official_aeat_first_registro_alta_hash_example() {
        let hash = calculate_registro_alta_hash(
            "89890001K",
            "12345678/G33",
            "01-01-2024",
            "F1",
            "12.35",
            "123.45",
            None,
            "2024-01-01T19:20:30+01:00",
        );

        assert_eq!(
            hash,
            "3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60"
        );
    }

    #[test]
    fn calculates_official_aeat_chained_registro_alta_hash_example() {
        let hash = calculate_registro_alta_hash(
            "89890001K",
            "12345679/G34",
            "01-01-2024",
            "F1",
            "12.35",
            "123.45",
            Some("3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60"),
            "2024-01-01T19:20:35+01:00",
        );

        assert_eq!(
            hash,
            "F7B94CFD8924EDFF273501B01EE5153E4CE8F259766F88CF6ACB8935802A2B97"
        );
    }

    #[test]
    fn calculates_official_aeat_registro_anulacion_hash_example() {
        let hash = calculate_registro_anulacion_hash(
            "89890001K",
            "12345679/G34",
            "01-01-2024",
            "F7B94CFD8924EDFF273501B01EE5153E4CE8F259766F88CF6ACB8935802A2B97",
            "2024-01-01T19:20:40+01:00",
        );

        assert_eq!(
            hash,
            "177547C0D57AC74748561D054A9CEC14B4C4EA23D1BEFD6F2E69E3A388F90C68"
        );
    }

    #[test]
    fn builds_registro_anulacion_xml_shape() {
        let xml = build_verifactu_anulacion_xml_draft(
            &invoice(),
            &previous_link(),
            "2026-05-28T12:05:00Z",
        )
        .expect("xml");

        assert!(xml.contains("<sf:RegistroAnulacion>"));
        assert!(xml.contains("<sf:IDEmisorFacturaAnulada>B00000000</sf:IDEmisorFacturaAnulada>"));
        assert!(xml.contains("<sf:NumSerieFacturaAnulada>A-7</sf:NumSerieFacturaAnulada>"));
        assert!(xml.contains("<sf:RegistroAnterior>"));
        assert!(xml.contains("<sf:TipoHuella>01</sf:TipoHuella>"));
    }

    #[test]
    fn links_previous_invoice_when_present() {
        let previous = PreviousInvoiceLink {
            company_tax_id: "B00000000".to_string(),
            series: "A".to_string(),
            number: 6,
            issued_at: "2026-05-27T09:00:00Z".to_string(),
            fiscal_hash: "b".repeat(64),
        };

        let xml = build_verifactu_xml_draft(&invoice(), Some(&previous)).expect("xml");

        assert!(xml.contains("<sf:RegistroAnterior>"));
        assert!(xml.contains("<sf:NumSerieFactura>A-6</sf:NumSerieFactura>"));
        assert!(!xml.contains("<sf:PrimerRegistro>S</sf:PrimerRegistro>"));
    }

    #[test]
    fn builds_rectifying_registro_alta_xml_shape() {
        let xml = build_verifactu_xml_draft(&rectifying_invoice(), Some(&previous_link()))
            .expect("rectifying xml");

        assert!(xml.contains("<sf:TipoFactura>R4</sf:TipoFactura>"));
        assert!(xml.contains("<sf:TipoRectificativa>I</sf:TipoRectificativa>"));
        assert!(xml.contains("<sf:FacturasRectificadas>"));
        assert!(xml.contains("<sf:NumSerieFactura>A-7</sf:NumSerieFactura>"));
        assert!(xml.contains(
            "<sf:BaseImponibleOimporteNoSujeto>-10.00</sf:BaseImponibleOimporteNoSujeto>"
        ));
    }

    #[test]
    fn builds_substitutive_rectifying_registro_alta_xml_shape() {
        let mut invoice = rectifying_invoice();
        invoice.rectification_reason_code = Some("R1".to_string());
        invoice.rectification_method = Some("S".to_string());

        let xml = build_verifactu_xml_draft(&invoice, Some(&previous_link()))
            .expect("substitutive rectifying xml");

        assert!(xml.contains("<sf:TipoFactura>R1</sf:TipoFactura>"));
        assert!(xml.contains("<sf:TipoRectificativa>S</sf:TipoRectificativa>"));
        assert!(xml.contains("<sf:ImporteRectificacion>"));
        assert!(xml.contains("<sf:BaseRectificada>100.00</sf:BaseRectificada>"));
        assert!(xml.contains("<sf:CuotaRectificada>21.00</sf:CuotaRectificada>"));
    }

    #[test]
    fn rejects_unissued_invoice() {
        let mut invoice = invoice();
        invoice.number = None;

        let error = build_verifactu_xml_draft(&invoice, None).expect_err("must reject draft");

        assert!(error.contains("issued invoice number"));
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn generated_xml_passes_local_xsd_contract() {
        let xml = build_verifactu_xml_draft(&invoice(), None).expect("xml");
        let target = std::env::temp_dir().join(format!(
            "cumplefactura-verifactu-{}.xml",
            uuid::Uuid::new_v4()
        ));
        std::fs::write(&target, xml).expect("write generated xml");

        let assets = dev_verifactu_xsd_assets().expect("dev xsd assets");
        let result = validate_verifactu_xml_file(&target, &assets);

        let _ = std::fs::remove_file(&target);

        result.expect("generated XML should pass local XSD contract");
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn write_validated_xml_export_checks_xsd_before_success() {
        let target = std::env::temp_dir().join(format!(
            "cumplefactura-verifactu-export-{}.xml",
            uuid::Uuid::new_v4()
        ));
        let assets = dev_verifactu_xsd_assets().expect("dev xsd assets");

        write_verifactu_xml_draft_validated(
            target.to_str().expect("temp path"),
            &invoice(),
            None,
            &assets,
        )
        .expect("validated export");

        assert!(target.exists());
        let _ = std::fs::remove_file(&target);
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn write_validated_anulacion_xml_export_checks_xsd_before_success() {
        let target = std::env::temp_dir().join(format!(
            "cumplefactura-verifactu-anulacion-export-{}.xml",
            uuid::Uuid::new_v4()
        ));
        let assets = dev_verifactu_xsd_assets().expect("dev xsd assets");

        write_verifactu_anulacion_xml_draft_validated(
            target.to_str().expect("temp path"),
            &invoice(),
            &previous_link(),
            "2026-05-28T12:05:00Z",
            &assets,
        )
        .expect("validated anulacion export");

        assert!(target.exists());
        let _ = std::fs::remove_file(&target);
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn write_validated_rectifying_xml_export_checks_xsd_before_success() {
        let target = std::env::temp_dir().join(format!(
            "cumplefactura-verifactu-rectifying-export-{}.xml",
            uuid::Uuid::new_v4()
        ));
        let assets = dev_verifactu_xsd_assets().expect("dev xsd assets");

        write_verifactu_xml_draft_validated(
            target.to_str().expect("temp path"),
            &rectifying_invoice(),
            Some(&previous_link()),
            &assets,
        )
        .expect("validated rectifying export");

        assert!(target.exists());
        let _ = std::fs::remove_file(&target);
    }
}
