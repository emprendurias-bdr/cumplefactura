# CumpleFactura - Regulatory Evidence Matrix

Status: pre-MVP evidence map
Date: 2026-11-02

This file maps product promises to local sources, executable evidence and live limits. It is not legal advice.

## Gate

Run the full local gate:

```powershell
npm run validate:regulatory
npm run validate:evidence-matrix
npm run validate:evidence-ledger
npm run validate:external-acceptance
npm run validate:sidecar-smoke
npm run validate:external-readiness
npm run validate:core-e2e
npm run validate:browser-smoke
npm run validate:secret-scan
npm run validate:tauri-desktop-e2e
```

Evidence output:

- `tests/regulatory/evidence/latest-regulatory-gate.json`
- `tests/regulatory/evidence/latest-regulatory-gate.md`
- `tests/regulatory/evidence/latest-evidence-ledger.json`
- `tests/regulatory/evidence/latest-evidence-ledger.md`
- `tests/regulatory/evidence/latest-external-acceptance-evidence.json`
- `tests/regulatory/evidence/latest-external-acceptance-evidence.md`
- `tests/regulatory/evidence/latest-sidecar-smoke.json`
- `tests/regulatory/evidence/latest-sidecar-smoke.md`
- `tests/regulatory/evidence/latest-external-readiness.json`
- `tests/regulatory/evidence/latest-external-readiness.md`
- `tests/regulatory/evidence/latest-browser-smoke.json`
- `tests/regulatory/evidence/latest-secret-scan.json`
- `tests/regulatory/evidence/latest-secret-scan.md`
- `tests/regulatory/evidence/latest-tauri-desktop-e2e.json`
- `tests/regulatory/evidence/latest-tauri-desktop-e2e.md`

## Matrix

| Promise | Local source | Executable evidence | Limit |
|---|---|---|---|
| Create draft and issue invoices locally | `MODULE_CONTRACT.md`; `C:\03 LEGISLACION\AEAT\MATRIZ_TECNICA_CUMPLEFACTURA_2026-05-27.md` | `cargo test`; `db::tests::persists_company_customer_and_invoice_draft`; `domain::invoice::*` | Local workflow only; archive/delete policies and commercial CRUD depth remain pending |
| Real company and customer forms | `MODULE_CONTRACT.md`; `src/useCumpleFactura.ts`; `src-tauri/src/db/companies.rs`; `src-tauri/src/db/customers.rs` | `cargo test`; `db::tests::updates_company_without_recreating_it`; `db::tests::upserts_customer_by_id_without_replace_delete`; `npm run validate:browser-smoke`; `npm run validate:ui-contract` | Form-based create/edit only; full onboarding wizard and deletion/archive policies remain pending |
| Initial onboarding settings | `MODULE_CONTRACT.md`; `src/useCumpleFactura.ts`; `src-tauri/src/domain/settings.rs`; SQLite migration `007_app_settings.sql` | `cargo test`; `db::tests::persists_app_settings_for_onboarding`; `npm run validate:browser-smoke`; `npm run validate:ui-contract` | Guided panel only; step-by-step wizard polish remains pending |
| Products/services catalog | `MODULE_CONTRACT.md`; `src/useCumpleFactura.ts`; `src-tauri/src/domain/product.rs`; SQLite migration `008_products_catalog.sql` | `cargo test`; `db::tests::upserts_and_lists_company_products`; `npm run validate:browser-smoke`; `npm run validate:ui-contract` | Local per-company catalog only; no stock, price history, search or import yet |
| Search and filter invoices | `MODULE_CONTRACT.md`; `src/useCumpleFactura.ts`; `src-tauri/src/db/invoices.rs` | `cargo test`; `db::tests::filters_invoices_by_series_kind_status_and_search`; `npm run validate:browser-smoke`; `npm run validate:ui-contract` | Local filters only; saved views remain pending |
| Paginated local lists | `MODULE_CONTRACT.md`; `src/useCumpleFactura.ts`; `src-tauri/src/db/invoices.rs`; `src-tauri/src/commands/fiscal.rs` | `cargo test`; `db::tests::paginates_invoice_audit_and_fiscal_lists`; `npm run validate:ui-contract`; `npm run validate:browser-smoke` | Local `limit/offset` pagination for invoices, audit and fiscal records; total counts, custom page sizes and saved views remain pending |
| Editable invoice lines with discounts, IVA and IRPF | `MODULE_CONTRACT.md`; `src-tauri/src/domain/invoice.rs`; SQLite migration `006_invoice_line_discounts.sql` | `cargo test`; `domain::invoice::tests::draft_applies_line_discount_before_tax_and_withholding`; `npm run validate:browser-smoke`; `npm run validate:ui-contract` | Quantity is integer in this MVP; advanced price rules and stock/unit metadata remain pending |
| Safe default app/export directories | `MODULE_CONTRACT.md`; Tauri path API contract | `npm run validate:ui-contract`; `npm run build`; UI invokes `app_defaults_get`; command `commands::app::app_defaults_get` | Creates local defaults only; selected paths still require command-side validation before write/restore |
| Native file picker for local paths | `MODULE_CONTRACT.md`; `src/useCumpleFactura.ts`; `src-tauri/capabilities/default.json`; dependency in `package.json` | `npm run validate:ui-contract`; `npm run validate:browser-smoke`; `npm run build`; gate `tauri_build` | Main UI path selection uses native dialogs and extension filters; browser smoke mocks dialog IPC, not OS modal rendering |
| Automatic invoice numbering by company/year/series | `MODULE_CONTRACT.md`; SQLite migration `004_next_mvp.sql` | `cargo test`; `db::tests::reserves_invoice_numbers_by_company_year_and_series`; UI invokes `invoice_next_number_preview` | Preview does not reserve; command emission remains the reservation boundary |
| Configurable company invoice series | `MODULE_CONTRACT.md`; SQLite migration `005_invoice_series_config.sql`; examples `VENDI202601`, `AL-001`, `C-001`, `I-001` | `cargo test`; `db::tests::configures_invoice_series_and_initial_sequence`; `db::tests::rejects_series_next_number_not_after_existing_invoice`; `npm run validate:ui-contract`; `npm run validate:browser-smoke` | Local series/default/next number and per-invoice selector only; historical import remains pending |
| Immutable audit chain | `MODULE_CONTRACT.md`; RRSIF/VERI*FACTU local docs in `C:\03 LEGISLACION\AEAT\FACTURACION Y SIF\` | `services::audit::*`; `db::tests::audit_events_are_append_only` | Local evidence only |
| VERI*FACTU `RegistroAlta` XML | Local XSD `SuministroLR.xsd` and `SuministroInformacion.xsd` | `services::verifactu::tests::generated_xml_passes_local_xsd_contract`; `npm run validate:verifactu:xsd` | XSD validates structure, not legal completeness |
| AEAT official hash for `RegistroAlta` | `Detalle especificaciones huella hash registros facturacion - AEAT.pdf` | Official vectors in `services::verifactu::tests::calculates_official_aeat_*registro_alta*` | Covered fields only |
| VERI*FACTU `RegistroAnulacion` XML | Local XSD and AEAT hash detail PDF | `services::verifactu::tests::builds_registro_anulacion_xml_shape`; official hash vector test | No AEAT transmission |
| Fiscal records append-only | `MODULE_CONTRACT.md` | `db::tests::fiscal_records_are_append_only`; `db::tests::fiscal_records_track_issued_and_voided_chain` | SQLite local |
| Fiscal chain verifier | AEAT hash detail PDF | `services::fiscal_chain::*` tests; UI calls `fiscal_chain_verify`; `npm run validate:browser-smoke`; `npm run validate:ui-contract` | Local verifier only; does not replace external audit, certification or AEAT acceptance |
| Rectifying invoices `R1-R5` and `I/S` | Local `SuministroInformacion.xsd` types `TipoFactura`, `TipoRectificativa`, `ImporteRectificacion` | `builds_rectifying_registro_alta_xml_shape`; `builds_substitutive_rectifying_registro_alta_xml_shape`; DB persistence test | Technical selector; legal cause remains user/professional responsibility |
| Rectification cause assistant | Local `SuministroInformacion.xsd` annotations for `ClaveTipoFacturaType` R1-R5 and `ClaveTipoRectificativaType` S/I | `services::rectification_advisor::*` tests; UI calls `rectification_advice` command | Assistant maps declared scenario only; it does not decide the legal/factual cause |
| Unsigned VERI*FACTU submission package | RD 1007/2023 art. 16.3 and Orden HAC/1177/2024 arts. 3-5 (no record signature in VERI*FACTU mode); local XSD `SuministroInformacion.xsd` (`ds:Signature` optional); `src-tauri/src/services/verifactu_submit.rs` | `cargo test`; `services::verifactu_submit::tests::*`; `db::tests::fiscal_export_and_aeat_submission_are_recorded_once`; UI exports XML and receives `export_id` + `xml_sha256` | Records are sent unsigned by design; the No VERI*FACTU mode (signed records without submission) is out of v1 |
| Sidecar loopback contract (HMAC, fail-closed) | `sidecar/ARQUITECTURA.md`; `crates/fiscal-contract/src/lib.rs`; `crates/fiscal-contract/src/messages.rs` | `cargo test --workspace`; `fiscal_contract::http::tests::*`; sidecar `server::tests::*` and `handlers::tests::*`; `npm run validate:sidecar-smoke`; gate step `sidecar_smoke` | Proves the local boundary and policy only; it does not prove AEAT acceptance |
| AEAT mTLS submit boundary | Local WSDL `SistemaFacturacion VERI-FACTU.wsdl`, ports `SistemaVerifactu*`; `crates/fiscal-contract/src/endpoints.rs`; `sidecar/src/aeat_client.rs`; `sidecar/src/soap.rs` | sidecar `aeat_client::tests::*` (local TLS server); sidecar `soap::tests::*`; manual `tools/homolog-verifactu.mjs` | The gate never calls AEAT; real acceptance needs a certificate, `CUMPLEFACTURA_SIDECAR_ALLOW_AEAT=1` and the manual homologation run; production stays blocked in v1 |
| Sidecar process lifecycle | `src-tauri/src/services/sidecar_process.rs`; `sidecar/src/main.rs` | `services::sidecar_process::tests::launches_reuses_and_restarts_real_sidecar`; `sidecar/tests/process.rs`; gate step `sidecar_smoke`; desktop E2E real step `Preflight envio` | Per-session secret over stdin; in v1 the certificate password comes from an environment variable and certificate expiry is not checked |
| AEAT response stored as submission evidence | SQLite migration `009_verifactu_submissions.sql`; `src-tauri/src/db/fiscal.rs` | `db::tests::fiscal_export_and_aeat_submission_are_recorded_once`; UI invokes `verifactu_submit` | CSV and states are stored locally; a unique index refuses a second acceptance of the same XML; TiempoEsperaEnvio is shown, not enforced |
| Fiscal UI command contract | `MODULE_CONTRACT.md`; `src-tauri/src/lib.rs`; matrix rows above | `npm run validate:ui-contract`; gate step `ui_contract`; every invoked command is registered and every registered command is invoked | Static UI contract only; interaction is covered by browser smoke and desktop E2E |
| Regulatory evidence matrix quality gate | `REGULATORY_EVIDENCE_MATRIX.md`; `MODULE_CONTRACT.md` | `npm run validate:evidence-matrix`; gate step `evidence_matrix`; `tools/verify-regulatory-evidence.mjs` | Completeness/shape check only; it does not prove legal sufficiency |
| Evidence ledger with SHA256 | `REGULATORY_EVIDENCE_MATRIX.md`; critical local sources in `C:\03 LEGISLACION\AEAT\FACTURACION Y SIF\`; generated evidence in `tests/regulatory/evidence/` | `npm run validate:evidence-ledger`; gate step `evidence_ledger`; `tools/verify-evidence-ledger.mjs`; evidence `tests/regulatory/evidence/latest-evidence-ledger.json` | Hash ledger proves local traceability of files/logs only; it is not certification, homologation or external AEAT acceptance |
| External acceptance evidence intake | `MODULE_CONTRACT.md`; fixture `tests/regulatory/fixtures/external-acceptance-manifest.example.json`; local AEAT VERI*FACTU sources | `npm run validate:external-acceptance`; gate step `external_acceptance`; `tools/verify-external-acceptance-evidence.mjs`; evidence `tests/regulatory/evidence/latest-external-acceptance-evidence.json` | Validates redacted manifest and hashes referenced artifacts only; default state is `not_provided`, no AEAT call or certification |
| External readiness audit | `MODULE_CONTRACT.md`; `sidecar/ARQUITECTURA.md`; runtime flag contracts in Rust services | `npm run validate:external-readiness`; gate step `external_readiness`; `tools/verify-external-readiness.mjs`; evidence `tests/regulatory/evidence/latest-external-readiness.json` | Reports ready/blocked status only; performs no network call, no certificate parsing, no AEAT submission and no homologation |
| Core E2E real fiscal workflow | `MODULE_CONTRACT.md`; `src-tauri/src/core_e2e.rs`; AEAT XSD assets | `npm run validate:core-e2e`; gate step `core_e2e`; evidence `tests/regulatory/evidence/latest-core-e2e.json`; XML/PDF/JSON/CSV/audit artifacts in `tests/regulatory/evidence/` | In-memory SQLite/local files only; no Tauri window loop, no sidecar, no certificate, no AEAT call, CSV retrieval or external acceptance |
| Browser smoke fiscal workflow | `MODULE_CONTRACT.md`; `src/useCumpleFactura.ts`; matrix rows above | `npm run validate:browser-smoke`; gate step `browser_smoke`; `tools/verify-browser-smoke.mjs`; evidence `tests/regulatory/evidence/latest-browser-smoke.json` | Uses local Tauri invoke mock; proves rendered workflow/limits, not Rust execution or AEAT acceptance |
| Secret scan gate | `MODULE_CONTRACT.md`; local secret handling policy | `npm run validate:secret-scan`; gate step `secret_scan`; `tools/verify-secret-scan.mjs`; evidence `tests/regulatory/evidence/latest-secret-scan.json` | High-confidence local scan only; reports paths/rules, never matched values |
| Desktop Tauri E2E evidence | `MODULE_CONTRACT.md`; `tools/verify-tauri-desktop-e2e.mjs`; `package.json` dev toolchain | `npm run validate:tauri-desktop-e2e`; gate step `tauri_desktop_e2e`; evidence `tests/regulatory/evidence/latest-tauri-desktop-e2e.json`; release exe + platform WebDriver checks; real mode ends with a sidecar preflight | Gate runs real WebDriver mode; standalone default remains preflight unless env flag is set |
| Desktop app buildable | Tauri/Vite/Rust project files | `npm run build`; `npm run tauri:build` | Windows build currently validated |
| Local JSON/CSV/audit exports | `MODULE_CONTRACT.md`; `src-tauri/src/services/export.rs` | `cargo test`; `services::export::*`; `services::export::tests::writes_fiscal_audit_json_with_chain_verification`; UI invokes `invoice_export_json`, `invoice_export_csv`, `fiscal_audit_export`; `npm run validate:ui-contract`; `npm run validate:browser-smoke` | JSON/CSV/audit are local evidence; audit export includes local chain verification, CSV/audit filters accepted but MVP exports all rows |
| Restore backup keeps a safety copy and rolls back on failure | `MODULE_CONTRACT.md`; `src-tauri/src/db/backup.rs`; `src-tauri/src/services/export.rs` | `cargo test`; `db::backup::tests::restores_backup_and_keeps_safety_copy`; `db::backup::tests::rolls_back_when_restored_chain_is_invalid`; `db::backup::tests::rejects_invalid_sources_before_touching_the_database`; UI invokes `backup_restore`; `npm run validate:ui-contract` | Replaces the active database only with `confirm`; restores the safety copy if migration or chain verification fails; not tested against a real user database |

## Live Limits

- No AEAT network transmission is performed by the gate: the sidecar smoke runs without `--allow-aeat`.
- VERI*FACTU records are sent unsigned by design (RD 1007/2023 art. 16.3; Orden HAC/1177/2024 arts. 3-5); AEAT authenticates the TLS client certificate. The No VERI*FACTU mode is out of v1.
- Only the local Rust sidecar opens the certificate and connects to AEAT; the app talks to it over `127.0.0.1` with a per-session HMAC secret delivered over stdin.
- Production endpoints require `--allow-production`, which the app never passes in v1; the default endpoint is `SistemaVerifactuPruebas`.
- Real mTLS acceptance is proven only by the manual `tools/homolog-verifactu.mjs` run plus the redacted external acceptance manifest.
- In v1 the certificate password comes from `CUMPLEFACTURA_CERT_PASSWORD_<ID>` or `CUMPLEFACTURA_CERT_PASSWORD`, and certificate expiry is not checked by the preflight.
- On Linux, OpenSSL 3 cannot open legacy-encrypted PKCS#12 files without the legacy provider; Windows (SChannel) is the supported runtime.
- SII, TicketBAI and FACe are out of v1 scope; no SII/foral transmission scope promised.
- Core E2E gate exercises real Rust domain/db/services with in-memory SQLite, XSD-valid XML, PDF and an `xml_exported` record; it does not start the sidecar, use certificates or call AEAT.
- Evidence matrix gate checks that each promise has source, executable evidence and limit; it does not prove legal sufficiency.
- Evidence ledger hashes local normative sources, repo artifacts, generated evidence and gate logs; it proves traceability, not certification or AEAT acceptance.
- External acceptance intake accepts only a redacted manifest plus SHA256 artifact hashes; without a supplied manifest it records `not_provided`.
- External readiness audit is allowed to be `blocked`; that is the safe state until sidecar build, vault certificate, flag and external acceptance evidence exist.
- Browser smoke gate uses a local Tauri invoke mock; it proves rendered workflow, real company/customer forms, editable line/series UI and visible limits, not Rust command execution or AEAT acceptance.
- Fiscal audit screen is local evidence only; its export includes chain verification but is not certification.
- Pagination is local `limit/offset` only; there are no total counts, saved views or infinite-scroll claims.
- Onboarding stores local settings, default fiscal flags and the VERI*FACTU endpoint; export folder is selected with native dialog in the main UI.
- Secret scan evidence is local and redacted; it cannot certify absence of every possible secret pattern.
- Desktop Tauri E2E default mode is preflight; the regulatory gate enables real WebDriver mode with `CUMPLEFACTURA_TAURI_DESKTOP_E2E_REAL=1`.
- Rectification assistant is technical: maps a declared scenario to R1-R5/I-S; it is not legal advice.
