# CumpleFactura - Regulatory test plan

Fecha: 2026-06-04
Fuente: C:\03 LEGISLACION\docs\estudios\ESTUDIO_VERIFACTU_RRSIF_CUMPLEFACTURA_2026-05-28.md

## Tests regulatorios minimos

| Test | Objetivo |
|---|---|
| invoice_numbering.spec | Series correlativas por ejercicio/tipo; sin huecos/duplicados. |
| invoice_series_config.spec | Alta de empresa configura patron, año opcional, separador, padding y siguiente numero. |
| company_customer_forms.spec | Alta/edicion de empresa y cliente desde formularios reales; demo solo rellena campos. |
| onboarding_settings.spec | Onboarding inicial guarda empresa activa, serie, flags fiscales por defecto y carpeta export local. |
| native_file_picker.spec | Dialogos nativos para carpeta export, backup, restore y artefactos PDF/JSON/CSV/XML/auditoria con filtros de extension. |
| product_catalog.spec | Catalogo por empresa guarda SKU, precio, IVA, IRPF/descuento y rellena lineas editables. |
| invoice_search_filters.spec | Busqueda y filtros por empresa, cliente, año, serie, estado, tipo y texto. |
| list_pagination.spec | Paginacion local de facturas, auditoria y registros fiscales con `limit/offset`. |
| invoice_editor.spec | Lineas editables con cantidad, precio, descuento, IVA e IRPF; totales calculados en Rust. |
| app_defaults.spec | Resolver directorios app/export seguros sin rutas de usuario hardcodeadas. |
| demo_seed_guard.spec | Datos demo solo tras accion explicita del usuario. |
| append_only.spec | Factura emitida no editable; rectificacion/anulacion explicita. |
| verifactu_xsd_contract.spec | XML valido contra XSD AEAT locales. |
| hash_chain.spec | Huella/cadena estable y sensible a cambios. |
| rectification_flow.spec | Flujo de rectificativa/anulacion sin borrado. |
| rectification_advisor.spec | Mapeo tecnico de escenario declarado a `R1-R5` y metodo `I/S`, con limite de no asesor juridico. |
| aeat_transport_preflight.spec | Preflight de transporte AEAT: endpoint WSDL permitido, hash XML, XAdES requerido y flag runtime. |
| xades_sidecar_preflight.spec | Preflight XAdES exact-XML: endpoint sidecar local, hash XML, vault ref y flag runtime. |
| xades_sidecar_sign.spec | Firma XAdES exact-XML: HMAC contra sidecar local, modo XAdES real obligatorio, XML firmado local y export `signed_xades`. |
| verifactu_submit_sidecar_preflight.spec | Readiness de envio VERI*FACTU via sidecar: HMAC local, WSDL/vault/flags, sin XML bruto ni SOAP AEAT. |
| verifactu_submit_sidecar_invoke.spec | Frontera final de envio: XML firmado a sidecar local `/verifactu/invoke-submit`, HMAC, respuesta redacted y gate sin AEAT real. |
| contapro_sidecar_import.spec | Import local redacted de readiness ContaPro sidecar: MVP solo VERI*FACTU/SII con manifiesto accepted/passed; FACe/TicketBAI diferidos, sin red ni secretos. |
| sii_sidecar_preflight.spec | Frontera SII `/sii/submit-preflight`: flag/HMAC/vault obligatorios; sin facturas ni SOAP AEAT en gate. |
| ticketbai_sidecar_preflight.spec | Frontera TicketBAI diferida: no importable MVP; sin envio foral en gate. |
| ui_contract.spec | Contrato estatico de UI: comandos Tauri fiscales, botones, guards y limites visibles. |
| evidence_matrix.spec | Matriz de promesas: cada promesa debe tener fuente local, evidencia ejecutable y limite vivo. |
| evidence_ledger.spec | Ledger SHA256: fuentes normativas locales, artefactos del repo, fixtures, evidencias generadas y logs del gate. |
| external_acceptance.spec | Entrada de aceptacion externa: manifiesto redacted, hashes SHA256, artefactos referenciados y sin secretos/XML bruto. |
| external_readiness.spec | Auditoria de readiness externa: driver Tauri, sidecar gate/ledger, flags, vault, certificado y evidencia de aceptacion. |
| core_e2e.spec | Nucleo real Rust/SQLite: emisor, cliente, borrador, emision, huella AEAT, cadena fiscal, XML XSD, PDF y paquete de firma/envio. |
| browser_smoke.spec | Navegador real: carga UI, crea emisor/cliente/borrador, emite factura, exporta XML y prepara firma/envio con mock Tauri local. |
| secret_scan.spec | Escaneo local redacted antes de ledger; cero secretos/material sensible en repo. |
| tauri_desktop_e2e.spec | Release desktop + drivers; WebDriver real opt-in para ventana Tauri. |
| territory_flags.spec | AEAT, SII, TicketBAI/Batuz, Navarra HTN separados por flags. |
| audit_export.spec | Export inspeccion por periodo/serie reproducible. |
| fiscal_audit_screen.spec | Pantalla local de auditoria fiscal: verifica cadena, muestra incidencias/hash final y exporta informe JSON. |
| local_exports.spec | Export JSON/CSV/auditoria fiscal local sin llamadas externas. |
| backup_restore_preflight.spec | Restore valida fichero origen y no reemplaza la base activa en MVP. |

## No prometer aun

- Certificacion RRSIF completa.
- TicketBAI/Batuz completo por todos los territorios.
- Navarra HTN automatizado.
- Presentacion real AEAT sin entorno autorizado.
## Specs creadas

Ruta: `tests/regulatory/`

- `invoice_numbering.spec.md`
- `append_only.spec.md`
- `hash_chain.spec.md`
- `verifactu_xsd_contract.spec.md`
- `xades_sidecar_preflight.spec.md`
- `services::xades_sidecar::sign_exact_xml_*` en `cargo test`
- `services::verifactu_submit_sidecar::*` en `cargo test`
- `verifactu_submit_sidecar_invoke` cableado en UI y contrato estatico
- `rectification_flow.spec.md`
- `services::rectification_advisor::*` en `cargo test`
- `services::aeat_transport::*` en `cargo test`
- `tools/verify-ui-contract.mjs`
- `tools/verify-regulatory-evidence.mjs`
- `tools/verify-evidence-ledger.mjs`
- `tools/verify-external-acceptance-evidence.mjs`
- `tools/verify-external-readiness.mjs`
- `src-tauri/src/core_e2e.rs`
- `tools/verify-core-e2e.ps1`
- `tools/verify-browser-smoke.mjs`
- `tools/verify-secret-scan.mjs`
- `tools/verify-tauri-desktop-e2e.mjs`
- `commands::app::app_defaults_get`
- `commands::company::company_update`
- `commands::invoices::invoice_next_number_preview`
- `commands::company::company_series_configure`
- `commands::company::company_series_list`
- `db::tests::configures_invoice_series_and_initial_sequence`
- `db::tests::rejects_series_next_number_not_after_existing_invoice`
- `db::tests::updates_company_without_recreating_it`
- `db::tests::upserts_customer_by_id_without_replace_delete`
- `commands::settings::app_settings_get`
- `commands::settings::app_settings_update`
- `db::tests::persists_app_settings_for_onboarding`
- `@tauri-apps/plugin-dialog` cableado en UI y capability `dialog:allow-open`/`dialog:allow-save`
- `tools/import-contapro-sidecar-evidence.mjs`
- `commands::fiscal::fiscal_sidecar_capabilities_get`
- `commands::fiscal::sii_submit_sidecar_preflight`
- `commands::fiscal::ticketbai_submit_sidecar_preflight`
- `services::sidecar_channels::*` en `cargo test`
- `commands::products::product_upsert`
- `commands::products::product_list`
- `db::tests::upserts_and_lists_company_products`
- `commands::invoices::invoice_list(filters,pagination)`
- `commands::fiscal::audit_list(pagination)`
- `commands::fiscal::fiscal_record_list(pagination)`
- `db::tests::filters_invoices_by_series_kind_status_and_search`
- `db::tests::paginates_invoice_audit_and_fiscal_lists`
- `domain::invoice::tests::draft_applies_line_discount_before_tax_and_withholding`
- `services::export::*` en `cargo test`
- `services::export::tests::writes_fiscal_audit_json_with_chain_verification`
- `fiscal_audit_screen.spec` cubierto por `tools/verify-browser-smoke.mjs` y `tools/verify-ui-contract.mjs`
- `territory_flags.spec.md`
- `audit_export.spec.md`
- `fixtures/invoice-basic.json`
- `fixtures/territory-flags.json`
- `fixtures/external-acceptance-manifest.example.json`

## Siguiente conversion

Cuando exista repo Tauri:

- Rust domain tests para numeracion, append-only, hash chain.
- TS contract tests para DTO/XML.
- CI local sin red.
