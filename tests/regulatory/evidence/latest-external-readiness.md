# CumpleFactura external readiness

- Generated: 2026-10-28T10:50:17.469Z
- Status: blocked
- Blockers: 18
- Warnings: 0

## Sections

| Section | Status | Blockers |
|---|---:|---:|
| Tauri desktop E2E | blocked | 3 |
| Certificate-backed XAdES | blocked | 10 |
| Real VERI*FACTU submission | blocked | 4 |
| Imported ContaPro sidecar channels | blocked | 1 |

## Blockers

- tauri_desktop_e2e: tauri_release_exe_exists - Release executable must exist before desktop E2E can run.
- tauri_desktop_e2e: tauri_driver_available - tauri-driver is required for real Tauri WebDriver E2E.
- tauri_desktop_e2e: tauri_desktop_e2e_evidence_passed - Latest Tauri desktop E2E verifier evidence must be present and passed.
- real_xades: sidecar_workspace_exists - ContaPro sidecar workspace must exist.
- real_xades: sidecar_gate_passed - Sidecar regulatory gate must be green before using it for real signing.
- real_xades: sidecar_ledger_passed - Sidecar evidence ledger must be green before using it for real signing.
- real_xades: cumplefactura_real_xades_flag - CUMPLEFACTURA_ENABLE_REAL_XADES_SIDECAR must be enabled explicitly.
- real_xades: sidecar_real_xades_flag - SIDECAR_ENABLE_REAL_XADES_ENDPOINTS must be enabled explicitly.
- real_xades: shared_secret_present - Shared HMAC secret must be provided by environment, never by prompt or file.
- real_xades: certificate_ref_valid - CUMPLEFACTURA_EXTERNAL_CERT_REF must use vault://certs/<id>.
- real_xades: vault_dir_exists - SIDECAR_CERT_VAULT_DIR must point to a mounted local vault directory.
- real_xades: vault_certificate_file_exists - Vault must contain <id>.p12 or <id>.pfx for the certificate ref.
- real_xades: certificate_password_env_present - Certificate password must be supplied by SIDECAR_CERT_PASSWORD_<ID> or SIDECAR_CERT_PASSWORD.
- real_verifactu_submission: cumplefactura_invoke_flag - CUMPLEFACTURA_ENABLE_VERIFACTU_SUBMIT_SIDECAR_INVOKE must be enabled explicitly.
- real_verifactu_submission: sidecar_transport_flag - SIDECAR_ENABLE_REAL_VERIFACTU_TRANSPORT must be enabled explicitly.
- real_verifactu_submission: sidecar_soap_flag - SIDECAR_ENABLE_REAL_VERIFACTU_SOAP_CALLS must be enabled explicitly.
- real_verifactu_submission: aeat_acceptance_evidence_validated - External AEAT VERI*FACTU acceptance/homologation must be recorded through the validated redacted manifest intake.
- imported_sidecar_channels: contapro_import_passed - ContaPro sidecar readiness evidence must be imported locally.

## Limits

- Blocked is an expected safe status until real cert/vault/flags/evidence exist.
- This audit proves readiness state only; it is not XAdES signing, AEAT transmission, CSV retrieval or homologation.
- External acceptance is considered ready only when the manifest verifier records accepted AEAT_VERIFACTU evidence.
- Imported SII/TicketBAI/FACe status is evidence visibility only; CumpleFactura still requires explicit flags/HMAC/vault before sidecar calls.
