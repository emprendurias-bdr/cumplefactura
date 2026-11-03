/** Facturas: editor de líneas, borrador/emisión/rectificativa, búsqueda y exportaciones. */
import { PathForm } from "../components/forms";
import { Icon } from "../components/Icon";
import { DataList, Pager } from "../components/lists";
import { cents, short } from "../lib/format";
import { PAGE_SIZE, type InvoiceLineForm } from "../types";
import type { Model } from "../useCumpleFactura";

const lineColumns: { key: Exclude<keyof InvoiceLineForm, "id">; header: string; aria: string; number?: boolean }[] = [
  { key: "description", header: "Descripcion", aria: "Descripcion linea" },
  { key: "quantity", header: "Cant.", aria: "Cantidad linea", number: true },
  { key: "unit_price_euros", header: "Precio EUR", aria: "Precio EUR linea" },
  { key: "discount_rate_percent", header: "Dto %", aria: "Descuento linea" },
  { key: "tax_rate_percent", header: "IVA %", aria: "IVA linea" },
  { key: "withholding_rate_percent", header: "IRPF %", aria: "IRPF linea" },
];

const statusOptions = ["Draft", "Issued", "Void", "Rectified"];
const kindOptions = ["Complete", "Simplified", "Rectifying"];

export function FacturasSection(p: Model) {
  const hasInvoice = Boolean(p.draft) || p.invoices.length > 0;

  return (
    <>
      <section className="panel invoiceEditor">
        <div className="editorTop">
          <div>
            <h2>Editor de factura</h2>
            <p>
              {p.invoiceLines.length} linea(s) - Base {cents(p.invoiceTotals.taxable_base_cents)} - Total {cents(p.invoiceTotals.total_cents)}
            </p>
          </div>
          <label className="fieldBlock">
            <span>Serie de esta factura</span>
            <select
              aria-label="Serie de esta factura"
              value={p.selectedSeries?.id ?? ""}
              onChange={(event) => void p.selectInvoiceSeries(event.target.value)}
              disabled={p.seriesConfigs.length === 0}
            >
              {p.seriesConfigs.length === 0 ? <option value="">Sin series</option> : null}
              {p.seriesConfigs.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label} - {item.preview}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="lineTable" aria-label="Lineas de factura">
          <div className="lineHeader">
            {lineColumns.map((column) => (
              <span key={column.key}>{column.header}</span>
            ))}
            <span />
          </div>
          {p.invoiceLines.map((line, index) => (
            <div className="lineRow" key={line.id}>
              {lineColumns.map((column) => (
                <input
                  key={column.key}
                  aria-label={`${column.aria} ${index + 1}`}
                  type={column.number ? "number" : undefined}
                  min={column.number ? 1 : undefined}
                  step={column.number ? 1 : undefined}
                  inputMode={column.number || column.key === "description" ? undefined : "decimal"}
                  value={line[column.key]}
                  onChange={(event) => p.updateInvoiceLine(line.id, column.key, event.target.value)}
                />
              ))}
              <button
                type="button"
                className="iconButton"
                aria-label={`Quitar linea ${index + 1}`}
                title={`Quitar linea ${index + 1}`}
                onClick={() => p.removeInvoiceLine(line.id)}
                disabled={p.invoiceLines.length === 1}
              >
                <Icon name="trash" />
              </button>
            </div>
          ))}
        </div>
        <div className="editorFooter">
          <button type="button" className="linkButton" onClick={p.addInvoiceLine}>
            <Icon name="plus" />
            Añadir linea
          </button>
          <p>
            IVA {cents(p.invoiceTotals.tax_cents)} - IRPF {cents(p.invoiceTotals.withholding_cents)} - Numero {p.activeSeriesPreview}
          </p>
        </div>
      </section>

      <section className="panel flow">
        <form onSubmit={p.createDraft}>
          <h2>1. Borrador</h2>
          <p>
            {p.draft
              ? `${p.draft.series} - ${cents(p.draft.totals.total_cents)}`
              : `${p.invoiceLines.length} linea(s) - ${cents(p.invoiceTotals.total_cents)}`}
          </p>
          <button className="primary" disabled={!p.canDraft}>
            Crear borrador
          </button>
        </form>
        <form onSubmit={p.issueInvoice}>
          <h2>2. Emision</h2>
          <p>
            {p.issued
              ? `Hash ${short(p.issued.fiscal_hash)}`
              : `Numero ${p.activeSeriesPreview} (${p.numberPreview?.source ?? "secuencia Rust"})`}
          </p>
          <button className="primary" disabled={!p.canIssue}>
            Emitir factura
          </button>
        </form>
        <form onSubmit={p.issueRectifyingInvoice}>
          <h2>3. Rectificativa</h2>
          <p>{p.rectifiableInvoice ? `${p.rectifiableInvoice.series}-${p.rectifiableInvoice.number}` : "Sin factura emitida"}</p>
          <div className="miniControls">
            <select value={p.rectificationScenario} onChange={(event) => p.setRectificationScenario(event.target.value)}>
              <option value="Article80OneTwoOrLegalError">80.1/80.2/error</option>
              <option value="Article80Three">80.3</option>
              <option value="Article80Four">80.4</option>
              <option value="Other">Resto</option>
              <option value="SimplifiedInvoice">Simplificada</option>
            </select>
            <select value={p.rectificationReason} onChange={(event) => p.setRectificationReason(event.target.value)}>
              {["R1", "R2", "R3", "R4", "R5"].map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <select value={p.rectificationMethod} onChange={(event) => p.setRectificationMethod(event.target.value)}>
              <option value="I">I</option>
              <option value="S">S</option>
            </select>
          </div>
          <button type="button" onClick={() => void p.adviseRectification()} disabled={!p.canRectify}>
            Sugerir
          </button>
          <p>
            {p.rectificationAdvice
              ? `${p.rectificationAdvice.reason_code}/${p.rectificationAdvice.method} - ${p.rectificationAdvice.confidence}`
              : "Selector tecnico R1-R5/I-S."}
          </p>
          <button className="primary" disabled={!p.canRectify}>
            Emitir rectificativa
          </button>
        </form>
      </section>

      <section className="panel invoiceFilters" aria-label="Buscar facturas">
        <div className="editorTop">
          <div>
            <h2>Buscar facturas</h2>
            <p>{p.invoices.length} resultado(s) con filtros actuales.</p>
          </div>
          <button type="button" className="linkButton" onClick={p.clearInvoiceFilters}>
            Limpiar filtros
          </button>
        </div>
        <form className="filterForm" onSubmit={p.searchInvoices}>
          <label className="fieldBlock">
            <span>Texto</span>
            <input
              aria-label="Buscar texto factura"
              value={p.filters.search}
              onChange={(event) => p.updateFilter("search", event.target.value)}
              placeholder="serie, numero, cliente, NIF, hash"
            />
          </label>
          <label className="fieldBlock">
            <span>Empresa</span>
            <select aria-label="Filtro empresa factura" value={p.filters.company_id} onChange={(event) => p.updateFilter("company_id", event.target.value)}>
              <option value="">Todas</option>
              {p.companies.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.legal_name}
                </option>
              ))}
            </select>
          </label>
          <label className="fieldBlock">
            <span>Cliente</span>
            <select aria-label="Filtro cliente factura" value={p.filters.customer_id} onChange={(event) => p.updateFilter("customer_id", event.target.value)}>
              <option value="">Todos</option>
              {p.customers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.display_name}
                </option>
              ))}
            </select>
          </label>
          <label className="fieldBlock">
            <span>Año</span>
            <input
              aria-label="Filtro año factura"
              inputMode="numeric"
              value={p.filters.fiscal_year}
              onChange={(event) => p.updateFilter("fiscal_year", event.target.value)}
              placeholder="2026"
            />
          </label>
          <label className="fieldBlock">
            <span>Serie</span>
            <input
              aria-label="Filtro serie factura"
              value={p.filters.series}
              onChange={(event) => p.updateFilter("series", event.target.value.toUpperCase())}
              placeholder="A, AL, VENDI2026"
            />
          </label>
          <label className="fieldBlock">
            <span>Estado</span>
            <select aria-label="Filtro estado factura" value={p.filters.status} onChange={(event) => p.updateFilter("status", event.target.value)}>
              <option value="">Todos</option>
              {statusOptions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="fieldBlock">
            <span>Tipo</span>
            <select aria-label="Filtro tipo factura" value={p.filters.kind} onChange={(event) => p.updateFilter("kind", event.target.value)}>
              <option value="">Todos</option>
              {kindOptions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <button className="primary">Buscar facturas</button>
        </form>
      </section>

      <section className="panel lists">
        <DataList
          title="Facturas"
          empty="Sin facturas"
          rows={p.invoices.map(
            (item) =>
              `${item.series}-${item.number ?? "BOR"} - ${item.kind} - ${item.status} - ${cents(item.total_cents)} - ${short(item.fiscal_hash)}`,
          )}
          footer={
            <Pager
              regionLabel="Pagina facturas"
              prevLabel="Anterior facturas"
              nextLabel="Siguiente facturas"
              page={p.pages.invoice}
              hasNext={p.invoices.length === PAGE_SIZE}
              onPrev={() => void p.changePage("invoice", p.pages.invoice - 1)}
              onNext={() => void p.changePage("invoice", p.pages.invoice + 1)}
            />
          }
        />
      </section>

      <section className="panel split">
        <div>
          <h2>PDF factura</h2>
          <PathForm
            p={p}
            pathKey="pdf"
            title="PDF factura"
            extensions={["pdf"]}
            aria="Ruta PDF factura"
            pickLabel="Elegir PDF"
            submitLabel="Exportar PDF"
            onSubmit={p.exportPdf}
            disabled={!hasInvoice}
            result={p.pdfResult ? `PDF creado - ${p.pdfResult}` : "Exporta la factura/borrador seleccionado."}
          />
          <h2>JSON factura</h2>
          <PathForm
            p={p}
            pathKey="json"
            title="JSON factura"
            extensions={["json"]}
            aria="Ruta JSON factura"
            pickLabel="Elegir JSON"
            submitLabel="Exportar JSON"
            onSubmit={p.exportJson}
            disabled={!hasInvoice}
            result={p.jsonResult ? `${p.jsonResult.status} - ${p.jsonResult.target_path}` : "Exporta datos de factura a JSON local."}
          />
          <h2>CSV facturas</h2>
          <PathForm
            p={p}
            pathKey="csv"
            title="CSV facturas"
            extensions={["csv"]}
            aria="Ruta CSV facturas"
            pickLabel="Elegir CSV"
            submitLabel="Exportar CSV"
            onSubmit={p.exportCsv}
            disabled={p.invoices.length === 0}
            result={p.csvResult ? `${p.csvResult.status} - ${p.csvResult.target_path}` : "Exporta listado local de facturas; filtros en contrato MVP."}
          />
        </div>
      </section>
    </>
  );
}
