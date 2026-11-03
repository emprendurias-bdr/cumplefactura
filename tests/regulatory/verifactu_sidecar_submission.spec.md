# VERI*FACTU submission through the local sidecar spec

Priority: P1

Legal basis: RD 1007/2023 art. 16.3 (VERI*FACTU systems need no record signature, the hash suffices); Orden HAC/1177/2024 art. 3 (art. 6.c signature excluded for VERI*FACTU) and arts. 4-5 (authentication with an electronic certificate on the connection). Local XSD: `ds:Signature` has `minOccurs="0"`.

## Must

- Export: `verifactu_xml_draft_export` / `verifactu_xml_anulacion_draft_export` validate the XML against the local XSD and record `fiscal_exports` with status `xml_exported` and the XML SHA-256.
- Preflight and submit only accept an `export_id` that is an `xml_exported` export of that invoice with that SHA-256, and only if the file on disk still has that SHA-256.
- The app never opens the certificate or connects to AEAT. It launches `cumplefactura-sidecar`, sends a per-session 32-byte HMAC secret over stdin and talks to it on `127.0.0.1` only.
- Every sidecar `POST` carries `x-signature` = HMAC-SHA256(secret, body); a wrong or missing signature is `401 hmac_invalid`.
- The sidecar checks, in order and before any network: endpoint in the WSDL allowlist, production only with `--allow-production`, SHA-256 match, root `RegFactuSistemaFacturacion`, `--allow-aeat`, certificate loads from `vault://certs/<id>`.
- The XML travels unsigned and unmodified inside a SOAP 1.1 envelope over TLS 1.2+ with the PKCS#12 client certificate.
- The AEAT answer is reduced to status, CSV, `EstadoEnvio`, `EstadoRegistro`, error code/description and `TiempoEsperaEnvio`, and stored in `verifactu_submissions`.
- A second acceptance of the same XML is refused (`xml_already_accepted_by_aeat` and a unique index).
- The sidecar exits when the app closes its stdin, and the app kills it on exit.

## Reject

- Any response containing the certificate ref, vault path, password or session secret.
- A preflight that reports `external_call_performed = true`.
- A submit whose returned SHA-256 differs from the one sent.
- Automatic retries of a submission.

## Current executable coverage

- `crates/fiscal-contract`: HMAC vectors (RFC 4231), endpoint URLs, HTTP reader (content-length, chunked, until close) and loopback client.
- `sidecar`: policy (`handlers::tests`), routing and HMAC (`server::tests`), vault (`vault::tests`, with a generated PKCS#12 when `openssl` exists), SOAP envelope and AEAT answers (`soap::tests`), TLS client against a local TLS server (`aeat_client::tests`) and the real binary (`sidecar/tests/process.rs`).
- App: `services::verifactu_submit::tests`, `services::sidecar_process::tests::launches_reuses_and_restarts_real_sidecar`, `db::tests::fiscal_export_and_aeat_submission_are_recorded_once`.
- Gate: `npm run validate:sidecar-smoke`; desktop E2E real mode ends with `Preflight envio` through the packaged app.

## Limits

- The gate never calls AEAT. Real mTLS acceptance is proven only with `tools/homolog-verifactu.mjs --enviar` against `SistemaVerifactuPruebas` and the redacted external acceptance manifest.
- In v1 the certificate password comes from an environment variable and certificate expiry is not checked.
- The No VERI*FACTU mode (signed records kept without submission) is out of v1.
