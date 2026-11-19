# CumpleFactura regulatory gate

- Generated: 2026-11-20T01:35:38.4553879+02:00
- Status: failed
- App: `C:\07 DESARROLLO\apps\CumpleFactura\.worktrees\g1`
- Source workspace: `C:\03 LEGISLACION`

## Steps

| Step | Status | Seconds | Log |
|---|---:|---:|---|
| `cargo_fmt_check` | passed | 0.755 | `C:\07 DESARROLLO\apps\CumpleFactura\.worktrees\g1\tests\regulatory\evidence\20261120-013112-cargo_fmt_check.log` |
| `cargo_test` | failed | 33.46 | `C:\07 DESARROLLO\apps\CumpleFactura\.worktrees\g1\tests\regulatory\evidence\20261120-013112-cargo_test.log` |
| `sidecar_build` | passed | 12.221 | `C:\07 DESARROLLO\apps\CumpleFactura\.worktrees\g1\tests\regulatory\evidence\20261120-013112-sidecar_build.log` |
| `sidecar_smoke` | failed | 0.947 | `C:\07 DESARROLLO\apps\CumpleFactura\.worktrees\g1\tests\regulatory\evidence\20261120-013112-sidecar_smoke.log` |
| `npm_build` | passed | 5.886 | `C:\07 DESARROLLO\apps\CumpleFactura\.worktrees\g1\tests\regulatory\evidence\20261120-013112-npm_build.log` |
| `ui_contract` | passed | 1.378 | `C:\07 DESARROLLO\apps\CumpleFactura\.worktrees\g1\tests\regulatory\evidence\20261120-013112-ui_contract.log` |
| `core_e2e` | passed | 26.342 | `C:\07 DESARROLLO\apps\CumpleFactura\.worktrees\g1\tests\regulatory\evidence\20261120-013112-core_e2e.log` |
| `browser_smoke` | failed | 17.624 | `C:\07 DESARROLLO\apps\CumpleFactura\.worktrees\g1\tests\regulatory\evidence\20261120-013112-browser_smoke.log` |
| `secret_scan` | passed | 1.216 | `C:\07 DESARROLLO\apps\CumpleFactura\.worktrees\g1\tests\regulatory\evidence\20261120-013112-secret_scan.log` |
| `external_acceptance` | passed | 0.962 | `C:\07 DESARROLLO\apps\CumpleFactura\.worktrees\g1\tests\regulatory\evidence\20261120-013112-external_acceptance.log` |
| `evidence_matrix` | failed | 0.947 | `C:\07 DESARROLLO\apps\CumpleFactura\.worktrees\g1\tests\regulatory\evidence\20261120-013112-evidence_matrix.log` |
| `verifactu_xsd_fixture` | passed | 1.189 | `C:\07 DESARROLLO\apps\CumpleFactura\.worktrees\g1\tests\regulatory\evidence\20261120-013112-verifactu_xsd_fixture.log` |
| `tauri_build` | passed | 154.83 | `C:\07 DESARROLLO\apps\CumpleFactura\.worktrees\g1\tests\regulatory\evidence\20261120-013112-tauri_build.log` |
| `tauri_desktop_e2e` | failed | 5.77 | `C:\07 DESARROLLO\apps\CumpleFactura\.worktrees\g1\tests\regulatory\evidence\20261120-013112-tauri_desktop_e2e.log` |
| `external_readiness` | passed | 1.416 | `C:\07 DESARROLLO\apps\CumpleFactura\.worktrees\g1\tests\regulatory\evidence\20261120-013112-external_readiness.log` |
| `evidence_ledger` | failed | 1.11 | `C:\07 DESARROLLO\apps\CumpleFactura\.worktrees\g1\tests\regulatory\evidence\20261120-013112-evidence_ledger.log` |

## Live limits

- VERI*FACTU records are sent unsigned by design (RD 1007/2023 art. 16.3; Orden HAC/1177/2024 arts. 3-5): AEAT authenticates the TLS client certificate.
- Only the local Rust sidecar (cumplefactura-sidecar) opens the certificate and connects to AEAT; the app talks to it over 127.0.0.1 with a per-session HMAC secret.
- No AEAT network transmission is performed by the gate: the sidecar smoke runs without --allow-aeat and production endpoints need --allow-production, never passed in v1.
- Sidecar smoke proves handshake, HMAC rejection, fail-closed submit, production block and exit on stdin close; real mTLS submission is verified manually with tools/homolog-verifactu.mjs.
- Core E2E gate exercises real Rust domain/db/services with in-memory SQLite, XSD-valid XML, PDF and an xml_exported record; it does not start the sidecar, use certificates or call AEAT.
- Evidence matrix gate checks that each product promise has source, executable evidence and a live limit; it does not prove legal sufficiency.
- Evidence ledger hashes local normative sources, repo artifacts, generated evidence and gate logs; it is traceability evidence, not certification.
- Secret scan runs locally before ledger and records only redacted rule/path findings.
- External acceptance evidence intake validates a supplied redacted manifest and hashes referenced artifacts; by default it records not_provided.
- External readiness audit reports blockers for missing sidecar build, vault certificate, CUMPLEFACTURA_SIDECAR_ALLOW_AEAT and acceptance evidence; blocked is safe and expected until supplied.
- Browser smoke gate uses a local Tauri invoke mock; it proves rendered workflow and visible limits, not Rust command execution or AEAT acceptance.
- Tauri desktop E2E verifier records preflight mode by default; the regulatory gate enables real WebDriver mode, which also launches the real sidecar through the app.
- R1-R5/I-S assistant maps declared scenarios only; it is not legal advice.