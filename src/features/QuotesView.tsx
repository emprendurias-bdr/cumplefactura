import { invoke } from "@tauri-apps/api/core";
import { FileOutput } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import {
  attempt,
  CustomerOption,
  DraftInput,
  draftToLineForms,
  emptyLine,
  euros,
  LineForm,
  lineFormsToDraft,
  LinesEditor,
  Runner,
  SeriesOption,
  shortDate,
  StatusBadge,
} from "./shared";

type QuoteStatus = "draft" | "sent" | "accepted" | "rejected" | "invoiced";

type Quote = {
  id: string;
  code: string;
  customer_id: string;
  status: QuoteStatus;
  valid_until?: string | null;
  notes: string;
  total_cents: number;
  invoice_id?: string | null;
  created_at: string;
  draft: DraftInput;
};

const STATUS: Record<QuoteStatus, { text: string; tone: "muted" | "accent" | "ok" | "danger" | "warn" }> = {
  draft: { text: "Borrador", tone: "muted" },
  sent: { text: "Enviado", tone: "accent" },
  accepted: { text: "Aceptado", tone: "ok" },
  rejected: { text: "Rechazado", tone: "danger" },
  invoiced: { text: "Facturado", tone: "warn" },
};

export function QuotesView({
  companyId,
  customers,
  series,
  territoryFlags,
  run,
  onInvoiced,
}: {
  companyId?: string;
  customers: CustomerOption[];
  series: SeriesOption[];
  territoryFlags: string[];
  run: Runner;
  onInvoiced: () => void;
}) {
  const [items, setItems] = useState<Quote[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [seriesCode, setSeriesCode] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineForm[]>([emptyLine()]);
  const [notice, setNotice] = useState("");

  async function load() {
    const result = await attempt(run, "Presupuestos", () => invoke<Quote[]>("quote_list", { companyId: companyId ?? null }));
    if (result) setItems(result);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  useEffect(() => {
    if (!seriesCode && series[0]) setSeriesCode(series[0].resolved_series);
  }, [series, seriesCode]);

  function reset() {
    setEditingId(null);
    setCustomerId("");
    setValidUntil("");
    setNotes("");
    setLines([emptyLine()]);
  }

  function edit(quote: Quote) {
    if (quote.status !== "draft") return;
    setEditingId(quote.id);
    setCustomerId(quote.customer_id);
    setSeriesCode(quote.draft.series);
    setValidUntil(quote.valid_until ?? "");
    setNotes(quote.notes);
    setLines(draftToLineForms(quote.draft.lines));
  }

  const draftLines = lineFormsToDraft(lines);
  const canSave = Boolean(companyId && customerId && seriesCode && draftLines);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!companyId || !draftLines) return;
    const draft: DraftInput = {
      company_id: companyId,
      customer_id: customerId,
      fiscal_year: new Date().getFullYear(),
      series: seriesCode,
      number: null,
      kind: "Complete",
      territory_flags: territoryFlags,
      lines: draftLines,
      rectifies_invoice_id: null,
      rectification_reason_code: null,
      rectification_method: null,
    };
    const saved = await attempt(run, "Guardar presupuesto", () =>
      invoke<Quote>("quote_upsert", { input: { id: editingId, valid_until: validUntil || null, notes, draft } }),
    );
    if (saved) {
      setNotice(`Presupuesto ${saved.code} guardado.`);
      reset();
      await load();
    }
  }

  async function setStatus(quote: Quote, status: QuoteStatus) {
    const ok = await attempt(run, `Presupuesto ${STATUS[status].text.toLowerCase()}`, () => invoke("quote_set_status", { id: quote.id, status }).then(() => true));
    if (ok) await load();
  }

  async function convert(quote: Quote) {
    const invoice = await attempt(run, "Convertir en factura", () => invoke<{ id: string }>("quote_convert", { id: quote.id }));
    if (invoice) {
      setNotice(`${quote.code} convertido en borrador de factura. Emitelo desde Facturas.`);
      await load();
      onInvoiced();
    }
  }

  return (
    <>
      <section className="panel" aria-label="Listado de presupuestos">
        <div className="editorTop">
          <div>
            <h2>Presupuestos</h2>
            <p>Al aceptarse se convierten en borrador de factura con un clic, sin volver a teclear lineas.</p>
          </div>
        </div>
        {notice ? <p className="noticeLine">{notice}</p> : null}
        {items.length === 0 ? (
          <p className="emptyState">Sin presupuestos todavia.</p>
        ) : (
          <div className="tableWrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Numero</th>
                  <th>Cliente</th>
                  <th>Valido hasta</th>
                  <th className="num">Total</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {items.map((quote) => (
                  <tr key={quote.id}>
                    <td>
                      {quote.status === "draft" ? (
                        <button type="button" className="rowLink" onClick={() => edit(quote)}>
                          {quote.code}
                        </button>
                      ) : (
                        quote.code
                      )}
                    </td>
                    <td>{customers.find((c) => c.id === quote.customer_id)?.display_name ?? "-"}</td>
                    <td>{shortDate(quote.valid_until)}</td>
                    <td className="num">{euros(quote.total_cents)}</td>
                    <td>
                      <StatusBadge tone={STATUS[quote.status].tone}>{STATUS[quote.status].text}</StatusBadge>
                    </td>
                    <td className="rowActions">
                      {quote.status === "draft" ? (
                        <button type="button" className="linkButton small" onClick={() => void setStatus(quote, "sent")}>
                          Marcar enviado
                        </button>
                      ) : null}
                      {quote.status === "draft" || quote.status === "sent" ? (
                        <>
                          <button type="button" className="linkButton small" onClick={() => void setStatus(quote, "accepted")}>
                            Aceptar
                          </button>
                          <button type="button" className="linkButton small" onClick={() => void setStatus(quote, "rejected")}>
                            Rechazar
                          </button>
                        </>
                      ) : null}
                      {quote.status === "rejected" ? (
                        <button type="button" className="linkButton small" onClick={() => void setStatus(quote, "draft")}>
                          Reabrir
                        </button>
                      ) : null}
                      {quote.status === "draft" || quote.status === "sent" || quote.status === "accepted" ? (
                        <button type="button" className="primary small" onClick={() => void convert(quote)}>
                          <FileOutput size={14} aria-hidden="true" />
                          Convertir en factura
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel" aria-label="Editar presupuesto">
        <form className="stackForm" onSubmit={save}>
          <div className="formTitle">
            <h2>{editingId ? "Editar presupuesto" : "Nuevo presupuesto"}</h2>
            {editingId ? (
              <button type="button" className="linkButton" onClick={reset}>
                Nuevo presupuesto
              </button>
            ) : null}
          </div>
          <div className="formGrid four">
            <label className="fieldBlock">
              <span>Cliente</span>
              <select aria-label="Cliente presupuesto" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="">Selecciona cliente</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.display_name} - {c.tax_id}
                  </option>
                ))}
              </select>
            </label>
            <label className="fieldBlock">
              <span>Serie al facturar</span>
              <select aria-label="Serie presupuesto" value={seriesCode} onChange={(e) => setSeriesCode(e.target.value)}>
                {series.length === 0 ? <option value="">Sin series</option> : null}
                {series.map((s) => (
                  <option key={s.id} value={s.resolved_series}>
                    {s.label} - {s.preview}
                  </option>
                ))}
              </select>
            </label>
            <label className="fieldBlock">
              <span>Valido hasta</span>
              <input aria-label="Validez presupuesto" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
            </label>
            <label className="fieldBlock">
              <span>Notas</span>
              <input aria-label="Notas presupuesto" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Condiciones, plazos..." />
            </label>
          </div>
          <LinesEditor lines={lines} onChange={setLines} idPrefix="Presupuesto" />
          <button className="primary" disabled={!canSave}>
            Guardar presupuesto
          </button>
        </form>
      </section>
    </>
  );
}
