# CumpleFactura regulatory gate

- Generated: 2026-06-28T21:23:26.6115755+02:00
- Status: passed
- App: `C:\07 DESARROLLO\apps\CumpleFactura`
- Source workspace: `C:\03 LEGISLACION`

## Steps

| Step | Status | Seconds | Log |
|---|---:|---:|---|
| `cargo_fmt_check` | passed | 1.672 | `C:\07 DESARROLLO\apps\CumpleFactura\tests\regulatory\evidence\20260628-212017-cargo_fmt_check.log` |
| `cargo_test` | passed | 18.234 | `C:\07 DESARROLLO\apps\CumpleFactura\tests\regulatory\evidence\20260628-212017-cargo_test.log` |
| `npm_build` | passed | 11.604 | `C:\07 DESARROLLO\apps\CumpleFactura\tests\regulatory\evidence\20260628-212017-npm_build.log` |
| `ui_contract` | passed | 3.945 | `C:\07 DESARROLLO\apps\CumpleFactura\tests\regulatory\evidence\20260628-212017-ui_contract.log` |
| `core_e2e` | passed | 6.679 | `C:\07 DESARROLLO\apps\CumpleFactura\tests\regulatory\evidence\20260628-212017-core_e2e.log` |
| `browser_smoke` | passed | 18.709 | `C:\07 DESARROLLO\apps\CumpleFactura\tests\regulatory\evidence\20260628-212017-browser_smoke.log` |
| `secret_scan` | passed | 4.065 | `C:\07 DESARROLLO\apps\CumpleFactura\tests\regulatory\evidence\20260628-212017-secret_scan.log` |
| `external_acceptance` | passed | 3.654 | `C:\07 DESARROLLO\apps\CumpleFactura\tests\regulatory\evidence\20260628-212017-external_acceptance.log` |
| `contapro_sidecar_import` | passed | 4.163 | `C:\07 DESARROLLO\apps\CumpleFactura\tests\regulatory\evidence\20260628-212017-contapro_sidecar_import.log` |
| `evidence_matrix` | passed | 3.544 | `C:\07 DESARROLLO\apps\CumpleFactura\tests\regulatory\evidence\20260628-212017-evidence_matrix.log` |
| `verifactu_xsd_fixture` | passed | 3.27 | `C:\07 DESARROLLO\apps\CumpleFactura\tests\regulatory\evidence\20260628-212017-verifactu_xsd_fixture.log` |
| `tauri_build` | passed | 87.408 | `C:\07 DESARROLLO\apps\CumpleFactura\tests\regulatory\evidence\20260628-212017-tauri_build.log` |
| `tauri_desktop_e2e` | passed | 14.654 | `C:\07 DESARROLLO\apps\CumpleFactura\tests\regulatory\evidence\20260628-212017-tauri_desktop_e2e.log` |
| `external_readiness` | passed | 4.176 | `C:\07 DESARROLLO\apps\CumpleFactura\tests\regulatory\evidence\20260628-212017-external_readiness.log` |
| `evidence_ledger` | passed | 3.233 | `C:\07 DESARROLLO\apps\CumpleFactura\tests\regulatory\evidence\20260628-212017-evidence_ledger.log` |

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