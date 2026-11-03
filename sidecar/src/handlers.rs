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
//! certificado, rutas del vault, el secreto o la contraseña del certificado
//! (`certificate_password` solo se pasa a `Backend::load_certificate`). Solo campos
//! interpretados.
//!
//! Caducidad del certificado (preflight): `certificate_expires_soon` si quedan ≤ 30
//! días (aviso) y `certificate_expired` si ya caducó (aviso y bloqueo).
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
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const OPERATION: &str = "RegFactuSistemaFacturacion";
/// Días antes de `notAfter` a partir de los que el preflight avisa.
const EXPIRY_WARNING_DAYS: i64 = 30;
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
        password: Option<&str>,
    ) -> Result<Self::Certificate, &'static str>;

    /// `notAfter` del certificado en segundos Unix, si se puede leer.
    fn certificate_not_after(&self, certificate: &Self::Certificate) -> Option<i64>;

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
    let mut not_after = None;
    let certificate_loaded = match backend.load_certificate(
        config.vault_dir.as_deref(),
        &request.certificate_ref,
        request.certificate_password.as_deref(),
    ) {
        Ok(certificate) => {
            not_after = backend.certificate_not_after(&certificate);
            true
        }
        Err(code) => {
            blockers.push(code.to_string());
            false
        }
    };
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |elapsed| elapsed.as_secs() as i64);
    let expires_in_days = not_after.map(|not_after| expiry_days(not_after, now));
    if not_after.is_some_and(|not_after| not_after <= now) {
        warnings.push("certificate_expired".to_string());
        blockers.push("certificate_expired".to_string());
    } else if expires_in_days.is_some_and(|days| days <= EXPIRY_WARNING_DAYS) {
        warnings.push("certificate_expires_soon".to_string());
    }
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
        certificate_expires_at: not_after.map(crate::vault::iso_utc),
        certificate_expires_in_days: expires_in_days,
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
        .load_certificate(
            config.vault_dir.as_deref(),
            &request.certificate_ref,
            request.certificate_password.as_deref(),
        )
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

/// Días completos que quedan hasta `not_after` (negativo si ya pasó).
pub fn expiry_days(not_after: i64, now: i64) -> i64 {
    (not_after - now).div_euclid(86_400)
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

    pub const PASSWORD: &str = "clave-de-prueba-123";

    /// AEAT y vault falsos: el certificado `vault://certs/ok` existe; el resto no.
    /// `vault://certs/con-clave` solo abre con `PASSWORD` en la petición.
    pub struct FakeBackend {
        pub response: Result<HttpResponse, String>,
        pub calls: RefCell<Vec<(EndpointName, String)>>,
        pub not_after: Option<i64>,
    }

    impl FakeBackend {
        pub fn answering(status: u16, body: &str) -> Self {
            Self {
                response: Ok(HttpResponse {
                    status,
                    body: body.as_bytes().to_vec(),
                }),
                calls: RefCell::new(Vec::new()),
                not_after: None,
            }
        }
    }

    impl Backend for FakeBackend {
        type Certificate = ();

        fn load_certificate(
            &self,
            _: Option<&Path>,
            certificate_ref: &str,
            password: Option<&str>,
        ) -> Result<(), &'static str> {
            match (certificate_ref, password) {
                ("vault://certs/ok", _) | ("vault://certs/con-clave", Some(PASSWORD)) => Ok(()),
                ("vault://certs/con-clave", None) => Err("certificate_password_required"),
                ("vault://certs/con-clave", _) => Err("certificate_pkcs12_invalid"),
                _ => Err("certificate_not_found"),
            }
        }

        fn certificate_not_after(&self, _: &()) -> Option<i64> {
            self.not_after
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
            certificate_password: None,
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
                certificate_password: None,
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
                certificate_password: None,
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
            not_after: None,
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

    fn preflight_with(
        backend: &FakeBackend,
        certificate_ref: &str,
        password: Option<&str>,
    ) -> SubmitPreflightResponse {
        preflight(
            &config(true, false),
            backend,
            &SubmitPreflightRequest {
                endpoint_name: "SistemaVerifactuPruebas".to_string(),
                certificate_ref: certificate_ref.to_string(),
                certificate_password: password.map(str::to_string),
            },
        )
    }

    #[test]
    fn password_from_request_reaches_vault_and_never_the_response() {
        let backend = FakeBackend::answering(200, ACCEPTED);
        let result = preflight_with(&backend, "vault://certs/con-clave", None);
        assert_eq!(result.blockers, vec!["certificate_password_required"]);
        let result = preflight_with(&backend, "vault://certs/con-clave", Some(PASSWORD));
        assert_eq!(result.status, "ready");
        assert!(!serde_json::to_string(&result).unwrap().contains(PASSWORD));

        let mut request = submit("SistemaVerifactuPruebas", "vault://certs/con-clave");
        request.certificate_password = Some(PASSWORD.to_string());
        let answer = invoke_submit(&config(true, false), &backend, &request).unwrap();
        assert!(!serde_json::to_string(&answer).unwrap().contains(PASSWORD));
        assert!(!backend.calls.borrow()[0].1.contains(PASSWORD));
        request.certificate_password = Some("otra".to_string());
        let rejected = invoke_submit(&config(true, false), &backend, &request).unwrap_err();
        assert_eq!(rejected.1.error, "certificate_pkcs12_invalid");
        assert!(rejected.1.detail.is_none());
    }

    #[test]
    fn preflight_reports_certificate_expiry() {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        let mut backend = FakeBackend::answering(200, ACCEPTED);
        let result = preflight_with(&backend, "vault://certs/ok", None);
        assert_eq!(
            (
                result.certificate_expires_at,
                result.certificate_expires_in_days
            ),
            (None, None)
        );

        backend.not_after = Some(now + 90 * 86_400 + 3_600);
        let result = preflight_with(&backend, "vault://certs/ok", None);
        assert_eq!(result.certificate_expires_in_days, Some(90));
        assert!(result.certificate_expires_at.unwrap().ends_with('Z'));
        assert!(result.warnings.is_empty() && result.status == "ready");

        backend.not_after = Some(now + 30 * 86_400 + 3_600);
        let result = preflight_with(&backend, "vault://certs/ok", None);
        assert_eq!(result.warnings, vec!["certificate_expires_soon"]);
        assert_eq!(result.status, "ready");

        backend.not_after = Some(now - 10);
        let result = preflight_with(&backend, "vault://certs/ok", None);
        assert_eq!(result.certificate_expires_in_days, Some(-1));
        assert_eq!(result.warnings, vec!["certificate_expired"]);
        assert_eq!(result.blockers, vec!["certificate_expired"]);
        assert_eq!(result.status, "blocked");
    }

    #[test]
    fn expiry_days_counts_whole_days() {
        assert_eq!(expiry_days(86_400 * 31, 0), 31);
        assert_eq!(expiry_days(86_400 * 31 - 1, 0), 30);
        assert_eq!(expiry_days(0, 0), 0);
        assert_eq!(expiry_days(-1, 0), -1);
    }
}
