# `domain/` — Modelo de negocio

Tipos serializables y helpers puros (sin SQLite ni Tauri).

| Archivo | Contenido |
|---|---|
| `company.rs` | Empresa, series, `resolve_series` / nº factura |
| `customer.rs` | Cliente + `CustomerKind` |
| `product.rs` | Producto/servicio catálogo |
| `invoice.rs` | Draft/issue, líneas, totales, rectificativas |
| `settings.rs` | `AppSettings` + flags por defecto |
| `tax.rs` | Régimen / territory flags |

Usado por `commands`, `db` y `services`.
