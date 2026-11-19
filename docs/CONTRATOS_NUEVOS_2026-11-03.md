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
- `CommercialDocumentLine`: los mismos campos que `InvoiceLineInput` (`description, quantity, unit_price_cents, discount_rate_basis_points, tax_rate_basis_points, withholding_rate_basis_points`) + `position`. La conversión a factura copia esos campos tal cual.
- `commercial_document_list` devuelve `{ items: CommercialDocumentSummary[], total: number }`; el resumen no lleva líneas.
- `commercial_document_to_invoice_draft(ids: string[])` devuelve el `Invoice` del borrador creado, con la misma forma que `invoice_draft_create`.
- `RecurringInvoice`: campos de §3.5 + `template: { lines, notes }` (en vez de `template_json` crudo) + `last_period_key: string | null`.
- `recurring_generate_due(today: Option<String>) -> { created: string[], skipped: string[] }` (ids de borradores creados y `period_key` ya generados).
- `recurring_preview(id, count) -> { period_key, run_date, total_cents }[]`.

## R2 (03-11) — Backend de D1, D2, D3, D5, D6, D7 y D8 (+ ficha de factura y motivo de anulación)

Migración `012_r2_documentos_cobros_logo.sql` (aditiva): `invoices.notes TEXT NOT NULL DEFAULT ''`, `invoices.is_recapitulative INTEGER NOT NULL DEFAULT 0`, `invoices.void_reason TEXT`, `invoices.due_date TEXT`, `invoice_lines.price_pending INTEGER NOT NULL DEFAULT 0`, `companies.logo_path TEXT`, `commercial_documents.number_padding INTEGER`, tablas `invoice_payments` y `commercial_series_configs`.

Nada de esto entra en la huella ni en el XML. Única excepción: `is_recapitulative = true` quita `sf:FechaOperacion` (D5, **pendiente** de confirmar con la AEAT). Las facturas normales salen byte a byte igual que antes (test contra `src-tauri/src/services/testdata/*.xml`).

### Formas JSON

```ts
// Líneas (entrada): InvoiceLineInput gana un campo opcional.
type InvoiceLineInput = {
  description: string; quantity: number; unit_price_cents: number;
  discount_rate_basis_points: number | null; tax_rate_basis_points: number;
  withholding_rate_basis_points: number | null;
  price_pending?: boolean | null;   // omitido/null en invoice_draft_update = conserva la marca de esa posición
};
// Una línea con precio > 0 nunca queda pendiente (la marca se borra sola).

type InvoiceDraftInput = { /* campos de siempre */ notes?: string };   // por defecto ""

type InvoiceLine = {
  id: string; description: string; quantity: number; unit_price_cents: number;
  discount_rate_basis_points: number; taxable_base_cents: number;
  tax_rate_basis_points: number; tax_cents: number;
  withholding_rate_basis_points: number; withholding_cents: number;
  price_pending: boolean;
};

type Invoice = {   // invoice_draft_create, invoice_draft_update, commercial_document_to_invoice_draft, IssuedInvoice.invoice
  id: string; company_id: string; customer_id: string; fiscal_year: number; series: string;
  number: number | null; kind: "Complete" | "Simplified" | "Rectifying";
  status: "Draft" | "Issued" | "Void" | "Rectified"; territory_flags: string[];
  rectifies_invoice_id: string | null; rectification_reason_code: "R1"|"R2"|"R3"|"R4"|"R5" | null;
  rectification_method: "I" | "S" | null; lines: InvoiceLine[];
  totals: { taxable_base_cents: number; tax_cents: number; withholding_cents: number; total_cents: number };
  created_at: string; issued_at: string | null;
  notes: string;
};

type InvoiceDetail = Invoice & {   // invoice_get
  is_recapitulative: boolean;
  due_date: string | null;          // AAAA-MM-DD
  paid_cents: number;
  payment_status: "unpaid" | "partial" | "paid" | "overdue";
  recurring_label: string | null;   // «Recurrente · <recurring_label> · <recurring_period_key>»
  recurring_period_key: string | null;  // "2026-11", "2026-T4", "2026"
  void_reason: string | null;
};

type InvoiceSummary = { /* campos de siempre */
  due_date: string | null; paid_cents: number;
  payment_status: "unpaid" | "partial" | "paid" | "overdue";
  recurring_label: string | null; recurring_period_key: string | null;
};

type PaymentInput = {              // exactamente uno de invoice_id / commercial_document_id
  invoice_id?: string | null; commercial_document_id?: string | null;
  amount_cents: number;            // > 0
  paid_at: string;                 // AAAA-MM-DD
  method: "transferencia" | "tarjeta" | "efectivo" | "domiciliacion" | "bizum" | "otros";
  reference?: string | null;
};
type Payment = {
  id: string; invoice_id: string | null; commercial_document_id: string | null;
  amount_cents: number; paid_at: string; method: string; reference: string | null; created_at: string;
};

type CommercialSeriesConfigInput = {
  company_id: string; kind: "quote" | "proforma" | "delivery_note";
  series_code: string;             // se recorta y pasa a mayúsculas; A-Z0-9, 1-10
  padding?: number | null;         // 1-10, por defecto 4
};
type CommercialSeriesConfig = {
  company_id: string; kind: string; series_code: string; padding: number;
  configured: boolean;             // false = valores por defecto P / PF / AL, 4 cifras
  preview: string;                 // "P-2026-0015": siguiente número del año en curso
};

type CompanySummary = { /* campos de siempre */ logo_path: string | null };
```

`payment_status`: `paid` si no queda nada pendiente (total − cobrado ≤ 0); `overdue` si queda algo y `due_date` es anterior a hoy (sin vencimiento no hay mora); `partial` si hay algún cobro; si no, `unpaid`.

### Comandos

| Comando | Argumentos (`invoke`) | Devuelve | Errores |
|---|---|---|---|
| `invoice_get` | `{ invoiceId }` | `InvoiceDetail` | `not_found` |
| `invoice_draft_update` | `{ id, input: InvoiceDraftInput }` | `Invoice` | `not_found`, `not_draft`, `validation_error:company_id`, `payments_exceed_total`, errores de validación de líneas |
| `invoice_issue` | igual que antes | `IssuedInvoice` | + `price_pending_lines:<n>`, `payments_exceed_total` |
| `invoice_list` | igual que antes | `InvoiceSummary[]` (campos nuevos) | — |
| `payment_register` | `{ input: PaymentInput }` | `Payment` | `validation_error:target`, `validation_error:amount_cents`, `validation_error:method`, `validation_error:paid_at`, `not_found`, `invoice_not_issued`, `payment_not_allowed`, `payment_exceeds_total:<pendiente_cents>` |
| `payment_list` | `{ invoiceId? , commercialDocumentId? }` (uno) | `Payment[]` por `paid_at` | `validation_error:target` |
| `payment_delete` | `{ id }` | `null` | `not_found`, `payment_required` |
| `invoice_due_date_set` | `{ invoiceId, dueDate: string \| null }` | `null` | `validation_error:due_date`, `not_found` |
| `commercial_series_list` | `{ companyId }` | `CommercialSeriesConfig[]` (quote, proforma, delivery_note) | `company not found: <id>` |
| `commercial_series_configure` | `{ input: CommercialSeriesConfigInput }` | `CommercialSeriesConfig` | `validation_error:kind`, `validation_error:company_id`, `validation_error:series_code`, `validation_error:padding` |
| `commercial_document_set_status` | igual que antes | `CommercialDocument` | + `payment_required` (proforma a `paid` sin cobros) |
| `company_logo_set` | `{ companyId, sourcePath }` | `string` (ruta de la copia) | `logo_format_not_supported:<motivo>. Usa un JPEG o un PNG sin transparencia (RGB o gris, 8 bits)`, `logo_too_large:1MB`, `logo_read_error:<detalle>`, `logo_write_error:<detalle>` |
| `company_logo_clear` | `{ companyId }` | `null` | `company not found: <id>` |
| `verifactu_xml_anulacion_draft_export` | `{ invoiceId, targetPath, reason }` | `VerifactuXmlResult` | + `reason_required` (motivo vacío) |

### Reglas

- **D1 PDF.** Misma plantilla para facturas y documentos comerciales: logo (si hay), emisor y cliente con dirección, tabla (Descripción, Cant., Precio, Dto., IVA, IRPF, Importe) con saltos de página y cabecera repetida, totales con IVA e IRPF por tipo, «Observaciones», pie con «Página n de N». Emitidas: QR + leyenda arriba a la derecha y huella en el pie. Borradores: sin QR. Comerciales: «Documento sin valor fiscal»; albarán sin precios = solo Descripción y Cantidad, sin totales. Muestras en `docs/ux/pdf/`.
- **D2 Observaciones.** `notes` viaja en `InvoiceDraftInput`; la conversión copia las del presupuesto/proforma tal cual y, en albaranes, una por albarán: `"Albarán AL-2026-0001: <notas>"` separadas por `\n`. Las recurrentes copian `template.notes`. Al emitir se guardan las `notes` que envía la interfaz en `input.draft`.
- **D3 Origen recurrente.** `recurring_label`/`recurring_period_key` en lista y ficha, también después de emitir.
- **D5 Recapitulativa.** Solo con **varios** albaranes (`is_recapitulative`); un albarán solo o un presupuesto siguen con `FechaOperacion`. La marca la pone Rust y pasa a la emitida; la interfaz no la envía.
- **D6 Cobros.** Directos solo sobre facturas `Issued`/`Rectified` o proformas `sent`/`paid`. Regla elegida: una proforma solo pasa a `paid` si tiene al menos un cobro, y no se puede borrar el último cobro de una proforma `paid`. Al convertir la proforma, sus cobros pasan al borrador; al emitir, a la factura emitida (misma transacción).
- **D7 Series.** `save_draft`/`derive` usan la serie configurada si la entrada no trae `series_code`. El número y su relleno se fijan al numerar: cambiar código o relleno no renumera ni reformatea lo ya numerado (`display_number` usa el relleno guardado; los anteriores a R2, 4 cifras).
- **D8 Pendiente de precio.** Las líneas de un albarán con `show_prices = false` llegan con `price_pending = true` (la línea de texto «Albarán AL-… · fecha» no). La emisión se bloquea con `price_pending_lines:<n>` contando las que siguen a 0 €. Editor: abrir con `invoice_get`, guardar con `invoice_draft_update` (enviar `price_pending` tal cual o omitirlo; al poner precio desaparece).
- **Anulación.** `reason` se guarda en `invoices.void_reason` y en un evento `invoice_void_reason` (hash del JSON `{"reason": …}`) encadenado justo detrás de `invoice_voided`; ni el XML ni la huella de anulación cambian.
