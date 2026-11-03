//! Crate library CumpleFactura: arranque Tauri + registro de comandos IPC.
//!
//! Capas: `commands` (IPC) → `domain` / `db` / `services` (fiscal local + sidecar).

use tauri::Manager;

mod commands;
#[cfg(test)]
mod core_e2e;
mod db;
mod domain;
mod services;

/// Inicializa SQLite, plugin dialog, el gestor del sidecar y el `invoke_handler`.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let state = db::init_app_state(app)?;
            app.manage(state);
            app.manage(services::sidecar_process::SidecarManager::default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app::app_defaults_get,
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
            commands::fiscal::verifactu_submit_preflight,
            commands::fiscal::verifactu_submit,
            commands::fiscal::verifactu_submission_list,
        ])
        .build(tauri::generate_context!())
        .expect("error while building CumpleFactura")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                app.state::<services::sidecar_process::SidecarManager>()
                    .shutdown();
            }
        });
}
