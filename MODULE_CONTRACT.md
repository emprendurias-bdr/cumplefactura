# CumpleFactura - Module contract

Estado: pre-MVP fiscal verificable
Fecha: 2026-06-04
Stack: Tauri 2 + React + TypeScript + Rust + SQLite

## Principios

- La logica fiscal critica vive en Rust, no solo en React.
- La emision debe ser local-first: sin red para crear borradores ni emitir en modo local.
- Una factura emitida no se edita: se rectifica, anula o emite evento compensatorio.
- La auditoria es append-only y cada evento encadena el hash anterior.
- VERI*FACTU, SII, TicketBAI/Batuz y Navarra HTN son flags separados; no mezclar territorios.

## Comandos Tauri iniciales

| Comando | Entrada | Salida | Estado |
|---|---|---|---|
| `app_defaults_get` | - | `AppDefaults` | Resuelve directorio app/export seguro desde Tauri; sin rutas de usuario hardcodeadas |
| `app_settings_get` | - | `AppSettings` | Lee configuracion local persistida de onboarding, carpeta export y flags fiscales por defecto |
| `app_settings_update` | `AppSettingsInput` | `AppSettings` | Guarda onboarding local, crea carpeta export si no existe y valida flags soportados |
| `company_create` | `CompanyInput` | `Company` | Persistencia SQLite |
| `company_update` | `CompanyUpdateInput` | `Company` | Edita datos reales del emisor por ID sin recrear entidad |
| `company_series_configure` | `InvoiceSeriesConfigInput` | `InvoiceSeriesConfig` | Configura serie por empresa/ejercicio, patron visible y siguiente numero |
| `company_series_list` | `company_id`, `fiscal_year` | `InvoiceSeriesConfig[]` | Lista series activas y preview |
| `customer_upsert` | `CustomerInput` con `id` opcional | `Customer` | Crea o actualiza cliente por ID con `ON CONFLICT DO UPDATE` |
| `product_upsert` | `ProductInput` con `id` opcional | `Product` | Crea o actualiza producto/servicio por empresa con SKU, precio, IVA, IRPF y descuento |
| `product_list` | `company_id` | `Product[]` | Lista catalogo activo/inactivo por empresa |
| `invoice_draft_create` | `InvoiceDraftInput` | `Invoice` | Totales + persistencia SQLite |
| `invoice_list` | `InvoiceListFilters?`, `ListPagination?` | `InvoiceSummary[]` | Busca/filtra por empresa, cliente, año, serie, estado, tipo y texto con `limit/offset` |
| `invoice_next_number_preview` | `company_id`, `fiscal_year`, `series` | `NextNumberPreview` | Lee `invoice_sequences`; preview UI, no reserva |
| `invoice_issue` | `InvoiceIssueInput` | `IssuedInvoice` | Ignora numero UI, reserva desde `invoice_sequences`, huella RegistroAlta AEAT + auditoria + registro fiscal persistido; soporta `Rectifying` R1-R5/I-S |
| `invoice_export_pdf` | `invoice_id`, `target_path` | `FilePath` | PDF profesional paginado; emitidas con QR tributario VERI*FACTU (35 mm, nivel M, leyenda AEAT); borradores con marca BORRADOR y sin QR |
| `invoice_export_json` | `invoice_id`, `target_path` | `ExportResult` | JSON de factura local |
| `invoice_export_csv` | `filters`, `target_path` | `ExportResult` | CSV local; filtros aceptados por contrato, MVP exporta todo |
| `fiscal_audit_export` | `filters`, `target_path` | `ExportResult` | JSON de trazabilidad fiscal local con verificacion de cadena; no certificacion |
| `fiscal_prepare_verifactu` | `invoice_id` | `FiscalPayload` | Placeholder sin envio real |
| `fiscal_sidecar_capabilities_get` | - | `ImportedSidecarCapabilities` | Importa evidencia local redacted de ContaPro sidecar; MVP solo VERI*FACTU/SII si tienen manifiesto accepted/passed; sin red ni secretos |
| `sii_submit_sidecar_preflight` | `SiiSidecarPreflightRequest` | `SiiSidecarPreflight` | Frontera local `/sii/submit-preflight`; requiere flag/HMAC/vault para llamar sidecar; sin SOAP AEAT |
| `ticketbai_submit_sidecar_preflight` | `TicketBaiSidecarPreflightRequest` | `TicketBaiSidecarPreflight` | Frontera local `/ticketbai/submit-preflight`; requiere flag/HMAC/vault para llamar sidecar; sin envio foral |
| `verifactu_xml_draft_export` | `invoice_id`, `target_path` | `VerifactuXmlResult` | XML alta borrador, XSD local obligatorio, sin firma/envio |
| `verifactu_xml_anulacion_draft_export` | `invoice_id`, `target_path` | `VerifactuXmlResult` | XML anulacion, XSD local obligatorio, registro fiscal append-only, factura `Void`, sin firma/envio |
| `fiscal_chain_verify` | - | `FiscalChainVerification` | Recalculo huellas AEAT + enlaces `previous_fiscal_hash` + deteccion tamper |
| `verifactu_submission_prepare` | `invoice_id`, `xml_path` | `SubmissionPreparation` | Revalida XML, calcula SHA256, registra `fiscal_exports`; sin firma ni envio |
| `verifactu_xades_sidecar_preflight` | `XadesSidecarPreflightRequest` | `XadesSidecarPreflight` | Comprueba exact XML hash, endpoint local `/verifactu/sign-xml`, ref `vault://certs/...` y flag; sin llamada sidecar |
| `verifactu_xades_sidecar_sign` | `XadesSidecarSignRequest` | `XadesSidecarSignature` | Revalida XML, llama sidecar local con HMAC, exige modo XAdES real, escribe XML firmado y registra export `signed_xades`; sin envio AEAT |
| `verifactu_submit_sidecar_preflight` | `VerifactuSubmitSidecarPreflightRequest` | `VerifactuSubmitSidecarPreflight` | Revalida XML firmado, llama sidecar local `/verifactu/submit-preflight` con HMAC y comprueba WSDL/vault/flags; sin SOAP AEAT |
| `verifactu_submit_sidecar_invoke` | `VerifactuSubmitSidecarInvokeRequest` | `VerifactuSubmitSidecarInvocation` | Envia XML firmado al sidecar local `/verifactu/invoke-submit` con HMAC; registra export `submitted_via_sidecar`; gate con sidecar falso |
| `invoice_due_date_set` | `invoice_id`, `due_date?` | `()` | Vencimiento de una emitida; sin vencimiento = vence en fecha de emision |
| `payment_register` | `PaymentInput` | `InvoicePayment` | Cobro parcial/total de una emitida; metodo transfer/card/cash/direct_debit/bizum/other; rechaza sobrecobro |
| `payment_delete` / `payment_list` | `payment_id` / `invoice_id` | `()` / `InvoicePayment[]` | Anula o lista cobros; audit event operativo |
| `receivables_list` | `company_id?` | `Receivable[]` | Estado de cobro paid/partial/pending/overdue con dias de retraso |
| `recurring_upsert` / `recurring_list` / `recurring_set_active` | plantilla / filtro / `id, active` | `RecurringInvoice` | Plantillas mensual/trimestral/anual con fecha fin opcional |
| `recurring_generate_due` | - | `RecurringRun[]` | Crea un BORRADOR por plantilla vencida y avanza la fecha; nunca emite. Se lanza al abrir la app |
| `quote_upsert` / `quote_list` | `QuoteInput` / `company_id?` | `Quote` | Presupuesto `P{año}-NNNN`; solo editable en borrador |
| `quote_set_status` | `id`, `status` | `()` | draft->sent/accepted/rejected, sent->accepted/rejected, rejected->draft |
| `quote_convert` | `id` | `Invoice` (borrador) | Convierte en borrador de factura y marca `invoiced` con `invoice_id` |
| `email_settings_get` / `email_settings_update` | - / `EmailSettings` | `EmailSettingsView` | SMTP propio (starttls/tls/none); devuelve `configured` y `password_saved`, nunca la contraseña |
| `email_password_set` | `password` | `()` | Guarda la contraseña SMTP en el almacen de credenciales del SO (keyring `CumpleFactura-SMTP`), no en SQLite |
| `email_send_test` / `email_send_invoice` / `email_send_reminder` | destino / `invoice_id` | `EmailLogEntry` | Envia PDF adjunto; solo emitidas; recordatorio exige importe pendiente; todo queda en `email_log` |
| `email_log_list` | `invoice_id?` | `EmailLogEntry[]` | Historial de envios |
| `company_list` / `customer_list` / `invoice_list` / `audit_list` / `fiscal_record_list` | filtros/paginacion segun lista | listas resumen | Lectura SQLite |
| `backup_export` | `target_path` | `BackupResult` | Export SQLite con `VACUUM INTO` |
| `backup_restore` | `source_path` | `BackupRestoreResult` | Preflight `validated-only`; no reemplazo destructivo en MVP |

## Invariantes P0

- `company_id`, `customer_id`, `series` y lineas son obligatorios.
- Las lineas admiten descripcion, cantidad entera, precio unitario, descuento porcentual, IVA e IRPF; la base imponible se calcula tras descuento en Rust.
- Empresa y cliente se guardan desde formularios reales; el demo solo rellena campos y no desbloquea permisos.
- `company_update` y `customer_upsert(id)` actualizan datos sin borrar entidades referenciadas por facturas.
- `products` pertenece a una empresa; `sku` es unico por empresa y no se mezcla entre emisores.
- El catalogo guarda precio, IVA, IRPF y descuento por defecto; usar un producto rellena la linea editable sin emitir ni reservar numero.
- `invoice_list` acepta filtros opcionales, busqueda textual y paginacion `limit/offset`; no muta facturas ni secuencias.
- `audit_list` y `fiscal_record_list` aceptan paginacion `limit/offset`; las listas no cargan todo el historico en una sola llamada.
- `number` debe ser positivo al emitir y procede de Rust; cualquier numero enviado por UI es ignorado en modo normal.
- `series + fiscal_year + number` debe ser unico por empresa en SQLite.
- `invoice_sequences` gobierna la siguiente numeracion por empresa/ejercicio/serie.
- `invoice_series_configs` permite continuar numeracion previa o crear nueva serie con codigo, año opcional, separador, padding y siguiente numero.
- `company_series_configure` rechaza `next_number` si no supera el maximo emitido para empresa/ejercicio/serie.
- La preview de numero no reserva; solo `invoice_issue` reserva.
- `app_settings` persiste una configuracion singleton para onboarding local: carpeta export, flags fiscales por defecto y estado completado.
- El onboarding solo se marca completo si existen empresa activa, serie activa, flags fiscales y carpeta export.
- Los flags fiscales por defecto se aplican a borradores, emision y rectificativas desde Rust/UI; `Sii` sigue visible como pendiente, no como envio real.
- `Rectifying` requiere `rectifies_invoice_id`, causa `R1-R5` y metodo `I/S`.
- `Rectifying` persiste causa/metodo y los traslada a XML VERI*FACTU. Metodo `S` incluye `ImporteRectificacion`.
- `audit_events` no admite update/delete por trigger SQLite.
- `fiscal_records` no admite update/delete por trigger SQLite.
- Cada `Alta` y `Anulacion` fiscal persiste `fiscal_hash` y `previous_fiscal_hash`.
- `fiscal_chain_verify` debe detectar hash fiscal no recalculable, enlace roto, duplicado, factura alterada y XML de anulacion ausente.
- `fiscal_audit_export` debe incluir facturas, eventos, registros fiscales y resultado de `fiscal_chain_verify`.
- `verifactu_submission_prepare` no puede devolver exito si el XML no existe o no pasa XSD local.
- `verifactu_submit_sidecar_preflight` exige `signed_xades`, endpoint local, secreto HMAC y `vault://certs/...`; no envia XML bruto ni invoca AEAT.
- `verifactu_submit_sidecar_invoke` exige `signed_xades`, XML con `Signature`, endpoint local, secreto HMAC, `vault://certs/...` y flag propio; nunca llama AEAT directamente desde CumpleFactura.
- `fiscal_sidecar_capabilities_get` solo lee evidencias locales redacted de ContaPro sidecar; no importa certificados, passwords, XML bruto ni claves.
- `sii_submit_sidecar_preflight` y `ticketbai_submit_sidecar_preflight` quedan bloqueados por defecto si faltan flags `CUMPLEFACTURA_ENABLE_*_SIDECAR_PREFLIGHT`, HMAC o `vault://certs/...`.
- SII/VERI*FACTU readiness de ContaPro se muestra como evidencia importable MVP solo con manifiesto accepted/passed; FACe/TicketBAI siguen bloqueados por alta externa/homologacion foral.
- Los paths por defecto de backup/export se obtienen de `app_defaults_get`; no se hardcodea un perfil de Windows en React.
- La seleccion principal de carpeta export, backup, restore y artefactos fiscales usa dialogo nativo Tauri con filtros de extension; los campos de ruta quedan en solo lectura desde la UI.
- Restore destructivo queda fuera del MVP: `backup_restore` valida origen y devuelve `destructive_restore_performed=false`.
- La huella fiscal de `Alta`/`Anulacion` se recalcula con los campos oficiales AEAT cubiertos por los tests.

- QR tributario: URL `ValidarQR` (prewww2 en pruebas, www2 en produccion) segun `app_settings.qr_environment` (defecto `test`); en pruebas el PDF lo indica bajo el QR.
- Cobros, recurrentes, presupuestos y emails generan `AuditEvent::operational` encadenado; no alteran `fiscal_records` ni la numeracion.
- `recurring_generate_due` y `quote_convert` solo crean borradores: la emision sigue siendo manual (`invoice_issue`).
- Secretos SMTP solo en keyring del sistema; SQLite guarda host/puerto/usuario/remitente.

## Fronteras

- `src-tauri/src/domain/`: reglas puras y DTOs.
- `src-tauri/src/services/`: auditoria, PDF, cliente fiscal futuro.
- `src-tauri/src/db/`: migraciones y persistencia local SQLite.
- `src-tauri/src/services/verifactu.rs`: generacion XML tecnica basada en XSD locales; no firma ni envia.
- `src-tauri/src/commands/`: frontera Tauri frontend <-> Rust.
- `tests/regulatory/`: specs de aceptacion que deben convertirse a Rust/TS.
- `#[cfg(test)]` en dominio/servicios/db: pruebas ejecutables de totales, hash, persistencia, listados, backup, PDF, XML y append-only.
- `src-tauri/src/core_e2e.rs`: E2E real del nucleo Rust/SQLite hasta XML VERI*FACTU XSD-validado, PDF y export `prepared_for_signature`.
- `tools/verify-regulatory-evidence.mjs`: valida que `REGULATORY_EVIDENCE_MATRIX.md` mantenga promesa, fuente, evidencia ejecutable y limite por fila.
- `tools/verify-evidence-ledger.mjs`: genera ledger SHA256 de fuentes normativas locales, artefactos del repo, fixtures, evidencias y logs del gate.
- `tools/verify-external-acceptance-evidence.mjs`: valida manifiesto externo redacted, hashes SHA256 y artefactos referenciados; sin manifiesto real registra `not_provided`.
- `tools/verify-external-readiness.mjs`: audita si existen ejecutable release, driver Tauri, WebDriver, sidecar verde, flags, vault, certificado y aceptacion externa validada para pasar de pre-MVP a entorno real.
- `tools/verify-browser-smoke.mjs`: valida render real en Chromium del flujo emisor -> cliente -> borrador -> emision -> XML -> preparacion con mock Tauri local.
- `tools/verify-secret-scan.mjs`: escaneo local de secretos con evidencias redacted; no imprime valores.
- `tools/verify-tauri-desktop-e2e.mjs`: evidencia desktop Tauri; preflight por defecto y modo WebDriver real para el gate.


## UI MVP

- Flujo demo cableado tras control explicito `Activar datos demo`: emisor -> cliente -> borrador -> emision -> listados -> backup/export.
- Flujo real cableado: guardar/editar empresa, guardar/editar cliente, configurar serie, crear borrador, emitir y exportar.
- La UI invoca comandos Tauri reales con `@tauri-apps/api/core`.
- Muestra estado pre-MVP: `local_evidence`, `external_blocked`, limites y directorio export seguro.
- Incluye onboarding inicial guiado para empresa, fiscalidad local, primera serie y carpeta export persistida.
- Incluye file picker nativo para carpeta export, backup, restore y artefactos PDF/JSON/CSV/XML/auditoria.
- Incluye catalogo productos/servicios por empresa y boton para rellenar una linea de factura.
- Incluye buscador/filtros de facturas por texto, empresa, cliente, año, serie, estado y tipo.
- Incluye paginacion local de facturas, auditoria y registros fiscales.
- Incluye pantalla de auditoria fiscal local con estado de cadena, incidencias, hash final por empresa y export JSON.
- Incluye panel `Canales ContaPro sidecar` con estado importado de VERI*FACTU, SII, FACe y TicketBAI; MVP accionable solo VERI*FACTU/SII.
- Permite configurar series: `VENDI202601`, `AL-001`, `C-001`, `I-001`.
- Permite elegir la serie activa de cada factura y editar lineas con cantidad, precio, descuento, IVA e IRPF antes de crear borrador o emitir.
- Exporta PDF, JSON, CSV, auditoria JSON y XML VERI*FACTU alta/anulacion borrador XSD-validado desde factura emitida.
- No hay todavia conteos totales, vistas guardadas, restore destructivo ni import visual.

## VERI*FACTU XML

- Basado en XSD locales `SuministroLR VERI-FACTU.xsd` y `SuministroInformacion VERI-FACTU.xsd` de `C:\03 LEGISLACION\AEAT\FACTURACION Y SIF\05 DOCUMENTACION TECNICA AEAT\01 VERIFACTU`, copiados a `src-tauri/resources/xsd/verifactu/`.
- Alcance actual: `RegistroAlta` F1/F2/R1-R5, rectificativa incremental o sustitutiva `I/S`, IVA general, y `RegistroAnulacion` con `RegistroAnterior` tomado de la cadena fiscal.
- Huella `RegistroAlta`: SHA-256 uppercase sobre campos oficiales AEAT (`IDEmisorFactura`, `NumSerieFactura`, `FechaExpedicionFactura`, `TipoFactura`, `CuotaTotal`, `ImporteTotal`, `Huella`, `FechaHoraHusoGenRegistro`).
- Huella `RegistroAnulacion`: SHA-256 uppercase sobre campos oficiales AEAT (`IDEmisorFacturaAnulada`, `NumSerieFacturaAnulada`, `FechaExpedicionFacturaAnulada`, `Huella`, `FechaHoraHusoGenRegistro`).
- Tests cubren ejemplos oficiales AEAT de primer alta, alta encadenada y anulacion.
- Validacion XSD local disponible con `npm run validate:verifactu:xsd` y `tools/validate-verifactu-xsd.ps1`.
- El test Rust `generated_xml_passes_local_xsd_contract` genera XML desde el servicio y lo valida contra los XSD locales en Windows.
- Los comandos `verifactu_xml_draft_export` y `verifactu_xml_anulacion_draft_export` usan validacion XSD local antes de devolver exito.
- Tauri empaqueta el script y XSD como recursos (`tools/` y `xsd/verifactu/`) y el runtime cae al arbol dev si no hay bundle.
- No es payload fiscal listo para produccion: falta firma XAdES, transporte AEAT y asistente juridico de causa rectificativa por caso.
- Verificacion ejecutable: `services::fiscal_chain` recalcula huellas `Alta`/`Anulacion` y valida cadena persistida.
- Preparacion firma/envio: `services::submission` genera evidencia local `SHA256 + prepared_for_signature`; no realiza XAdES ni red.
- Frontera XAdES: `services::xades_sidecar` hace preflight y firma exact-XML contra sidecar local `/verifactu/sign-xml`; exige HMAC, flag runtime y modo XAdES real. No envia a AEAT.
- Frontera envio: `services::verifactu_submit_sidecar` llama solo al preflight local `/verifactu/submit-preflight`; verifica readiness WSDL/vault/flags antes de cualquier `/verifactu/invoke-submit`.
- Frontera invocacion: `services::verifactu_submit_sidecar::invoke_submit` manda XML firmado solo al sidecar local `/verifactu/invoke-submit`; respuesta redacted y registro `fiscal_exports`.
- Frontera SII importada: `services::sidecar_channels::sii_preflight` manda solo metadatos `book`, endpoint, vault ref y flag al sidecar local `/sii/submit-preflight`; sin facturas ni SOAP AEAT.
- Frontera TicketBAI diferida: `services::sidecar_channels::ticketbai_preflight` queda fail-closed y fuera de MVP hasta politica de firma, LicenciaTBAI y aceptacion foral.

## Gate regulatorio

- Comando canonico: `npm run validate:regulatory`.
- Ejecuta `cargo fmt --check`, `cargo test`, `npm run build`, `npm run validate:ui-contract`, `npm run validate:core-e2e`, `npm run validate:browser-smoke`, `npm run validate:secret-scan`, `npm run validate:evidence-matrix`, `npm run validate:verifactu:xsd`, `npm run tauri:build`, `npm run validate:tauri-desktop-e2e`, `npm run validate:external-acceptance`, `npm run validate:external-readiness` y `npm run validate:evidence-ledger`.
- `validate:tauri-desktop-e2e` comprueba prerequisitos/release en modo preflight; el gate lo ejecuta en modo WebDriver real con `CUMPLEFACTURA_TAURI_DESKTOP_E2E_REAL=1`.
- Evidencia actual: `tests/regulatory/evidence/latest-regulatory-gate.json`, `latest-secret-scan.json/md`, `latest-tauri-desktop-e2e.json/md`, `latest-evidence-ledger.json/md`, `latest-external-acceptance-evidence.json/md`, `latest-external-readiness.json/md` y artefactos core/browser smoke.
- Import ContaPro sidecar: `npm run validate:contapro-sidecar-import` genera `latest-contapro-sidecar-import.json/md` y se incluye en gate/ledger.
- Matriz de trazabilidad: `REGULATORY_EVIDENCE_MATRIX.md`.

## Fuentes regulatorias locales

- `C:\03 LEGISLACION\docs\estudios\ESTUDIO_VERIFACTU_RRSIF_CUMPLEFACTURA_2026-05-28.md`
- `C:\03 LEGISLACION\AEAT\MATRIZ_TECNICA_CUMPLEFACTURA_2026-05-27.md`
- `C:\03 LEGISLACION\AEAT\FACTURACION Y SIF\05 DOCUMENTACION TECNICA AEAT\01 VERIFACTU\Detalle especificaciones huella hash registros facturacion - AEAT.pdf`
- `C:\03 LEGISLACION\FORAL\05 NAVARRA HTN\MAPA_PRESENTACION_HTN.md`
- `C:\03 LEGISLACION\docs\estudios\MATRIZ_AI_ACT_APPS_2026-05-28.md`

No usar este scaffold como garantia de cumplimiento. Es base tecnica para implementar y probar.





