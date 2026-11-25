//! Settings de app: carpeta export, flags territoriales, onboarding, entorno VERI*FACTU
//! y dónde vive la contraseña del certificado.
//!
//! `certificate_password_mode` (ADR-002) guarda solo la preferencia, nunca la contraseña:
//! - `session` (por defecto): la interfaz la pide y la manda en cada preflight/envío;
//! - `keychain`: se acepta y se guarda, pero mientras no se apruebe la librería del
//!   llavero se comporta como `session`;
//! - `env`: la app no manda contraseña y el sidecar usa su variable de entorno.
//!
//! `qr_environment` (`test` por defecto, `production`) elige el host de cotejo del QR
//! tributario del PDF; se cambia a producción al homologar.
//!
//! Envío a la AEAT (S3): `aeat_sending_enabled` (apagado por defecto) decide si el sidecar
//! arranca con `--allow-aeat`; `verifactu_environment` (`test` por defecto, `production`)
//! decide el entorno y si arranca con `--allow-production`. Pasar a producción exige
//! `production_confirmed` en la petición (el diálogo de confirmación de Ajustes).
//! `verifactu_endpoint_name` solo aporta el tipo de certificado (persona o sello): el puerto
//! real lo da `effective_endpoint`, así que en pruebas nunca se usa uno de producción.

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
    /// `test` · `production`. Ajustes guardados antes de este campo cargan `test`.
    #[serde(default = "default_qr_environment")]
    pub qr_environment: String,
    /// Envío real a la AEAT. Ajustes guardados antes de este campo cargan `false`.
    #[serde(default)]
    pub aeat_sending_enabled: bool,
    /// `test` · `production`. Ajustes guardados antes de este campo cargan `test`.
    #[serde(default = "default_qr_environment")]
    pub verifactu_environment: String,
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
    #[serde(default = "default_qr_environment")]
    pub qr_environment: String,
    #[serde(default)]
    pub aeat_sending_enabled: bool,
    #[serde(default = "default_qr_environment")]
    pub verifactu_environment: String,
    /// Solo en la petición: el usuario confirmó el paso a producción en el diálogo.
    #[serde(default)]
    pub production_confirmed: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            export_dir: None,
            default_territory_flags: default_flags(),
            onboarding_completed: false,
            verifactu_endpoint_name: default_endpoint_name(),
            certificate_password_mode: default_password_mode(),
            qr_environment: default_qr_environment(),
            aeat_sending_enabled: false,
            verifactu_environment: default_qr_environment(),
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
        crate::services::qr::QrEnvironment::parse(&self.qr_environment)?;
        if !matches!(self.verifactu_environment.as_str(), "test" | "production") {
            return Err(format!(
                "unsupported verifactu_environment: {}",
                self.verifactu_environment
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

    pub fn is_production(&self) -> bool {
        self.verifactu_environment == "production"
    }

    /// Puerto SOAP al que se envía: el tipo de certificado guardado, en el entorno elegido.
    /// En pruebas nunca devuelve un puerto de producción, aunque se guardara uno.
    pub fn effective_endpoint(&self) -> EndpointName {
        let sello = matches!(
            EndpointName::parse(&self.verifactu_endpoint_name),
            Some(EndpointName::SistemaVerifactuSello | EndpointName::SistemaVerifactuSelloPruebas)
        );
        match (self.is_production(), sello) {
            (true, true) => EndpointName::SistemaVerifactuSello,
            (true, false) => EndpointName::SistemaVerifactu,
            (false, true) => EndpointName::SistemaVerifactuSelloPruebas,
            (false, false) => EndpointName::SistemaVerifactuPruebas,
        }
    }

    /// Banderas del sidecar: `(--allow-aeat, --allow-production)`.
    /// `env_allow_aeat` es `CUMPLEFACTURA_SIDECAR_ALLOW_AEAT=1` (gate y homologación).
    /// Producción solo con el envío real encendido en Ajustes: la variable nunca la abre.
    pub fn sidecar_flags(&self, env_allow_aeat: bool) -> (bool, bool) {
        let production = self.aeat_sending_enabled && self.is_production();
        (self.aeat_sending_enabled || env_allow_aeat, production)
    }
}

pub fn default_flags() -> Vec<String> {
    vec!["CommonTerritory".to_string(), "VeriFactu".to_string()]
}

pub fn default_qr_environment() -> String {
    "test".to_string()
}

pub fn default_password_mode() -> String {
    "session".to_string()
}

pub fn default_endpoint_name() -> String {
    DEFAULT_ENDPOINT.as_str().to_string()
}
