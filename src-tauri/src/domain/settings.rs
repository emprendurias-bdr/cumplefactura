//! Settings de app: carpeta export, flags territoriales, onboarding, entorno VERI*FACTU
//! y dónde vive la contraseña del certificado.
//!
//! `certificate_password_mode` (ADR-002) guarda solo la preferencia, nunca la contraseña:
//! - `session` (por defecto): la interfaz la pide y la manda en cada preflight/envío;
//! - `keychain`: se acepta y se guarda, pero mientras no se apruebe la librería del
//!   llavero se comporta como `session`;
//! - `env`: la app no manda contraseña y el sidecar usa su variable de entorno.

use fiscal_contract::endpoints::{EndpointName, DEFAULT_ENDPOINT};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub export_dir: Option<String>,
    pub default_territory_flags: Vec<String>,
    pub onboarding_completed: bool,
    /// Puerto SOAP de la AEAT al que envía el sidecar. Por defecto, pruebas.
    #[serde(default = "default_endpoint_name")]
    pub verifactu_endpoint_name: String,
    /// `session` · `keychain` · `env`. Ajustes guardados antes de este campo cargan `session`.
    #[serde(default = "default_password_mode")]
    pub certificate_password_mode: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettingsInput {
    pub export_dir: Option<String>,
    pub default_territory_flags: Vec<String>,
    pub onboarding_completed: bool,
    #[serde(default = "default_endpoint_name")]
    pub verifactu_endpoint_name: String,
    #[serde(default = "default_password_mode")]
    pub certificate_password_mode: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            export_dir: None,
            default_territory_flags: default_flags(),
            onboarding_completed: false,
            verifactu_endpoint_name: default_endpoint_name(),
            certificate_password_mode: default_password_mode(),
            updated_at: chrono::Utc::now().to_rfc3339(),
        }
    }
}

impl AppSettingsInput {
    pub fn validate(&self) -> Result<(), String> {
        if let Some(path) = &self.export_dir {
            if path.trim().is_empty() {
                return Err("export_dir cannot be blank when provided".to_string());
            }
        }
        if self.default_territory_flags.is_empty() {
            return Err("default_territory_flags requires at least one flag".to_string());
        }
        for flag in &self.default_territory_flags {
            if !matches!(
                flag.as_str(),
                "CommonTerritory"
                    | "VeriFactu"
                    | "Sii"
                    | "TicketBaiBizkaia"
                    | "TicketBaiAraba"
                    | "TicketBaiGipuzkoa"
                    | "NavarraHtn"
            ) {
                return Err(format!("unsupported territory flag: {flag}"));
            }
        }
        if EndpointName::parse(&self.verifactu_endpoint_name).is_none() {
            return Err(format!(
                "unsupported VERI*FACTU endpoint: {}",
                self.verifactu_endpoint_name
            ));
        }
        if !matches!(
            self.certificate_password_mode.as_str(),
            "session" | "keychain" | "env"
        ) {
            return Err(format!(
                "unsupported certificate_password_mode: {}",
                self.certificate_password_mode
            ));
        }
        Ok(())
    }
}

impl AppSettings {
    /// `true` si la app debe mandar al sidecar la contraseña que le da la interfaz.
    /// `keychain` cuenta como `session` hasta que haya llavero.
    pub fn sends_certificate_password(&self) -> bool {
        self.certificate_password_mode != "env"
    }
}

pub fn default_flags() -> Vec<String> {
    vec!["CommonTerritory".to_string(), "VeriFactu".to_string()]
}

pub fn default_password_mode() -> String {
    "session".to_string()
}

pub fn default_endpoint_name() -> String {
    DEFAULT_ENDPOINT.as_str().to_string()
}
