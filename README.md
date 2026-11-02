# CumpleFactura

App de escritorio **local-first** (Tauri 2 + React + SQLite) para facturación y cumplimiento VERI\*FACTU. Estado: pre-MVP, pendiente de homologación.

## Arquitectura

```
src/ (UI React) ──invoke──> src-tauri/ (Rust: commands → domain + db + services)
                                  │  HTTP 127.0.0.1 + HMAC por sesión
                                  ▼
                         sidecar/ (cumplefactura-sidecar) ──TLS mutuo──> AEAT
crates/fiscal-contract/  contrato compartido app ↔ sidecar
tools/ → gate regulatorio → tests/regulatory/evidence/
```

- La app genera, numera, encadena y valida el XML. Nunca abre el certificado ni sale a internet.
- El sidecar es el único proceso que usa el certificado `vault://certs/<id>` y envía a la AEAT. Ver [`sidecar/ARQUITECTURA.md`](sidecar/ARQUITECTURA.md).
- En modo VERI\*FACTU los registros no se firman: basta la huella (RD 1007/2023, art. 16.3).

## Arranque

| Comando | Qué hace |
|---|---|
| `npm run tauri:dev` | Compila el sidecar y arranca la app en desarrollo |
| `npm run tauri:build` | Ejecutable release (app + sidecar en `target/release/`) |
| `npm run tauri:bundle` | Instalador con el sidecar incluido (`externalBin`) |
| `cargo test --workspace` | Tests de app, sidecar y contrato |
| `npm run validate:regulatory` | Gate completo (Windows, PowerShell) |

Variables de entorno del envío real (por defecto todo bloqueado):

| Variable | Efecto |
|---|---|
| `CUMPLEFACTURA_SIDECAR_ALLOW_AEAT=1` | La app arranca el sidecar con permiso para llamar a la AEAT |
| `CUMPLEFACTURA_CERT_VAULT_DIR` | Carpeta de certificados (por defecto `<datos de la app>/certs`) |
| `CUMPLEFACTURA_CERT_PASSWORD_<ID>` / `CUMPLEFACTURA_CERT_PASSWORD` | Contraseña del `.p12`/`.pfx` |

## Carpetas

| Ruta | Rol |
|---|---|
| `src/` | UI React: `useCumpleFactura.ts` (estado y llamadas) + `sections/` por pantalla |
| `src-tauri/` | Backend Tauri/Rust |
| `sidecar/` | Proceso que envía a la AEAT |
| `crates/fiscal-contract/` | Mensajes, HMAC, endpoints y lector HTTP comunes |
| `tools/` | Validadores y gate |
| `tests/regulatory/` | Specs, fixtures y evidencia |
| `docs/` | Plan MVP, UX/UI, maquetas y `revisar/` (documentos pendientes de decidir) |

No editar a mano: `dist/`, `target/`, `src-tauri/gen/`, `src-tauri/binaries/`, `tests/regulatory/evidence/*` ni los XSD AEAT de `src-tauri/resources/xsd/verifactu/`.
