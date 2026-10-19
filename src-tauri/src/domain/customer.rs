use chrono::Utc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CustomerKind {
    Business,
    Individual,
    PublicAdministration,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomerInput {
    pub id: Option<String>,
    pub display_name: String,
    pub tax_id: String,
    pub kind: CustomerKind,
    pub address: String,
    pub postal_code: String,
    pub municipality: String,
    pub province: String,
    pub country_code: String,
    /// Email para envio de facturas y recordatorios (opcional).
    #[serde(default)]
    pub email: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Customer {
    pub id: String,
    pub display_name: String,
    pub tax_id: String,
    pub kind: CustomerKind,
    pub address: String,
    pub postal_code: String,
    pub municipality: String,
    pub province: String,
    pub country_code: String,
    #[serde(default)]
    pub email: Option<String>,
    pub updated_at: String,
}

impl CustomerInput {
    pub fn validate(&self) -> Result<(), String> {
        if let Some(id) = &self.id {
            require("id", id)?;
        }
        require("display_name", &self.display_name)?;
        require("tax_id", &self.tax_id)?;
        require("address", &self.address)?;
        require("postal_code", &self.postal_code)?;
        require("municipality", &self.municipality)?;
        require("province", &self.province)?;
        require("country_code", &self.country_code)?;
        if let Some(email) = self
            .email
            .as_deref()
            .map(str::trim)
            .filter(|e| !e.is_empty())
        {
            if !is_plausible_email(email) {
                return Err(format!("invalid customer email: {email}"));
            }
        }
        Ok(())
    }
}

impl Customer {
    pub fn from_input(input: CustomerInput) -> Self {
        Self {
            id: input.id.unwrap_or_else(|| Uuid::new_v4().to_string()),
            display_name: input.display_name,
            tax_id: input.tax_id,
            kind: input.kind,
            address: input.address,
            postal_code: input.postal_code,
            municipality: input.municipality,
            province: input.province,
            country_code: input.country_code,
            email: input
                .email
                .map(|e| e.trim().to_string())
                .filter(|e| !e.is_empty()),
            updated_at: Utc::now().to_rfc3339(),
        }
    }
}

/// Comprobacion basica (usuario@dominio.tld); la validacion real la hace el transporte SMTP.
pub fn is_plausible_email(value: &str) -> bool {
    let mut parts = value.split('@');
    match (parts.next(), parts.next(), parts.next()) {
        (Some(user), Some(domain), None) => {
            !user.is_empty()
                && domain.contains('.')
                && !domain.starts_with('.')
                && !domain.ends_with('.')
                && !value.contains(char::is_whitespace)
        }
        _ => false,
    }
}

fn require(field: &str, value: &str) -> Result<(), String> {
    if value.trim().is_empty() {
        Err(format!("{field} is required"))
    } else {
        Ok(())
    }
}
