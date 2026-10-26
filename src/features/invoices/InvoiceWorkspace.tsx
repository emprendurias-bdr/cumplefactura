import { Button, ConfirmDialog } from "@bdr/ui";
import { ArrowLeft, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useWorkspaceState } from "../../shared/context";
import { cents, eurosToCents } from "../../shared/forms";
import { numberProposal } from "../../shared/numberProposal";
import { InvoiceEditor } from "./InvoiceEditor";
import { InvoiceTable } from "./InvoiceTable";
import { InvoicePreview } from "./InvoicePreview";
import { RectificationWizard } from "./RectificationWizard";
export function InvoiceWorkspace() {
  const s = useWorkspaceState();
  const amountSafe = [
    ...Object.values(s.invoiceTotals),
    ...s.invoiceLines.map((line) => eurosToCents(line.unit_price_euros)),
    s.draft?.totals.total_cents ?? 0,
  ].every(Number.isSafeInteger);
  const proposed = numberProposal(s.numberPreview, {
    companyId: s.company?.id,
    series: s.activeSeries,
    fiscalYear: s.fiscalYear,
  });
  const [editing, setEditing] = useState(location.hash === "#/facturas/nueva");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const inFlight = useRef(false);
  const resultFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!confirm && (s.issued || uncertain)) resultFocus.current?.focus();
  }, [confirm, s.issued, uncertain]);
  const [rectifying, setRectifying] = useState(false);
  useEffect(() => {
    const change = () => setEditing(location.hash === "#/facturas/nueva");
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  const newInvoice = useCallback(() => {
    setUncertain(false);
    s.markInvoiceEditorDirty();
    location.hash = "/facturas/nueva";
    setEditing(true);
  }, [s.markInvoiceEditorDirty]);
  async function issue() {
    if (
      inFlight.current ||
      s.draftSaving ||
      !s.canIssue ||
      s.issued ||
      !amountSafe
    )
      return;
    inFlight.current = true;
    setBusy(true);
    try {
      await s.issueInvoice();
      setConfirm(false);
    } catch {
      setConfirm(false);
      setUncertain(true);
      s.setDraft(null);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  if (!editing) return <InvoiceTable onNew={newInvoice} />;
  return (
    <section className="phase2-screen" aria-label="Editor de factura">
      <a className="back-link" href="#/facturas">
        <ArrowLeft size={16} aria-hidden="true" />
        Volver a facturas
      </a>
      <header className="phase2-head">
        <div>
          <p className="eyebrow">Nueva factura · serie {s.activeSeries}</p>
          <h1>
            Factura para{" "}
            <span className="bdr-highlight">
              {s.customer?.display_name || "tu cliente"}
            </span>
          </h1>
        </div>
        <div className="phase2-actions">
          <form
            onSubmit={(event) => {
              void s.createDraft(event).catch(() => {});
            }}
          >
            <Button
              type="submit"
              variant="secondary"
              disabled={
                !s.canDraft ||
                s.draftSaving ||
                busy ||
                Boolean(s.issued) ||
                uncertain ||
                !amountSafe
              }
            >
              Crear borrador
            </Button>
          </form>
          <Button
            onClick={() => setConfirm(true)}
            disabled={
              !s.canIssue ||
              s.draftSaving ||
              busy ||
              Boolean(s.issued) ||
              !amountSafe
            }
          >
            Emitir factura
          </Button>
        </div>
      </header>
      {!amountSafe && (
        <p role="alert" className="phase2-info">
          Revisa los importes: este equipo no puede representarlos con
          precisión. No se enviarán al motor hasta que sean representables.
        </p>
      )}
      {uncertain && (
        <p
          role="alert"
          className="phase2-info"
          tabIndex={-1}
          ref={(node) => {
            resultFocus.current = node;
          }}
        >
          No hemos recibido confirmación de la emisión. Revisa la lista de
          facturas antes de intentar emitir de nuevo. No reintentamos
          automáticamente.
        </p>
      )}
      {s.issued ? (
        <div
          className="phase2-info"
          role="status"
          tabIndex={-1}
          ref={(node) => {
            resultFocus.current = node;
          }}
        >
          <strong>Factura emitida</strong> · {s.issued.invoice.series}-
          {s.issued.invoice.number}. El envío a la AEAT no está confirmado.{" "}
          <Button onClick={newInvoice} variant="secondary">
            <Plus size={16} />
            Nueva factura
          </Button>
        </div>
      ) : (
        <p role="status">
          {s.draft ? "Borrador persistido · " : ""}
          {s.status}
        </p>
      )}
      {(!s.company || !s.customer) && (
        <aside className="phase2-info">
          Antes de guardar, configura tu empresa y el cliente en{" "}
          <a href="#/clientes">Clientes</a>, y la serie en{" "}
          <a href="#/ajustes">Ajustes</a>.
        </aside>
      )}
      <div className="split-editor">
        <div className="editor-fields">
          <div className="editor-metadata">
            <label>
              Cliente
              <select
                aria-label="Cliente de la factura"
                value={s.customer?.id || ""}
                onChange={(e) => s.selectCustomer(e.target.value)}
                disabled={Boolean(s.issued) || s.draftSaving || busy}
              >
                <option value="">Elige un cliente</option>
                {s.customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.display_name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Fecha<span className="readonly-value">Se registra al emitir</span>
            </label>
          </div>
          <p className="number-proposal">
            {proposed ? (
              <>
                Se numerará <strong className="bdr-mono">{proposed}</strong> al
                emitir.
              </>
            ) : (
              <>
                El número definitivo se asignará al emitir; la previsión aún no
                está disponible.
              </>
            )}{" "}
            Mientras es borrador no tiene número.
          </p>
          <fieldset
            className="editor-fieldset"
            disabled={Boolean(s.issued) || busy || s.draftSaving}
          >
            <legend className="sr-only">Líneas y serie de la factura</legend>
            <InvoiceEditor />
          </fieldset>
          <dl className="invoice-totals">
            <dt>Base imponible</dt>
            <dd>{cents(s.invoiceTotals.taxable_base_cents)}</dd>
            <dt>IVA</dt>
            <dd>{cents(s.invoiceTotals.tax_cents)}</dd>
            <dt>IRPF</dt>
            <dd>{cents(s.invoiceTotals.withholding_cents)}</dd>
            <dt>Total provisional</dt>
            <dd>{cents(s.invoiceTotals.total_cents)}</dd>
          </dl>
          <Button
            variant="secondary"
            onClick={() => setRectifying((v) => !v)}
            aria-expanded={rectifying}
          >
            Rectificativa (abono)
          </Button>
          {rectifying && (
            <div className="rectification-panel">
              <p>
                La causa jurídica la decides tú. Las propuestas R1–R5 y el
                método son sugerencias.
              </p>
              <RectificationWizard />
            </div>
          )}
        </div>
        <InvoicePreview />
      </div>
      <ConfirmDialog
        open={confirm}
        title={`Emitir factura ${proposed ?? "(número por asignar)"}`}
        confirmLabel={`Emitir factura ${proposed ?? "(número por asignar)"}`}
        busy={busy}
        onCancel={() => setConfirm(false)}
        onConfirm={() => void issue()}
        consequences={[
          `Importe provisional: ${cents(s.invoiceTotals.total_cents)} a ${s.customer?.display_name || "tu cliente"}. Rust confirma el importe final.`,
          "Se asigna el número definitivo y se crea la huella y el registro de alta encadenado.",
          "Esta versión no tiene envío automático ni cola operativa. Emitir no implica haber enviado ni presentado el registro a la AEAT.",
          "Después no podrás editar la factura emitida. Para corregirla tendrás que rectificarla; la emisión es irreversible.",
        ]}
      />
    </section>
  );
}
