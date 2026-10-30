# CumpleFactura regulatory gate

- Generated: 2026-10-28T12:50:17.8852186+02:00
- Status: failed
- App: `C:\Users\bilel\Desktop\BDR\cumplefactura`
- Source workspace: `C:\03 LEGISLACION`

## Steps

| Step | Status | Seconds | Log |
|---|---:|---:|---|
| `cargo_fmt_check` | passed | 0.258 | `C:\Users\bilel\Desktop\BDR\cumplefactura\tests\regulatory\evidence\20261028-124731-cargo_fmt_check.log` |
| `cargo_test` | passed | 27.683 | `C:\Users\bilel\Desktop\BDR\cumplefactura\tests\regulatory\evidence\20261028-124731-cargo_test.log` |
| `npm_build` | passed | 5.104 | `C:\Users\bilel\Desktop\BDR\cumplefactura\tests\regulatory\evidence\20261028-124731-npm_build.log` |
| `ui_contract` | passed | 1.104 | `C:\Users\bilel\Desktop\BDR\cumplefactura\tests\regulatory\evidence\20261028-124731-ui_contract.log` |
| `core_e2e` | passed | 1.914 | `C:\Users\bilel\Desktop\BDR\cumplefactura\tests\regulatory\evidence\20261028-124731-core_e2e.log` |
| `browser_smoke` | failed | 2.503 | `C:\Users\bilel\Desktop\BDR\cumplefactura\tests\regulatory\evidence\20261028-124731-browser_smoke.log` |
| `secret_scan` | passed | 0.811 | `C:\Users\bilel\Desktop\BDR\cumplefactura\tests\regulatory\evidence\20261028-124731-secret_scan.log` |
| `external_acceptance` | passed | 0.524 | `C:\Users\bilel\Desktop\BDR\cumplefactura\tests\regulatory\evidence\20261028-124731-external_acceptance.log` |
| `contapro_sidecar_import` | failed | 0.491 | `C:\Users\bilel\Desktop\BDR\cumplefactura\tests\regulatory\evidence\20261028-124731-contapro_sidecar_import.log` |
| `evidence_matrix` | failed | 0.418 | `C:\Users\bilel\Desktop\BDR\cumplefactura\tests\regulatory\evidence\20261028-124731-evidence_matrix.log` |
| `verifactu_xsd_fixture` | passed | 0.63 | `C:\Users\bilel\Desktop\BDR\cumplefactura\tests\regulatory\evidence\20261028-124731-verifactu_xsd_fixture.log` |
| `tauri_build` | passed | 117.032 | `C:\Users\bilel\Desktop\BDR\cumplefactura\tests\regulatory\evidence\20261028-124731-tauri_build.log` |
| `tauri_desktop_e2e` | failed | 6.516 | `C:\Users\bilel\Desktop\BDR\cumplefactura\tests\regulatory\evidence\20261028-124731-tauri_desktop_e2e.log` |
| `external_readiness` | passed | 0.665 | `C:\Users\bilel\Desktop\BDR\cumplefactura\tests\regulatory\evidence\20261028-124731-external_readiness.log` |
| `evidence_ledger` | failed | 0.391 | `C:\Users\bilel\Desktop\BDR\cumplefactura\tests\regulatory\evidence\20261028-124731-evidence_ledger.log` |

## Live limits

- XAdES signature generation is available only through local sidecar /verifactu/sign-xml with HMAC, explicit CumpleFactura flag and sidecar real-XAdES mode.
- Gate validates the CumpleFactura HTTP boundary with a local fake sidecar; certificate-backed real XAdES remains covered by the sidecar gate and runtime preflight.
- No AEAT network transmission is performed by the gate.
- XAdES sidecar preflight checks exact XML hash, local /verifactu/sign-xml endpoint, vault ref and runtime flag before signing.
- AEAT transport preflight checks WSDL endpoint allowlist, XML hash, XAdES status and runtime flag only.
- VERI*FACTU submit sidecar preflight checks local /verifactu/submit-preflight with HMAC, WSDL, vault and flags; it sends no raw XML and performs no SOAP call.
- VERI*FACTU invoke-submit boundary sends signed XML only to local /verifactu/invoke-submit; gate uses a fake sidecar and does not prove AEAT acceptance.
- Core E2E gate exercises real Rust domain/db/services with in-memory SQLite, XSD-valid XML, PDF and prepared export; it does not use certificates or external AEAT.
- Evidence matrix gate checks that each product promise has source, executable evidence and a live limit; it does not prove legal sufficiency.
- Evidence ledger hashes local normative sources, repo artifacts, generated evidence and gate logs; it is traceability evidence, not certification.
- Secret scan runs locally before ledger and records only redacted rule/path findings.
- External acceptance evidence intake validates a supplied redacted manifest and hashes referenced artifacts; by default it records not_provided.
- ContaPro sidecar import reads local redacted readiness evidence for VERI*FACTU, SII, FACe and TicketBAI without importing secrets or performing network calls.
- External readiness audit checks desktop E2E prerequisites and reports blockers for missing vault, certificate flags and acceptance evidence; blocked is safe and expected until supplied.
- Browser smoke gate uses a local Tauri invoke mock; it proves rendered workflow and visible limits, not Rust command execution or AEAT acceptance.
- Tauri desktop E2E verifier records preflight mode by default; the regulatory gate enables real WebDriver mode with CUMPLEFACTURA_TAURI_DESKTOP_E2E_REAL=1.
- R1-R5/I-S assistant maps declared scenarios only; it is not legal advice.