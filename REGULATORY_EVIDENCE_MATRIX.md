# CumpleFactura - Regulatory Evidence Matrix

Status: pre-MVP evidence map
Date: 2026-06-04

This file maps product promises to local sources, executable evidence and live limits. It is not legal advice.

## Gate

Run the full local gate:

```powershell
npm run validate:regulatory
npm run validate:evidence-matrix
npm run validate:evidence-ledger
npm run validate:external-acceptance
npm run validate:contapro-sidecar-import
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
- `tests/regulatory/evidence/latest-contapro-sidecar-import.json`
- `tests/regulatory/evidence/latest-contapro-sidecar-import.md`
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
| Real company and customer forms | `MODULE_CONTRACT.md`; `src/App.tsx`; `src-tauri/src/db/mod.rs` | `cargo test`; `db::tests::updates_company_without_recreating_it`; `db::tests::upserts_customer_by_id_without_replace_delete`; `npm run validate:browser-smoke`; `npm run validate:ui-contract` | Form-based create/edit only; full onboarding wizard and deletion/archive policies remain pending |
| Initial onboarding settings | `MODULE_CONTRACT.md`; `src/App.tsx`; `src-tauri/src/domain/settings.rs`; SQLite migration `007_app_settings.sql` | `cargo test`; `db::tests::persists_app_settings_for_onboarding`; `npm run validate:browser-smoke`; `npm run validate:ui-contract` | Guided panel only; step-by-step wizard polish remains pending |
| Products/services catalog | `MODULE_CONTRACT.md`; `src/App.tsx`; `src-tauri/src/domain/product.rs`; SQLite migration `008_products_catalog.sql` | `cargo test`; `db::tests::upserts_and_lists_company_products`; `npm run validate:browser-smoke`; `npm run validate:ui-contract` | Local per-company catalog only; no stock, price history, search or import yet |
| Search and filter invoices | `MODULE_CONTRACT.md`; `src/App.tsx`; `src-tauri/src/db/mod.rs` | `cargo test`; `db::tests::filters_invoices_by_series_kind_status_and_search`; `npm run validate:browser-smoke`; `npm run validate:ui-contract` | Local filters only; saved views remain pending |
| Paginated local lists | `MODULE_CONTRACT.md`; `src/App.tsx`; `src-tauri/src/db/mod.rs`; `src-tauri/src/commands/fiscal.rs` | `cargo test`; `db::tests::paginates_invoice_audit_and_fiscal_lists`; `npm run validate:ui-contract`; `npm run validate:browser-smoke` | Local `limit/offset` pagination for invoices, audit and fiscal records; total counts, custom page sizes and saved views remain pending |
| Editable invoice lines with discounts, IVA and IRPF | `MODULE_CONTRACT.md`; `src-tauri/src/domain/invoice.rs`; SQLite migration `006_invoice_line_discounts.sql` | `cargo test`; `domain::invoice::tests::draft_applies_line_discount_before_tax_and_withholding`; `npm run validate:browser-smoke`; `npm run validate:ui-contract` | Quantity is integer in this MVP; advanced price rules and stock/unit metadata remain pending |
| Safe default app/export directories | `MODULE_CONTRACT.md`; Tauri path API contract | `npm run validate:ui-contract`; `npm run build`; UI invokes `app_defaults_get`; command `commands::app::app_defaults_get` | Creates local defaults only; selected paths still require command-side validation before write/restore |
| Native file picker for local paths | `MODULE_CONTRACT.md`; `src/App.tsx`; `src-tauri/capabilities/default.json`; dependency in `package.json` | `npm run validate:ui-contract`; `npm run validate:browser-smoke`; `npm run build`; gate `tauri_build` | Main UI path selection uses native dialogs and extension filters; browser smoke mocks dialog IPC, not OS modal rendering |
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
| Prepare signature/submission package | Local XSD and XML SHA256 evidence | `services::submission::tests::prepares_unsigned_package_with_sha256`; `verifactu_submission_prepare` | Package is local; no AEAT network submission |
| XAdES sidecar exact-XML preflight | Sidecar `/verifactu/sign-xml`, local XML SHA256 and vault ref contract | `services::xades_sidecar::*` tests; UI calls `verifactu_xades_sidecar_preflight`; sidecar tests `test_verifactu_sign_xml_*` | Preflight only; does not send XML or certificate refs to sidecar |
| XAdES exact-XML signing via sidecar | Sidecar `/verifactu/sign-xml`, HMAC boundary, local XML SHA256 and `signed_xades` fiscal export | `services::xades_sidecar::sign_exact_xml_*` tests; UI calls `verifactu_xades_sidecar_sign`; sidecar tests `test_verifactu_sign_xml_*` | Requires explicit runtime flag, shared secret and real sidecar mode; gate uses fake local sidecar for CumpleFactura boundary |
| AEAT VERI*FACTU transport preflight | Local WSDL `SistemaFacturacion VERI-FACTU.wsdl`, service `sfVerifactu`, endpoints `SistemaVerifactu*` | `services::aeat_transport::*` tests; UI calls `verifactu_transport_preflight`; gate step `cargo_test` | Preflight only; no SOAP call, certificate session or AEAT submission |
| VERI*FACTU submit readiness via sidecar | Sidecar `/verifactu/submit-preflight`, local WSDL/Zeep/vault readiness and HMAC boundary | `services::verifactu_submit_sidecar::*` tests; UI calls `verifactu_submit_sidecar_preflight`; sidecar tests `test_verifactu_preflight_*` | Calls only local sidecar preflight; sends no raw XML; no SOAP call, CSV or AEAT acceptance |
| VERI*FACTU invoke-submit boundary via sidecar | Sidecar `/verifactu/invoke-submit`, WSDL operation `RegFactuSistemaFacturacion`, signed XML and HMAC boundary | `services::verifactu_submit_sidecar::invoke_*` tests; UI calls `verifactu_submit_sidecar_invoke`; sidecar tests `test_verifactu_invoke_submit_*` | Runtime can ask sidecar to call AEAT only behind explicit flags/cert; gate uses fake local sidecar, no real AEAT/CSV |
| ContaPro sidecar MVP fiscal import | `MODULE_CONTRACT.md`; `tools/import-contapro-sidecar-evidence.mjs`; ContaPro sidecar `latest-external-readiness.json`; VERI*FACTU/SII acceptance manifests | `npm run validate:contapro-sidecar-import`; gate step `contapro_sidecar_import`; evidence `tests/regulatory/evidence/latest-contapro-sidecar-import.json` | MVP importable scope is VERI*FACTU/SII only when ready plus accepted/passed manifest; FACe/TicketBAI are deferred evidence; no certificate/password/raw XML import and no AEAT/SII/FACe/foral network call |
| SII sidecar preflight boundary | ContaPro sidecar `/sii/submit-preflight`; `src-tauri/src/services/sidecar_channels.rs` | `cargo test`; `services::sidecar_channels::*`; UI calls `sii_submit_sidecar_preflight`; `npm run validate:ui-contract`; `npm run validate:browser-smoke` | Fail-closed unless explicit flag/HMAC/vault exist; no invoice payload, no SOAP AEAT and no CSV retrieval from CumpleFactura gate |
| TicketBAI deferred sidecar boundary | ContaPro sidecar `/ticketbai/submit-preflight`; `src-tauri/src/services/sidecar_channels.rs`; ContaPro TicketBAI homologation status | `cargo test`; `services::sidecar_channels::*`; UI shows deferred channel; `npm run validate:ui-contract`; `npm run validate:browser-smoke` | Not MVP importable; blocked by foral signature policy, software registration and acceptance evidence; no XML firmado and no foral network call from CumpleFactura gate |
| Fiscal UI command contract | `MODULE_CONTRACT.md`; matrix rows above | `npm run validate:ui-contract`; gate step `ui_contract` | Static UI contract only; no browser interaction automation |
| Regulatory evidence matrix quality gate | `REGULATORY_EVIDENCE_MATRIX.md`; `MODULE_CONTRACT.md` | `npm run validate:evidence-matrix`; gate step `evidence_matrix`; `tools/verify-regulatory-evidence.mjs` | Completeness/shape check only; it does not prove legal sufficiency |
| Evidence ledger with SHA256 | `REGULATORY_EVIDENCE_MATRIX.md`; critical local sources in `C:\03 LEGISLACION\AEAT\FACTURACION Y SIF\`; generated evidence in `tests/regulatory/evidence/` | `npm run validate:evidence-ledger`; gate step `evidence_ledger`; `tools/verify-evidence-ledger.mjs`; evidence `tests/regulatory/evidence/latest-evidence-ledger.json` | Hash ledger proves local traceability of files/logs only; it is not certification, homologation or external AEAT acceptance |
| External acceptance evidence intake | `MODULE_CONTRACT.md`; fixture `tests/regulatory/fixtures/external-acceptance-manifest.example.json`; local AEAT VERI*FACTU sources | `npm run validate:external-acceptance`; gate step `external_acceptance`; `tools/verify-external-acceptance-evidence.mjs`; evidence `tests/regulatory/evidence/latest-external-acceptance-evidence.json` | Validates redacted manifest and hashes referenced artifacts only; default state is `not_provided`, no AEAT call or certification |
| External readiness audit | `MODULE_CONTRACT.md`; sidecar gate/ledger; runtime flag contracts in Rust services | `npm run validate:external-readiness`; gate step `external_readiness`; `tools/verify-external-readiness.mjs`; evidence `tests/regulatory/evidence/latest-external-readiness.json` | Reports ready/blocked status only; performs no network call, no certificate parsing, no AEAT submission and no homologation |
| Core E2E real fiscal workflow | `MODULE_CONTRACT.md`; `src-tauri/src/core_e2e.rs`; AEAT XSD assets | `npm run validate:core-e2e`; gate step `core_e2e`; evidence `tests/regulatory/evidence/latest-core-e2e.json`; XML/PDF/JSON/CSV/audit artifacts in `tests/regulatory/evidence/` | In-memory SQLite/local files only; no Tauri window loop, XAdES, SOAP AEAT, AEAT CSV retrieval or external acceptance |
| Browser smoke fiscal workflow | `MODULE_CONTRACT.md`; `src/App.tsx`; matrix rows above | `npm run validate:browser-smoke`; gate step `browser_smoke`; `tools/verify-browser-smoke.mjs`; evidence `tests/regulatory/evidence/latest-browser-smoke.json` | Uses local Tauri invoke mock; proves rendered workflow/limits, not Rust execution or AEAT acceptance |
| Secret scan gate | `MODULE_CONTRACT.md`; local secret handling policy | `npm run validate:secret-scan`; gate step `secret_scan`; `tools/verify-secret-scan.mjs`; evidence `tests/regulatory/evidence/latest-secret-scan.json` | High-confidence local scan only; reports paths/rules, never matched values |
| Desktop Tauri E2E evidence | `MODULE_CONTRACT.md`; `tools/verify-tauri-desktop-e2e.mjs`; `package.json` dev toolchain | `npm run validate:tauri-desktop-e2e`; gate step `tauri_desktop_e2e`; evidence `tests/regulatory/evidence/latest-tauri-desktop-e2e.json`; release exe + EdgeDriver checks | Gate runs real WebDriver mode; standalone default remains preflight unless env flag is set |
| Desktop app buildable | Tauri/Vite/Rust project files | `npm run build`; `npm run tauri:build` | Windows build currently validated |
| Local JSON/CSV/audit exports | `MODULE_CONTRACT.md`; `src-tauri/src/services/export.rs` | `cargo test`; `services::export::*`; `services::export::tests::writes_fiscal_audit_json_with_chain_verification`; UI invokes `invoice_export_json`, `invoice_export_csv`, `fiscal_audit_export`; `npm run validate:ui-contract`; `npm run validate:browser-smoke` | JSON/CSV/audit are local evidence; audit export includes local chain verification, CSV/audit filters accepted but MVP exports all rows |
| Restore backup stays non-destructive | `MODULE_CONTRACT.md`; `src-tauri/src/services/export.rs` | `cargo test`; `services::export::tests::validates_restore_source_extension`; UI invokes `backup_restore`; `npm run validate:ui-contract` | Preflight only; active database is not replaced in MVP |

## Live Limits

- XAdES signature generation exists only through local sidecar `/verifactu/sign-xml` with HMAC, explicit CumpleFactura flag and sidecar real-XAdES mode.
- The CumpleFactura gate validates the HTTP boundary with a local fake sidecar; certificate-backed real XAdES remains covered by the sidecar gate and runtime preflight.
- No AEAT network transmission is performed by the gate.
- XAdES sidecar preflight validates exact XML hash, local `/verifactu/sign-xml`, `vault://certs/...` ref and runtime flag before signing.
- AEAT transport preflight validates endpoint allowlist, XML hash, XAdES status and runtime flag only.
- Submit sidecar preflight calls only local `/verifactu/submit-preflight` with HMAC; it checks WSDL/vault/flags and sends no raw XML to that endpoint.
- Invoke-submit sidecar boundary sends signed XML only to local `/verifactu/invoke-submit`; real AEAT acceptance requires sidecar flags, authorized certificate and external homologation.
- ContaPro sidecar import reads redacted local readiness for VERI*FACTU, SII, FACe and TicketBAI, but marks MVP importable only VERI*FACTU/SII with accepted manifests; it performs no external call and imports no secrets.
- SII sidecar preflight in CumpleFactura sends only readiness metadata to local `/sii/submit-preflight` when explicitly enabled; no SII SOAP call or invoice batch is sent by the gate.
- TicketBAI is visible as deferred evidence, not MVP runtime scope; no signed XML or foral call is sent by the gate.
- Core E2E gate exercises real Rust domain/db/services with in-memory SQLite, XSD-valid XML, PDF and prepared export; it does not use certificates or external AEAT.
- Evidence matrix gate checks that each promise has source, executable evidence and limit; it does not prove legal sufficiency.
- Evidence ledger hashes local normative sources, repo artifacts, generated evidence and gate logs; it proves traceability, not certification or AEAT acceptance.
- External acceptance intake accepts only a redacted manifest plus SHA256 artifact hashes; without a supplied manifest it records `not_provided`.
- External readiness audit is allowed to be `blocked`; that is the safe state until vault, certificate flags and external acceptance evidence exist.
- Browser smoke gate uses a local Tauri invoke mock; it proves rendered workflow, real company/customer forms, editable line/series UI and visible limits, not Rust command execution or AEAT acceptance.
- Fiscal audit screen is local evidence only; its export includes chain verification but is not certification.
- Pagination is local `limit/offset` only; there are no total counts, saved views or infinite-scroll claims.
- Onboarding stores local settings and applies default fiscal flags; export folder is selected with native dialog in the main UI.
- Secret scan evidence is local and redacted; it cannot certify absence of every possible secret pattern.
- Desktop Tauri E2E default mode is preflight; the regulatory gate enables real WebDriver mode with `CUMPLEFACTURA_TAURI_DESKTOP_E2E_REAL=1`.
- Rectification assistant is technical: maps a declared scenario to R1-R5/I-S, with warning that it is not legal advice.
- UI contract gate, browser smoke, secret scan and desktop E2E evidence are included.
- No SII/foral transmission scope promised.
