// @ts-nocheck
import { FileCode2, FolderOpen, Plus, RefreshCw, Trash2 } from "lucide-react";
import { DataList, Pager } from "../components/lists";
import { cents, short } from "../lib/format";
import { PAGE_SIZE } from "../types";

export function FacturasSection(p: Record<string, any>) {
  return (
    <>
<section className="panel invoiceEditor">
                <div className="editorTop">
                  <div>
                    <h2>Editor de factura</h2>
                    <p>{p.invoiceLines.length} linea(s) - Base {p.cents(p.invoiceTotals.taxable_base_cents)} - Total {p.cents(p.invoiceTotals.total_cents)}</p>
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
                    <span>Descripcion</span>
                    <span>Cant.</span>
                    <span>Precio EUR</span>
                    <span>Dto %</span>
                    <span>IVA %</span>
                    <span>IRPF %</span>
                    <span />
                  </div>
                  {p.invoiceLines.map((line, index) => (
                    <div className="lineRow" key={line.id}>
                      <input
                        aria-label={`Descripcion linea ${index + 1}`}
                        value={line.description}
                        onChange={(event) => p.updateInvoiceLine(line.id, "description", event.target.value)} />
                      <input
                        aria-label={`Cantidad linea ${index + 1}`}
                        type="number"
                        min={1}
                        step={1}
                        value={line.quantity}
                        onChange={(event) => p.updateInvoiceLine(line.id, "quantity", event.target.value)} />
                      <input
                        aria-label={`Precio EUR linea ${index + 1}`}
                        inputMode="decimal"
                        value={line.unit_price_euros}
                        onChange={(event) => p.updateInvoiceLine(line.id, "unit_price_euros", event.target.value)} />
                      <input
                        aria-label={`Descuento linea ${index + 1}`}
                        inputMode="decimal"
                        value={line.discount_rate_percent}
                        onChange={(event) => p.updateInvoiceLine(line.id, "discount_rate_percent", event.target.value)} />
                      <input
                        aria-label={`IVA linea ${index + 1}`}
                        inputMode="decimal"
                        value={line.tax_rate_percent}
                        onChange={(event) => p.updateInvoiceLine(line.id, "tax_rate_percent", event.target.value)} />
                      <input
                        aria-label={`IRPF linea ${index + 1}`}
                        inputMode="decimal"
                        value={line.withholding_rate_percent}
                        onChange={(event) => p.updateInvoiceLine(line.id, "withholding_rate_percent", event.target.value)} />
                      <button
                        type="button"
                        className="iconButton"
                        aria-label={`Quitar linea ${index + 1}`}
                        title={`Quitar linea ${index + 1}`}
                        onClick={() => p.removeInvoiceLine(line.id)}
                        disabled={p.invoiceLines.length === 1}
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="editorFooter">
                  <button type="button" className="linkButton" onClick={p.addInvoiceLine}>
                    <Plus size={16} aria-hidden="true" />
                    Añadir linea
                  </button>
                  <p>IVA {p.cents(p.invoiceTotals.tax_cents)} - IRPF {p.cents(p.invoiceTotals.withholding_cents)} - Numero {p.activeSeriesPreview}</p>
                </div>
              </section>
<section className="panel flow">
                <form onSubmit={p.createDraft}>
                  <h2>1. Borrador</h2>
                  <p>{p.draft ? `${p.draft.series} - ${p.cents(p.draft.totals.total_cents)}` : `${p.invoiceLines.length} linea(s) - ${p.cents(p.invoiceTotals.total_cents)}`}</p>
                  <button className="primary" disabled={!p.canDraft}>Crear borrador</button>
                </form>
                <form onSubmit={p.issueInvoice}>
                  <h2>2. Emision</h2>
                  <p>{p.issued ? `Hash ${p.short(p.issued.fiscal_hash)}` : `Numero ${p.activeSeriesPreview} (${p.numberPreview?.source ?? "secuencia Rust"})`}</p>
                  <button className="primary" disabled={!p.canIssue}>Emitir factura</button>
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
                      {["R1", "R2", "R3", "R4", "R5"].map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                    <select value={p.rectificationMethod} onChange={(event) => p.setRectificationMethod(event.target.value)}>
                      <option value="I">I</option>
                      <option value="S">S</option>
                    </select>
                  </div>
                  <button type="button" onClick={() => void p.adviseRectification()} disabled={!p.canRectify}>Sugerir</button>
                  <p>{p.rectificationAdvice ? `${p.rectificationAdvice.reason_code}/${p.rectificationAdvice.method} - ${p.rectificationAdvice.confidence}` : "Selector tecnico R1-R5/I-S."}</p>
                  <button className="primary" disabled={!p.canRectify}>Emitir rectificativa</button>
                </form>
              </section>
<section className="panel invoiceFilters" aria-label="Buscar facturas">
                <div className="editorTop">
                  <div>
                    <h2>Buscar facturas</h2>
                    <p>{p.invoices.length} resultado(s) con filtros actuales.</p>
                  </div>
                  <button type="button" className="linkButton" onClick={p.clearInvoiceFilters}>Limpiar filtros</button>
                </div>
                <form className="filterForm" onSubmit={p.searchInvoices}>
                  <label className="fieldBlock">
                    <span>Texto</span>
                    <input aria-label="Buscar texto factura" value={p.invoiceSearch} onChange={(event) => p.setInvoiceSearch(event.target.value)} placeholder="serie, numero, cliente, NIF, hash" />
                  </label>
                  <label className="fieldBlock">
                    <span>Empresa</span>
                    <select aria-label="Filtro empresa factura" value={p.invoiceCompanyFilter} onChange={(event) => p.setInvoiceCompanyFilter(event.target.value)}>
                      <option value="">Todas</option>
                      {p.companies.map((item) => <option key={item.id} value={item.id}>{item.legal_name}</option>)}
                    </select>
                  </label>
                  <label className="fieldBlock">
                    <span>Cliente</span>
                    <select aria-label="Filtro cliente factura" value={p.invoiceCustomerFilter} onChange={(event) => p.setInvoiceCustomerFilter(event.target.value)}>
                      <option value="">Todos</option>
                      {p.customers.map((item) => <option key={item.id} value={item.id}>{item.display_name}</option>)}
                    </select>
                  </label>
                  <label className="fieldBlock">
                    <span>Año</span>
                    <input aria-label="Filtro año factura" inputMode="numeric" value={p.invoiceYearFilter} onChange={(event) => p.setInvoiceYearFilter(event.target.value)} placeholder="2026" />
                  </label>
                  <label className="fieldBlock">
                    <span>Serie</span>
                    <input aria-label="Filtro serie factura" value={p.invoiceSeriesFilter} onChange={(event) => p.setInvoiceSeriesFilter(event.target.value.toUpperCase())} placeholder="A, AL, VENDI2026" />
                  </label>
                  <label className="fieldBlock">
                    <span>Estado</span>
                    <select aria-label="Filtro estado factura" value={p.invoiceStatusFilter} onChange={(event) => p.setInvoiceStatusFilter(event.target.value)}>
                      <option value="">Todos</option>
                      <option value="Draft">Draft</option>
                      <option value="Issued">Issued</option>
                      <option value="Void">Void</option>
                      <option value="Rectified">Rectified</option>
                    </select>
                  </label>
                  <label className="fieldBlock">
                    <span>Tipo</span>
                    <select aria-label="Filtro tipo factura" value={p.invoiceKindFilter} onChange={(event) => p.setInvoiceKindFilter(event.target.value)}>
                      <option value="">Todos</option>
                      <option value="Complete">Complete</option>
                      <option value="Simplified">Simplified</option>
                      <option value="Rectifying">Rectifying</option>
                    </select>
                  </label>
                  <button className="primary">Buscar facturas</button>
                </form>
              </section>
<section className="panel lists">
<DataList
                  title="Facturas"
                  empty="Sin facturas"
                  rows={p.invoices.map((item) => `${item.series}-${item.number ?? "BOR"} - ${item.kind} - ${item.status} - ${p.cents(item.total_cents)} - ${p.short(item.fiscal_hash)}`)}
                  footer={<Pager regionLabel="Pagina facturas" prevLabel="Anterior facturas" nextLabel="Siguiente facturas" page={p.invoicePage} hasNext={p.invoices.length === p.PAGE_SIZE} onPrev={() => void p.changeInvoicePage(p.invoicePage - 1)} onNext={() => void p.changeInvoicePage(p.invoicePage + 1)} />} />
                
</section>
<section className="panel split"><div>
<h2>PDF factura</h2>
              <form className="backupForm pathForm" onSubmit={p.exportPdf}>
                <input aria-label="Ruta PDF factura" value={p.pdfPath} readOnly />
                <button type="button" className="linkButton" onClick={() => void p.pickSavePath("PDF factura", p.pdfPath, ["pdf"], p.setPdfPath)}>
                  <FolderOpen size={16} aria-hidden="true" />
                  Elegir PDF
                </button>
                <button className="primary" disabled={!p.draft && p.invoices.length === 0}>Exportar PDF</button>
              </form>
              <p>{p.pdfResult ? `PDF creado - ${p.pdfResult}` : "Exporta la factura/borrador seleccionado."}</p>
<h2>JSON factura</h2>
              <form className="backupForm pathForm" onSubmit={p.exportJson}>
                <input aria-label="Ruta JSON factura" value={p.jsonPath} readOnly />
                <button type="button" className="linkButton" onClick={() => void p.pickSavePath("JSON factura", p.jsonPath, ["json"], p.setJsonPath)}>
                  <FolderOpen size={16} aria-hidden="true" />
                  Elegir JSON
                </button>
                <button className="primary" disabled={!p.draft && p.invoices.length === 0}>Exportar JSON</button>
              </form>
              <p>{p.jsonResult ? `${p.jsonResult.status} - ${p.jsonResult.target_path}` : "Exporta datos de factura a JSON local."}</p>
<h2>CSV facturas</h2>
              <form className="backupForm pathForm" onSubmit={p.exportCsv}>
                <input aria-label="Ruta CSV facturas" value={p.csvPath} readOnly />
                <button type="button" className="linkButton" onClick={() => void p.pickSavePath("CSV facturas", p.csvPath, ["csv"], p.setCsvPath)}>
                  <FolderOpen size={16} aria-hidden="true" />
                  Elegir CSV
                </button>
                <button className="primary" disabled={p.invoices.length === 0}>Exportar CSV</button>
              </form>
              <p>{p.csvResult ? `${p.csvResult.status} - ${p.csvResult.target_path}` : "Exporta listado local de facturas; filtros en contrato MVP."}</p>
</div></section>
    
    </>
  );
}
