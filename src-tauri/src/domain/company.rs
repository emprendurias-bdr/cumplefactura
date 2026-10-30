//! Empresa emisora y series de numeración (resolución de código / preview).

use chrono::Utc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompanyInput {
    pub legal_name: String,
    pub tax_id: String,
    pub address: String,
    pub postal_code: String,
    pub municipality: String,
    pub province: String,
    pub country_code: String,
    pub default_series: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompanyUpdateInput {
    pub id: String,
    pub legal_name: String,
    pub tax_id: String,
    pub address: String,
    pub postal_code: String,
    pub municipality: String,
    pub province: String,
    pub country_code: String,
    pub default_series: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InvoiceSeriesConfigInput {
    pub company_id: String,
    pub label: String,
    pub series_code: String,
    pub fiscal_year: i32,
    pub include_year: bool,
    pub separator: String,
    pub padding: i32,
    pub next_number: i64,
    pub is_default: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InvoiceSeriesConfig {
    pub id: String,
    pub company_id: String,
    pub label: String,
    pub series_code: String,
    pub fiscal_year: i32,
    pub include_year: bool,
    pub separator: String,
    pub padding: i32,
    pub next_number: i64,
    pub is_default: bool,
    pub active: bool,
    pub resolved_series: String,
    pub preview: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Company {
    pub id: String,
    pub legal_name: String,
    pub tax_id: String,
    pub address: String,
    pub postal_code: String,
    pub municipality: String,
    pub province: String,
    pub country_code: String,
    pub default_series: String,
    pub created_at: String,
}

impl CompanyInput {
    pub fn validate(&self) -> Result<(), String> {
        require("legal_name", &self.legal_name)?;
        require("tax_id", &self.tax_id)?;
        require("address", &self.address)?;
        require("postal_code", &self.postal_code)?;
        require("municipality", &self.municipality)?;
        require("province", &self.province)?;
        require("country_code", &self.country_code)?;
        Ok(())
    }
}

impl CompanyUpdateInput {
    pub fn validate(&self) -> Result<(), String> {
        require("id", &self.id)?;
        require("legal_name", &self.legal_name)?;
        require("tax_id", &self.tax_id)?;
        require("address", &self.address)?;
        require("postal_code", &self.postal_code)?;
        require("municipality", &self.municipality)?;
        require("province", &self.province)?;
        require("country_code", &self.country_code)?;
        Ok(())
    }

    pub fn normalized_default_series(&self) -> String {
        self.default_series
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("A")
            .to_string()
    }
}

impl Company {
    pub fn from_input(input: CompanyInput) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            legal_name: input.legal_name,
            tax_id: input.tax_id,
            address: input.address,
            postal_code: input.postal_code,
            municipality: input.municipality,
            province: input.province,
            country_code: input.country_code,
            default_series: input.default_series.unwrap_or_else(|| "A".to_string()),
            created_at: Utc::now().to_rfc3339(),
        }
    }
}

impl InvoiceSeriesConfigInput {
    pub fn validate(&self) -> Result<(), String> {
        require("company_id", &self.company_id)?;
        require("series_code", &self.series_code)?;
        if self.fiscal_year < 2000 || self.fiscal_year > 2100 {
            return Err("fiscal_year out of supported range".to_string());
        }
        if self.padding < 1 || self.padding > 12 {
            return Err("padding must be between 1 and 12".to_string());
        }
        if self.next_number < 1 {
            return Err("next_number must be positive".to_string());
        }
        if self.separator.len() > 3 {
            return Err("separator must be 3 characters or fewer".to_string());
        }
        if !self
            .series_code
            .chars()
            .all(|value| value.is_ascii_alphanumeric())
        {
            return Err("series_code must use only ASCII letters or numbers".to_string());
        }
        Ok(())
    }

    pub fn normalized_label(&self) -> String {
        let label = self.label.trim();
        if label.is_empty() {
            self.normalized_series_code()
        } else {
            label.to_string()
        }
    }

    pub fn normalized_series_code(&self) -> String {
        self.series_code.trim().to_ascii_uppercase()
    }

    pub fn normalized_separator(&self) -> String {
        self.separator.trim().to_string()
    }

    pub fn resolved_series(&self) -> String {
        resolve_series(
            &self.normalized_series_code(),
            self.fiscal_year,
            self.include_year,
        )
    }
}

pub fn resolve_series(series_code: &str, fiscal_year: i32, include_year: bool) -> String {
    if include_year {
        format!("{series_code}{fiscal_year}")
    } else {
        series_code.to_string()
    }
}

pub fn format_invoice_number(
    resolved_series: &str,
    separator: &str,
    padding: i32,
    number: i64,
) -> String {
    let width = usize::try_from(padding).unwrap_or(1);
    format!("{resolved_series}{separator}{number:0width$}")
}

fn require(field: &str, value: &str) -> Result<(), String> {
    if value.trim().is_empty() {
        Err(format!("{field} is required"))
    } else {
        Ok(())
    }
}
