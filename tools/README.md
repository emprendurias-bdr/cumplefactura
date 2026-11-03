# `tools/` — Gates y validadores

Scripts invocados por `package.json` y por `npm run validate:regulatory` (Windows/PowerShell).
La salida va a `tests/regulatory/evidence/`. Ningún script guarda secretos.

| Script | Rol | En el gate |
|---|---|---|
| `lib.mjs` | Utilidades comunes: rutas, hashes, JSON, tabla de la matriz, búsqueda de ejecutables, escritura de evidencia | — |
| `run-regulatory-gate.ps1` | Orquesta el gate completo | — |
| `validate-verifactu-xsd.ps1` | XML ↔ XSD local (.NET, necesita PowerShell) | sí |
| `verify-core-e2e.ps1` | E2E de dominio Rust con SQLite real | sí |
| `verify-ui-contract.mjs` | `invoke()` de la UI ↔ comandos registrados en `lib.rs`, etiquetas, guardas y límites visibles | sí |
| `verify-browser-smoke.mjs` | Recorrido completo en Chromium con Tauri simulado (`CUMPLEFACTURA_CHROMIUM_PATH` opcional) | sí |
| `verify-sidecar-smoke.mjs` | Arranca el sidecar real: handshake, HMAC, bloqueo sin `--allow-aeat`, salida al cerrar stdin | sí |
| `verify-secret-scan.mjs` | Escaneo de secretos | sí |
| `verify-tauri-desktop-e2e.mjs` | E2E de escritorio (preflight por defecto, real con `CUMPLEFACTURA_TAURI_DESKTOP_E2E_REAL=1`; Windows y Linux) | sí |
| `verify-regulatory-evidence.mjs` | Matriz de evidencias | sí |
| `verify-external-acceptance-evidence.mjs` | Manifiesto redactado de aceptación externa | sí |
| `verify-external-readiness.mjs` | Qué falta para enviar de verdad (suele dar `blocked`) | sí |
| `verify-evidence-ledger.mjs` | Hashea fuentes, artefactos, evidencias y logs | sí |
| `build-sidecar.mjs` | Copia el sidecar a `src-tauri/binaries/` para el instalador (`npm run tauri:bundle`) | no |
| `homolog-verifactu.mjs` | Envío manual a la AEAT de **pruebas** con certificado real (`--enviar`) | no |
