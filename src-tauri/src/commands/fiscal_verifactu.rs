//! Comandos IPC para preparar datos fiscales y generar XML VERI*FACTU.
//!
//! La generación y validación normativa permanece en `services::verifactu`;
//! aquí se coordinan SQLite, rutas locales y los resultados que recibe la UI.

use super::*;

/// Devuelve el contrato preliminar de payload VERI*FACTU.
#[tauri::command]
pub fn fiscal_prepare_verifactu(invoice_id: String) -> Result<FiscalPayload, String> {
    if invoice_id.trim().is_empty() {
        return Err("invoice_id is required".to_string());
    }

    Ok(FiscalPayload {
        invoice_id,
        provider: "verifactu-placeholder".to_string(),
        environment: "local-dev".to_string(),
        payload_version: "pre-mvp".to_string(),
        transmission_required: false,
        notes: vec![
            "Payload contract only; no real AEAT submission yet.".to_string(),
            "Validate against local XSD before enabling transmission.".to_string(),
        ],
    })
}

/// Ofrece el mapeo técnico de una rectificativa a R1-R5 y S/I.
#[tauri::command]
pub fn rectification_advice(
    input: RectificationAdviceInput,
) -> Result<RectificationAdvice, String> {
    Ok(rectification_advisor::advise(input))
}

/// Genera y valida un XML de alta VERI*FACTU sin firmarlo ni enviarlo.
#[tauri::command]
pub fn verifactu_xml_draft_export(
    app: AppHandle,
    state: State<'_, AppState>,
    invoice_id: String,
    target_path: String,
) -> Result<VerifactuXmlResult, String> {
    if invoice_id.trim().is_empty() {
        return Err("invoice_id is required".to_string());
    }
    if target_path.trim().is_empty() {
        return Err("target_path is required".to_string());
    }

    let conn = state
        .conn
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;
    let invoice = db::invoice_pdf_data(&conn, &invoice_id)?;
    let previous = match db::previous_fiscal_record_link_for_invoice(&conn, &invoice_id, "Alta")? {
        Some(link) => Some(link),
        None => db::previous_issued_invoice_link(&conn, &invoice_id)?,
    };
    let has_previous = previous.is_some();
    let assets = resolve_verifactu_xsd_assets(&app)?;
    verifactu::write_verifactu_xml_draft_validated(
        &target_path,
        &invoice,
        previous.as_ref(),
        &assets,
    )?;

    Ok(VerifactuXmlResult {
        target_path,
        status: "draft-created-xsd-valid".to_string(),
        xsd_validated: true,
        notes: vec![
            "XML alta generated and validated against local AEAT XSD; not signed or submitted."
                .to_string(),
            "XSD validation is structural, not full fiscal/legal compliance.".to_string(),
            if has_previous {
                "Includes provisional RegistroAnterior."
            } else {
                "Marked as provisional PrimerRegistro."
            }
            .to_string(),
        ],
    })
}

/// Genera, valida y registra un XML de anulación VERI*FACTU.
#[tauri::command]
pub fn verifactu_xml_anulacion_draft_export(
    app: AppHandle,
    state: State<'_, AppState>,
    invoice_id: String,
    target_path: String,
) -> Result<VerifactuXmlResult, String> {
    if invoice_id.trim().is_empty() {
        return Err("invoice_id is required".to_string());
    }
    if target_path.trim().is_empty() {
        return Err("target_path is required".to_string());
    }

    let mut conn = state
        .conn
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;
    let invoice = db::invoice_pdf_data(&conn, &invoice_id)?;
    if invoice.status != "Issued" {
        return Err("anulacion requires invoice status Issued".to_string());
    }
    if invoice.fiscal_hash.is_none() {
        return Err("anulacion requires an issued invoice fiscal_hash".to_string());
    }
    let generated_at = Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true);
    let previous = match db::latest_fiscal_record_link_for_company(&conn, &invoice.company_id)? {
        Some(link) => link,
        None => invoice_self_link(&invoice)?,
    };
    let cancellation_hash = verifactu::calculate_invoice_registro_anulacion_hash(
        &invoice,
        &previous.fiscal_hash,
        &generated_at,
    )?;
    let assets = resolve_verifactu_xsd_assets(&app)?;
    verifactu::write_verifactu_anulacion_xml_draft_validated(
        &target_path,
        &invoice,
        &previous,
        &generated_at,
        &assets,
    )?;
    let previous_audit_hash = db::latest_audit_hash(&conn)?;
    let audit_event = AuditEvent::invoice_voided(
        invoice.id.clone(),
        "local-user".to_string(),
        cancellation_hash.clone(),
        previous_audit_hash,
    );
    let audit_hash = audit_event.chain_hash();
    if let Err(err) = db::insert_anulacion_record(
        &mut conn,
        &invoice_id,
        &cancellation_hash,
        Some(&previous.fiscal_hash),
        &generated_at,
        &target_path,
        &audit_event,
        &audit_hash,
    ) {
        let _ = fs::remove_file(&target_path);
        return Err(err);
    }

    Ok(VerifactuXmlResult {
        target_path,
        status: "anulacion-created-xsd-valid-recorded".to_string(),
        xsd_validated: true,
        notes: vec![
            "XML anulacion generated, XSD-validated, recorded in fiscal chain, invoice marked Void."
                .to_string(),
            "Not signed or submitted to AEAT.".to_string(),
            "XSD validation is structural, not full fiscal/legal compliance.".to_string(),
        ],
    })
}

/// Prepara un paquete VERI*FACTU sin firma para el siguiente paso del flujo.
#[tauri::command]
pub fn verifactu_submission_prepare(
    app: AppHandle,
    state: State<'_, AppState>,
    invoice_id: String,
    xml_path: String,
) -> Result<SubmissionPreparation, String> {
    if invoice_id.trim().is_empty() {
        return Err("invoice_id is required".to_string());
    }
    if xml_path.trim().is_empty() {
        return Err("xml_path is required".to_string());
    }

    let assets = resolve_verifactu_xsd_assets(&app)?;
    verifactu::validate_verifactu_xml_file(Path::new(&xml_path), &assets)?;

    let conn = state
        .conn
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;
    db::invoice_pdf_data(&conn, &invoice_id)?;
    let mut package = submission::prepare_unsigned_verifactu_package(
        invoice_id.clone(),
        "pending".to_string(),
        xml_path,
    )?;
    let export_id = db::insert_fiscal_export(
        &conn,
        &invoice_id,
        &package.provider,
        &package.environment,
        &package.payload_version,
        &package.xml_sha256,
        "prepared_for_signature",
    )?;
    package.export_id = export_id;
    Ok(package)
}

/// Comprueba las condiciones de transporte antes de cualquier envío.
#[tauri::command]
pub fn verifactu_transport_preflight(
    app: AppHandle,
    state: State<'_, AppState>,
    input: AeatTransportPreflightRequest,
) -> Result<AeatTransportPreflight, String> {
    if input.invoice_id.trim().is_empty() {
        return Err("invoice_id is required".to_string());
    }
    if input.xml_path.trim().is_empty() {
        return Err("xml_path is required".to_string());
    }

    let assets = resolve_verifactu_xsd_assets(&app)?;
    verifactu::validate_verifactu_xml_file(Path::new(&input.xml_path), &assets)?;

    let conn = state
        .conn
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;
    db::invoice_pdf_data(&conn, &input.invoice_id)?;

    aeat_transport::preflight(input)
}

fn invoice_self_link(invoice: &db::InvoicePdfData) -> Result<PreviousInvoiceLink, String> {
    let number = invoice
        .number
        .ok_or_else(|| "issued invoice missing number".to_string())?;
    let issued_at = invoice
        .issued_at
        .clone()
        .ok_or_else(|| "issued invoice missing issued_at".to_string())?;
    let fiscal_hash = invoice
        .fiscal_hash
        .clone()
        .ok_or_else(|| "issued invoice missing fiscal_hash".to_string())?;

    Ok(PreviousInvoiceLink {
        company_tax_id: invoice.company_tax_id.clone(),
        series: invoice.series.clone(),
        number,
        issued_at,
        fiscal_hash,
    })
}
