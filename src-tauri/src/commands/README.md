# `commands/` — IPC Tauri

Handlers `#[tauri::command]` registrados en `lib.rs`. Traducen input UI → domain/db/services.

| Archivo | Comandos (resumen) |
|---|---|
| `app.rs` | `app_defaults_get` (carpetas de datos y exportación) |
| `settings.rs` | onboarding / flags / carpeta export / entorno VERI\*FACTU |
| `company.rs` | CRUD empresa + series |
| `customers.rs` | upsert/list clientes |
| `products.rs` | upsert/list catálogo |
| `invoices.rs` | draft, issue, preview nº, list, PDF |
| `fiscal.rs` | backup, exports, XML, cadena, `verifactu_submit_preflight` y `verifactu_submit` |

Sin lógica fiscal pesada aquí: delegan en `services` y `db`. `AppState::lock()` y `domain::require()` evitan repetir el bloqueo de la base de datos y las comprobaciones de campos.
