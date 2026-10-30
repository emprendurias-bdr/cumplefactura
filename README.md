# CumpleFactura

App desktop **local-first** (Tauri 2 + React + SQLite) para facturación y evidencia VERI\*FACTU pre-MVP.

## Arquitectura

```
src/ (UI React) --invoke--> src-tauri (Rust)
  commands → domain + db + services
services → PDF/JSON/CSV/XML local | sidecar loopback HMAC (fail-closed)
tools/ → gates regulatory → tests/regulatory/evidence/
```

## Arranque

- UI: `npm run tauri:dev`
- Build: `npm run tauri:build`
- Gates: `npm run validate:regulatory` (PowerShell)

## Carpetas

| Ruta | Rol |
|---|---|
| `src/` | UI React: `App.tsx` (estado y navegacion) + `sections/` por pantalla |
| `src-tauri/` | Backend Tauri/Rust |
| `tools/` | Validadores / gate |
| `tests/regulatory/` | Specs + fixtures + evidencia |
| `dist/` | Bundle Vite (**generado**) |
| `docs/` | Plan MVP, UX/UI, maquetas y `revisar/` (documentos pendientes de decidir) |

No editar a mano: `dist/`, `src-tauri/gen/`, `tests/regulatory/evidence/*` regenerados, XSD AEAT en `resources/xsd/verifactu/`.
