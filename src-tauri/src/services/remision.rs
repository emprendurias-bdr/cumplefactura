//! S4: cola de remisión a la AEAT, dentro del proceso de la app (no es un servicio de Windows).
//!
//! Norma:
//! - RD 1007/2023, art. 16.1: remisión «de forma continuada, segura, correcta, íntegra,
//!   automática, consecutiva, instantánea y fehaciente» de todos los registros.
//! - Orden HAC/1177/2024, art. 16.2: control de flujo con `TiempoEsperaEnvio` (60 s al
//!   principio, el que devuelva la AEAT después) y máximo de registros por envío.
//! - Orden HAC/1177/2024, art. 16.4: si una incidencia impide remitir, se remite en cuanto
//!   sea posible «respetando el orden temporal de generación», se reintenta «al menos una
//!   vez cada hora» y se avisa de cuántos registros faltan mientras quede alguno.
//!
//! Cómo funciona:
//! - `send` es el único camino de envío (cola automática y «Reintentar ahora»): comprueba el
//!   XML exportado, respeta `TiempoEsperaEnvio`, llama al sidecar y guarda cada intento.
//! - `Queue::run` recorre `db::pending_remision` en orden de cadena por empresa. Una empresa
//!   se detiene en su primer registro que no obtiene respuesta definitiva (sin confirmar,
//!   espera de la AEAT o fallo al preparar), así ningún registro sale antes que su anterior.
//!   Si el sidecar o el certificado fallan antes de salir hacia la AEAT, se para todo.
//! - Un envío lleva un registro (máximo del diseño de registro: 1.000). La AEAT pide esperar
//!   tras cada envío, así que el siguiente sale en la siguiente vuelta (`next_attempt_at`).
//! - Un reenvío tras «sin confirmar» lleva el mismo XML; si ya había llegado, la AEAT lo
//!   marca como `RegistroDuplicado` y el sidecar devuelve el estado que ya consta allí.
//! - Con el envío real apagado (S3), las vueltas automáticas no envían nada.
//! - Cada intento deja el evento de auditoría `remision_attempted` (S2), también los que
//!   fallan antes de llegar a la AEAT; los que llegan dejan además `verifactu_submitted`.
//! - `AppState::remision` impide dos envíos a la vez: si ya hay una vuelta en curso, se
//!   devuelve el estado sin enviar.
//!
//! Quién la mueve: la interfaz (al abrir la app, tras emitir o anular, cada hora y cuando
//! termina la espera de la AEAT). En modo de contraseña «solo durante esta sesión» la
//! contraseña vive en la interfaz (ADR-002) y llega en cada vuelta.

use crate::db::{self, AppState, PendingRemision};
use crate::services::sidecar_process::SidecarClient;
use crate::services::verifactu_submit::{self, SubmitInput};
use chrono::Utc;
use fiscal_contract::messages::InvokeSubmitResponse;
use rusqlite::Connection;
use serde::Serialize;
use std::path::Path;

const WAIT_PREFIX: &str = "aeat_wait_time_pending:";

/// Estado de la cola para el chip de la barra superior y la pantalla VERI*FACTU.
#[derive(Debug, Clone, Serialize)]
pub struct RemisionStatus {
    /// Registros sin respuesta definitiva de la AEAT.
    pub pending: usize,
    /// `generated_at` del registro pendiente más antiguo.
    pub oldest_pending_at: Option<String>,
    /// Hora del último intento (evento `remision_attempted`).
    pub last_attempt_at: Option<String>,
    /// Primer momento (UTC) en que la AEAT deja volver a enviar, si pidió esperar.
    pub next_attempt_at: Option<String>,
    /// Motivo por el que la última vuelta no remitió todo.
    pub last_error: Option<String>,
    pub sending_enabled: bool,
    /// Había otra vuelta en curso: esta no envió nada.
    pub busy: bool,
}

/// Certificado con el que envía la vuelta (la contraseña no se guarda nunca).
#[derive(Clone)]
pub struct Credentials {
    pub certificate_ref: String,
    pub certificate_password: Option<String>,
}

/// Comprobaciones comunes a preflight y envío. Devuelve el XML y el endpoint del entorno elegido.
/// En modo `env` descarta la contraseña que llegue de la interfaz: manda el entorno del sidecar.
pub fn checked_submission(
    state: &AppState,
    input: &mut SubmitInput,
) -> Result<(String, String), String> {
    let xml = verifactu_submit::read_checked_xml(input)?;
    let conn = state.lock()?;
    if !db::fiscal_export_matches(
        &conn,
        &input.export_id,
        &input.invoice_id,
        &input.xml_sha256,
    )? {
        return Err("export_not_found: exporta de nuevo el XML de esta factura".to_string());
    }
    if db::verifactu_xml_already_accepted(&conn, &input.xml_sha256)? {
        return Err("xml_already_accepted_by_aeat".to_string());
    }
    db::check_anulacion_export_is_current(&conn, &input.export_id, &input.invoice_id)?;
    let settings = db::get_app_settings(&conn)?;
    if !settings.sends_certificate_password() {
        input.certificate_password = None;
    }
    Ok((xml, settings.effective_endpoint().as_str().to_string()))
}

/// Envía a la AEAT el XML exportado y guarda el intento. Devuelve la fila guardada.
/// Si falla después de poder llegar a la AEAT (sin respuesta, respuesta ilegible o
/// incoherente), se guarda como `transport_error` («sin confirmar»), nunca como aceptado
/// ni rechazado. Si el XML era una anulación, la respuesta decide el estado de la factura
/// (`db::record_verifactu_submission`).
pub fn send(
    state: &AppState,
    client: &dyn Fn() -> Result<SidecarClient, String>,
    mut input: SubmitInput,
) -> Result<(String, InvokeSubmitResponse), String> {
    let (xml, endpoint_name) = checked_submission(state, &mut input)?;
    {
        let conn = state.lock()?;
        verifactu_submit::check_wait_time(&conn, &input.invoice_id, &endpoint_name, Utc::now())?;
    }
    let client = client()?;
    // Sin bloqueo de base de datos durante la llamada a la AEAT (hasta 30 s).
    let aeat = match verifactu_submit::submit(&client, &input, xml, &endpoint_name) {
        Ok(aeat) => aeat,
        Err(err) if verifactu_submit::failed_before_aeat(&err) => return Err(err),
        Err(err) => verifactu_submit::unconfirmed_response(&input, &endpoint_name, &err),
    };
    let mut conn = state.lock()?;
    let submission_id = db::record_verifactu_submission(
        &mut conn,
        db::VerifactuSubmissionRecord {
            invoice_id: &input.invoice_id,
            fiscal_export_id: &input.export_id,
            response: &aeat,
        },
    )?;
    Ok((submission_id, aeat))
}

/// Cola de remisión con sus dependencias (sidecar y generación del XML de alta).
pub struct Queue<'a> {
    pub state: &'a AppState,
    pub client: &'a dyn Fn() -> Result<SidecarClient, String>,
    /// Carpeta de la app donde la cola deja el XML de alta de cada factura.
    pub xml_dir: &'a Path,
    /// Escribe y valida contra el XSD el XML de alta de la factura en la ruta dada.
    pub write_alta_xml: &'a dyn Fn(&Connection, &str, &str) -> Result<(), String>,
}

impl Queue<'_> {
    /// Una vuelta de la cola. `automatic`: lanzada por la app (no envía con el envío real
    /// apagado); `false`: «Reintentar ahora» de la persona.
    pub fn run(
        &self,
        credentials: &Credentials,
        automatic: bool,
    ) -> Result<RemisionStatus, String> {
        let Ok(_running) = self.state.remision.try_lock() else {
            return status(self.state, None, true);
        };
        let (pending, sending_enabled) = {
            let conn = self.state.lock()?;
            (
                db::pending_remision(&conn)?,
                db::get_app_settings(&conn)?.aeat_sending_enabled,
            )
        };
        if automatic && !sending_enabled {
            return status(self.state, None, false);
        }
        let mut stopped: Vec<String> = Vec::new();
        let mut last_error = None;
        for item in pending {
            if stopped.contains(&item.company_id) {
                continue;
            }
            let outcome = self
                .package(&item, credentials)
                .and_then(|input| send(self.state, self.client, input));
            if let Err(err) = &outcome {
                if err.starts_with(WAIT_PREFIX) {
                    // La AEAT pidió esperar: no es un intento; sale en la siguiente vuelta.
                    stopped.push(item.company_id);
                    continue;
                }
            }
            self.audit(&item, automatic, &outcome)?;
            match outcome {
                Ok((_, aeat)) if aeat.status == "transport_error" => {
                    last_error = aeat.descripcion_error.or(Some("transport_error".into()));
                    stopped.push(item.company_id);
                }
                Ok(_) => {}
                Err(err) if verifactu_submit::failed_before_aeat(&err) => {
                    return status(self.state, Some(err), false);
                }
                Err(err) => {
                    last_error = Some(err);
                    stopped.push(item.company_id);
                }
            }
        }
        status(self.state, last_error, false)
    }

    /// Paquete de envío del registro: el XML de alta lo genera la cola en su carpeta (y lo
    /// reusa en los reintentos); el de anulación es el exportado al anular.
    fn package(
        &self,
        item: &PendingRemision,
        credentials: &Credentials,
    ) -> Result<SubmitInput, String> {
        let conn = self.state.lock()?;
        let (export_id, xml_path, xml_sha256) = if item.record_type == "Alta" {
            let path = self.xml_dir.join(format!("{}-alta.xml", item.invoice_id));
            let path_text = path.to_string_lossy().to_string();
            let reused = match std::fs::read(&path) {
                Ok(bytes) => {
                    let sha = verifactu_submit::sha256_upper(&bytes);
                    db::alta_export_with_hash(&conn, &item.invoice_id, &sha)?
                        .map(|export_id| (export_id, path_text.clone(), sha))
                }
                Err(_) => None,
            };
            match reused {
                Some(found) => found,
                None => {
                    std::fs::create_dir_all(self.xml_dir)
                        .map_err(|err| format!("remision_dir_error: {err}"))?;
                    (self.write_alta_xml)(&conn, &item.invoice_id, &path_text)?;
                    let export = verifactu_submit::record_xml_export(
                        &conn,
                        &item.invoice_id,
                        &path_text,
                        verifactu_submit::PAYLOAD_VERSION,
                    )?;
                    (export.export_id, path_text, export.xml_sha256)
                }
            }
        } else {
            db::pending_anulacion_export(&conn, &item.invoice_id)?
                .ok_or_else(|| "anulacion_not_pending".to_string())?
        };
        Ok(SubmitInput {
            invoice_id: item.invoice_id.clone(),
            export_id,
            xml_path,
            xml_sha256,
            certificate_ref: credentials.certificate_ref.clone(),
            certificate_password: credentials.certificate_password.clone(),
        })
    }

    /// Evento `remision_attempted` de cada intento, con su resultado.
    fn audit(
        &self,
        item: &PendingRemision,
        automatic: bool,
        outcome: &Result<(String, InvokeSubmitResponse), String>,
    ) -> Result<(), String> {
        let (submission_id, result, error) = match outcome {
            Ok((id, aeat)) => (Some(id.as_str()), aeat.status.as_str(), None),
            Err(err) => (None, "error", Some(err.as_str())),
        };
        let mut conn = self.state.lock()?;
        let tx = conn
            .transaction()
            .map_err(|err| format!("database error: {err}"))?;
        db::audit_change(
            &tx,
            "invoice",
            &item.invoice_id,
            "remision_attempted",
            &serde_json::json!({
                "fiscal_record_id": item.fiscal_record_id,
                "record_type": item.record_type,
                "trigger": if automatic { "automatic" } else { "manual" },
                "submission_id": submission_id,
                "result": result,
                "error": error,
            }),
        )?;
        tx.commit().map_err(|err| format!("database error: {err}"))
    }
}

/// Estado de la cola sin enviar nada.
pub fn status(
    state: &AppState,
    last_error: Option<String>,
    busy: bool,
) -> Result<RemisionStatus, String> {
    let conn = state.lock()?;
    let pending = db::pending_remision(&conn)?;
    let settings = db::get_app_settings(&conn)?;
    let endpoint = settings.effective_endpoint();
    let now = Utc::now();
    let mut next_attempt_at: Option<String> = None;
    let mut seen: Vec<&str> = Vec::new();
    for item in &pending {
        if seen.contains(&item.company_id.as_str()) {
            continue;
        }
        seen.push(&item.company_id);
        if let Err(err) =
            verifactu_submit::check_wait_time(&conn, &item.invoice_id, endpoint.as_str(), now)
        {
            if let Some(at) = err.strip_prefix(WAIT_PREFIX) {
                // RFC 3339 en UTC con el mismo formato: el orden de texto es el de tiempo.
                if next_attempt_at
                    .as_deref()
                    .is_none_or(|current| at < current)
                {
                    next_attempt_at = Some(at.to_string());
                }
            }
        }
    }
    Ok(RemisionStatus {
        pending: pending.len(),
        oldest_pending_at: pending
            .iter()
            .filter_map(|item| chronological(&item.generated_at).map(|at| (at, &item.generated_at)))
            .min()
            .map(|(_, text)| text.clone()),
        last_attempt_at: db::last_remision_attempt(&conn)?,
        next_attempt_at,
        last_error,
        sending_enabled: settings.aeat_sending_enabled,
        busy,
    })
}

/// `generated_at` lleva zona horaria variable: se compara como instante, no como texto.
fn chronological(value: &str) -> Option<chrono::DateTime<Utc>> {
    chrono::DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|at| at.with_timezone(&Utc))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::tests::{company, customer, invoice};
    use crate::domain::invoice::InvoiceStatus;
    use crate::domain::settings::AppSettingsInput;
    use crate::services::audit::AuditEvent;
    use fiscal_contract::http::{read_http_message, response_bytes};
    use fiscal_contract::{verify_hmac_hex, HEADER_SIGNATURE, MAX_BODY_BYTES};
    use serde_json::Value;
    use std::io::{BufReader, Write};
    use std::net::TcpListener;
    use std::path::PathBuf;
    use std::sync::{Arc, Mutex};

    const SECRET: [u8; 32] = [7; 32];

    type Reply = Box<dyn FnOnce(&Value) -> Value + Send>;

    /// Servidor local que habla el protocolo del sidecar (HMAC por loopback) y contesta
    /// las respuestas de `replies` en orden. Guarda el `xml` de cada petición.
    struct FakeSidecar {
        client: SidecarClient,
        received: Arc<Mutex<Vec<String>>>,
    }

    fn fake_sidecar(replies: Vec<Reply>) -> FakeSidecar {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let received = Arc::new(Mutex::new(Vec::new()));
        let log = Arc::clone(&received);
        std::thread::spawn(move || {
            for reply in replies {
                let Ok((stream, _)) = listener.accept() else {
                    return;
                };
                let request =
                    read_http_message(&mut BufReader::new(&stream), MAX_BODY_BYTES).unwrap();
                assert!(verify_hmac_hex(
                    &SECRET,
                    &request.body,
                    request.header(HEADER_SIGNATURE).unwrap()
                ));
                let body: Value = serde_json::from_slice(&request.body).unwrap();
                log.lock()
                    .unwrap()
                    .push(body["xml"].as_str().unwrap().to_string());
                let answer = reply(&body);
                (&stream)
                    .write_all(&response_bytes(
                        200,
                        "application/json",
                        answer.to_string().as_bytes(),
                    ))
                    .unwrap();
            }
        });
        FakeSidecar {
            client: SidecarClient {
                port,
                secret: SECRET.to_vec(),
            },
            received,
        }
    }

    fn aeat(status: &'static str, wait: Option<u64>) -> Reply {
        Box::new(move |body: &Value| {
            serde_json::json!({
                "xml_sha256": body["xml_sha256"], "endpoint_name": body["endpoint_name"],
                "operation": "RegFactuSistemaFacturacion", "status": status, "http_status": 200,
                "csv": if status.starts_with("accepted") { Some("A-CSV") } else { None },
                "estado_envio": null, "estado_registro": null, "codigo_error": null,
                "descripcion_error": if status == "transport_error" { Some("aeat_timeout") } else { None },
                "tiempo_espera_envio_seconds": wait, "soap_fault": null, "errores": [],
                "external_call_performed": true
            })
        })
    }

    struct Fixture {
        state: AppState,
        invoices: Vec<String>,
        dir: PathBuf,
    }

    /// `n` facturas emitidas y encadenadas de una empresa, con el envío real encendido.
    fn fixture(n: usize, sending_enabled: bool) -> Fixture {
        let mut conn = db::test_conn();
        let company = company();
        let customer = customer();
        db::insert_company(&conn, &company).unwrap();
        db::upsert_customer(&conn, &customer).unwrap();
        let mut previous: Option<String> = None;
        let mut invoices = Vec::new();
        for index in 0..n {
            let mut issued = invoice(company.id.clone(), customer.id.clone());
            issued.number = Some(index as i64 + 1);
            issued.status = InvoiceStatus::Issued;
            // Hora local con desfase, como guarda la app las altas.
            issued.issued_at = Some(format!("2026-05-28T12:0{index}:00+02:00"));
            let hash = format!("{index:X}").repeat(64)[..64].to_string();
            let event = AuditEvent::invoice_issued(
                issued.id.clone(),
                "tester".to_string(),
                hash.clone(),
                db::latest_audit_hash(&conn).unwrap(),
            );
            db::insert_issued_invoice(&mut conn, &issued, &hash, previous.as_deref(), &event)
                .unwrap();
            previous = Some(hash);
            invoices.push(issued.id);
        }
        db::update_app_settings(
            &conn,
            AppSettingsInput {
                export_dir: None,
                default_territory_flags: crate::domain::settings::default_flags(),
                onboarding_completed: true,
                verifactu_endpoint_name: crate::domain::settings::default_endpoint_name(),
                certificate_password_mode: "env".to_string(),
                qr_environment: "test".to_string(),
                aeat_sending_enabled: sending_enabled,
                verifactu_environment: "test".to_string(),
                production_confirmed: false,
            },
        )
        .unwrap();
        let dir = std::env::temp_dir().join(format!("cf-remision-{}", uuid::Uuid::new_v4()));
        Fixture {
            state: AppState {
                conn: std::sync::Mutex::new(conn),
                remision: std::sync::Mutex::new(()),
            },
            invoices,
            dir,
        }
    }

    fn write_alta(_: &Connection, invoice_id: &str, path: &str) -> Result<(), String> {
        std::fs::write(
            path,
            format!(
                "<sfLR:RegFactuSistemaFacturacion>{invoice_id}</sfLR:RegFactuSistemaFacturacion>"
            ),
        )
        .map_err(|err| err.to_string())
    }

    fn credentials() -> Credentials {
        Credentials {
            certificate_ref: "vault://certs/empresa".to_string(),
            certificate_password: None,
        }
    }

    fn run(fx: &Fixture, sidecar: &FakeSidecar, automatic: bool) -> RemisionStatus {
        let client = sidecar.client.clone();
        let connect = move || Ok(client.clone());
        Queue {
            state: &fx.state,
            client: &connect,
            xml_dir: &fx.dir,
            write_alta_xml: &write_alta,
        }
        .run(&credentials(), automatic)
        .unwrap()
    }

    fn sent_invoices(sidecar: &FakeSidecar, fx: &Fixture) -> Vec<usize> {
        sidecar
            .received
            .lock()
            .unwrap()
            .iter()
            .map(|xml| fx.invoices.iter().position(|id| xml.contains(id)).unwrap())
            .collect()
    }

    fn attempts(fx: &Fixture) -> i64 {
        fx.state
            .lock()
            .unwrap()
            .query_row(
                "SELECT COUNT(*) FROM audit_events WHERE action = 'remision_attempted'",
                [],
                |row| row.get(0),
            )
            .unwrap()
    }

    /// Simula que la espera de la AEAT ya pasó (las respuestas son inalterables salvo aquí).
    fn forget_wait(fx: &Fixture) {
        fx.state
            .lock()
            .unwrap()
            .execute(
                "UPDATE verifactu_submissions SET submitted_at = '2000-01-01T00:00:00Z'",
                [],
            )
            .unwrap();
    }

    #[test]
    fn sends_each_new_record_as_soon_as_it_runs() {
        let fx = fixture(1, true);
        let sidecar = fake_sidecar(vec![aeat("accepted", Some(60))]);
        let status = run(&fx, &sidecar, true);
        assert_eq!(sent_invoices(&sidecar, &fx), vec![0]);
        assert_eq!(status.pending, 0);
        assert!(status.last_attempt_at.is_some());
        assert_eq!(attempts(&fx), 1);
    }

    #[test]
    fn network_failure_leaves_it_pending_and_retry_resends_the_same_xml() {
        let fx = fixture(2, true);
        let sidecar = fake_sidecar(vec![
            aeat("transport_error", None),
            aeat("accepted", None),
            aeat("accepted", None),
        ]);
        let first = run(&fx, &sidecar, true);
        // Sin confirmar: el primero queda pendiente y el segundo no sale antes que él.
        assert_eq!(sent_invoices(&sidecar, &fx), vec![0]);
        assert_eq!(first.pending, 2);
        assert_eq!(first.last_error.as_deref(), Some("aeat_timeout"));

        let second = run(&fx, &sidecar, false);
        assert_eq!(sent_invoices(&sidecar, &fx), vec![0, 0, 1]);
        assert_eq!(second.pending, 0);
        let received = sidecar.received.lock().unwrap();
        assert_eq!(received[0], received[1], "el reintento lleva el mismo XML");
        assert_eq!(attempts(&fx), 3);
    }

    #[test]
    fn respects_tiempo_espera_envio_and_chain_order() {
        let fx = fixture(3, true);
        let sidecar = fake_sidecar(vec![
            aeat("accepted", Some(60)),
            aeat("accepted", Some(60)),
            aeat("accepted", Some(60)),
        ]);
        let status = run(&fx, &sidecar, true);
        assert_eq!(sent_invoices(&sidecar, &fx), vec![0]);
        assert_eq!(status.pending, 2);
        assert!(
            status.next_attempt_at.is_some(),
            "la interfaz sabe cuándo volver"
        );
        // Otra vuelta durante la espera no envía ni cuenta como intento.
        run(&fx, &sidecar, true);
        assert_eq!(sent_invoices(&sidecar, &fx), vec![0]);
        assert_eq!(attempts(&fx), 1);

        forget_wait(&fx);
        run(&fx, &sidecar, true);
        forget_wait(&fx);
        run(&fx, &sidecar, true);
        assert_eq!(sent_invoices(&sidecar, &fx), vec![0, 1, 2]);
    }

    #[test]
    fn duplicate_after_unconfirmed_closes_the_record_without_sending_again() {
        let fx = fixture(1, true);
        // El sidecar traduce `RegistroDuplicado` con estado `Correcta` a `accepted`.
        let sidecar = fake_sidecar(vec![aeat("transport_error", None), aeat("accepted", None)]);
        run(&fx, &sidecar, true);
        let status = run(&fx, &sidecar, true);
        assert_eq!(status.pending, 0);
        let again = run(&fx, &sidecar, false);
        assert_eq!(again.pending, 0);
        assert_eq!(
            sent_invoices(&sidecar, &fx).len(),
            2,
            "nada más tras aceptarse"
        );
    }

    #[test]
    fn rejected_record_does_not_block_the_next_one() {
        let fx = fixture(2, true);
        let sidecar = fake_sidecar(vec![aeat("rejected", None), aeat("accepted", None)]);
        let status = run(&fx, &sidecar, true);
        assert_eq!(sent_invoices(&sidecar, &fx), vec![0, 1]);
        assert_eq!(status.pending, 0);
    }

    #[test]
    fn sending_disabled_sends_nothing_and_reports_pending() {
        let fx = fixture(2, false);
        let sidecar = fake_sidecar(vec![]);
        let status = run(&fx, &sidecar, true);
        assert!(sidecar.received.lock().unwrap().is_empty());
        assert_eq!(status.pending, 2);
        assert!(!status.sending_enabled);
        assert_eq!(attempts(&fx), 0);
    }

    #[test]
    fn sidecar_down_stops_the_round_and_audits_the_attempt() {
        let fx = fixture(2, true);
        let down = || Err::<SidecarClient, String>("sidecar_connection_error: refused".into());
        let status = Queue {
            state: &fx.state,
            client: &down,
            xml_dir: &fx.dir,
            write_alta_xml: &write_alta,
        }
        .run(&credentials(), true)
        .unwrap();
        assert_eq!(status.pending, 2);
        assert!(status
            .last_error
            .unwrap()
            .starts_with("sidecar_connection_error"));
        assert_eq!(attempts(&fx), 1, "se audita y no se intenta el siguiente");
    }

    #[test]
    fn only_one_round_at_a_time() {
        let fx = fixture(1, true);
        let sidecar = fake_sidecar(vec![]);
        let _held = fx.state.remision.lock().unwrap();
        let status = run(&fx, &sidecar, true);
        assert!(status.busy);
        assert!(sidecar.received.lock().unwrap().is_empty());
    }

    #[test]
    fn sends_pending_anulacion_after_its_alta() {
        let fx = fixture(1, true);
        let invoice_id = fx.invoices[0].clone();
        std::fs::create_dir_all(&fx.dir).unwrap();
        let path = fx.dir.join("anulacion.xml").to_string_lossy().to_string();
        std::fs::write(
            &path,
            "<sfLR:RegFactuSistemaFacturacion>anulacion</sfLR:RegFactuSistemaFacturacion>",
        )
        .unwrap();
        {
            let mut conn = fx.state.lock().unwrap();
            let hash = "E".repeat(64);
            let event = AuditEvent::invoice_voided(
                invoice_id.clone(),
                "tester".to_string(),
                hash.clone(),
                db::latest_audit_hash(&conn).unwrap(),
            );
            db::insert_anulacion_record(
                &mut conn,
                &invoice_id,
                &hash,
                Some(&"0".repeat(64)),
                // 10:30Z es posterior al alta (10:00Z), pero su texto ordena antes de «12:00+02:00».
                "2026-05-28T10:30:00Z",
                &path,
                &event,
                "Error en el importe",
            )
            .unwrap();
            verifactu_submit::record_xml_export(
                &conn,
                &invoice_id,
                &path,
                db::ANULACION_PAYLOAD_VERSION,
            )
            .unwrap();
        }
        let sidecar = fake_sidecar(vec![aeat("accepted", None), aeat("accepted", None)]);
        let status = run(&fx, &sidecar, true);
        let received = sidecar.received.lock().unwrap().clone();
        assert_eq!(received.len(), 2);
        assert!(received[0].contains(&invoice_id), "primero el alta");
        assert!(received[1].contains("anulacion"));
        assert_eq!(status.pending, 0);
        let invoice_status: String = fx
            .state
            .lock()
            .unwrap()
            .query_row(
                "SELECT status FROM invoices WHERE id = ?1",
                [&invoice_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(invoice_status, "Void");
    }
}
