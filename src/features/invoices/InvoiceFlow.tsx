import { useWorkspaceState } from "../../shared/context";
import { cents, short } from "../../shared/forms";
export function InvoiceFlow() {
  const {
    createDraft,
    draft,
    invoiceLines,
    invoiceTotals,
    canDraft,
    issueInvoice,
    issued,
    activeSeriesPreview,
    numberPreview,
    canIssue,
    issueRectifyingInvoice,
    rectifiableInvoice,
    rectificationScenario,
    setRectificationScenario,
    rectificationReason,
    setRectificationReason,
    rectificationMethod,
    setRectificationMethod,
    adviseRectification,
    canRectify,
    rectificationAdvice,
  } = useWorkspaceState();
  return (
    <section className="panel flow">
      <form onSubmit={createDraft}>
        <h2>1. Borrador</h2>
        <p>
          {draft
            ? `${draft.series} - ${cents(draft.totals.total_cents)}`
            : `${invoiceLines.length} linea(s) - ${cents(invoiceTotals.total_cents)}`}
        </p>
        <button className="primary" disabled={!canDraft}>
          Crear borrador
        </button>
      </form>
      <form onSubmit={issueInvoice}>
        <h2>2. Emision</h2>
        <p>
          {issued
            ? `Hash ${short(issued.fiscal_hash)}`
            : `Numero ${activeSeriesPreview} (${numberPreview?.source ?? "secuencia Rust"})`}
        </p>
        <button className="primary" disabled={!canIssue}>
          Emitir factura
        </button>
      </form>
      <form onSubmit={issueRectifyingInvoice}>
        <h2>3. Rectificativa</h2>
        <p>
          {rectifiableInvoice
            ? `${rectifiableInvoice.series}-${rectifiableInvoice.number}`
            : "Sin factura emitida"}
        </p>
        <div className="miniControls">
          <label className="fieldLabel">
            Qué ha ocurrido
            <select
              value={rectificationScenario}
              onChange={(event) => setRectificationScenario(event.target.value)}
            >
              <option value="Article80OneTwoOrLegalError">
                80.1/80.2/error
              </option>
              <option value="Article80Three">80.3</option>
              <option value="Article80Four">80.4</option>
              <option value="Other">Resto</option>
              <option value="SimplifiedInvoice">Simplificada</option>
            </select>
          </label>
          <label className="fieldLabel">
            Causa de rectificación
            <select
              value={rectificationReason}
              onChange={(event) => setRectificationReason(event.target.value)}
            >
              {["R1", "R2", "R3", "R4", "R5"].map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="fieldLabel">
            Método de rectificación
            <select
              value={rectificationMethod}
              onChange={(event) => setRectificationMethod(event.target.value)}
            >
              <option value="I">I</option>
              <option value="S">S</option>
            </select>
          </label>
        </div>
        <button
          type="button"
          onClick={() => void adviseRectification()}
          disabled={!canRectify}
        >
          Sugerir
        </button>
        <p>
          {rectificationAdvice
            ? `${rectificationAdvice.reason_code}/${rectificationAdvice.method} - ${rectificationAdvice.confidence}`
            : "Selector tecnico R1-R5/I-S."}
        </p>
        <button className="primary" disabled={!canRectify}>
          Emitir rectificativa
        </button>
      </form>
    </section>
  );
}
