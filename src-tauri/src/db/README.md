# `db/` — Persistencia SQLite

| Pieza | Rol |
|---|---|
| `mod.rs` | `AppState`, migraciones, CRUD, listados paginados |
| `migrations/*.sql` | Esquema versionado (series, descuentos, fiscal…) |

`init_app_state` abre la BD en el data dir de Tauri y aplica migraciones.

No editar el esquema solo en SQL sin migración numerada. Huellas fiscales se escriben al emitir; la verificación está en `services/fiscal_chain`.
