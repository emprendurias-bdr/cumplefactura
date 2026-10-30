//! Cliente receptor (tipos, input, entidad).

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
            updated_at: Utc::now().to_rfc3339(),
        }
    }
}

fn require(field: &str, value: &str) -> Result<(), String> {
    if value.trim().is_empty() {
        Err(format!("{field} is required"))
    } else {
        Ok(())
    }
}
