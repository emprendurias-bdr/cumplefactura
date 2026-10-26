import { Plus, Trash2 } from "lucide-react";
import { useWorkspaceState } from "../../shared/context";
import { cents } from "../../shared/forms";
export function InvoiceEditor() {
  const {
    invoiceLines,
    invoiceTotals,
    selectedSeries,
    selectInvoiceSeries,
    seriesConfigs,
    updateInvoiceLine,
    removeInvoiceLine,
    addInvoiceLine,
    activeSeriesPreview,
  } = useWorkspaceState();
  return (
    <section className="panel invoiceEditor">
      <div className="editorTop">
        <div>
          <h2>Editor de factura</h2>
          <p>
            {invoiceLines.length} linea(s) - Base{" "}
            {cents(invoiceTotals.taxable_base_cents)} - Total{" "}
            {cents(invoiceTotals.total_cents)}
          </p>
        </div>
        <label className="fieldBlock">
          <span>Serie de esta factura</span>
          <select
            aria-label="Serie de esta factura"
            value={selectedSeries?.id ?? ""}
            onChange={(event) => void selectInvoiceSeries(event.target.value)}
            disabled={seriesConfigs.length === 0}
          >
            {seriesConfigs.length === 0 ? (
              <option value="">Sin series</option>
            ) : null}
            {seriesConfigs.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label} - {item.preview}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="lineTable" aria-label="Lineas de factura">
        <div className="lineHeader">
          <span>Descripcion</span>
          <span>Cant.</span>
          <span>Precio EUR</span>
          <span>Dto %</span>
          <span>IVA %</span>
          <span>IRPF %</span>
          <span />
        </div>
        {invoiceLines.map((line, index) => (
          <div className="lineRow" key={line.id}>
            <input
              aria-label={`Descripcion linea ${index + 1}`}
              value={line.description}
              onChange={(event) =>
                updateInvoiceLine(line.id, "description", event.target.value)
              }
            />
            <input
              aria-label={`Cantidad linea ${index + 1}`}
              type="number"
              min={1}
              step={1}
              value={line.quantity}
              onChange={(event) =>
                updateInvoiceLine(line.id, "quantity", event.target.value)
              }
            />
            <input
              aria-label={`Precio EUR linea ${index + 1}`}
              inputMode="decimal"
              value={line.unit_price_euros}
              onChange={(event) =>
                updateInvoiceLine(
                  line.id,
                  "unit_price_euros",
                  event.target.value,
                )
              }
            />
            <input
              aria-label={`Descuento linea ${index + 1}`}
              inputMode="decimal"
              value={line.discount_rate_percent}
              onChange={(event) =>
                updateInvoiceLine(
                  line.id,
                  "discount_rate_percent",
                  event.target.value,
                )
              }
            />
            <input
              aria-label={`IVA linea ${index + 1}`}
              inputMode="decimal"
              value={line.tax_rate_percent}
              onChange={(event) =>
                updateInvoiceLine(
                  line.id,
                  "tax_rate_percent",
                  event.target.value,
                )
              }
            />
            <input
              aria-label={`IRPF linea ${index + 1}`}
              inputMode="decimal"
              value={line.withholding_rate_percent}
              onChange={(event) =>
                updateInvoiceLine(
                  line.id,
                  "withholding_rate_percent",
                  event.target.value,
                )
              }
            />
            <button
              type="button"
              className="iconButton"
              aria-label={`Quitar linea ${index + 1}`}
              title={`Quitar linea ${index + 1}`}
              onClick={() => removeInvoiceLine(line.id)}
              disabled={invoiceLines.length === 1}
            >
              <Trash2 size={16} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
      <div className="editorFooter">
        <button type="button" className="linkButton" onClick={addInvoiceLine}>
          <Plus size={16} aria-hidden="true" />
          Añadir linea
        </button>
        <p>
          IVA {cents(invoiceTotals.tax_cents)} - IRPF{" "}
          {cents(invoiceTotals.withholding_cents)} - Numero{" "}
          {activeSeriesPreview}
        </p>
      </div>
    </section>
  );
}
