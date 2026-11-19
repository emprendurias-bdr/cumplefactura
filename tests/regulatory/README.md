# Regulatory tests — CumpleFactura

Origen matriz: documentación técnica AEAT / CumpleFactura (pre-MVP).

Specs de aceptación + fixtures + evidencia generada por `tools/`.

## Specs

| Spec | Prioridad |
|---|---|
| `invoice_numbering.spec.md` | P0 |
| `append_only.spec.md` | P0 |
| `hash_chain.spec.md` | P0 |
| `verifactu_xsd_contract.spec.md` | P1 |
| `rectification_flow.spec.md` | P1 |
| `territory_flags.spec.md` | P1 |
| `verifactu_sidecar_submission.spec.md` | P1 |
| `audit_export.spec.md` | P2 |

## Subcarpetas

- `fixtures/` — entradas versionadas
- `evidence/` — **generado** por el gate (no editar). Solo guarda los resúmenes `latest-*` y los registros de la última ejecución: el gate borra los anteriores al terminar.

Ejecutar: `npm run validate:regulatory` (u scripts individuales en `package.json`).
