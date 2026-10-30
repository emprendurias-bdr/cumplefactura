# `commands/` — IPC Tauri

Handlers `#[tauri::command]` registrados en `lib.rs`. Traducen input UI → domain/db/services.

| Archivo | Comandos (resumen) |
|---|---|
| `app.rs` | `app_defaults_get` (paths seguros) |
| `settings.rs` | onboarding / flags / carpeta export |
| `company.rs` | CRUD empresa + series |
| `customers.rs` | upsert/list clientes |
| `products.rs` | upsert/list catálogo |
| `invoices.rs` | draft, issue, preview nº, list, PDF |
| `fiscal.rs` | backup, exports, XML, cadena, sidecars |

Sin lógica fiscal pesada aquí: delegan en `services` y `db`.
