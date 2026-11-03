//! Envío VERI*FACTU desde la app: del XML exportado a la respuesta de la AEAT.
//!
//! Flujo:
//! 1. `record_xml_export`: tras generar y validar el XML contra el XSD, guarda su
//!    SHA-256 en `fiscal_exports` (`xml_exported`). Ese hash identifica el registro.
//! 2. `read_checked_xml`: antes de preflight o envío, relee el fichero y exige que
//!    su SHA-256 siga siendo el exportado. Así no hace falta volver a validar el XSD
//!    y nadie puede cambiar el XML entre la exportación y el envío.
//! 3. `check_wait_time`: si la última respuesta de la AEAT para esa empresa y ese
//!    endpoint pidió esperar (`TiempoEsperaEnvio`) y no ha pasado el tiempo, no se envía.
//! 4. `preflight` y `submit` hablan con el sidecar por el canal loopback firmado.
//!    Toda respuesta del envío, también `transport_error`, se guarda en
//!    `verifactu_submissions`. Reintentar es siempre una decisión manual: aquí no
//!    hay reintentos automáticos.
//!
//! Qué comprueba de la respuesta del sidecar (defensa en profundidad):
//! - el preflight nunca dice haber llamado a la AEAT;
//! - el envío devuelve el mismo SHA-256 que se mandó;
//! - la respuesta no contiene la referencia del certificado, el secreto de sesión
//!   ni la contraseña del certificado.
//!
//! Qué no hace nunca: firmar, abrir certificados o hablar con la AEAT. Eso es el sidecar.
//! Tampoco guarda ni registra `certificate_password`: solo la reenvía al sidecar.
//! Sin firma XAdES: RD 1007/2023 art. 16.3 (ver `sidecar/ARQUITECTURA.md`).

use crate::services::sidecar_process::SidecarClient;
use chrono::{DateTime, Utc};
use fiscal_contract::messages::{
    InvokeSubmitRequest, InvokeSubmitResponse, SubmitPreflightRequest, SubmitPreflightResponse,
};
use fiscal_contract::{PATH_INVOKE_SUBMIT, PATH_SUBMIT_PREFLIGHT};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;

pub const PROVIDER: &str = "AEAT-VERIFACTU";
pub const PAYLOAD_VERSION: &str = "verifactu-xml-v1";
/// Tiempo máximo que el sidecar espera a la AEAT.
const AEAT_TIMEOUT_SECONDS: u64 = 30;
/// Margen del canal local sobre el tiempo de la AEAT.
const LOOPBACK_TIMEOUT: Duration = Duration::from_secs(AEAT_TIMEOUT_SECONDS + 15);
/// Por debajo de esta longitud, buscar la contraseña en la respuesta daría falsos
/// positivos (un «1234» aparece en cualquier código) y bloquearía un envío ya hecho.
const MIN_PASSWORD_LEAK_CHECK_LEN: usize = 8;

/// Exportación XML registrada, lista para enviar.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XmlExport {
    pub export_id: String,
    pub xml_sha256: String,
    pub xml_bytes: usize,
}

/// Datos que la UI envía para preflight y envío.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubmitInput {
    pub invoice_id: String,
    pub export_id: String,
    pub xml_path: String,
    pub xml_sha256: String,
    pub certificate_ref: String,
    /// Contraseña del certificado en modo «solo durante esta sesión». Nunca se serializa.
    #[serde(default, skip_serializing)]
    pub certificate_password: Option<String>,
}

/// SHA-256 en mayúsculas, como las huellas de la AEAT.
pub fn sha256_upper(bytes: &[u8]) -> String {
    fiscal_contract::sha256_hex(bytes).to_uppercase()
}

/// Registra en `fiscal_exports` el XML recién exportado.
pub fn record_xml_export(
    conn: &Connection,
    invoice_id: &str,
    xml_path: &str,
) -> Result<XmlExport, String> {
    let bytes = std::fs::read(xml_path).map_err(|err| format!("XML read error: {err}"))?;
    let xml_sha256 = sha256_upper(&bytes);
    let export_id = crate::db::insert_fiscal_export(
        conn,
        invoice_id,
        PROVIDER,
        "local",
        PAYLOAD_VERSION,
        &xml_sha256,
        "xml_exported",
    )?;
    Ok(XmlExport {
        export_id,
        xml_sha256,
        xml_bytes: bytes.len(),
    })
}

/// Relee el XML y comprueba que es el que se exportó. Devuelve su contenido.
pub fn read_checked_xml(input: &SubmitInput) -> Result<String, String> {
    for (field, value) in [
        ("invoice_id", &input.invoice_id),
        ("export_id", &input.export_id),
        ("xml_path", &input.xml_path),
        ("xml_sha256", &input.xml_sha256),
        ("certificate_ref", &input.certificate_ref),
    ] {
        if value.trim().is_empty() {
            return Err(format!("{field} is required"));
        }
    }
    let xml =
        std::fs::read_to_string(&input.xml_path).map_err(|err| format!("XML read error: {err}"))?;
    if !sha256_upper(xml.as_bytes()).eq_ignore_ascii_case(input.xml_sha256.trim()) {
        return Err("xml_sha256_mismatch: el XML cambió desde que se exportó".to_string());
    }
    Ok(xml)
}

/// Pregunta al sidecar si se podría enviar ahora.
pub fn preflight(
    client: &SidecarClient,
    input: &SubmitInput,
    endpoint_name: &str,
) -> Result<SubmitPreflightResponse, String> {
    let request = SubmitPreflightRequest {
        endpoint_name: endpoint_name.to_string(),
        certificate_ref: input.certificate_ref.clone(),
        certificate_password: input.certificate_password.clone(),
    };
    let response: SubmitPreflightResponse = post(client, PATH_SUBMIT_PREFLIGHT, &request, input)?;
    if response.external_call_performed {
        return Err("sidecar_preflight_reported_external_call".to_string());
    }
    Ok(response)
}

/// Envía el XML a la AEAT a través del sidecar.
pub fn submit(
    client: &SidecarClient,
    input: &SubmitInput,
    xml: String,
    endpoint_name: &str,
) -> Result<InvokeSubmitResponse, String> {
    let request = InvokeSubmitRequest {
        xml,
        xml_sha256: input.xml_sha256.trim().to_uppercase(),
        endpoint_name: endpoint_name.to_string(),
        certificate_ref: input.certificate_ref.clone(),
        timeout_seconds: AEAT_TIMEOUT_SECONDS,
        certificate_password: input.certificate_password.clone(),
    };
    let response: InvokeSubmitResponse = post(client, PATH_INVOKE_SUBMIT, &request, input)?;
    if !response
        .xml_sha256
        .eq_ignore_ascii_case(&request.xml_sha256)
    {
        return Err("sidecar_xml_sha256_mismatch".to_string());
    }
    if !response.external_call_performed {
        return Err("sidecar_submit_did_not_report_external_call".to_string());
    }
    Ok(response)
}

/// Rechaza con `aeat_wait_time_pending:<segundos>` si la AEAT pidió esperar y no ha pasado el tiempo.
pub fn check_wait_time(
    conn: &Connection,
    invoice_id: &str,
    endpoint_name: &str,
    now: DateTime<Utc>,
) -> Result<(), String> {
    let Some((submitted_at, wait_seconds)) =
        crate::db::latest_verifactu_wait(conn, invoice_id, endpoint_name)?
    else {
        return Ok(());
    };
    let submitted_at = DateTime::parse_from_rfc3339(&submitted_at)
        .map_err(|err| format!("submitted_at invalido: {err}"))?;
    let elapsed_ms = (now - submitted_at.with_timezone(&Utc)).num_milliseconds();
    let pending_ms = wait_seconds * 1_000 - elapsed_ms;
    if pending_ms > 0 {
        // Redondeo hacia arriba: nunca decir «0 segundos» si aún falta algo.
        return Err(format!(
            "aeat_wait_time_pending:{}",
            (pending_ms + 999) / 1_000
        ));
    }
    Ok(())
}

fn post<Req: Serialize, Res: serde::de::DeserializeOwned>(
    client: &SidecarClient,
    path: &str,
    request: &Req,
    input: &SubmitInput,
) -> Result<Res, String> {
    let body =
        serde_json::to_vec(request).map_err(|err| format!("sidecar payload error: {err}"))?;
    let raw: Value = fiscal_contract::http::post_json_loopback(
        client.port,
        path,
        &client.secret,
        &body,
        LOOPBACK_TIMEOUT,
    )?;
    let text = raw.to_string();
    if text.contains(input.certificate_ref.trim()) {
        return Err("sidecar_response_leaked_certificate_ref".to_string());
    }
    if text.contains(&fiscal_contract::to_hex(&client.secret)) {
        return Err("sidecar_response_leaked_shared_secret".to_string());
    }
    // shortcut: contraseñas de menos de 8 caracteres no se buscan; si el sidecar
    // llegara a devolverlas, esto no lo vería. El sidecar no las devuelve (tests en `handlers`).
    if input
        .certificate_password
        .as_deref()
        .is_some_and(|password| {
            password.chars().count() >= MIN_PASSWORD_LEAK_CHECK_LEN && text.contains(password)
        })
    {
        return Err("sidecar_response_leaked_certificate_password".to_string());
    }
    serde_json::from_value(raw).map_err(|err| format!("sidecar_json_error: {err}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use fiscal_contract::http::{read_http_message, response_bytes};
    use fiscal_contract::{verify_hmac_hex, HEADER_SIGNATURE, MAX_BODY_BYTES};
    use std::io::{BufReader, Write};
    use std::net::TcpListener;

    const SECRET: [u8; 32] = [3; 32];

    fn write_xml(name: &str) -> (String, String) {
        let path =
            std::env::temp_dir().join(format!("cf-submit-{name}-{}.xml", uuid::Uuid::new_v4()));
        let xml = "<sfLR:RegFactuSistemaFacturacion/>";
        std::fs::write(&path, xml).unwrap();
        (
            path.to_string_lossy().to_string(),
            sha256_upper(xml.as_bytes()),
        )
    }

    fn input(xml_path: &str, xml_sha256: &str) -> SubmitInput {
        SubmitInput {
            invoice_id: "i1".to_string(),
            export_id: "e1".to_string(),
            xml_path: xml_path.to_string(),
            xml_sha256: xml_sha256.to_string(),
            certificate_ref: "vault://certs/empresa".to_string(),
            certificate_password: None,
        }
    }

    /// Sidecar falso: verifica la firma HMAC y contesta `reply` (o lo que diga `make_reply`).
    fn fake_sidecar(
        make_reply: impl FnOnce(&Value) -> Value + Send + 'static,
    ) -> (SidecarClient, std::thread::JoinHandle<(String, Value)>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let handle = std::thread::spawn(move || {
            let (stream, _) = listener.accept().unwrap();
            let request = read_http_message(&mut BufReader::new(&stream), MAX_BODY_BYTES).unwrap();
            assert!(verify_hmac_hex(
                &SECRET,
                &request.body,
                request.header(HEADER_SIGNATURE).unwrap()
            ));
            let body: Value = serde_json::from_slice(&request.body).unwrap();
            let reply = make_reply(&body);
            (&stream)
                .write_all(&response_bytes(
                    200,
                    "application/json",
                    reply.to_string().as_bytes(),
                ))
                .unwrap();
            (request.start_line, body)
        });
        (
            SidecarClient {
                port,
                secret: SECRET.to_vec(),
            },
            handle,
        )
    }

    fn accepted(sha: &str) -> Value {
        serde_json::json!({
            "xml_sha256": sha, "endpoint_name": "SistemaVerifactuPruebas",
            "operation": "RegFactuSistemaFacturacion", "status": "accepted", "http_status": 200,
            "csv": "A-CSV", "estado_envio": "Correcto", "estado_registro": "Correcto",
            "codigo_error": null, "descripcion_error": null, "tiempo_espera_envio_seconds": 60,
            "soap_fault": null, "external_call_performed": true
        })
    }

    #[test]
    fn read_checked_xml_requires_fields_and_unchanged_file() {
        let (path, sha) = write_xml("read");
        assert_eq!(
            read_checked_xml(&input(&path, &sha.to_lowercase())).unwrap(),
            "<sfLR:RegFactuSistemaFacturacion/>"
        );
        assert!(read_checked_xml(&input(&path, &"0".repeat(64)))
            .unwrap_err()
            .starts_with("xml_sha256_mismatch"));
        let mut missing = input(&path, &sha);
        missing.certificate_ref = " ".to_string();
        assert_eq!(
            read_checked_xml(&missing).unwrap_err(),
            "certificate_ref is required"
        );
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn submit_sends_exact_xml_and_endpoint() {
        let (path, sha) = write_xml("submit");
        let (client, server) = fake_sidecar(|body| accepted(body["xml_sha256"].as_str().unwrap()));
        let request = input(&path, &sha);
        let xml = read_checked_xml(&request).unwrap();
        let response = submit(&client, &request, xml, "SistemaVerifactuPruebas").unwrap();
        assert_eq!(response.csv.as_deref(), Some("A-CSV"));
        let (start_line, body) = server.join().unwrap();
        assert!(start_line.starts_with("POST /verifactu/invoke-submit "));
        assert_eq!(body["xml"], "<sfLR:RegFactuSistemaFacturacion/>");
        assert_eq!(body["endpoint_name"], "SistemaVerifactuPruebas");
        assert_eq!(body["certificate_ref"], "vault://certs/empresa");
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn submit_rejects_inconsistent_sidecar_answers() {
        let (path, sha) = write_xml("checks");
        let request = input(&path, &sha);

        let (client, server) = fake_sidecar(|_| accepted(&"0".repeat(64)));
        let err = submit(
            &client,
            &request,
            read_checked_xml(&request).unwrap(),
            "SistemaVerifactuPruebas",
        );
        assert_eq!(err.unwrap_err(), "sidecar_xml_sha256_mismatch");
        server.join().unwrap();

        let (client, server) = fake_sidecar(|body| {
            let mut reply = accepted(body["xml_sha256"].as_str().unwrap());
            reply["external_call_performed"] = Value::Bool(false);
            reply
        });
        let err = submit(
            &client,
            &request,
            read_checked_xml(&request).unwrap(),
            "SistemaVerifactuPruebas",
        );
        assert_eq!(
            err.unwrap_err(),
            "sidecar_submit_did_not_report_external_call"
        );
        server.join().unwrap();

        let (client, server) = fake_sidecar(|body| {
            let mut reply = accepted(body["xml_sha256"].as_str().unwrap());
            reply["descripcion_error"] = Value::String("cert vault://certs/empresa".to_string());
            reply
        });
        let err = submit(
            &client,
            &request,
            read_checked_xml(&request).unwrap(),
            "SistemaVerifactuPruebas",
        );
        assert_eq!(err.unwrap_err(), "sidecar_response_leaked_certificate_ref");
        server.join().unwrap();
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn preflight_must_not_reach_aeat() {
        let (path, sha) = write_xml("preflight");
        let reply = |external: bool| {
            move |_: &Value| {
                serde_json::json!({
                    "status": "blocked", "blockers": ["aeat_calls_disabled"], "warnings": [],
                    "endpoint_name": "SistemaVerifactuPruebas", "endpoint_allowed": true,
                    "certificate_loaded": false, "certificate_source": null,
                    "aeat_calls_enabled": false, "production_enabled": false,
                    "external_call_performed": external
                })
            }
        };
        let (client, server) = fake_sidecar(reply(false));
        let result = preflight(&client, &input(&path, &sha), "SistemaVerifactuPruebas").unwrap();
        assert_eq!(result.blockers, vec!["aeat_calls_disabled"]);
        let (start_line, _) = server.join().unwrap();
        assert!(start_line.starts_with("POST /verifactu/submit-preflight "));

        let (client, server) = fake_sidecar(reply(true));
        assert_eq!(
            preflight(&client, &input(&path, &sha), "SistemaVerifactuPruebas").unwrap_err(),
            "sidecar_preflight_reported_external_call"
        );
        server.join().unwrap();
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn password_goes_to_sidecar_but_never_back_or_into_serialized_input() {
        const PASSWORD: &str = "contrasena-larga-1";
        let (path, sha) = write_xml("password");
        let mut request = input(&path, &sha);
        request.certificate_password = Some(PASSWORD.to_string());
        assert!(!serde_json::to_string(&request).unwrap().contains(PASSWORD));
        let from_ui: SubmitInput = serde_json::from_value(serde_json::json!({
            "invoice_id": "i1", "export_id": "e1", "xml_path": path, "xml_sha256": sha,
            "certificate_ref": "vault://certs/empresa", "certificate_password": PASSWORD
        }))
        .unwrap();
        assert_eq!(from_ui.certificate_password.as_deref(), Some(PASSWORD));

        let (client, server) = fake_sidecar(|body| accepted(body["xml_sha256"].as_str().unwrap()));
        let xml = read_checked_xml(&request).unwrap();
        submit(&client, &request, xml, "SistemaVerifactuPruebas").unwrap();
        let (_, body) = server.join().unwrap();
        assert_eq!(body["certificate_password"], PASSWORD);

        let (client, server) = fake_sidecar(|body| {
            let mut reply = accepted(body["xml_sha256"].as_str().unwrap());
            reply["descripcion_error"] = Value::String(format!("eco {PASSWORD}"));
            reply
        });
        let xml = read_checked_xml(&request).unwrap();
        let err = submit(&client, &request, xml, "SistemaVerifactuPruebas").unwrap_err();
        assert_eq!(err, "sidecar_response_leaked_certificate_password");
        assert!(!err.contains(PASSWORD));
        server.join().unwrap();

        // Contraseña corta: no se busca (evita falsos positivos con códigos como «1100»).
        request.certificate_password = Some("1100".to_string());
        let (client, server) = fake_sidecar(|body| {
            let mut reply = accepted(body["xml_sha256"].as_str().unwrap());
            reply["codigo_error"] = Value::String("1100".to_string());
            reply
        });
        let xml = read_checked_xml(&request).unwrap();
        assert!(submit(&client, &request, xml, "SistemaVerifactuPruebas").is_ok());
        server.join().unwrap();
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn wait_time_blocks_until_elapsed_per_company_and_endpoint() {
        use crate::db::tests::issued_invoice_with_export;
        let mut conn = crate::db::test_conn();
        let (invoice_id, export_id) = issued_invoice_with_export(&mut conn);
        let now = Utc::now();
        check_wait_time(&conn, &invoice_id, "SistemaVerifactuPruebas", now).unwrap();

        let mut response: InvokeSubmitResponse =
            serde_json::from_value(accepted(&"A".repeat(64))).unwrap();
        response.status = "rejected".to_string();
        crate::db::insert_verifactu_submission(
            &conn,
            crate::db::VerifactuSubmissionRecord {
                invoice_id: &invoice_id,
                fiscal_export_id: &export_id,
                response: &response,
            },
        )
        .unwrap();
        assert_eq!(
            check_wait_time(&conn, &invoice_id, "SistemaVerifactuPruebas", now).unwrap_err(),
            "aeat_wait_time_pending:60"
        );
        let later = now + chrono::Duration::seconds(59);
        assert!(
            check_wait_time(&conn, &invoice_id, "SistemaVerifactuPruebas", later)
                .unwrap_err()
                .starts_with("aeat_wait_time_pending:")
        );
        let after = now + chrono::Duration::seconds(61);
        check_wait_time(&conn, &invoice_id, "SistemaVerifactuPruebas", after).unwrap();
        // Otro endpoint no hereda la espera.
        check_wait_time(&conn, &invoice_id, "SistemaVerifactuSelloPruebas", now).unwrap();
    }
}
