//! Catálogo producto/servicio (SKU, precios, IVA/IRPF/dto).

use chrono::Utc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ProductKind {
    Service,
    Product,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProductInput {
    pub id: Option<String>,
    pub company_id: String,
    pub sku: String,
    pub name: String,
    pub description: String,
    pub kind: ProductKind,
    pub unit_price_cents: i64,
    pub tax_rate_basis_points: i64,
    pub withholding_rate_basis_points: Option<i64>,
    pub discount_rate_basis_points: Option<i64>,
    pub active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Product {
    pub id: String,
    pub company_id: String,
    pub sku: String,
    pub name: String,
    pub description: String,
    pub kind: ProductKind,
    pub unit_price_cents: i64,
    pub tax_rate_basis_points: i64,
    pub withholding_rate_basis_points: Option<i64>,
    pub discount_rate_basis_points: Option<i64>,
    pub active: bool,
    pub updated_at: String,
}

impl ProductInput {
    pub fn validate(&self) -> Result<(), String> {
        if let Some(id) = &self.id {
            require("id", id)?;
        }
        require("company_id", &self.company_id)?;
        require("sku", &self.sku)?;
        require("name", &self.name)?;
        require("description", &self.description)?;
        if !self
            .sku
            .chars()
            .all(|value| value.is_ascii_alphanumeric() || value == '-' || value == '_')
        {
            return Err("sku must use ASCII letters, numbers, '-' or '_'".to_string());
        }
        if self.unit_price_cents < 0 {
            return Err("unit_price_cents cannot be negative".to_string());
        }
        validate_rate("tax_rate_basis_points", self.tax_rate_basis_points)?;
        if let Some(rate) = self.withholding_rate_basis_points {
            validate_rate("withholding_rate_basis_points", rate)?;
        }
        if let Some(rate) = self.discount_rate_basis_points {
            validate_rate("discount_rate_basis_points", rate)?;
        }
        Ok(())
    }
}

impl Product {
    pub fn from_input(input: ProductInput) -> Self {
        Self {
            id: input.id.unwrap_or_else(|| Uuid::new_v4().to_string()),
            company_id: input.company_id,
            sku: input.sku.trim().to_ascii_uppercase(),
            name: input.name.trim().to_string(),
            description: input.description.trim().to_string(),
            kind: input.kind,
            unit_price_cents: input.unit_price_cents,
            tax_rate_basis_points: input.tax_rate_basis_points,
            withholding_rate_basis_points: input.withholding_rate_basis_points,
            discount_rate_basis_points: input.discount_rate_basis_points,
            active: input.active,
            updated_at: Utc::now().to_rfc3339(),
        }
    }
}

fn validate_rate(field: &str, value: i64) -> Result<(), String> {
    if (0..=10_000).contains(&value) {
        Ok(())
    } else {
        Err(format!("{field} must be between 0 and 10000"))
    }
}

fn require(field: &str, value: &str) -> Result<(), String> {
    if value.trim().is_empty() {
        Err(format!("{field} is required"))
    } else {
        Ok(())
    }
}
