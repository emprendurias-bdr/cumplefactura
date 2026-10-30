//! Factura: draft/issue, líneas, totales, rectificativas y payload fiscal placeholder.

use crate::domain::tax::TerritoryFlag;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
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
}

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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IssuedInvoice {
    pub invoice: Invoice,
    pub fiscal_hash: String,
    pub audit_hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FiscalPayload {
    pub invoice_id: String,
    pub provider: String,
    pub environment: String,
    pub payload_version: String,
    pub transmission_required: bool,
    pub notes: Vec<String>,
}

impl Invoice {
    pub fn draft(input: InvoiceDraftInput) -> Result<Self, String> {
        validate_draft(&input)?;
        let allow_negative_lines = matches!(input.kind, InvoiceKind::Rectifying);
        let lines = input
            .lines
            .into_iter()
            .map(|line| build_line(line, allow_negative_lines))
            .collect::<Result<Vec<_>, _>>()?;
        let totals = calculate_totals(&lines);

        Ok(Self {
            id: Uuid::new_v4().to_string(),
            company_id: input.company_id,
            customer_id: input.customer_id,
            fiscal_year: input.fiscal_year,
            series: input.series,
            number: input.number,
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

        let mut draft = input.draft;
        draft.number = Some(input.number);
        let mut invoice = Self::draft(draft)?;
        invoice.status = InvoiceStatus::Issued;
        invoice.issued_at = Some(input.issued_at);
        let fiscal_hash = invoice.fiscal_hash()?;
        Ok((invoice, fiscal_hash))
    }

    pub fn fiscal_hash(&self) -> Result<String, String> {
        let material = serde_json::to_vec(self).map_err(|err| err.to_string())?;
        let digest = Sha256::digest(material);
        Ok(hex::encode(digest))
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

fn build_line(input: InvoiceLineInput, allow_negative: bool) -> Result<InvoiceLine, String> {
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

    let gross_cents = input.quantity * input.unit_price_cents;
    let taxable_base_cents = gross_cents * i64::from(10_000 - discount_rate_basis_points) / 10_000;
    let tax_cents = taxable_base_cents * i64::from(input.tax_rate_basis_points) / 10_000;
    let withholding_cents = taxable_base_cents * i64::from(withholding_rate_basis_points) / 10_000;

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
    })
}

fn calculate_totals(lines: &[InvoiceLine]) -> InvoiceTotals {
    let taxable_base_cents = lines.iter().map(|line| line.taxable_base_cents).sum();
    let tax_cents = lines.iter().map(|line| line.tax_cents).sum();
    let withholding_cents = lines.iter().map(|line| line.withholding_cents).sum();
    InvoiceTotals {
        taxable_base_cents,
        tax_cents,
        withholding_cents,
        total_cents: taxable_base_cents + tax_cents - withholding_cents,
    }
}

fn require(field: &str, value: &str) -> Result<(), String> {
    if value.trim().is_empty() {
        Err(format!("{field} is required"))
    } else {
        Ok(())
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
}
