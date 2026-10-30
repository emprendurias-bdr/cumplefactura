# PRODUCT_BRIEF_CUMPLEFACTURA

## Resumen

CumpleFactura es una app desktop local-first para facturacion y cumplimiento fiscal espanol. Stack decidido: Tauri 2 + React + TypeScript + Rust + SQLite. Debe estar preparada para RRSIF/VERI*FACTU antes de julio de 2027.

## MVP

| Imprescindible | Nice-to-have | Fuera de scope v1 |
|---|---|---|
| Crear empresa/emisor | Multiempresa avanzada | ERP completo |
| Clientes y terceros | Import CSV | RRHH/nominas |
| Facturas emitidas | Facturas recurrentes | Contabilidad completa |
| Series y numeracion | Presupuestos/albaranes | SII completo si no aplica al target |
| IVA/IRPF basicos | Plantillas PDF editables | TicketBAI completo v1 salvo decision comercial |
| PDF factura | Email integrado | Portal cliente |
| SQLite local cifrable | Backup cloud opcional | SaaS multiusuario |
| Export JSON/CSV | Import Facturae | Inventario avanzado |
| Preparacion VERI*FACTU | API fiscal hibrida | BI complejo |
| Auditoria local append-only | Firma avanzada propia | Marketplace |

## Estructura Inicial Del Repo

```text
CumpleFactura/
  package.json
  src/
    app/
    components/
    features/
      invoices/
      customers/
      company/
      settings/
      fiscal/
    shared/
      api/
      types/
      ui/
  src-tauri/
    Cargo.toml
    tauri.conf.json
    src/
      main.rs
      commands/
        invoices.rs
        customers.rs
        company.rs
        fiscal.rs
        export.rs
      db/
        mod.rs
        migrations/
      domain/
        invoice.rs
        customer.rs
        tax.rs
      services/
        audit.rs
        pdf.rs
        fiscal_client.rs
  docs/
    PRODUCT_BRIEF_CUMPLEFACTURA.md
    MODULE_CONTRACT.md
```

## Contratos Frontend <-> Rust

| Comando Tauri | Entrada | Salida | Descripcion |
|---|---|---|---|
| `company_create` | `CompanyInput` | `Company` | Alta de emisor. |
| `customer_upsert` | `CustomerInput` | `Customer` | Crear/editar cliente. |
| `invoice_draft_create` | `InvoiceDraftInput` | `Invoice` | Crear borrador. |
| `invoice_issue` | `InvoiceIssueInput` | `IssuedInvoice` | Emitir, numerar, auditar. |
| `invoice_export_pdf` | `invoiceId` | `FilePath` | Generar PDF local. |
| `fiscal_prepare_verifactu` | `invoiceId` | `FiscalPayload` | Preparar payload para sidecar/API. |
| `backup_export` | `targetPath` | `BackupResult` | Export local cifrado. |

## Primer Sprint: 20 Issues Priorizados

| # | Prioridad | Ticket |
|---:|---|---|
| 1 | P0 | Crear repo Tauri 2 + React + TypeScript con plantilla minima. |
| 2 | P0 | Configurar SQLite desde Rust con migraciones versionadas. |
| 3 | P0 | Crear modelo `Company` y pantalla de alta de emisor. |
| 4 | P0 | Crear modelo `Customer` y CRUD basico. |
| 5 | P0 | Crear modelo `Invoice` con estados `draft`, `issued`, `void`. |
| 6 | P0 | Implementar numeracion por serie y ejercicio. |
| 7 | P0 | Crear pantalla de listado de facturas. |
| 8 | P0 | Crear editor de factura con lineas, IVA e IRPF. |
| 9 | P0 | Implementar comando `invoice_issue` con validacion minima. |
| 10 | P0 | Registrar auditoria local append-only al emitir factura. |
| 11 | P1 | Generar PDF basico de factura. |
| 12 | P1 | Exportar factura a JSON/CSV. |
| 13 | P1 | Crear configuracion fiscal basica: regimen, serie, IVA por defecto. |
| 14 | P1 | Disenar DTO `FiscalPayload` para VERI*FACTU/sidecar. |
| 15 | P1 | Implementar cliente placeholder hacia `contapro-sidecar`/API SaaS. |
| 16 | P1 | Crear backup local manual de SQLite. |
| 17 | P1 | Crear seed/demo local. |
| 18 | P2 | Anadir tests Rust para numeracion y emision. |
| 19 | P2 | Anadir tests UI para crear cliente y factura. |
| 20 | P2 | Documentar instalacion dev y limites MVP. |

## Reglas

- No meter logica fiscal critica solo en frontend.
- No depender de conexion para emitir borradores.
- No prometer VERI*FACTU real hasta tener pruebas y proveedor/sidecar operativo.
- No convertir v1 en ERP: facturacion local-first primero.
