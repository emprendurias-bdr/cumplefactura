//! Política del sidecar: qué se comprueba, en qué orden y qué se responde.
//!
//! Qué hace: implementa las tres operaciones del contrato (`healthz`, preflight y
//! envío) sobre un `Backend` que aporta el certificado y la llamada a la AEAT.
//!
//! Orden del envío, de menos a más arriesgado (falla cerrado en el primer problema):
//! 1. el endpoint está en la lista cerrada;
//! 2. producción solo con `--allow-production`;
//! 3. el SHA-256 del XML coincide con el que calculó la app;
//! 4. la raíz del XML es `RegFactuSistemaFacturacion`;
//! 5. las llamadas reales están permitidas (`--allow-aeat`);
//! 6. el certificado se abre;
//! 7. solo entonces se llama a la AEAT.
//!
//! Qué no hace nunca: devolver el XML de la AEAT en bruto, la referencia del
//! certificado, rutas del vault o el secreto. Solo campos interpretados.
//!
//! Por qué un `Backend` intercambiable: los tests ejercitan toda la política con
//! una AEAT falsa, sin certificados ni red.

use crate::aeat_client::HttpResponse;
use crate::config::SidecarConfig;
use crate::soap;
use fiscal_contract::endpoints::EndpointName;
use fiscal_contract::messages::{
    ErrorResponse, HealthResponse, InvokeSubmitRequest, InvokeSubmitResponse,
    SubmitPreflightRequest, SubmitPreflightResponse,
};
use std::path::Path;
use std::time::Duration;

const OPERATION: &str = "RegFactuSistemaFacturacion";
const MIN_TIMEOUT_SECONDS: u64 = 5;
const MAX_TIMEOUT_SECONDS: u64 = 120;

/// Lo que el sidecar necesita del mundo exterior.
pub trait Backend {
    /// Certificado ya abierto. En producción, `native_tls::Identity`.
    type Certificate;

    fn load_certificate(
        &self,
        vault_dir: Option<&Path>,
        certificate_ref: &str,
    ) -> Result<Self::Certificate, &'static str>;

    fn post_soap(
        &self,
        endpoint: EndpointName,
        certificate: Self::Certificate,
        envelope: &str,
        timeout: Duration,
    ) -> Result<HttpResponse, String>;
}

/// Respuesta de error con su código HTTP.
pub type Rejection = (u16, ErrorResponse);

pub fn healthz(config: &SidecarConfig) -> HealthResponse {
    HealthResponse {
        status: "ok".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        aeat_calls_enabled: config.allow_aeat,
        production_enabled: config.allow_production,
    }
}

/// ¿Se podría enviar ahora? Nunca sale a internet; acumula todos los bloqueos
/// para que la persona usuaria vea de una vez todo lo que falta.
pub fn preflight<B: Backend>(
    config: &SidecarConfig,
    backend: &B,
    request: &SubmitPreflightRequest,
) -> SubmitPreflightResponse {
    let mut blockers = Vec::new();
    let mut warnings = Vec::new();
    let endpoint = EndpointName::parse(&request.endpoint_name);
    match endpoint {
        None => blockers.push("endpoint_name_not_allowed".to_string()),
        Some(endpoint) if endpoint.is_production() && !config.allow_production => {
            blockers.push("production_endpoint_disabled".to_string())
        }
        Some(endpoint) if endpoint.is_production() => {
            warnings.push("production_endpoint_has_legal_effects".to_string())
        }
        Some(_) => {}
    }
    let certificate_loaded =
        match backend.load_certificate(config.vault_dir.as_deref(), &request.certificate_ref) {
            Ok(_) => true,
            Err(code) => {
                blockers.push(code.to_string());
                false
            }
        };
    if !config.allow_aeat {
        blockers.push("aeat_calls_disabled".to_string());
    }
    SubmitPreflightResponse {
        status: if blockers.is_empty() {
            "ready"
        } else {
            "blocked"
        }
        .to_string(),
        blockers,
        warnings,
        endpoint_name: request.endpoint_name.clone(),
        endpoint_allowed: endpoint.is_some(),
        certificate_loaded,
        certificate_source: certificate_loaded.then(|| "pkcs12_vault".to_string()),
        aeat_calls_enabled: config.allow_aeat,
        production_enabled: config.allow_production,
        external_call_performed: false,
    }
}

/// Envía el registro a la AEAT. `Err` significa que no se intentó ninguna conexión.
pub fn invoke_submit<B: Backend>(
    config: &SidecarConfig,
    backend: &B,
    request: &InvokeSubmitRequest,
) -> Result<InvokeSubmitResponse, Rejection> {
    let endpoint = EndpointName::parse(&request.endpoint_name)
        .ok_or_else(|| reject("endpoint_name_not_allowed"))?;
    if endpoint.is_production() && !config.allow_production {
        return Err(reject("production_endpoint_disabled"));
    }
    let xml_sha256 = fiscal_contract::sha256_hex(request.xml.as_bytes());
    if !xml_sha256.eq_ignore_ascii_case(request.xml_sha256.trim()) {
        return Err(reject("xml_sha256_mismatch"));
    }
    let envelope = soap::wrap_regfactu(&request.xml).map_err(reject)?;
    if !config.allow_aeat {
        return Err(reject("aeat_calls_disabled"));
    }
    let certificate = backend
        .load_certificate(config.vault_dir.as_deref(), &request.certificate_ref)
        .map_err(reject)?;

    let timeout = Duration::from_secs(
        request
            .timeout_seconds
            .clamp(MIN_TIMEOUT_SECONDS, MAX_TIMEOUT_SECONDS),
    );
    let (http_status, outcome) = match backend.post_soap(endpoint, certificate, &envelope, timeout)
    {
        Ok(response) => (Some(response.status), soap::parse_response(&response.body)),
        Err(error) => (None, soap::transport_error(&error)),
    };
    Ok(InvokeSubmitResponse {
        xml_sha256: xml_sha256.to_uppercase(),
        endpoint_name: endpoint.as_str().to_string(),
        operation: OPERATION.to_string(),
        status: outcome.status,
        http_status,
        csv: outcome.csv,
        estado_envio: outcome.estado_envio,
        estado_registro: outcome.estado_registro,
        codigo_error: outcome.codigo_error,
        descripcion_error: outcome.descripcion_error,
        tiempo_espera_envio_seconds: outcome.tiempo_espera_envio_seconds,
        soap_fault: outcome.soap_fault,
        // Se intentó la conexión: puede que la AEAT recibiera el registro aunque la
        // respuesta no llegara. La app lo trata como "no confirmado".
        external_call_performed: true,
    })
}

/// Rechazo antes de cualquier conexión saliente (HTTP 409).
pub fn reject(code: &str) -> Rejection {
    (
        409,
        ErrorResponse {
            error: code.to_string(),
            detail: None,
            external_call_performed: false,
        },
    )
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use std::cell::RefCell;

    pub const REGISTRO: &str = "<sfLR:RegFactuSistemaFacturacion xmlns:sfLR=\"https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR.xsd\"><sfLR:Cabecera/></sfLR:RegFactuSistemaFacturacion>";

    /// AEAT y vault falsos: el certificado `vault://certs/ok` existe; el resto no.
    pub struct FakeBackend {
        pub response: Result<HttpResponse, String>,
        pub calls: RefCell<Vec<(EndpointName, String)>>,
    }

    impl FakeBackend {
        pub fn answering(status: u16, body: &str) -> Self {
            Self {
                response: Ok(HttpResponse {
                    status,
                    body: body.as_bytes().to_vec(),
                }),
                calls: RefCell::new(Vec::new()),
            }
        }
    }

    impl Backend for FakeBackend {
        type Certificate = ();

        fn load_certificate(
            &self,
            _: Option<&Path>,
            certificate_ref: &str,
        ) -> Result<(), &'static str> {
            if certificate_ref == "vault://certs/ok" {
                Ok(())
            } else {
                Err("certificate_not_found")
            }
        }

        fn post_soap(
            &self,
            endpoint: EndpointName,
            _: (),
            envelope: &str,
            _: Duration,
        ) -> Result<HttpResponse, String> {
            self.calls
                .borrow_mut()
                .push((endpoint, envelope.to_string()));
            self.response.clone()
        }
    }

    fn config(allow_aeat: bool, allow_production: bool) -> SidecarConfig {
        SidecarConfig {
            shared_secret: vec![7; 32],
            allow_aeat,
            allow_production,
            vault_dir: None,
        }
    }

    fn submit(endpoint: &str, certificate_ref: &str) -> InvokeSubmitRequest {
        InvokeSubmitRequest {
            xml: REGISTRO.to_string(),
            xml_sha256: fiscal_contract::sha256_hex(REGISTRO.as_bytes()).to_uppercase(),
            endpoint_name: endpoint.to_string(),
            certificate_ref: certificate_ref.to_string(),
            timeout_seconds: 30,
        }
    }

    const ACCEPTED: &str = "<RespuestaRegFactuSistemaFacturacion><CSV>CSV1</CSV><EstadoEnvio>Correcto</EstadoEnvio></RespuestaRegFactuSistemaFacturacion>";

    #[test]
    fn preflight_reports_every_blocker_without_network() {
        let backend = FakeBackend::answering(200, ACCEPTED);
        let result = preflight(
            &config(false, false),
            &backend,
            &SubmitPreflightRequest {
                endpoint_name: "SistemaVerifactu".to_string(),
                certificate_ref: "vault://certs/falta".to_string(),
            },
        );
        assert_eq!(result.status, "blocked");
        assert_eq!(
            result.blockers,
            vec![
                "production_endpoint_disabled",
                "certificate_not_found",
                "aeat_calls_disabled"
            ]
        );
        assert!(!result.external_call_performed);
        assert!(backend.calls.borrow().is_empty());
    }

    #[test]
    fn preflight_ready_when_everything_is_in_place() {
        let result = preflight(
            &config(true, false),
            &FakeBackend::answering(200, ACCEPTED),
            &SubmitPreflightRequest {
                endpoint_name: "SistemaVerifactuPruebas".to_string(),
                certificate_ref: "vault://certs/ok".to_string(),
            },
        );
        assert_eq!(result.status, "ready");
        assert!(result.certificate_loaded && result.endpoint_allowed);
        assert_eq!(result.certificate_source.as_deref(), Some("pkcs12_vault"));
    }

    #[test]
    fn submit_checks_run_in_order_before_any_network() {
        let backend = FakeBackend::answering(200, ACCEPTED);
        let code = |cfg: SidecarConfig, request: InvokeSubmitRequest| {
            invoke_submit(&cfg, &backend, &request).unwrap_err().1.error
        };
        assert_eq!(
            code(config(true, true), submit("Otro", "vault://certs/ok")),
            "endpoint_name_not_allowed"
        );
        assert_eq!(
            code(
                config(true, false),
                submit("SistemaVerifactu", "vault://certs/ok")
            ),
            "production_endpoint_disabled"
        );
        let mut tampered = submit("SistemaVerifactuPruebas", "vault://certs/ok");
        tampered.xml.push(' ');
        assert_eq!(code(config(true, false), tampered), "xml_sha256_mismatch");
        let mut other_root = submit("SistemaVerifactuPruebas", "vault://certs/ok");
        other_root.xml = "<Otra/>".to_string();
        other_root.xml_sha256 = fiscal_contract::sha256_hex(b"<Otra/>");
        assert_eq!(
            code(config(true, false), other_root),
            "xml_root_not_regfactu"
        );
        assert_eq!(
            code(
                config(false, false),
                submit("SistemaVerifactuPruebas", "vault://certs/ok")
            ),
            "aeat_calls_disabled"
        );
        assert_eq!(
            code(
                config(true, false),
                submit("SistemaVerifactuPruebas", "vault://certs/falta")
            ),
            "certificate_not_found"
        );
        assert!(backend.calls.borrow().is_empty());
    }

    #[test]
    fn submit_wraps_xml_and_maps_aeat_answer() {
        let backend = FakeBackend::answering(200, ACCEPTED);
        let result = invoke_submit(
            &config(true, false),
            &backend,
            &submit("SistemaVerifactuPruebas", "vault://certs/ok"),
        )
        .unwrap();
        assert_eq!(result.status, "accepted");
        assert_eq!(result.csv.as_deref(), Some("CSV1"));
        assert_eq!(result.http_status, Some(200));
        assert!(result.external_call_performed);
        let calls = backend.calls.borrow();
        assert_eq!(calls[0].0, EndpointName::SistemaVerifactuPruebas);
        assert!(calls[0]
            .1
            .contains("<soapenv:Body>\n<sfLR:RegFactuSistemaFacturacion"));
        let json = serde_json::to_string(&result).unwrap();
        assert!(!json.contains("vault://") && !json.contains("RegFactuSistemaFacturacion xmlns"));
    }

    #[test]
    fn production_allowed_only_with_flag_and_network_errors_are_transport_errors() {
        let backend = FakeBackend {
            response: Err("connect_error: refused".to_string()),
            calls: RefCell::new(Vec::new()),
        };
        let result = invoke_submit(
            &config(true, true),
            &backend,
            &submit("SistemaVerifactu", "vault://certs/ok"),
        )
        .unwrap();
        assert_eq!(result.status, "transport_error");
        assert_eq!(
            result.descripcion_error.as_deref(),
            Some("connect_error: refused")
        );
        assert_eq!(result.http_status, None);
    }
}
