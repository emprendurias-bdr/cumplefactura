# `sections/` — Pantallas

Cada pantalla recibe `Ctx` (`ctx.ts`: un hook por dominio y la ruta) y solo pinta; no llama a Rust.

| Ruta | Pantalla |
|---|---|
| `#/facturas` | `FacturasSection`: lista, filtros, columna Verifactu de 5 pasos |
| `#/facturas/nueva`, `#/facturas/:id/editar` | `FacturaEditor`: editor partido (nuevo o cualquier borrador, `invoice_get` + `invoice_draft_update`), observaciones, líneas pendientes de precio y confirmación de emisión |
| `#/facturas/:id` | `FacturaDetalle`: pasos, desglose, observaciones, `CobrosCard` (cobros y vencimiento), vista previa y actividad |
| `#/facturas/:id/rectificar` | `RectificativaWizard`: 4 pasos |
| `#/documentos/<pestaña>[/:id]` | `DocumentosSection` + `DocumentoEditor` (F4) |
| `#/recurrentes[/:id]` | `RecurrentesSection` + `RecurrenteEditor` (F4) |
| `#/clientes[/:id]`, `#/productos[/:id]` | Lista + formulario lateral |
| `#/verifactu` | `VerifactuSection`, `VerifactuEnvio`, `VerifactuTecnico` |
| `#/ajustes/<x>` | `AjustesSection` y `ajustes/*` |
| (primer arranque) | `FirstRun` |
