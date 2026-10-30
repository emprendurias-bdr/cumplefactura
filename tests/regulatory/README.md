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
| `xades_sidecar_preflight.spec.md` | P1 |
| `audit_export.spec.md` | P2 |

## Subcarpetas

- `fixtures/` — entradas versionadas
- `evidence/` — **generado** por el gate (no editar)

Ejecutar: `npm run validate:regulatory` (u scripts individuales en `package.json`).
