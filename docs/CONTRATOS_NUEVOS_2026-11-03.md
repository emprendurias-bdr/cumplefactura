# Contratos nuevos (F3 y F4) — 2026-11-03

Contrato común entre backend (Rust/Tauri) e interfaz para el trabajo de F3 (cierre fiscal) y F4 (documentos comerciales y recurrentes). Se escribe antes del código para que las dos partes se hagan en paralelo. Al terminar, `MODULE_CONTRACT.md` incorpora estas filas.

Reglas: comandos y campos en `snake_case`; importes en céntimos (`*_cents`); fechas ISO `AAAA-MM-DD`; errores como `String` con un código estable al principio (`codigo` o `codigo:detalle`), que la interfaz traduce en `src/i18n/es.ts`.

## F3 — Cierre fiscal

### Contraseña del certificado (ADR-002)

- `AppSettings` / `AppSettingsInput` ganan `certificate_password_mode: "session" | "keychain" | "env"`, por defecto `"session"`. `"keychain"` se acepta y se guarda, pero mientras no se apruebe la librería del llavero el backend lo trata como `"session"` y la interfaz muestra la opción deshabilitada con el motivo «Pendiente de aprobar».
- `SubmitInput` (preflight y envío) gana `certificate_password: string | null`. En modo `session` la interfaz la guarda solo en memoria (estado de React, nunca `localStorage`) y la manda en cada llamada. En modo `env` va `null` y el sidecar usa la variable de entorno como hoy.
- Contrato del sidecar (`crates/fiscal-contract`): `SubmitPreflightRequest` e `InvokeSubmitRequest` ganan `certificate_password: Option<String>` (`#[serde(default)]`). Si llega, `vault::load_with` la usa antes que las variables de entorno. Nunca se registra ni se devuelve.
- Error nuevo de preflight/envío: `certificate_password_required` (ya existe en el sidecar) → la interfaz pide la contraseña.

### Caducidad del certificado

- `SubmitPreflightResponse` gana `certificate_expires_at: Option<String>` (ISO) y `certificate_expires_in_days: Option<i64>`, leídos del `notAfter` del certificado con un parseo DER mínimo, sin librería. Si no se pueden leer, `null`.
- Aviso (no bloqueo): `warnings` incluye `certificate_expires_soon` si quedan ≤ 30 días y `certificate_expired` si ya caducó (este sí va también en `blockers`).

### Respuestas AEAT, espera y reintento manual

- Se guardan **todas** las respuestas en `verifactu_submissions`, también `transport_error` (antes no se guardaba). El índice único sigue siendo solo para `accepted` y `accepted_with_errors`.
- Comando nuevo `verifactu_submission_list(invoice_id: Option<String>) -> Vec<VerifactuSubmissionSummary>` ordenado por fecha descendente. Campos: `id, invoice_id, fiscal_export_id, endpoint_name, xml_sha256, status, csv, estado_envio, estado_registro, codigo_error, descripcion_error, tiempo_espera_envio_seconds, submitted_at`.
- `verifactu_submit` rechaza con `aeat_wait_time_pending:<segundos>` si la última respuesta de la AEAT pidió esperar y no ha pasado el tiempo; con `xml_already_accepted_by_aeat` si ya está aceptado. Un `transport_error` previo permite reintentar (decisión manual: no hay reintentos automáticos).
- Estado en la interfaz: `transport_error` = «Sin confirmar»; `accepted` = «Aceptada»; `accepted_with_errors` = «Aceptada con errores»; `rejected` = «Rechazada».

### Restaurar copia de seguridad

- `backup_restore(source_path, confirm: bool)`. Con `confirm = false`, igual que hoy (solo valida). Con `confirm = true`: valida, hace una copia de seguridad previa de la base actual, sustituye la base, la reabre, ejecuta las migraciones y verifica la cadena fiscal. Si algo falla, vuelve a la copia previa.
- `BackupRestoreResult` gana `safety_backup_path: Option<String>` y `chain_ok: Option<bool>`; `status` = `validated-only` · `restored` · `rolled_back`.

### QR tributario

- `invoice_export_pdf` añade el QR VERI\*FACTU (y la leyenda «Factura verificable en la sede electrónica de la AEAT») a las facturas emitidas; los borradores no llevan QR. Rescatado de `claude/cf-funcionalidades-estrella` (`services/qr.rs`), con `qrcode` sin features (sin imágenes): única dependencia nueva, pendiente del OK de Bilel y Dabiz (design.md §0.2).
- `AppSettings` gana `qr_environment: "test" | "production"`, por defecto `"test"`.

## F4 — Documentos comerciales y recurrentes

Contratos de `docs/ESPEC_DOCUMENTOS_Y_RECURRENTES.md` §4, con estas precisiones de forma:

- `CommercialDocument`: campos de §3.1 + `lines: CommercialDocumentLine[]` + `display_number: string | null` (`P-2026-0014`).
- `CommercialDocumentLine`: mismos campos que la línea de factura que hoy envía la interfaz (`description, quantity_milli, unit_price_cents, discount_basis_points, vat_rate_basis_points, irpf_rate_basis_points, product_id`, con los nombres exactos que use `invoice_draft_create`) + `position`.
- `commercial_document_list` devuelve `{ items: CommercialDocumentSummary[], total: number }`; el resumen no lleva líneas.
- `commercial_document_to_invoice_draft(ids: string[])` devuelve el `Invoice` del borrador creado, con la misma forma que `invoice_draft_create`.
- `RecurringInvoice`: campos de §3.5 + `template: { lines, notes }` (en vez de `template_json` crudo) + `last_period_key: string | null`.
- `recurring_generate_due(today: Option<String>) -> { created: string[], skipped: string[] }` (ids de borradores creados y `period_key` ya generados).
- `recurring_preview(id, count) -> { period_key, run_date, total_cents }[]`.
