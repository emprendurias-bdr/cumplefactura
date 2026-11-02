# `src-tauri/src/` — Crate principal

## Módulos

| Módulo | Rol |
|---|---|
| `lib.rs` | `run()`: setup DB, dialog plugin, gestor del sidecar, `invoke_handler` y cierre del sidecar al salir |
| `main.rs` | Entry bin → `cumplefactura_lib::run()` |
| `commands/` | Capa IPC Tauri (entrada UI) |
| `domain/` | Tipos y reglas de negocio puras |
| `db/` | SQLite, migraciones, queries |
| `services/` | PDF/export/XML/cadena/envío por el sidecar |
| `core_e2e.rs` | Helpers de test E2E (cfg test) |

Flujo típico: **command → domain/db → service → respuesta IPC**.
