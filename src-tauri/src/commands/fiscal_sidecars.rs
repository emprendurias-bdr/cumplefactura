//! Comandos IPC para capacidades y operaciones de sidecars fiscales.
//!
//! La capa de comandos valida la factura y el XML antes de delegar en los
//! servicios de SII, TicketBAI, firma XAdES y envío VERI*FACTU.

use super::*;

/// Devuelve las capacidades importadas desde el readiness de ContaPro.
#[tauri::command]
pub fn fiscal_sidecar_capabilities_get() -> Result<ImportedSidecarCapabilities, String> {
    Ok(sidecar_channels::imported_sidecar_capabilities())
}

/// Ejecuta el preflight local del sidecar SII.
#[tauri::command]
pub fn sii_submit_sidecar_preflight(
    input: SiiSidecarPreflightRequest,
) -> Result<SiiSidecarPreflight, String> {
    sidecar_channels::sii_preflight(input)
}

/// Ejecuta el preflight local del sidecar TicketBAI.
#[tauri::command]
pub fn ticketbai_submit_sidecar_preflight(
    input: TicketBaiSidecarPreflightRequest,
) -> Result<TicketBaiSidecarPreflight, String> {
    sidecar_channels::ticketbai_preflight(input)
}

/// Comprueba si el sidecar XAdES está preparado para firmar el XML indicado.
#[tauri::command]
pub fn verifactu_xades_sidecar_preflight(
    app: AppHandle,
    state: State<'_, AppState>,
    input: XadesSidecarPreflightRequest,
) -> Result<XadesSidecarPreflight, String> {
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

    xades_sidecar::preflight(input)
}

/// Firma el XML mediante el sidecar XAdES y registra la exportación.
#[tauri::command]
pub fn verifactu_xades_sidecar_sign(
    app: AppHandle,
    state: State<'_, AppState>,
    input: XadesSidecarSignRequest,
) -> Result<XadesSidecarSignature, String> {
    if input.invoice_id.trim().is_empty() {
        return Err("invoice_id is required".to_string());
    }
    if input.xml_path.trim().is_empty() {
        return Err("xml_path is required".to_string());
    }
    if input.signed_xml_path.trim().is_empty() {
        return Err("signed_xml_path is required".to_string());
    }

    let assets = resolve_verifactu_xsd_assets(&app)?;
    verifactu::validate_verifactu_xml_file(Path::new(&input.xml_path), &assets)?;

    let conn = state
        .conn
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;
    db::invoice_pdf_data(&conn, &input.invoice_id)?;

    let mut signature = xades_sidecar::sign_exact_xml(input)?;
    let signed_export_id = db::insert_fiscal_export(
        &conn,
        &signature.invoice_id,
        &signature.provider,
        &signature.environment,
        &signature.payload_version,
        &signature.xml_sha256,
        "signed_xades",
    )?;
    signature.export_id = signed_export_id;
    Ok(signature)
}

/// Comprueba si el sidecar de envío VERI*FACTU está preparado.
#[tauri::command]
pub fn verifactu_submit_sidecar_preflight(
    app: AppHandle,
    state: State<'_, AppState>,
    input: VerifactuSubmitSidecarPreflightRequest,
) -> Result<VerifactuSubmitSidecarPreflight, String> {
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

    verifactu_submit_sidecar::preflight(input)
}

/// Solicita al sidecar el envío de un XML firmado y registra su resultado.
#[tauri::command]
pub fn verifactu_submit_sidecar_invoke(
    state: State<'_, AppState>,
    input: VerifactuSubmitSidecarInvokeRequest,
) -> Result<VerifactuSubmitSidecarInvocation, String> {
    if input.invoice_id.trim().is_empty() {
        return Err("invoice_id is required".to_string());
    }
    if input.xml_path.trim().is_empty() {
        return Err("xml_path is required".to_string());
    }

    let conn = state
        .conn
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;
    db::invoice_pdf_data(&conn, &input.invoice_id)?;

    let mut result = verifactu_submit_sidecar::invoke_submit(input)?;
    let submit_export_id = db::insert_fiscal_export(
        &conn,
        &result.invoice_id,
        &result.provider,
        &result.environment,
        &result.payload_version,
        &result.xml_sha256,
        "submitted_via_sidecar",
    )?;
    result.export_id = submit_export_id;
    Ok(result)
}
