//! Cliente receptor (tipos, input, entidad).

use super::require;
use super::tax_id::validate_spanish_tax_id;
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
    /// Clave L7 de `IDOtro` (02 NIF-IVA … 07 No censado). Vacío: NIF español.
    #[serde(default)]
    pub id_type: Option<String>,
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
    pub id_type: Option<String>,
    pub updated_at: String,
}

/// Claves L7 del «Diseño de registro VERI*FACTU» (Orden HAC/1177/2024) para `IDOtro/IDType`.
pub const ID_OTRO_TYPES: [&str; 6] = ["02", "03", "04", "05", "06", "07"];

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
        let country = self.country_code.as_str();
        if country.len() != 2 || !country.bytes().all(|byte| byte.is_ascii_uppercase()) {
            return Err(format!("invalid_country_code:{country}"));
        }
        match self.id_type.as_deref().filter(|value| !value.is_empty()) {
            // Sin tipo: NIF español (destinatario `NIF`), solo para clientes de España.
            None if country == "ES" => validate_spanish_tax_id(&self.tax_id),
            None => Err("foreign_customer_id_type_required".to_string()),
            // XSD `IDOtroType`: para un español con NIF se usa `NIF`, no `IDOtro` con NIF-IVA.
            Some("02") if country == "ES" => Err("spanish_customer_use_nif".to_string()),
            Some(kind) if ID_OTRO_TYPES.contains(&kind) => {
                if self.tax_id.chars().count() > 20 {
                    Err("foreign_id_too_long".to_string())
                } else {
                    Ok(())
                }
            }
            Some(kind) => Err(format!("invalid_id_type:{kind}")),
        }
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
            id_type: input.id_type.filter(|value| !value.is_empty()),
            updated_at: Utc::now().to_rfc3339(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input(tax_id: &str, country: &str, id_type: Option<&str>) -> CustomerInput {
        CustomerInput {
            id: None,
            display_name: "Cliente".to_string(),
            tax_id: tax_id.to_string(),
            kind: CustomerKind::Business,
            address: "Calle 1".to_string(),
            postal_code: "00000".to_string(),
            municipality: "Lugar".to_string(),
            province: "Lugar".to_string(),
            country_code: country.to_string(),
            id_type: id_type.map(str::to_string),
        }
    }

    #[test]
    fn spanish_customer_needs_valid_nif_and_foreign_needs_id_type() {
        assert!(input("00000000T", "ES", None).validate().is_ok());
        assert!(input("00000000T", "ES", Some("")).validate().is_ok());
        assert_eq!(
            input("00000000A", "ES", None).validate(),
            Err("invalid_tax_id:00000000A".to_string())
        );
        assert_eq!(
            input("FR12345678901", "FR", None).validate(),
            Err("foreign_customer_id_type_required".to_string())
        );
        assert!(input("FR12345678901", "FR", Some("02")).validate().is_ok());
        assert!(input("AB123456", "ES", Some("03")).validate().is_ok());
        assert_eq!(
            input("00000000T", "ES", Some("02")).validate(),
            Err("spanish_customer_use_nif".to_string())
        );
        assert_eq!(
            input("X", "FR", Some("01")).validate(),
            Err("invalid_id_type:01".to_string())
        );
        assert_eq!(
            input("X", "fr", Some("02")).validate(),
            Err("invalid_country_code:fr".to_string())
        );
        assert_eq!(
            input(&"9".repeat(21), "US", Some("04")).validate(),
            Err("foreign_id_too_long".to_string())
        );
    }
}
