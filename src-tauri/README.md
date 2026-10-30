# `src-tauri/` — Backend Tauri

Runtime Rust: IPC, SQLite, servicios fiscales locales y frontera sidecar.

## Estructura

| Ruta | Rol |
|---|---|
| `src/` | Código Rust (`lib`, commands, domain, db, services) |
| `capabilities/` | ACL editable (`default.json`) |
| `gen/` | Schemas ACL **generados** (no editar) |
| `resources/xsd/` | XSD VERI\*FACTU / XMLDSig empaquetados |
| `tauri.conf.json` | Config app + bundle resources |
| `Cargo.toml` / `build.rs` | Crate + `tauri_build` |

## Principio

Fail-closed hacia AEAT: sin flags/HMAC/vault no hay firma ni submit real. Numeración y huellas se resuelven en Rust, no en la UI.
