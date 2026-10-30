# `tools/` — Gates y validadores

Scripts invocados por `package.json` / `validate:regulatory`.

| Script | Rol |
|---|---|
| `run-regulatory-gate.ps1` | Orquesta el gate completo |
| `validate-verifactu-xsd.ps1` | XML ↔ XSD local (.NET) |
| `verify-ui-contract.mjs` | Contrato UI / invoke |
| `verify-browser-smoke.mjs` | Smoke Playwright mock |
| `verify-core-e2e.ps1` | E2E core Rust |
| `verify-secret-scan.mjs` | Escaneo secretos |
| `verify-tauri-desktop-e2e.mjs` | Desktop E2E (preflight por defecto) |
| `verify-*-evidence*.mjs` / `verify-evidence-ledger.mjs` | Matriz / ledger evidencia |
| `verify-external-*.mjs` | Readiness / acceptance externos |
| `import-contapro-sidecar-evidence.mjs` | Import evidencia ContaPro |

Salida típica → `tests/regulatory/evidence/`. No hardcodear secretos.
