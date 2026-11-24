//! Registros fiscales encadenados, auditoría, exportaciones VERI*FACTU y respuestas de la AEAT.

use super::*;

/// Estado de la factura mientras la AEAT no confirma su anulación.
pub const VOID_PENDING: &str = "VoidPending";
/// Estado de la factura cuando la AEAT rechaza su anulación (decisión 12.1): sigue
/// vigente fiscalmente; se puede reintentar la anulación o desistir.
pub const VOID_REJECTED: &str = "VoidRejected";
/// Código de error de la AEAT cuando el registro de alta a anular no consta allí
/// (cuadro B «Cuadro Operativa Anulación», ERROR (6) del Diseño de registro VERI*FACTU).
/// Con este rechazo se propone reenviar con `SinRegistroPrevio=S` (decisión 12.2).
pub const AEAT_ERROR_REGISTRO_NO_EXISTE: &str = "3002";
/// `payload_version` de las exportaciones XML de anulación: así se sabe, al guardar
/// la respuesta de la AEAT, que el envío era una anulación.
pub const ANULACION_PAYLOAD_VERSION: &str = "verifactu-anulacion-xml-v1";

/// Registra la anulación en la cadena y deja la factura en `VoidPending`. Vale desde
/// `Issued` o desde `VoidRejected` (reintento tras rechazo).
/// Solo pasa a `Void` cuando la AEAT acepta el envío (`record_verifactu_submission`).
// Un argumento por dato del registro de anulación; agruparlos solo movería el problema.
#[allow(clippy::too_many_arguments)]
pub fn insert_anulacion_record(
    conn: &mut Connection,
    invoice_id: &str,
    fiscal_hash: &str,
    previous_fiscal_hash: Option<&str>,
    generated_at: &str,
    xml_path: &str,
    audit_event: &AuditEvent,
    reason: &str,
) -> Result<(), String> {
    let reason = reason.trim();
    if reason.is_empty() {
        return Err("reason_required".to_string());
    }
    let audit_hash = audit_event.chain_hash();
    let tx = conn.transaction().map_err(db_error)?;
    let company_id: String = tx
        .query_row(
            "SELECT company_id FROM invoices WHERE id = ?1",
            params![invoice_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(db_error)?
        .ok_or_else(|| format!("invoice not found: {invoice_id}"))?;

    tx.execute(
        "UPDATE invoices SET status = ?3, void_reason = ?2
         WHERE id = ?1 AND status IN ('Issued', ?4)",
        params![invoice_id, reason, VOID_PENDING, VOID_REJECTED],
    )
    .map_err(db_error)
    .and_then(|updated| {
        if updated == 1 {
            Ok(())
        } else {
            Err("invoice must be issued or with rejected anulacion to create anulacion".to_string())
        }
    })?;

    insert_fiscal_record_tx(
        &tx,
        &FiscalRecordInput {
            id: uuid::Uuid::new_v4().to_string(),
            company_id,
            invoice_id: invoice_id.to_string(),
            record_type: "Anulacion".to_string(),
            generated_at: generated_at.to_string(),
            fiscal_hash: fiscal_hash.to_string(),
            previous_fiscal_hash: previous_fiscal_hash.map(str::to_string),
            xml_path: Some(xml_path.to_string()),
            status: "created".to_string(),
            created_at: chrono::Utc::now().to_rfc3339(),
        },
    )?;

    tx.execute(
        "INSERT INTO audit_events (id, entity_type, entity_id, action, actor, occurred_at, payload_hash, previous_hash, hash)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            audit_event.id,
            audit_event.entity_type,
            audit_event.entity_id,
            audit_event.action,
            audit_event.actor,
            audit_event.occurred_at,
            audit_event.payload_hash,
            audit_event.previous_hash,
            audit_hash,
        ],
    )
    .map_err(db_error)?;
    // El motivo va en un evento propio, encadenado detrás: `invoice_voided` no cambia.
    let payload = serde_json::json!({ "reason": reason }).to_string();
    operational_audit(&tx, "invoice", invoice_id, "invoice_void_reason", &payload)?;
    tx.commit().map_err(db_error)
}

pub fn latest_audit_hash(conn: &Connection) -> Result<Option<String>, String> {
    conn.query_row(
        "SELECT hash FROM audit_events ORDER BY occurred_at DESC, rowid DESC LIMIT 1",
        [],
        |row| row.get(0),
    )
    .optional()
    .map_err(db_error)
}

#[derive(Debug, Clone, Serialize)]
pub struct AuditSummary {
    pub id: String,
    pub entity_id: String,
    pub action: String,
    pub actor: String,
    pub occurred_at: String,
    pub payload_hash: String,
    pub previous_hash: Option<String>,
    pub hash: String,
}

#[derive(Debug, Clone)]
pub struct FiscalRecordInput {
    pub id: String,
    pub company_id: String,
    pub invoice_id: String,
    pub record_type: String,
    pub generated_at: String,
    pub fiscal_hash: String,
    pub previous_fiscal_hash: Option<String>,
    pub xml_path: Option<String>,
    pub status: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct FiscalRecordSummary {
    pub id: String,
    pub company_id: String,
    pub invoice_id: String,
    pub record_type: String,
    pub generated_at: String,
    pub fiscal_hash: String,
    pub previous_fiscal_hash: Option<String>,
    pub xml_path: Option<String>,
    pub status: String,
}

#[derive(Debug, Clone)]
pub struct FiscalRecordVerificationRow {
    pub id: String,
    pub company_id: String,
    pub company_tax_id: String,
    pub invoice_id: String,
    pub invoice_kind: String,
    pub invoice_rectification_reason_code: Option<String>,
    pub invoice_series: String,
    pub invoice_number: Option<i64>,
    pub invoice_status: String,
    pub invoice_tax_cents: i64,
    pub invoice_total_cents: i64,
    pub invoice_fiscal_hash: Option<String>,
    pub invoice_issued_at: Option<String>,
    pub record_type: String,
    pub generated_at: String,
    pub fiscal_hash: String,
    pub previous_fiscal_hash: Option<String>,
    pub xml_path: Option<String>,
    /// `created` · `accepted` · `rejected` (anulaciones, según la respuesta AEAT).
    pub record_status: String,
}

/// Todos los eventos (todas las páginas).
pub fn list_audit_events(conn: &Connection) -> Result<Vec<AuditSummary>, String> {
    collect_all_pages(|page| list_audit_events_paginated(conn, page))
}

pub fn list_audit_events_paginated(
    conn: &Connection,
    pagination: ListPagination,
) -> Result<Vec<AuditSummary>, String> {
    let pagination = pagination.normalized()?;
    let mut stmt = conn
        .prepare(
            "SELECT id, entity_id, action, actor, occurred_at, payload_hash, previous_hash, hash
             FROM audit_events ORDER BY occurred_at DESC, rowid DESC
             LIMIT ?1 OFFSET ?2",
        )
        .map_err(db_error)?;
    let rows = stmt
        .query_map(params![pagination.limit(), pagination.offset()], |row| {
            Ok(AuditSummary {
                id: row.get(0)?,
                entity_id: row.get(1)?,
                action: row.get(2)?,
                actor: row.get(3)?,
                occurred_at: row.get(4)?,
                payload_hash: row.get(5)?,
                previous_hash: row.get(6)?,
                hash: row.get(7)?,
            })
        })
        .map_err(db_error)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(db_error)
}

/// Todos los registros fiscales (todas las páginas).
pub fn list_fiscal_records(conn: &Connection) -> Result<Vec<FiscalRecordSummary>, String> {
    collect_all_pages(|page| list_fiscal_records_paginated(conn, page))
}

pub fn list_fiscal_records_paginated(
    conn: &Connection,
    pagination: ListPagination,
) -> Result<Vec<FiscalRecordSummary>, String> {
    let pagination = pagination.normalized()?;
    let mut stmt = conn
        .prepare(
            "SELECT fr.id, fr.company_id, fr.invoice_id, fr.record_type, fr.generated_at, fr.fiscal_hash,
                    fr.previous_fiscal_hash, fr.xml_path, COALESCE(ao.status, fr.status)
             FROM fiscal_records fr
             LEFT JOIN anulacion_outcomes ao ON ao.fiscal_record_id = fr.id
             ORDER BY fr.generated_at DESC, fr.rowid DESC
             LIMIT ?1 OFFSET ?2",
        )
        .map_err(db_error)?;
    let rows = stmt
        .query_map(params![pagination.limit(), pagination.offset()], |row| {
            Ok(FiscalRecordSummary {
                id: row.get(0)?,
                company_id: row.get(1)?,
                invoice_id: row.get(2)?,
                record_type: row.get(3)?,
                generated_at: row.get(4)?,
                fiscal_hash: row.get(5)?,
                previous_fiscal_hash: row.get(6)?,
                xml_path: row.get(7)?,
                status: row.get(8)?,
            })
        })
        .map_err(db_error)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(db_error)
}

pub fn list_fiscal_records_for_verification(
    conn: &Connection,
) -> Result<Vec<FiscalRecordVerificationRow>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT fr.id, fr.company_id, c.tax_id, fr.invoice_id, i.kind, i.rectification_reason_code, i.series, i.number, i.status,
                    i.tax_cents, i.total_cents, i.fiscal_hash, i.issued_at, fr.record_type,
                    fr.generated_at, fr.fiscal_hash, fr.previous_fiscal_hash, fr.xml_path,
                    COALESCE(ao.status, fr.status)
             FROM fiscal_records fr
             LEFT JOIN anulacion_outcomes ao ON ao.fiscal_record_id = fr.id
             JOIN companies c ON c.id = fr.company_id
             JOIN invoices i ON i.id = fr.invoice_id
             ORDER BY fr.company_id ASC, fr.generated_at ASC, fr.rowid ASC",
        )
        .map_err(db_error)?;
    let rows = stmt
        .query_map([], |row| {
            Ok(FiscalRecordVerificationRow {
                id: row.get(0)?,
                company_id: row.get(1)?,
                company_tax_id: row.get(2)?,
                invoice_id: row.get(3)?,
                invoice_kind: row.get(4)?,
                invoice_rectification_reason_code: row.get(5)?,
                invoice_series: row.get(6)?,
                invoice_number: row.get(7)?,
                invoice_status: row.get(8)?,
                invoice_tax_cents: row.get(9)?,
                invoice_total_cents: row.get(10)?,
                invoice_fiscal_hash: row.get(11)?,
                invoice_issued_at: row.get(12)?,
                record_type: row.get(13)?,
                generated_at: row.get(14)?,
                fiscal_hash: row.get(15)?,
                previous_fiscal_hash: row.get(16)?,
                xml_path: row.get(17)?,
                record_status: row.get(18)?,
            })
        })
        .map_err(db_error)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(db_error)
}

pub fn insert_fiscal_export(
    conn: &Connection,
    invoice_id: &str,
    provider: &str,
    environment: &str,
    payload_version: &str,
    payload_hash: &str,
    status: &str,
) -> Result<String, String> {
    let id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO fiscal_exports (id, invoice_id, provider, environment, payload_version, payload_hash, status, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            id,
            invoice_id,
            provider,
            environment,
            payload_version,
            payload_hash,
            status,
            chrono::Utc::now().to_rfc3339(),
        ],
    )
    .map_err(db_error)?;
    Ok(id)
}

/// `true` si `export_id` es una exportación XML de `invoice_id` con ese hash.
pub fn fiscal_export_matches(
    conn: &Connection,
    export_id: &str,
    invoice_id: &str,
    payload_hash: &str,
) -> Result<bool, String> {
    conn.query_row(
        "SELECT COUNT(*) FROM fiscal_exports
         WHERE id = ?1 AND invoice_id = ?2 AND upper(payload_hash) = upper(?3) AND status = 'xml_exported'",
        params![export_id, invoice_id, payload_hash],
        |row| row.get::<_, i64>(0),
    )
    .map(|count| count == 1)
    .map_err(db_error)
}

/// `true` si la AEAT ya aceptó un XML con este hash.
pub fn verifactu_xml_already_accepted(conn: &Connection, xml_sha256: &str) -> Result<bool, String> {
    conn.query_row(
        "SELECT COUNT(*) FROM verifactu_submissions
         WHERE upper(xml_sha256) = upper(?1) AND status IN ('accepted', 'accepted_with_errors')",
        params![xml_sha256],
        |row| row.get::<_, i64>(0),
    )
    .map(|count| count > 0)
    .map_err(db_error)
}

/// Respuesta AEAT a guardar como evidencia del envío.
#[derive(Clone, Copy)]
pub struct VerifactuSubmissionRecord<'a> {
    pub invoice_id: &'a str,
    pub fiscal_export_id: &'a str,
    pub response: &'a fiscal_contract::messages::InvokeSubmitResponse,
}

pub fn insert_verifactu_submission(
    conn: &Connection,
    record: VerifactuSubmissionRecord,
) -> Result<String, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let response = record.response;
    conn.execute(
        "INSERT INTO verifactu_submissions (id, invoice_id, fiscal_export_id, endpoint_name, xml_sha256, status, csv, estado_envio, estado_registro, codigo_error, descripcion_error, tiempo_espera_envio_seconds, submitted_at, http_status, soap_fault, errores_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
        params![
            id,
            record.invoice_id,
            record.fiscal_export_id,
            response.endpoint_name,
            response.xml_sha256,
            response.status,
            response.csv,
            response.estado_envio,
            response.estado_registro,
            response.codigo_error,
            response.descripcion_error,
            response.tiempo_espera_envio_seconds.map(|value| value as i64),
            chrono::Utc::now().to_rfc3339(),
            response.http_status,
            response.soap_fault,
            serde_json::to_string(&response.errores).map_err(|err| err.to_string())?,
        ],
    )
    .map_err(db_error)?;
    Ok(id)
}

/// Guarda el intento de envío y, si era una anulación, aplica la respuesta en la
/// misma transacción:
/// - aceptada (con o sin errores): factura `Void`, resultado `accepted`;
/// - rechazada: factura `VoidRejected` («Anulación rechazada», visible; decisión 12.1),
///   resultado `rejected`; la auditoría guarda los códigos de error. El registro sigue en
///   la cadena (es el «registro anterior generado en este sistema informático», Diseño
///   de registro VERI*FACTU, hojas 2 y 3, `RegistroAnterior`) y la siguiente anulación
///   sale con `RechazoPrevio=S` (hoja 3 y cuadro B «Anulación por rechazo»);
/// - sin confirmar (`transport_error`): nada cambia, sigue «anulación pendiente».
pub fn record_verifactu_submission(
    conn: &mut Connection,
    record: VerifactuSubmissionRecord,
) -> Result<String, String> {
    let tx = conn.transaction().map_err(db_error)?;
    let id = insert_verifactu_submission(&tx, record)?;
    let is_anulacion = tx
        .query_row(
            "SELECT payload_version = ?2 FROM fiscal_exports WHERE id = ?1",
            params![record.fiscal_export_id, ANULACION_PAYLOAD_VERSION],
            |row| row.get::<_, bool>(0),
        )
        .optional()
        .map_err(db_error)?
        .unwrap_or(false);
    let outcome = match record.response.status.as_str() {
        "accepted" | "accepted_with_errors" => Some(("Void", "accepted", "invoice_void_accepted")),
        "rejected" => Some((VOID_REJECTED, "rejected", "invoice_void_rejected")),
        _ => None,
    };
    if let (true, Some((invoice_status, record_status, action))) = (is_anulacion, outcome) {
        let updated = tx
            .execute(
                "UPDATE invoices SET status = ?2 WHERE id = ?1 AND status = ?3",
                params![record.invoice_id, invoice_status, VOID_PENDING],
            )
            .map_err(db_error)?;
        // Sin anulación pendiente (p. ej. reenvío ya resuelto): solo queda el intento guardado.
        if updated == 1 {
            // `fiscal_records` es inalterable: el resultado va a `anulacion_outcomes`.
            tx.execute(
                "INSERT INTO anulacion_outcomes (fiscal_record_id, invoice_id, status, submission_id, decided_at)
                 SELECT fr.id, fr.invoice_id, ?2, ?3, ?4
                 FROM fiscal_records fr
                 LEFT JOIN anulacion_outcomes ao ON ao.fiscal_record_id = fr.id
                 WHERE fr.invoice_id = ?1 AND fr.record_type = 'Anulacion' AND ao.fiscal_record_id IS NULL
                 ORDER BY fr.generated_at DESC, fr.rowid DESC LIMIT 1",
                params![
                    record.invoice_id,
                    record_status,
                    id,
                    chrono::Utc::now().to_rfc3339()
                ],
            )
            .map_err(db_error)?;
            let payload = serde_json::json!({
                "submission_id": id,
                "codigo_error": record.response.codigo_error,
                "descripcion_error": record.response.descripcion_error,
                "errores": record.response.errores,
            })
            .to_string();
            operational_audit(&tx, "invoice", record.invoice_id, action, &payload)?;
        }
    }
    tx.commit().map_err(db_error)?;
    Ok(id)
}

/// Exportación XML de la anulación pendiente de la factura (la última exportada), con
/// la ruta de su XML. `None` si la factura no está en `VoidPending`. Permite reenviar
/// tras reiniciar la app: la anulación no se puede volver a exportar mientras está pendiente.
pub fn pending_anulacion_export(
    conn: &Connection,
    invoice_id: &str,
) -> Result<Option<(String, String, String)>, String> {
    conn.query_row(
        "SELECT fe.id, fr.xml_path, fe.payload_hash
         FROM invoices i
         JOIN fiscal_exports fe ON fe.invoice_id = i.id AND fe.payload_version = ?2
         JOIN fiscal_records fr ON fr.invoice_id = i.id AND fr.record_type = 'Anulacion'
         WHERE i.id = ?1 AND i.status = ?3 AND fr.xml_path IS NOT NULL
         ORDER BY fe.created_at DESC, fe.rowid DESC, fr.generated_at DESC, fr.rowid DESC
         LIMIT 1",
        params![invoice_id, ANULACION_PAYLOAD_VERSION, VOID_PENDING],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    )
    .optional()
    .map_err(db_error)
}

/// Comprueba que una exportación de anulación es la de la anulación pendiente: un XML
/// de anulación antiguo (ya rechazado o resuelto) no se puede reenviar, porque su
/// respuesta se aplicaría a otra anulación. Las exportaciones de alta pasan sin más.
pub fn check_anulacion_export_is_current(
    conn: &Connection,
    export_id: &str,
    invoice_id: &str,
) -> Result<(), String> {
    let is_anulacion: bool = conn
        .query_row(
            "SELECT payload_version = ?2 FROM fiscal_exports WHERE id = ?1",
            params![export_id, ANULACION_PAYLOAD_VERSION],
            |row| row.get(0),
        )
        .optional()
        .map_err(db_error)?
        .unwrap_or(false);
    if !is_anulacion {
        return Ok(());
    }
    match pending_anulacion_export(conn, invoice_id)? {
        Some((current, _, _)) if current == export_id => Ok(()),
        _ => Err("anulacion_not_pending".to_string()),
    }
}

/// Desistir de una anulación rechazada (decisión 12.1): la factura vuelve a `Issued`
/// y queda constancia en la auditoría (`invoice_void_desisted`). El registro rechazado
/// y su resultado en `anulacion_outcomes` no cambian (ambos son inalterables).
pub fn desist_rejected_anulacion(conn: &mut Connection, invoice_id: &str) -> Result<(), String> {
    let tx = conn.transaction().map_err(db_error)?;
    let updated = tx
        .execute(
            "UPDATE invoices SET status = 'Issued', void_reason = NULL WHERE id = ?1 AND status = ?2",
            params![invoice_id, VOID_REJECTED],
        )
        .map_err(db_error)?;
    if updated != 1 {
        return Err("anulacion_not_rejected".to_string());
    }
    let fiscal_record_id: Option<String> = tx
        .query_row(
            "SELECT ao.fiscal_record_id FROM anulacion_outcomes ao
             JOIN fiscal_records fr ON fr.id = ao.fiscal_record_id
             WHERE ao.invoice_id = ?1 AND ao.status = 'rejected'
             ORDER BY fr.generated_at DESC, fr.rowid DESC LIMIT 1",
            params![invoice_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(db_error)?;
    let payload = serde_json::json!({ "fiscal_record_id": fiscal_record_id }).to_string();
    operational_audit(
        &tx,
        "invoice",
        invoice_id,
        "invoice_void_desisted",
        &payload,
    )?;
    tx.commit().map_err(db_error)
}

/// Rechazo de la última anulación de la factura, para la ficha y para proponer
/// `SinRegistroPrevio=S`.
#[derive(Debug, Clone, Serialize)]
pub struct AnulacionRejection {
    pub submission_id: String,
    pub submitted_at: String,
    pub codigo_error: Option<String>,
    pub descripcion_error: Option<String>,
    pub errores: Vec<fiscal_contract::messages::ErrorRegistro>,
    /// La AEAT dice que el alta no consta: se propone `SinRegistroPrevio=S` (decisión 12.2).
    pub propose_sin_registro_previo: bool,
}

/// Rechazo de la última anulación de la factura; `None` si la última no fue rechazada.
pub fn latest_anulacion_rejection(
    conn: &Connection,
    invoice_id: &str,
) -> Result<Option<AnulacionRejection>, String> {
    let row: Option<(String, String, Option<String>, Option<String>, String)> = conn
        .query_row(
            "SELECT s.id, s.submitted_at, s.codigo_error, s.descripcion_error, s.errores_json
             FROM fiscal_records fr
             JOIN anulacion_outcomes ao ON ao.fiscal_record_id = fr.id
             JOIN verifactu_submissions s ON s.id = ao.submission_id
             WHERE fr.invoice_id = ?1 AND fr.record_type = 'Anulacion' AND ao.status = 'rejected'
               AND fr.rowid = (SELECT rowid FROM fiscal_records
                               WHERE invoice_id = ?1 AND record_type = 'Anulacion'
                               ORDER BY generated_at DESC, rowid DESC LIMIT 1)",
            params![invoice_id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                ))
            },
        )
        .optional()
        .map_err(db_error)?;
    Ok(row.map(
        |(submission_id, submitted_at, codigo_error, descripcion_error, errores_json)| {
            let errores: Vec<fiscal_contract::messages::ErrorRegistro> =
                serde_json::from_str(&errores_json).unwrap_or_default();
            let propose_sin_registro_previo = codigo_error.as_deref()
                == Some(AEAT_ERROR_REGISTRO_NO_EXISTE)
                || errores
                    .iter()
                    .any(|e| e.codigo.as_deref() == Some(AEAT_ERROR_REGISTRO_NO_EXISTE));
            AnulacionRejection {
                submission_id,
                submitted_at,
                codigo_error,
                descripcion_error,
                errores,
                propose_sin_registro_previo,
            }
        },
    ))
}

/// `true` si la última anulación de la factura fue rechazada por la AEAT: la nueva
/// debe llevar `RechazoPrevio=S`.
pub fn latest_anulacion_rejected(conn: &Connection, invoice_id: &str) -> Result<bool, String> {
    conn.query_row(
        "SELECT COALESCE(ao.status, fr.status) FROM fiscal_records fr
         LEFT JOIN anulacion_outcomes ao ON ao.fiscal_record_id = fr.id
         WHERE fr.invoice_id = ?1 AND fr.record_type = 'Anulacion'
         ORDER BY fr.generated_at DESC, fr.rowid DESC LIMIT 1",
        params![invoice_id],
        |row| row.get::<_, String>(0),
    )
    .optional()
    .map(|status| status.as_deref() == Some("rejected"))
    .map_err(db_error)
}

/// Fila de `verifactu_submissions` para la interfaz (`verifactu_submission_list`).
#[derive(Debug, Clone, Serialize)]
pub struct VerifactuSubmissionSummary {
    pub id: String,
    pub invoice_id: String,
    pub fiscal_export_id: String,
    pub endpoint_name: String,
    pub xml_sha256: String,
    pub status: String,
    pub csv: Option<String>,
    pub estado_envio: Option<String>,
    pub estado_registro: Option<String>,
    pub codigo_error: Option<String>,
    pub descripcion_error: Option<String>,
    pub tiempo_espera_envio_seconds: Option<i64>,
    pub submitted_at: String,
    pub http_status: Option<i64>,
    pub soap_fault: Option<String>,
    pub errores: Vec<fiscal_contract::messages::ErrorRegistro>,
}

/// Respuestas guardadas, de la más reciente a la más antigua; opcionalmente de una factura.
pub fn list_verifactu_submissions(
    conn: &Connection,
    invoice_id: Option<&str>,
) -> Result<Vec<VerifactuSubmissionSummary>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, invoice_id, fiscal_export_id, endpoint_name, xml_sha256, status, csv, estado_envio, estado_registro, codigo_error, descripcion_error, tiempo_espera_envio_seconds, submitted_at, http_status, soap_fault, errores_json
             FROM verifactu_submissions
             WHERE ?1 IS NULL OR invoice_id = ?1
             ORDER BY submitted_at DESC, rowid DESC",
        )
        .map_err(db_error)?;
    let rows = stmt
        .query_map(params![invoice_id], |row| {
            Ok(VerifactuSubmissionSummary {
                id: row.get(0)?,
                invoice_id: row.get(1)?,
                fiscal_export_id: row.get(2)?,
                endpoint_name: row.get(3)?,
                xml_sha256: row.get(4)?,
                status: row.get(5)?,
                csv: row.get(6)?,
                estado_envio: row.get(7)?,
                estado_registro: row.get(8)?,
                codigo_error: row.get(9)?,
                descripcion_error: row.get(10)?,
                tiempo_espera_envio_seconds: row.get(11)?,
                submitted_at: row.get(12)?,
                http_status: row.get(13)?,
                soap_fault: row.get(14)?,
                // Un JSON ilegible no debe ocultar el envío: se lista sin errores detallados.
                errores: serde_json::from_str(&row.get::<_, String>(15)?).unwrap_or_default(),
            })
        })
        .map_err(db_error)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(db_error)
}

/// Última respuesta con `TiempoEsperaEnvio` para la empresa de la factura y ese
/// endpoint: (`submitted_at`, segundos). La espera de la AEAT es por obligado
/// tributario, no por factura.
pub fn latest_verifactu_wait(
    conn: &Connection,
    invoice_id: &str,
    endpoint_name: &str,
) -> Result<Option<(String, i64)>, String> {
    conn.query_row(
        "SELECT s.submitted_at, s.tiempo_espera_envio_seconds
         FROM verifactu_submissions s
         JOIN invoices i ON i.id = s.invoice_id
         WHERE i.company_id = (SELECT company_id FROM invoices WHERE id = ?1)
           AND s.endpoint_name = ?2
           AND s.tiempo_espera_envio_seconds IS NOT NULL
         ORDER BY s.submitted_at DESC, s.rowid DESC
         LIMIT 1",
        params![invoice_id, endpoint_name],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )
    .optional()
    .map_err(db_error)
}

#[derive(Debug, Clone, Serialize)]
pub struct PreviousInvoiceLink {
    pub company_tax_id: String,
    pub series: String,
    pub number: i64,
    pub issued_at: String,
    pub fiscal_hash: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct RectifiedInvoiceLink {
    pub company_tax_id: String,
    pub series: String,
    pub number: i64,
    pub issued_at: String,
    pub taxable_base_cents: i64,
    pub tax_cents: i64,
}

pub fn latest_fiscal_record_hash_for_company(
    conn: &Connection,
    company_id: &str,
) -> Result<Option<String>, String> {
    conn.query_row(
        "SELECT fiscal_hash FROM fiscal_records
         WHERE company_id = ?1
         ORDER BY generated_at DESC, rowid DESC
         LIMIT 1",
        params![company_id],
        |row| row.get(0),
    )
    .optional()
    .map_err(db_error)
}

pub fn latest_fiscal_record_link_for_company(
    conn: &Connection,
    company_id: &str,
) -> Result<Option<PreviousInvoiceLink>, String> {
    conn.query_row(
        "SELECT c.tax_id, i.series, i.number, i.issued_at, fr.fiscal_hash
         FROM fiscal_records fr
         JOIN invoices i ON i.id = fr.invoice_id
         JOIN companies c ON c.id = fr.company_id
         WHERE fr.company_id = ?1
           AND i.number IS NOT NULL
           AND i.issued_at IS NOT NULL
         ORDER BY fr.generated_at DESC, fr.rowid DESC
         LIMIT 1",
        params![company_id],
        |row| {
            Ok(PreviousInvoiceLink {
                company_tax_id: row.get(0)?,
                series: row.get(1)?,
                number: row.get(2)?,
                issued_at: row.get(3)?,
                fiscal_hash: row.get(4)?,
            })
        },
    )
    .optional()
    .map_err(db_error)
}

pub fn previous_fiscal_record_link_for_invoice(
    conn: &Connection,
    invoice_id: &str,
    record_type: &str,
) -> Result<Option<PreviousInvoiceLink>, String> {
    conn.query_row(
        "SELECT c.tax_id, i.series, i.number, i.issued_at, prev.fiscal_hash
         FROM fiscal_records cur
         JOIN fiscal_records prev ON prev.fiscal_hash = cur.previous_fiscal_hash
         JOIN invoices i ON i.id = prev.invoice_id
         JOIN companies c ON c.id = prev.company_id
         WHERE cur.invoice_id = ?1
           AND cur.record_type = ?2
           AND i.number IS NOT NULL
           AND i.issued_at IS NOT NULL
         ORDER BY cur.generated_at DESC, cur.rowid DESC
         LIMIT 1",
        params![invoice_id, record_type],
        |row| {
            Ok(PreviousInvoiceLink {
                company_tax_id: row.get(0)?,
                series: row.get(1)?,
                number: row.get(2)?,
                issued_at: row.get(3)?,
                fiscal_hash: row.get(4)?,
            })
        },
    )
    .optional()
    .map_err(db_error)
}

pub fn rectified_invoice_link(
    conn: &Connection,
    invoice_id: &str,
) -> Result<RectifiedInvoiceLink, String> {
    conn.query_row(
        "SELECT c.tax_id, i.series, i.number, i.issued_at, i.taxable_base_cents, i.tax_cents
         FROM invoices i
         JOIN companies c ON c.id = i.company_id
         WHERE i.id = ?1
           AND i.number IS NOT NULL
           AND i.issued_at IS NOT NULL
           AND i.fiscal_hash IS NOT NULL",
        params![invoice_id],
        |row| {
            Ok(RectifiedInvoiceLink {
                company_tax_id: row.get(0)?,
                series: row.get(1)?,
                number: row.get(2)?,
                issued_at: row.get(3)?,
                taxable_base_cents: row.get(4)?,
                tax_cents: row.get(5)?,
            })
        },
    )
    .optional()
    .map_err(db_error)?
    .ok_or_else(|| format!("rectified invoice not found or not issued: {invoice_id}"))
}

pub fn previous_issued_invoice_link(
    conn: &Connection,
    invoice_id: &str,
) -> Result<Option<PreviousInvoiceLink>, String> {
    conn.query_row(
        "SELECT c.tax_id, p.series, p.number, p.issued_at, p.fiscal_hash
         FROM invoices cur
         JOIN invoices p ON p.company_id = cur.company_id
         JOIN companies c ON c.id = p.company_id
         WHERE cur.id = ?1
           AND p.id <> cur.id
           AND p.status = 'Issued'
           AND p.number IS NOT NULL
           AND p.issued_at IS NOT NULL
           AND p.fiscal_hash IS NOT NULL
           AND (
                p.issued_at < cur.issued_at
                OR (p.issued_at = cur.issued_at AND p.rowid < cur.rowid)
           )
         ORDER BY p.issued_at DESC, p.rowid DESC
         LIMIT 1",
        params![invoice_id],
        |row| {
            Ok(PreviousInvoiceLink {
                company_tax_id: row.get(0)?,
                series: row.get(1)?,
                number: row.get(2)?,
                issued_at: row.get(3)?,
                fiscal_hash: row.get(4)?,
            })
        },
    )
    .optional()
    .map_err(db_error)
}

pub(super) fn insert_fiscal_record_tx(
    tx: &Transaction<'_>,
    record: &FiscalRecordInput,
) -> Result<(), String> {
    tx.execute(
        "INSERT INTO fiscal_records (id, company_id, invoice_id, record_type, generated_at, fiscal_hash, previous_fiscal_hash, xml_path, status, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            record.id,
            record.company_id,
            record.invoice_id,
            record.record_type,
            record.generated_at,
            record.fiscal_hash,
            record.previous_fiscal_hash,
            record.xml_path,
            record.status,
            record.created_at,
        ],
    )
    .map(|_| ())
    .map_err(db_error)
}
