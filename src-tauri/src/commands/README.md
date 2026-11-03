# `commands/` — IPC Tauri

Handlers `#[tauri::command]` registrados en `lib.rs`. Traducen input UI → domain/db/services.

| Archivo | Comandos (resumen) |
|---|---|
| `app.rs` | `app_defaults_get` (carpetas de datos y exportación) |
| `settings.rs` | onboarding / flags / carpeta export / entorno VERI\*FACTU / modo de contraseña del certificado |
| `company.rs` | CRUD empresa + series + logo (`company_logo_set`, `company_logo_clear`) |
| `customers.rs` | upsert/list clientes |
| `products.rs` | upsert/list catálogo |
| `invoices.rs` | draft (alta y `invoice_draft_update`), `invoice_get`, issue, preview nº, list, PDF |
| `payments.rs` | `payment_register`, `payment_list`, `payment_delete`, `invoice_due_date_set` |
| `commercial_documents.rs`, `recurring.rs` | Presupuestos, proformas, albaranes, series de documentos (`commercial_series_*`) y recurrentes |
| `fiscal.rs` | backup, exports, XML, cadena, `verifactu_submit_preflight`, `verifactu_submit` y `verifactu_submission_list` |

Sin lógica fiscal pesada aquí: delegan en `services` y `db`. `AppState::lock()` y `domain::require()` evitan repetir el bloqueo de la base de datos y las comprobaciones de campos.
