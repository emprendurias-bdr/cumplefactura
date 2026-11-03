//! Registros fiscales encadenados, auditoría, exportaciones VERI*FACTU y respuestas de la AEAT.

use super::*;

pub fn insert_anulacion_record(
    conn: &mut Connection,
    invoice_id: &str,
    fiscal_hash: &str,
    previous_fiscal_hash: Option<&str>,
    generated_at: &str,
    xml_path: &str,
    audit_event: &AuditEvent,
) -> Result<(), String> {
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
        "UPDATE invoices SET status = 'Void' WHERE id = ?1 AND status = 'Issued'",
        params![invoice_id],
    )
    .map_err(db_error)
    .and_then(|updated| {
        if updated == 1 {
            Ok(())
        } else {
            Err("invoice must be issued to create anulacion".to_string())
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
}

pub fn list_audit_events(conn: &Connection) -> Result<Vec<AuditSummary>, String> {
    list_audit_events_paginated(conn, ListPagination::default())
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

pub fn list_fiscal_records(conn: &Connection) -> Result<Vec<FiscalRecordSummary>, String> {
    list_fiscal_records_paginated(conn, ListPagination::default())
}

pub fn list_fiscal_records_paginated(
    conn: &Connection,
    pagination: ListPagination,
) -> Result<Vec<FiscalRecordSummary>, String> {
    let pagination = pagination.normalized()?;
    let mut stmt = conn
        .prepare(
            "SELECT id, company_id, invoice_id, record_type, generated_at, fiscal_hash, previous_fiscal_hash, xml_path, status
             FROM fiscal_records ORDER BY generated_at DESC, rowid DESC
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
                    fr.generated_at, fr.fiscal_hash, fr.previous_fiscal_hash, fr.xml_path
             FROM fiscal_records fr
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
        "INSERT INTO verifactu_submissions (id, invoice_id, fiscal_export_id, endpoint_name, xml_sha256, status, csv, estado_envio, estado_registro, codigo_error, descripcion_error, tiempo_espera_envio_seconds, submitted_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
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
        ],
    )
    .map_err(db_error)?;
    Ok(id)
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
