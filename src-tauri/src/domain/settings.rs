use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub export_dir: Option<String>,
    pub default_territory_flags: Vec<String>,
    pub onboarding_completed: bool,
    pub updated_at: String,
    /// Entorno del QR tributario: "test" (prewww2, por defecto) o "production".
    #[serde(default = "default_qr_environment")]
    pub qr_environment: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettingsInput {
    pub export_dir: Option<String>,
    pub default_territory_flags: Vec<String>,
    pub onboarding_completed: bool,
    /// None conserva el valor guardado.
    #[serde(default)]
    pub qr_environment: Option<String>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            export_dir: None,
            default_territory_flags: default_flags(),
            onboarding_completed: false,
            updated_at: chrono::Utc::now().to_rfc3339(),
            qr_environment: default_qr_environment(),
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
        if let Some(env) = &self.qr_environment {
            crate::services::qr::QrEnvironment::parse(env)?;
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
        Ok(())
    }
}

pub fn default_qr_environment() -> String {
    "test".to_string()
}

pub fn default_flags() -> Vec<String> {
    vec!["CommonTerritory".to_string(), "VeriFactu".to_string()]
}
