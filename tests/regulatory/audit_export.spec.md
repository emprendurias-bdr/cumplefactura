# Spec - audit export

## Must
- Export issued invoices, audit events, hashes and configuration by period.
- Export is deterministic: same DB state gives same package hash.
- Export includes app version and schema version.
- Export excludes secrets/private keys.
- VERI*FACTU XML export validates the XSD, computes SHA256 and records `fiscal_exports` as `xml_exported`.
- Submission state is explicit: `not_submitted` until the sidecar returns an AEAT answer stored in `verifactu_submissions`.

## Reject
- Non-deterministic timestamps during export.
- Missing audit events for issued invoices.
- Claiming submitted status without an AEAT answer (CSV and states) stored in `verifactu_submissions`.

## Current executable coverage
- Rust `services::verifactu_submit::record_xml_export` (core E2E) and `db::tests::fiscal_export_and_aeat_submission_are_recorded_once`.
