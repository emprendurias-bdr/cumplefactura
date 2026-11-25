//! Factura: draft/issue, líneas, totales, rectificativas y payload fiscal placeholder.
//!
//! `notes` (observaciones) y `price_pending` (línea de albarán sin precio) son operativos: nunca
//! entran en la huella AEAT ni en el XML; la huella técnica de `fiscal_hash` también los ignora.

use super::require;
use crate::domain::tax::{check_vat_rate, round_div, TerritoryFlag, VatTreatment};
use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum InvoiceKind {
    Complete,
    Simplified,
    Rectifying,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum RectificationReasonCode {
    R1,
    R2,
    R3,
    R4,
    R5,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum RectificationMethod {
    I,
    S,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum InvoiceStatus {
    Draft,
    Issued,
    Void,
    Rectified,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InvoiceLineInput {
    pub description: String,
    pub quantity: i64,
    pub unit_price_cents: i64,
    pub discount_rate_basis_points: Option<i32>,
    pub tax_rate_basis_points: i32,
    pub withholding_rate_basis_points: Option<i32>,
    /// `None` en `invoice_draft_update` conserva la marca de la línea en esa posición.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub price_pending: Option<bool>,
    /// Calificación L9/L10; omitida = S1 (sujeta y no exenta).
    #[serde(default)]
    pub vat_treatment: VatTreatment,
    /// Recargo de equivalencia (Ley 37/1992 art. 161); omitido = sin recargo.
    #[serde(default)]
    pub surcharge_rate_basis_points: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InvoiceDraftInput {
    pub company_id: String,
    pub customer_id: String,
    pub fiscal_year: i32,
    pub series: String,
    pub number: Option<i64>,
    pub kind: InvoiceKind,
    pub territory_flags: Vec<TerritoryFlag>,
    pub lines: Vec<InvoiceLineInput>,
    pub rectifies_invoice_id: Option<String>,
    pub rectification_reason_code: Option<RectificationReasonCode>,
    pub rectification_method: Option<RectificationMethod>,
    #[serde(default)]
    pub notes: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InvoiceIssueInput {
    pub draft: InvoiceDraftInput,
    pub number: i64,
    pub issued_at: String,
    pub actor: String,
    pub previous_audit_hash: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InvoiceLine {
    pub id: String,
    pub description: String,
    pub quantity: i64,
    pub unit_price_cents: i64,
    pub discount_rate_basis_points: i32,
    pub taxable_base_cents: i64,
    pub tax_rate_basis_points: i32,
    pub tax_cents: i64,
    pub withholding_rate_basis_points: i32,
    pub withholding_cents: i64,
    #[serde(default)]
    pub price_pending: bool,
    // Valores por defecto fuera del JSON: la huella técnica de las facturas S1 sin recargo no cambia.
    #[serde(default, skip_serializing_if = "VatTreatment::is_s1")]
    pub vat_treatment: VatTreatment,
    #[serde(default, skip_serializing_if = "is_zero_i32")]
    pub surcharge_rate_basis_points: i32,
    #[serde(default, skip_serializing_if = "is_zero_i64")]
    pub surcharge_cents: i64,
}

fn is_zero_i32(value: &i32) -> bool {
    *value == 0
}

fn is_zero_i64(value: &i64) -> bool {
    *value == 0
}

/// `tax_cents` de los totales es la `CuotaTotal` del registro: IVA repercutido más recargo de
/// equivalencia («Diseño de registro», campo `CuotaTotal`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InvoiceTotals {
    pub taxable_base_cents: i64,
    pub tax_cents: i64,
    pub withholding_cents: i64,
    pub total_cents: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Invoice {
    pub id: String,
    pub company_id: String,
    pub customer_id: String,
    pub fiscal_year: i32,
    pub series: String,
    pub number: Option<i64>,
    /// `NumSerieFactura` fijado al emitir con el formato de la serie; `None` en borradores.
    #[serde(default)]
    pub num_serie: Option<String>,
    pub kind: InvoiceKind,
    pub status: InvoiceStatus,
    pub territory_flags: Vec<TerritoryFlag>,
    pub rectifies_invoice_id: Option<String>,
    pub rectification_reason_code: Option<RectificationReasonCode>,
    pub rectification_method: Option<RectificationMethod>,
    pub lines: Vec<InvoiceLine>,
    pub totals: InvoiceTotals,
    pub created_at: String,
    pub issued_at: Option<String>,
    #[serde(default)]
    pub notes: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IssuedInvoice {
    pub invoice: Invoice,
    pub fiscal_hash: String,
    pub audit_hash: String,
}

impl Invoice {
    /// Borrador con los tipos vigentes hoy; `issue` vuelve a comprobarlos en su fecha.
    pub fn draft(input: InvoiceDraftInput) -> Result<Self, String> {
        Self::draft_on(input, Utc::now().date_naive())
    }

    /// `operation_date`: fecha de devengo para la tabla de tipos (Ley 37/1992 art. 90.Dos).
    /// La app no pide fecha de operación aparte: es la de expedición (`FechaOperacion`).
    fn draft_on(input: InvoiceDraftInput, operation_date: NaiveDate) -> Result<Self, String> {
        validate_draft(&input)?;
        validate_vat_lines(&input, operation_date)?;
        let allow_negative_lines = matches!(input.kind, InvoiceKind::Rectifying);
        let lines = build_lines(input.lines, allow_negative_lines)?;
        let totals = calculate_totals(&lines);

        Ok(Self {
            id: Uuid::new_v4().to_string(),
            company_id: input.company_id,
            customer_id: input.customer_id,
            fiscal_year: input.fiscal_year,
            series: input.series,
            number: input.number,
            num_serie: None,
            kind: input.kind,
            status: InvoiceStatus::Draft,
            territory_flags: input.territory_flags,
            rectifies_invoice_id: input.rectifies_invoice_id,
            rectification_reason_code: input.rectification_reason_code,
            rectification_method: input.rectification_method,
            lines,
            totals,
            created_at: Utc::now().to_rfc3339(),
            issued_at: None,
            notes: input.notes.trim().to_string(),
        })
    }

    pub fn issue(input: InvoiceIssueInput) -> Result<(Self, String), String> {
        if input.number <= 0 {
            return Err("invoice number must be positive".to_string());
        }
        if input.issued_at.trim().is_empty() {
            return Err("issued_at is required".to_string());
        }
        if input.actor.trim().is_empty() {
            return Err("actor is required".to_string());
        }

        let operation_date = DateTime::parse_from_rfc3339(&input.issued_at)
            .map_err(|err| format!("invalid issued_at: {err}"))?
            .date_naive();
        let mut draft = input.draft;
        draft.number = Some(input.number);
        let mut invoice = Self::draft_on(draft, operation_date)?;
        invoice.status = InvoiceStatus::Issued;
        invoice.issued_at = Some(input.issued_at);
        let fiscal_hash = invoice.fiscal_hash()?;
        Ok((invoice, fiscal_hash))
    }

    pub fn fiscal_hash(&self) -> Result<String, String> {
        let mut operational_free = self.clone();
        operational_free.notes.clear();
        for line in &mut operational_free.lines {
            line.price_pending = false;
        }
        let material = serde_json::to_vec(&operational_free).map_err(|err| err.to_string())?;
        let digest = Sha256::digest(material);
        Ok(fiscal_contract::to_hex(&digest))
    }
}

fn validate_draft(input: &InvoiceDraftInput) -> Result<(), String> {
    require("company_id", &input.company_id)?;
    require("customer_id", &input.customer_id)?;
    require("series", &input.series)?;
    if input.fiscal_year < 2000 || input.fiscal_year > 2100 {
        return Err("fiscal_year out of supported range".to_string());
    }
    if matches!(input.kind, InvoiceKind::Rectifying) && input.rectifies_invoice_id.is_none() {
        return Err("rectifying invoices require rectifies_invoice_id".to_string());
    }
    if matches!(input.kind, InvoiceKind::Rectifying)
        && (input.rectification_reason_code.is_none() || input.rectification_method.is_none())
    {
        return Err("rectifying invoices require reason code and method".to_string());
    }
    if !matches!(input.kind, InvoiceKind::Rectifying)
        && (input.rectification_reason_code.is_some() || input.rectification_method.is_some())
    {
        return Err("rectification metadata requires Rectifying kind".to_string());
    }
    if input.lines.is_empty() {
        return Err("invoice requires at least one line".to_string());
    }
    Ok(())
}

pub(crate) fn build_line(
    input: InvoiceLineInput,
    allow_negative: bool,
) -> Result<InvoiceLine, String> {
    require("line.description", &input.description)?;
    if input.quantity <= 0 {
        return Err("line.quantity must be positive".to_string());
    }
    if input.unit_price_cents < 0 && !allow_negative {
        return Err("line.unit_price_cents cannot be negative".to_string());
    }
    if input.tax_rate_basis_points < 0 {
        return Err("line.tax_rate_basis_points cannot be negative".to_string());
    }
    let discount_rate_basis_points = input.discount_rate_basis_points.unwrap_or(0);
    if !(0..=10_000).contains(&discount_rate_basis_points) {
        return Err("line.discount_rate_basis_points must be between 0 and 10000".to_string());
    }

    let withholding_rate_basis_points = input.withholding_rate_basis_points.unwrap_or(0);
    if withholding_rate_basis_points < 0 {
        return Err("line.withholding_rate_basis_points cannot be negative".to_string());
    }

    let surcharge_rate_basis_points = input.surcharge_rate_basis_points.unwrap_or(0);
    if surcharge_rate_basis_points < 0 {
        return Err("line.surcharge_rate_basis_points cannot be negative".to_string());
    }

    // Redondeo al céntimo más próximo (la mitad se aleja de cero) en lugar de truncar.
    // Cantidades enormes dan error, no un importe desbordado.
    let gross_cents = input
        .quantity
        .checked_mul(input.unit_price_cents)
        .ok_or_else(|| "line_amount_too_large".to_string())?;
    let taxable_base_cents = percent_of(gross_cents, 10_000 - discount_rate_basis_points)?;
    let tax_cents = percent_of(taxable_base_cents, input.tax_rate_basis_points)?;
    let surcharge_cents = percent_of(taxable_base_cents, surcharge_rate_basis_points)?;
    let withholding_cents = percent_of(taxable_base_cents, withholding_rate_basis_points)?;

    Ok(InvoiceLine {
        id: Uuid::new_v4().to_string(),
        description: input.description,
        quantity: input.quantity,
        unit_price_cents: input.unit_price_cents,
        discount_rate_basis_points,
        taxable_base_cents,
        tax_rate_basis_points: input.tax_rate_basis_points,
        tax_cents,
        withholding_rate_basis_points,
        withholding_cents,
        // Con precio ya no está pendiente: la marca solo bloquea líneas a 0 €.
        price_pending: input.price_pending.unwrap_or(false) && input.unit_price_cents == 0,
        vat_treatment: input.vat_treatment,
        surcharge_rate_basis_points,
        surcharge_cents,
    })
}

/// `amount × basis_points / 10 000` redondeado al céntimo.
fn percent_of(amount: i64, basis_points: i32) -> Result<i64, String> {
    amount
        .checked_mul(i64::from(basis_points))
        .map(|value| round_div(value, 10_000))
        .ok_or_else(|| "line_amount_too_large".to_string())
}

/// Líneas de una factura con la cuota de cada grupo del desglose cuadrada al céntimo.
///
/// La cuota se calcula sobre la base agregada de cada grupo (calificación, tipo y recargo), que es
/// lo que declara cada `DetalleDesglose` (RD 1619/2012 art. 6.1.g-h y 6.2.c: cuota por tipo). La
/// diferencia con la suma de cuotas por línea (como mucho medio céntimo por línea) se asigna a la
/// línea de mayor base del grupo, para que líneas, totales y XML sumen lo mismo.
pub(crate) fn build_lines(
    inputs: Vec<InvoiceLineInput>,
    allow_negative: bool,
) -> Result<Vec<InvoiceLine>, String> {
    let mut lines = inputs
        .into_iter()
        .map(|line| build_line(line, allow_negative))
        .collect::<Result<Vec<_>, _>>()?;
    let mut groups: BTreeMap<(VatTreatment, i32, i32), Vec<usize>> = BTreeMap::new();
    for (index, line) in lines.iter().enumerate() {
        groups
            .entry((
                line.vat_treatment,
                line.tax_rate_basis_points,
                line.surcharge_rate_basis_points,
            ))
            .or_default()
            .push(index);
    }
    for ((_, tax_rate, surcharge_rate), indexes) in groups {
        let base = indexes
            .iter()
            .try_fold(0i64, |sum, &i| sum.checked_add(lines[i].taxable_base_cents))
            .ok_or_else(|| "line_amount_too_large".to_string())?;
        let tax_diff =
            percent_of(base, tax_rate)? - indexes.iter().map(|&i| lines[i].tax_cents).sum::<i64>();
        let surcharge_diff = percent_of(base, surcharge_rate)?
            - indexes
                .iter()
                .map(|&i| lines[i].surcharge_cents)
                .sum::<i64>();
        let largest = *indexes
            .iter()
            .max_by_key(|&&i| lines[i].taxable_base_cents.abs())
            .expect("group has lines");
        lines[largest].tax_cents += tax_diff;
        lines[largest].surcharge_cents += surcharge_diff;
    }
    Ok(lines)
}

/// Calificación, tipos y recargo de cada línea frente a la norma vigente en `operation_date`.
fn validate_vat_lines(input: &InvoiceDraftInput, operation_date: NaiveDate) -> Result<(), String> {
    // F2 y R5: la simplificada no identifica al destinatario (RD 1619/2012 art. 7.1).
    let simplified = matches!(input.kind, InvoiceKind::Simplified)
        || input.rectification_reason_code == Some(RectificationReasonCode::R5);
    for line in &input.lines {
        let treatment = line.vat_treatment;
        if simplified && treatment == VatTreatment::E5 {
            // RD 1619/2012 art. 4.4.a: no cabe simplificada en entregas intracomunitarias.
            return Err("simplified_not_allowed_for:E5".to_string());
        }
        if simplified && treatment == VatTreatment::S2 {
            // La inversión del sujeto pasivo exige identificar al destinatario (art. 6.1.d y m).
            return Err("simplified_not_allowed_for:S2".to_string());
        }
        check_vat_rate(
            operation_date,
            treatment,
            line.tax_rate_basis_points,
            line.surcharge_rate_basis_points.unwrap_or(0),
        )?;
    }
    Ok(())
}

pub(crate) fn calculate_totals(lines: &[InvoiceLine]) -> InvoiceTotals {
    let taxable_base_cents = lines.iter().map(|line| line.taxable_base_cents).sum();
    let tax_cents = lines
        .iter()
        .map(|line| line.tax_cents + line.surcharge_cents)
        .sum();
    let withholding_cents = lines.iter().map(|line| line.withholding_cents).sum();
    InvoiceTotals {
        taxable_base_cents,
        tax_cents,
        withholding_cents,
        total_cents: taxable_base_cents + tax_cents - withholding_cents,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base_line() -> InvoiceLineInput {
        InvoiceLineInput {
            description: "Servicio profesional".to_string(),
            quantity: 2,
            unit_price_cents: 10_000,
            discount_rate_basis_points: None,
            tax_rate_basis_points: 2_100,
            withholding_rate_basis_points: Some(1_500),
            price_pending: None,
            vat_treatment: VatTreatment::S1,
            surcharge_rate_basis_points: None,
        }
    }

    fn base_draft() -> InvoiceDraftInput {
        InvoiceDraftInput {
            company_id: "company-1".to_string(),
            customer_id: "customer-1".to_string(),
            fiscal_year: 2026,
            series: "A".to_string(),
            number: None,
            kind: InvoiceKind::Complete,
            territory_flags: vec![TerritoryFlag::CommonTerritory, TerritoryFlag::VeriFactu],
            lines: vec![base_line()],
            rectifies_invoice_id: None,
            rectification_reason_code: None,
            rectification_method: None,
            notes: String::new(),
        }
    }

    #[test]
    fn draft_calculates_tax_and_withholding_totals() {
        let invoice = Invoice::draft(base_draft()).expect("valid draft");

        assert_eq!(invoice.totals.taxable_base_cents, 20_000);
        assert_eq!(invoice.totals.tax_cents, 4_200);
        assert_eq!(invoice.totals.withholding_cents, 3_000);
        assert_eq!(invoice.totals.total_cents, 21_200);
    }

    #[test]
    fn rectifying_invoice_requires_source_invoice() {
        let mut draft = base_draft();
        draft.kind = InvoiceKind::Rectifying;

        let err = Invoice::draft(draft).expect_err("rectifying invoice without source must fail");
        assert!(err.contains("rectifies_invoice_id"));
    }

    #[test]
    fn rectifying_invoice_allows_negative_adjustment_line() {
        let mut draft = base_draft();
        draft.kind = InvoiceKind::Rectifying;
        draft.rectifies_invoice_id = Some("source-invoice".to_string());
        draft.rectification_reason_code = Some(RectificationReasonCode::R4);
        draft.rectification_method = Some(RectificationMethod::I);
        draft.lines[0].unit_price_cents = -1_000;

        let invoice = Invoice::draft(draft).expect("rectifying draft");

        assert_eq!(invoice.totals.taxable_base_cents, -2_000);
        assert_eq!(invoice.totals.tax_cents, -420);
        assert_eq!(invoice.totals.total_cents, -2_120);
    }

    #[test]
    fn draft_applies_line_discount_before_tax_and_withholding() {
        let mut draft = base_draft();
        draft.lines[0].discount_rate_basis_points = Some(1_000);

        let invoice = Invoice::draft(draft).expect("discounted draft");

        assert_eq!(invoice.lines[0].discount_rate_basis_points, 1_000);
        assert_eq!(invoice.totals.taxable_base_cents, 18_000);
        assert_eq!(invoice.totals.tax_cents, 3_780);
        assert_eq!(invoice.totals.withholding_cents, 2_700);
        assert_eq!(invoice.totals.total_cents, 19_080);
    }

    #[test]
    fn rectifying_invoice_requires_reason_code_and_method() {
        let mut draft = base_draft();
        draft.kind = InvoiceKind::Rectifying;
        draft.rectifies_invoice_id = Some("source-invoice".to_string());

        let err = Invoice::draft(draft).expect_err("missing metadata");

        assert!(err.contains("reason code and method"));
    }

    #[test]
    fn issue_requires_positive_number() {
        let input = InvoiceIssueInput {
            draft: base_draft(),
            number: 0,
            issued_at: "2026-05-28T10:00:00Z".to_string(),
            actor: "test".to_string(),
            previous_audit_hash: None,
        };

        let err = Invoice::issue(input).expect_err("zero number must fail");
        assert!(err.contains("positive"));
    }

    #[test]
    fn notes_and_price_pending_stay_out_of_the_technical_hash() {
        let issue = |notes: &str, pending: Option<bool>| {
            let mut draft = base_draft();
            draft.notes = notes.to_string();
            draft.lines[0].price_pending = pending;
            Invoice::issue(InvoiceIssueInput {
                draft,
                number: 1,
                issued_at: "2026-05-28T10:00:00Z".to_string(),
                actor: "test".to_string(),
                previous_audit_hash: None,
            })
            .expect("issue")
        };
        let (plain, _) = issue("", None);
        let (noted, _) = issue("Pago a 30 días", Some(true));
        assert_eq!(noted.notes, "Pago a 30 días");
        // Con precio, la marca de pendiente desaparece sola.
        assert!(!noted.lines[0].price_pending);
        assert_eq!(plain.notes, "");
        let mut a = plain.clone();
        let mut b = noted.clone();
        a.id = "same".into();
        b.id = "same".into();
        b.lines[0].id = a.lines[0].id.clone();
        b.created_at = a.created_at.clone();
        assert_eq!(a.fiscal_hash(), b.fiscal_hash());

        let mut zero = base_draft();
        zero.lines[0].unit_price_cents = 0;
        zero.lines[0].price_pending = Some(true);
        assert!(Invoice::draft(zero).expect("draft").lines[0].price_pending);
    }

    #[test]
    fn fiscal_hash_changes_when_number_changes() {
        let first = InvoiceIssueInput {
            draft: base_draft(),
            number: 1,
            issued_at: "2026-05-28T10:00:00Z".to_string(),
            actor: "test".to_string(),
            previous_audit_hash: None,
        };
        let second = InvoiceIssueInput {
            draft: base_draft(),
            number: 2,
            issued_at: "2026-05-28T10:00:00Z".to_string(),
            actor: "test".to_string(),
            previous_audit_hash: None,
        };

        let (_, first_hash) = Invoice::issue(first).expect("first invoice");
        let (_, second_hash) = Invoice::issue(second).expect("second invoice");

        assert_ne!(first_hash, second_hash);
    }

    fn line(cents: i64, quantity: i64) -> InvoiceLineInput {
        InvoiceLineInput {
            quantity,
            unit_price_cents: cents,
            withholding_rate_basis_points: None,
            ..base_line()
        }
    }

    fn draft_with(lines: Vec<InvoiceLineInput>) -> Result<Invoice, String> {
        let mut draft = base_draft();
        draft.lines = lines;
        Invoice::draft(draft)
    }

    #[test]
    fn tax_rounds_half_cent_up_instead_of_truncating() {
        // 0,50 € al 21 % = 0,105 € → 0,11 € (antes se truncaba a 0,10 €).
        let invoice = draft_with(vec![line(50, 1)]).expect("draft");
        assert_eq!(invoice.totals.tax_cents, 11);
        assert_eq!(invoice.totals.total_cents, 61);
    }

    #[test]
    fn discount_base_and_tax_round_to_the_cent() {
        // 3 × 3,33 € = 9,99 €; −10 % = 8,991 € → 8,99 €; 21 % = 1,8879 € → 1,89 €.
        let mut input = line(333, 3);
        input.discount_rate_basis_points = Some(1_000);
        let invoice = draft_with(vec![input]).expect("draft");
        assert_eq!(invoice.totals.taxable_base_cents, 899);
        assert_eq!(invoice.totals.tax_cents, 189);
    }

    #[test]
    fn several_lines_of_one_rate_round_on_the_aggregated_base() {
        // Por línea serían 3 × 0,11 € = 0,33 €; sobre la base de 1,50 €: 0,315 € → 0,32 €.
        let invoice = draft_with(vec![line(50, 1), line(50, 1), line(50, 1)]).expect("draft");
        assert_eq!(invoice.totals.taxable_base_cents, 150);
        assert_eq!(invoice.totals.tax_cents, 32);
        let line_sum: i64 = invoice.lines.iter().map(|line| line.tax_cents).sum();
        assert_eq!(line_sum, 32, "líneas y totales suman lo mismo");
    }

    #[test]
    fn negative_rectifying_half_cent_rounds_away_from_zero() {
        let mut draft = base_draft();
        draft.kind = InvoiceKind::Rectifying;
        draft.rectifies_invoice_id = Some("source-invoice".to_string());
        draft.rectification_reason_code = Some(RectificationReasonCode::R4);
        draft.rectification_method = Some(RectificationMethod::I);
        draft.lines = vec![line(-50, 1), line(-50, 1)];
        let invoice = Invoice::draft(draft).expect("rectifying draft");
        // −1,00 € al 21 % = −0,21 € exactos; cada línea sola sería −0,105 € → −0,11 €.
        assert_eq!(invoice.totals.tax_cents, -21);
        assert_eq!(invoice.totals.total_cents, -121);
    }

    #[test]
    fn large_amounts_are_exact_and_overflow_is_an_error() {
        let invoice = draft_with(vec![line(99_999_999, 1_000_000)]).expect("draft");
        assert_eq!(invoice.totals.taxable_base_cents, 99_999_999_000_000);
        assert_eq!(invoice.totals.tax_cents, 20_999_999_790_000);
        let err = draft_with(vec![line(i64::MAX / 2, 3)]).expect_err("overflow");
        assert_eq!(err, "line_amount_too_large");
    }

    #[test]
    fn equivalence_surcharge_adds_to_cuota_total() {
        let mut input = line(10_000, 1);
        input.surcharge_rate_basis_points = Some(520);
        let invoice = draft_with(vec![input]).expect("draft");
        assert_eq!(invoice.lines[0].tax_cents, 2_100);
        assert_eq!(invoice.lines[0].surcharge_cents, 520);
        assert_eq!(invoice.totals.tax_cents, 2_620);
        assert_eq!(invoice.totals.total_cents, 12_620);

        let mut wrong = line(10_000, 1);
        wrong.tax_rate_basis_points = 1_000;
        wrong.surcharge_rate_basis_points = Some(520);
        assert!(draft_with(vec![wrong])
            .unwrap_err()
            .starts_with("surcharge_rate_unknown"));
    }

    #[test]
    fn unknown_rates_and_non_s1_with_rate_are_rejected() {
        let mut sixteen = line(10_000, 1);
        sixteen.tax_rate_basis_points = 1_600;
        assert_eq!(
            draft_with(vec![sixteen]).unwrap_err(),
            "vat_rate_unknown:1600"
        );

        let mut s2 = line(10_000, 1);
        s2.vat_treatment = VatTreatment::S2;
        assert_eq!(
            draft_with(vec![s2.clone()]).unwrap_err(),
            "vat_rate_not_allowed_for:S2"
        );
        s2.tax_rate_basis_points = 0;
        let invoice = draft_with(vec![s2]).expect("S2 sin cuota");
        assert_eq!(invoice.totals.tax_cents, 0);
        assert_eq!(invoice.lines[0].vat_treatment, VatTreatment::S2);
    }

    #[test]
    fn simplified_invoice_rejects_reverse_charge_and_intra_eu_exemption() {
        for treatment in [VatTreatment::S2, VatTreatment::E5] {
            let mut draft = base_draft();
            draft.kind = InvoiceKind::Simplified;
            draft.lines[0].vat_treatment = treatment;
            draft.lines[0].tax_rate_basis_points = 0;
            let err = Invoice::draft(draft).expect_err("simplificada");
            assert_eq!(
                err,
                format!("simplified_not_allowed_for:{}", treatment.code())
            );
        }
    }

    #[test]
    fn issue_checks_rates_on_the_operation_date() {
        let input = InvoiceIssueInput {
            draft: base_draft(),
            number: 1,
            issued_at: "2024-06-01T10:00:00Z".to_string(),
            actor: "test".to_string(),
            previous_audit_hash: None,
        };
        let err = Invoice::issue(input).expect_err("sin tabla de 2024");
        assert!(err.starts_with("vat_rate_table_missing"));
    }

    #[test]
    fn default_line_fields_stay_out_of_the_technical_hash_json() {
        let invoice = draft_with(vec![line(10_000, 1)]).expect("draft");
        let json = serde_json::to_string(&invoice.lines[0]).expect("json");
        assert!(!json.contains("vat_treatment"));
        assert!(!json.contains("surcharge"));
    }
}
