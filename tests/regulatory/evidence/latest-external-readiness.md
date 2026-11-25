# CumpleFactura external readiness

- Generated: 2026-11-25T23:08:37.143Z
- Status: blocked
- Blockers: 7
- Warnings: 0

## Sections

| Section | Status | Blockers |
|---|---:|---:|
| Tauri desktop E2E | blocked | 1 |
| VERI*FACTU sidecar | ready | 0 |
| Certificate in local vault | blocked | 4 |
| Real VERI*FACTU submission | blocked | 2 |

## Blockers

- tauri_desktop_e2e: tauri_desktop_e2e_evidence_passed - Latest Tauri desktop E2E verifier evidence must be present and passed.
- certificate: certificate_ref_valid - CUMPLEFACTURA_EXTERNAL_CERT_REF must use vault://certs/<id> with [A-Za-z0-9_-].
- certificate: vault_dir_exists - CUMPLEFACTURA_CERT_VAULT_DIR must point to the local vault directory (the app defaults to <app data>/certs).
- certificate: vault_certificate_file_exists - Vault must contain <id>.p12 or <id>.pfx for the certificate ref.
- certificate: certificate_password_env_present - Certificate password must be supplied by CUMPLEFACTURA_CERT_PASSWORD_<ID> or CUMPLEFACTURA_CERT_PASSWORD.
- real_verifactu_submission: sidecar_allow_aeat_flag - CUMPLEFACTURA_SIDECAR_ALLOW_AEAT=1 makes the app start the sidecar with --allow-aeat.
- real_verifactu_submission: aeat_acceptance_evidence_validated - External AEAT VERI*FACTU acceptance must be recorded through the validated redacted manifest intake.

## Limits

- Blocked is an expected safe status until a real certificate, vault, flag and acceptance evidence exist.
- This audit proves readiness state only; it is not AEAT transmission, CSV retrieval or homologation.
- VERI*FACTU records are sent unsigned by design (RD 1007/2023 art. 16.3); AEAT authenticates the TLS client certificate.
- Production endpoints stay blocked: the app never starts the sidecar with --allow-production in v1.
