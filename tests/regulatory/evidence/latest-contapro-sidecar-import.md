# CumpleFactura ContaPro sidecar import

- Generated: 2026-06-28T19:21:30.264Z
- Status: passed
- Source readiness: blocked
- Source gate: passed
- External call: false
- MVP importable: verifactu, sii
- Deferred: face, ticketbai

## Channels

| Channel | Status | MVP importable | Acceptance | Blockers |
|---|---|---:|---|---|
| verifactu | ready | yes | accepted/passed | none |
| sii | ready | yes | accepted/passed | none |
| face | blocked | no | missing/missing | face_acceptance_manifest_validated |
| ticketbai | blocked | no | missing/missing | ticketbai_sidecar_enable_real_ticketbai_submission_enabled, ticketbai_acceptance_manifest_validated |

## Deferred

- FACe remains blocked by external SP/certificate registration evidence.
- TicketBAI remains blocked by foral signing policy, software registration and acceptance evidence.

## Limits

- This import reads local redacted evidence only.
- It performs no AEAT, SII, FACe or foral network call.
- It imports no certificate, password, private key or raw fiscal payload.
- CumpleFactura remains local-first and fail-closed.
