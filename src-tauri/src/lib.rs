use tauri::Manager;

mod commands;
#[cfg(test)]
mod core_e2e;
mod db;
mod domain;
mod services;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let state = db::init_app_state(app)?;
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app::app_defaults_get,
            commands::preferences::ui_preferences_get,
            commands::preferences::ui_preferences_update,
            commands::settings::app_settings_get,
            commands::settings::app_settings_update,
            commands::company::company_create,
            commands::company::company_update,
            commands::company::company_list,
            commands::company::company_series_configure,
            commands::company::company_series_list,
            commands::customers::customer_upsert,
            commands::customers::customer_list,
            commands::products::product_upsert,
            commands::products::product_list,
            commands::invoices::invoice_draft_create,
            commands::invoices::invoice_issue,
            commands::invoices::invoice_next_number_preview,
            commands::invoices::invoice_list,
            commands::invoices::invoice_export_pdf,
            commands::fiscal::fiscal_prepare_verifactu,
            commands::fiscal::fiscal_sidecar_capabilities_get,
            commands::fiscal::sii_submit_sidecar_preflight,
            commands::fiscal::ticketbai_submit_sidecar_preflight,
            commands::fiscal::rectification_advice,
            commands::fiscal::backup_export,
            commands::fiscal::backup_restore,
            commands::fiscal::invoice_export_json,
            commands::fiscal::invoice_export_csv,
            commands::fiscal::fiscal_audit_export,
            commands::fiscal::verifactu_xml_draft_export,
            commands::fiscal::verifactu_xml_anulacion_draft_export,
            commands::fiscal::audit_list,
            commands::fiscal::fiscal_record_list,
            commands::fiscal::fiscal_chain_verify,
            commands::fiscal::verifactu_submission_prepare,
            commands::fiscal::verifactu_xades_sidecar_preflight,
            commands::fiscal::verifactu_xades_sidecar_sign,
            commands::fiscal::verifactu_transport_preflight,
            commands::fiscal::verifactu_submit_sidecar_preflight,
            commands::fiscal::verifactu_submit_sidecar_invoke,
        ])
        .run(tauri::generate_context!())
        .expect("error while running CumpleFactura");
}
