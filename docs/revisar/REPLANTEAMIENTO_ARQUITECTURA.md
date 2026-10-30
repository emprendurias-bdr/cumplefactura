# Replanteamiento de arquitectura - CumpleFactura

Fecha: 2026-06-03  
Estado: diagnostico. No implica cambio de codigo.

## Resumen

CumpleFactura es la pieza mas alineada con local-first: Tauri 2, React, Rust y SQLite. Actualmente gestiona empresas, clientes, series, facturas, registros fiscales, auditoria append-only, PDF/XML, firma/envio preparado y sidecar.

Debe ser app independiente y modulo de facturacion dentro de la suite.

## Encaje en la suite modular

- Standalone: autonomo/microempresa puede trabajar localmente.
- Suite: una empresa ya existente en Suite Core activa CumpleFactura sin re-alta.
- Owner recomendado del dominio `invoicing`: emision, series, facturas, PDF/XML y registros VERI*FACTU locales.
- ContaPro consume eventos/facturas para contabilidad, libros e impuestos.

## Tablas locales actuales

- `companies`
- `customers`
- `invoice_sequences`
- `invoices`
- `invoice_lines`
- `invoice_territory_flags`
- `audit_events`
- `fiscal_exports`
- `invoice_series_configs`

## Datos comunes a reutilizar

- `tenants`
- `companies`
- `identity_users`
- `tenant_memberships`
- permisos por modulo
- `parties` para clientes/proveedores
- `audit_events`/`audit_evidence`
- `integration_connections` para sidecar/vault

## Cambios necesarios

- Mapear `companies.id` local a `suite_core.companies.id`.
- Definir alta offline y reconciliacion por NIF.
- Definir sync outbox/inbox.
- Definir estrategia de numeracion offline.
- Definir eventos `invoice.issued`, `invoice.voided`, `fiscal.export.prepared`, `fiscal.export.signed`.
- Evitar duplicar clientes/proveedores cuando exista `parties`.

## Riesgos

- conflictos de numeracion offline;
- facturas fiscales emitidas sin sincronizacion;
- divergencia entre factura local y asiento contable;
- sidecar/certificado no disponible;
- promesas regulatorias sin aceptacion externa.

## Checklist tecnico

- [ ] Crear `MODULE_CONTRACT.md` version suite.
- [ ] Definir sync protocol.
- [ ] Definir mapping local/global para empresas.
- [ ] Definir mapping local/global para terceros.
- [ ] Probar flujo empresa existente -> factura -> evento -> ContaPro.
- [ ] Mantener gate regulatorio.
- [ ] Decidir Tauri vs SwiftUI nativo.

