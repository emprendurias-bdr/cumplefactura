# CumpleFactura ContaPro sidecar import

- Generated: 2026-10-28T10:48:12.200Z
- Status: missing_source_evidence
- Source readiness: missing
- Source gate: missing
- External call: false
- MVP importable: none
- Deferred: verifactu, sii, face, ticketbai

## Channels

| Channel | Status | MVP importable | Acceptance | Blockers |
|---|---|---:|---|---|
| verifactu | missing | no | missing/missing | none |
| sii | missing | no | missing/missing | none |
| face | missing | no | missing/missing | none |
| ticketbai | missing | no | missing/missing | none |

## Deferred

- FACe remains blocked by external SP/certificate registration evidence.
- TicketBAI remains blocked by foral signing policy, software registration and acceptance evidence.

## Limits

- This import reads local redacted evidence only.
- It performs no AEAT, SII, FACe or foral network call.
- It imports no certificate, password, private key or raw fiscal payload.
- CumpleFactura remains local-first and fail-closed.
