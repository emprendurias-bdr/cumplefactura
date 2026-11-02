# CumpleFactura - Module contract

Estado: pre-MVP fiscal verificable
Fecha: 2026-11-02
Stack: Tauri 2 + React + TypeScript + Rust + SQLite; sidecar Rust `cumplefactura-sidecar` para la AEAT

## Principios

- La logica fiscal critica vive en Rust, no solo en React.
- La emision debe ser local-first: sin red para crear borradores ni emitir en modo local.
- Una factura emitida no se edita: se rectifica, anula o emite evento compensatorio.
- La auditoria es append-only y cada evento encadena el hash anterior.
- VERI*FACTU, SII, TicketBAI/Batuz y Navarra HTN son flags separados; no mezclar territorios.
- Solo el sidecar abre el certificado y habla con la AEAT; la app nunca sale a internet (ver `sidecar/ARQUITECTURA.md`).

## Comandos Tauri iniciales

| Comando | Entrada | Salida | Estado |
|---|---|---|---|
| `app_defaults_get` | - | `AppDefaults` | Resuelve carpetas de datos y export desde Tauri; la UI deriva los nombres de fichero |
| `app_settings_get` | - | `AppSettings` | Lee configuracion local persistida de onboarding, carpeta export, flags fiscales y endpoint VERI*FACTU |
| `app_settings_update` | `AppSettingsInput` | `AppSettings` | Guarda onboarding local y valida flags soportados y endpoint (4 puertos del WSDL) |
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
| `invoice_export_pdf` | `invoice_id`, `target_path` | `FilePath` | PDF basico local |
| `invoice_export_json` | `invoice_id`, `target_path` | `ExportResult` | JSON de factura local |
| `invoice_export_csv` | `filters`, `target_path` | `ExportResult` | CSV local; filtros aceptados por contrato, MVP exporta todo |
| `fiscal_audit_export` | `filters`, `target_path` | `ExportResult` | JSON de trazabilidad fiscal local con verificacion de cadena; no certificacion |
| `verifactu_xml_draft_export` | `invoice_id`, `target_path` | `VerifactuXmlResult` | XML alta, XSD local obligatorio; registra `fiscal_exports` `xml_exported` y devuelve `export_id` + `xml_sha256`; sin envio |
| `verifactu_xml_anulacion_draft_export` | `invoice_id`, `target_path` | `VerifactuXmlResult` | XML anulacion, XSD local obligatorio, registro fiscal append-only, factura `Void`, `xml_exported`; sin envio |
| `fiscal_chain_verify` | - | `FiscalChainVerification` | Recalculo huellas AEAT + enlaces `previous_fiscal_hash` + deteccion tamper |
| `verifactu_submit_preflight` | `SubmitInput` (`invoice_id`, `export_id`, `xml_path`, `xml_sha256`, `certificate_ref`) | `SubmitPreflightResponse` | Comprueba que el XML sigue siendo el exportado y pregunta al sidecar (lanzandolo si hace falta) por endpoint, certificado y permiso AEAT; nunca llama a la AEAT |
| `verifactu_submit` | `SubmitInput` | `VerifactuSubmission` | Envia el XML sin firma al sidecar, que lo remite a la AEAT por TLS mutuo; guarda CSV y estados en `verifactu_submissions` si la AEAT contesta |
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
- Los registros VERI*FACTU se envian sin firma XAdES: RD 1007/2023 art. 16.3 y Orden HAC/1177/2024 arts. 3-5. El modo No VERI*FACTU queda fuera de v1.
- `verifactu_submit_preflight` y `verifactu_submit` exigen que `export_id` sea una exportacion `xml_exported` de esa factura con ese SHA-256 y que el fichero no haya cambiado.
- Un XML ya aceptado por la AEAT no se reenvia: `xml_already_accepted_by_aeat` y un indice unico en `verifactu_submissions`.
- La app comprueba que la respuesta del sidecar trae el mismo SHA-256, que el preflight no salio a internet y que no contiene la referencia del certificado ni el secreto.
- El sidecar se lanza con un secreto HMAC nuevo por sesion (stdin), solo escucha en `127.0.0.1`, se relanza si muere y se cierra al salir la app.
- Sin `CUMPLEFACTURA_SIDECAR_ALLOW_AEAT=1` el sidecar no puede llamar a la AEAT; produccion exige `--allow-production`, que v1 no pasa nunca.
- Las rutas por defecto se derivan de la carpeta export de `app_defaults_get`; no se hardcodea un perfil de Windows en React.
- La seleccion principal de carpeta export, backup, restore y artefactos fiscales usa dialogo nativo Tauri con filtros de extension; los campos de ruta quedan en solo lectura desde la UI.
- Restore destructivo queda fuera del MVP: `backup_restore` valida origen y devuelve `destructive_restore_performed=false`.
- La huella fiscal de `Alta`/`Anulacion` se recalcula con los campos oficiales AEAT cubiertos por los tests.

## Fronteras

- `src-tauri/src/domain/`: reglas puras y DTOs.
- `src-tauri/src/services/`: auditoria, PDF, exportaciones, XML VERI*FACTU, cadena fiscal y cliente del sidecar.
- `src-tauri/src/db/`: migraciones y persistencia local SQLite, un modulo por entidad.
- `src-tauri/src/services/verifactu.rs`: generacion XML tecnica basada en XSD locales y huellas AEAT; no envia.
- `src-tauri/src/services/sidecar_process.rs` y `verifactu_submit.rs`: arranque del sidecar y envio por el canal loopback.
- `sidecar/`: proceso `cumplefactura-sidecar`, unico con certificado y red hacia la AEAT.
- `crates/fiscal-contract/`: contrato HTTP compartido (mensajes, HMAC, endpoints, lector HTTP).
- `src-tauri/src/commands/`: frontera Tauri frontend <-> Rust.
- `tests/regulatory/`: specs de aceptacion que deben convertirse a Rust/TS.
- `#[cfg(test)]` en dominio/servicios/db: pruebas ejecutables de totales, hash, persistencia, listados, backup, PDF, XML y append-only.
- `src-tauri/src/core_e2e.rs`: E2E real del nucleo Rust/SQLite hasta XML VERI*FACTU XSD-validado, PDF y export `xml_exported`.
- `tools/verify-regulatory-evidence.mjs`: valida que `REGULATORY_EVIDENCE_MATRIX.md` mantenga promesa, fuente, evidencia ejecutable y limite por fila.
- `tools/verify-evidence-ledger.mjs`: genera ledger SHA256 de fuentes normativas locales, artefactos del repo, fixtures, evidencias y logs del gate.
- `tools/verify-external-acceptance-evidence.mjs`: valida manifiesto externo redacted, hashes SHA256 y artefactos referenciados; sin manifiesto real registra `not_provided`.
- `tools/verify-external-readiness.mjs`: audita si existen ejecutable release, driver Tauri, WebDriver, sidecar compilado y con smoke verde, vault, certificado, permiso AEAT y aceptacion externa validada.
- `tools/verify-browser-smoke.mjs`: valida render real en Chromium del flujo emisor -> cliente -> borrador -> emision -> XML -> preflight -> envio con mock Tauri local.
- `tools/verify-sidecar-smoke.mjs`: arranca el sidecar real sin `--allow-aeat` y comprueba handshake, HMAC, bloqueo y cierre.
- `tools/homolog-verifactu.mjs`: envio manual a la AEAT de pruebas con certificado real; fuera del gate.
- `tools/verify-secret-scan.mjs`: escaneo local de secretos con evidencias redacted; no imprime valores.
- `tools/verify-tauri-desktop-e2e.mjs`: evidencia desktop Tauri; preflight por defecto y modo WebDriver real para el gate (Windows y Linux), que termina con un preflight del sidecar.


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
- Incluye envio VERI*FACTU en tres pasos: Exportar XML (o anulacion) -> Preflight envio -> Enviar, con referencia `vault://certs/<id>` y entorno elegido en Ajustes.
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
- No es payload fiscal listo para produccion hasta completar la homologacion con la AEAT de pruebas y el asistente juridico de causa rectificativa por caso.
- Verificacion ejecutable: `services::fiscal_chain` recalcula huellas `Alta`/`Anulacion` y valida cadena persistida.
- Envio: `services::verifactu_submit` registra la exportacion (SHA-256), comprueba que el fichero no cambia y habla con el sidecar por `127.0.0.1` con HMAC.
- Sidecar: `sidecar/src/soap.rs` envuelve el documento `RegFactuSistemaFacturacion` sin modificarlo en SOAP 1.1 (`soapAction=""`) y `sidecar/src/aeat_client.rs` lo envia por TLS mutuo con el PKCS#12 del vault a los puertos `SistemaVerifactu*` del WSDL.
- La respuesta `RespuestaRegFactuSistemaFacturacion` se reduce a estado, CSV, `EstadoEnvio`, `EstadoRegistro`, error y `TiempoEsperaEnvio`, y se guarda en `verifactu_submissions`.

## Gate regulatorio

- Comando canonico: `npm run validate:regulatory`.
- Ejecuta `cargo fmt --check` y `cargo test --workspace`, compila el sidecar y pasa `npm run validate:sidecar-smoke`, y despues `npm run build`, `npm run validate:ui-contract`, `npm run validate:core-e2e`, `npm run validate:browser-smoke`, `npm run validate:secret-scan`, `npm run validate:evidence-matrix`, `npm run validate:verifactu:xsd`, `npm run tauri:build`, `npm run validate:tauri-desktop-e2e`, `npm run validate:external-acceptance`, `npm run validate:external-readiness` y `npm run validate:evidence-ledger`.
- `validate:tauri-desktop-e2e` comprueba prerequisitos/release en modo preflight; el gate lo ejecuta en modo WebDriver real con `CUMPLEFACTURA_TAURI_DESKTOP_E2E_REAL=1`.
- Evidencia actual: `tests/regulatory/evidence/latest-regulatory-gate.json`, `latest-sidecar-smoke.json/md`, `latest-secret-scan.json/md`, `latest-tauri-desktop-e2e.json/md`, `latest-evidence-ledger.json/md`, `latest-external-acceptance-evidence.json/md`, `latest-external-readiness.json/md` y artefactos core/browser smoke.
- Matriz de trazabilidad: `REGULATORY_EVIDENCE_MATRIX.md`.

## Fuentes regulatorias locales

- `C:\03 LEGISLACION\docs\estudios\ESTUDIO_VERIFACTU_RRSIF_CUMPLEFACTURA_2026-05-28.md`
- `C:\03 LEGISLACION\AEAT\MATRIZ_TECNICA_CUMPLEFACTURA_2026-05-27.md`
- `C:\03 LEGISLACION\AEAT\FACTURACION Y SIF\05 DOCUMENTACION TECNICA AEAT\01 VERIFACTU\Detalle especificaciones huella hash registros facturacion - AEAT.pdf`
- `C:\03 LEGISLACION\FORAL\05 NAVARRA HTN\MAPA_PRESENTACION_HTN.md`
- `C:\03 LEGISLACION\docs\estudios\MATRIZ_AI_ACT_APPS_2026-05-28.md`

No usar este scaffold como garantia de cumplimiento. Es base tecnica para implementar y probar.
