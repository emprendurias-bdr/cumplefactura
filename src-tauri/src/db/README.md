# `db/` — Persistencia SQLite

| Pieza | Rol |
|---|---|
| `mod.rs` | `AppState`, migraciones y reexportación de los módulos |
| `settings.rs`, `companies.rs`, `customers.rs`, `products.rs` | Ajustes, emisores, series y logo, clientes, catálogo |
| `invoices.rs` | Borradores (alta y edición), emisión con numeración reservada, listados, ficha, datos para PDF/XML |
| `payments.rs` | Cobros de factura o proforma (`invoice_payments`) y vencimiento; nunca toca tablas fiscales |
| `fiscal.rs` | Registros fiscales, auditoría, exportaciones y respuestas AEAT (`verifactu_submissions`) |
| `backup.rs` | Restaurar copia: validar, copia previa, sustituir, migrar, verificar cadena; vuelta atrás si falla |
| `tests.rs` | Tests con SQLite en memoria (`db::test_conn()`) |
| `migrations/*.sql` | Esquema versionado (series, descuentos, fiscal…) |

`init_app_state` abre la BD en el data dir de Tauri y aplica migraciones.

No editar el esquema solo en SQL sin migración numerada. Huellas fiscales se escriben al emitir; la verificación está en `services/fiscal_chain`.
