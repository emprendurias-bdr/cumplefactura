# CumpleFactura external readiness

- Generated: 2026-11-19T23:35:37.291Z
- Status: blocked
- Blockers: 10
- Warnings: 0

## Sections

| Section | Status | Blockers |
|---|---:|---:|
| Tauri desktop E2E | blocked | 2 |
| VERI*FACTU sidecar | blocked | 2 |
| Certificate in local vault | blocked | 4 |
| Real VERI*FACTU submission | blocked | 2 |

## Blockers

- tauri_desktop_e2e: tauri_release_exe_exists - Release executable must exist before desktop E2E can run.
- tauri_desktop_e2e: tauri_desktop_e2e_evidence_passed - Latest Tauri desktop E2E verifier evidence must be present and passed.
- sidecar: sidecar_release_binary_exists - cumplefactura-sidecar must be built next to the release executable (cargo build --workspace --release).
- sidecar: sidecar_smoke_passed - Latest sidecar smoke (handshake, HMAC, fail-closed, exit on stdin close) must have passed.
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
