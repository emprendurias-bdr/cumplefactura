//! Sidecar VERI*FACTU de CumpleFactura.
//!
//! Proceso aparte que arranca la app de escritorio. Es el único que abre el
//! certificado del contribuyente y el único que habla con la AEAT. La app le pasa
//! el registro XML ya generado y validado; el sidecar lo envuelve en SOAP, lo envía
//! por TLS mutuo y devuelve el CSV y los estados interpretados.
//!
//! Mapa de módulos (cada fichero explica qué hace, qué no hace nunca y por qué):
//!
//! | Módulo        | Responsabilidad                                       |
//! |---------------|-------------------------------------------------------|
//! | `config`      | argumentos, secreto de sesión por stdin               |
//! | `server`      | canal loopback, HMAC, enrutado                        |
//! | `handlers`    | política: orden de comprobaciones y respuestas        |
//! | `vault`       | `vault://certs/<id>` → identidad TLS                  |
//! | `soap`        | sobre SOAP y lectura de la respuesta AEAT             |
//! | `aeat_client` | único módulo con conexión saliente                    |
//!
//! La arquitectura completa está en `sidecar/ARQUITECTURA.md`.

pub mod aeat_client;
pub mod config;
pub mod handlers;
pub mod server;
pub mod soap;
pub mod vault;

use fiscal_contract::endpoints::EndpointName;
use std::path::Path;
use std::time::Duration;

/// Backend real: certificados del vault local y AEAT por HTTPS.
pub struct AeatBackend;

impl handlers::Backend for AeatBackend {
    type Certificate = native_tls::Identity;

    fn load_certificate(
        &self,
        vault_dir: Option<&Path>,
        certificate_ref: &str,
        password: Option<&str>,
    ) -> Result<Self::Certificate, &'static str> {
        vault::load(vault_dir, certificate_ref, password)
    }

    fn certificate_not_after(&self, certificate: &Self::Certificate) -> Option<i64> {
        vault::certificate_not_after(certificate)
    }

    fn post_soap(
        &self,
        endpoint: EndpointName,
        certificate: Self::Certificate,
        envelope: &str,
        timeout: Duration,
    ) -> Result<aeat_client::HttpResponse, String> {
        aeat_client::post_soap(endpoint, certificate, envelope, timeout)
    }
}
