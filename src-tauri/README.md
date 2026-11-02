# `src-tauri/` — Backend Tauri

Runtime Rust: IPC, SQLite, servicios fiscales locales y cliente del sidecar (`../sidecar/`).

## Estructura

| Ruta | Rol |
|---|---|
| `src/` | Código Rust (`lib`, commands, domain, db, services) |
| `capabilities/` | ACL editable (`default.json`) |
| `gen/` | Schemas ACL **generados** (no editar) |
| `resources/xsd/` | XSD VERI\*FACTU / XMLDSig empaquetados |
| `tauri.conf.json` | Config app + bundle resources |
| `tauri.bundle.conf.json` | Añade el sidecar (`externalBin`) al generar instalador (`npm run tauri:bundle`) |
| `binaries/` | Sidecar copiado por `tools/build-sidecar.mjs` (**generado**, ignorado por git) |
| `Cargo.toml` / `build.rs` | Crate + `tauri_build` |

## Principio

Fail-closed hacia AEAT: la app nunca sale a internet; el sidecar solo envía con `CUMPLEFACTURA_SIDECAR_ALLOW_AEAT=1` y un certificado del vault. Numeración y huellas se resuelven en Rust, no en la UI.
