import { invoke } from "@tauri-apps/api/core";
import { Pause, Play, Repeat } from "lucide-react";
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
  todayIso,
} from "./shared";

type Recurring = {
  id: string;
  customer_id: string;
  label: string;
  frequency: "monthly" | "quarterly" | "yearly";
  next_run_date: string;
  end_date?: string | null;
  active: boolean;
  last_invoice_id?: string | null;
  total_cents: number;
  draft: DraftInput;
};

type RecurringRun = { recurring_id: string; label: string; run_date: string; invoice: { id: string } };

const FREQUENCY_LABEL = { monthly: "Mensual", quarterly: "Trimestral", yearly: "Anual" } as const;

export function RecurringView({
  companyId,
  customers,
  series,
  territoryFlags,
  run,
  onDraftsCreated,
}: {
  companyId?: string;
  customers: CustomerOption[];
  series: SeriesOption[];
  territoryFlags: string[];
  run: Runner;
  onDraftsCreated: () => void;
}) {
  const [items, setItems] = useState<Recurring[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [seriesCode, setSeriesCode] = useState("");
  const [frequency, setFrequency] = useState<Recurring["frequency"]>("monthly");
  const [nextRun, setNextRun] = useState(todayIso());
  const [endDate, setEndDate] = useState("");
  const [lines, setLines] = useState<LineForm[]>([emptyLine()]);
  const [lastRuns, setLastRuns] = useState<RecurringRun[]>([]);

  async function load() {
    const result = await attempt(run, "Recurrentes", () => invoke<Recurring[]>("recurring_list", { companyId: companyId ?? null }));
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
    setLabel("");
    setCustomerId("");
    setFrequency("monthly");
    setNextRun(todayIso());
    setEndDate("");
    setLines([emptyLine()]);
  }

  function edit(item: Recurring) {
    setEditingId(item.id);
    setLabel(item.label);
    setCustomerId(item.customer_id);
    setSeriesCode(item.draft.series);
    setFrequency(item.frequency);
    setNextRun(item.next_run_date);
    setEndDate(item.end_date ?? "");
    setLines(draftToLineForms(item.draft.lines));
  }

  const draftLines = lineFormsToDraft(lines);
  const canSave = Boolean(companyId && customerId && seriesCode && label.trim() && nextRun && draftLines);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!companyId || !draftLines) return;
    const draft: DraftInput = {
      company_id: companyId,
      customer_id: customerId,
      fiscal_year: Number(nextRun.slice(0, 4)),
      series: seriesCode,
      number: null,
      kind: "Complete",
      territory_flags: territoryFlags,
      lines: draftLines,
      rectifies_invoice_id: null,
      rectification_reason_code: null,
      rectification_method: null,
    };
    const saved = await attempt(run, "Guardar recurrente", () =>
      invoke<Recurring>("recurring_upsert", {
        input: { id: editingId, label, frequency, next_run_date: nextRun, end_date: endDate || null, draft },
      }),
    );
    if (saved) {
      reset();
      await load();
    }
  }

  async function toggle(item: Recurring) {
    const ok = await attempt(run, item.active ? "Pausar recurrente" : "Reanudar recurrente", () =>
      invoke("recurring_set_active", { id: item.id, active: !item.active }).then(() => true),
    );
    if (ok) await load();
  }

  async function generate() {
    const runs = await attempt(run, "Generar borradores recurrentes", () => invoke<RecurringRun[]>("recurring_generate_due"));
    if (runs) {
      setLastRuns(runs);
      await load();
      if (runs.length > 0) onDraftsCreated();
    }
  }

  return (
    <>
      <section className="panel" aria-label="Plantillas recurrentes">
        <div className="editorTop">
          <div>
            <h2>Plantillas recurrentes</h2>
            <p>Generan borradores cuando llega su fecha. La emision sigue siendo manual (control fiscal).</p>
          </div>
          <button type="button" className="primary" onClick={() => void generate()}>
            <Repeat size={16} aria-hidden="true" />
            Generar borradores pendientes
          </button>
        </div>
        {lastRuns.length > 0 ? (
          <p className="noticeLine">
            {lastRuns.length} borrador(es) creado(s): {lastRuns.map((r) => `${r.label} (${shortDate(r.run_date)})`).join(", ")}. Revisalos en Facturas › Nueva factura y Emitidas.
          </p>
        ) : null}
        {items.length === 0 ? (
          <p className="emptyState">Sin plantillas. Crea la primera abajo (cuotas, alquileres, mantenimientos).</p>
        ) : (
          <div className="tableWrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Plantilla</th>
                  <th>Cliente</th>
                  <th>Frecuencia</th>
                  <th>Proxima</th>
                  <th>Fin</th>
                  <th className="num">Importe</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <button type="button" className="rowLink" onClick={() => edit(item)}>
                        {item.label}
                      </button>
                    </td>
                    <td>{customers.find((c) => c.id === item.customer_id)?.display_name ?? "-"}</td>
                    <td>{FREQUENCY_LABEL[item.frequency]}</td>
                    <td>{shortDate(item.next_run_date)}</td>
                    <td>{shortDate(item.end_date)}</td>
                    <td className="num">{euros(item.total_cents)}</td>
                    <td>{item.active ? <StatusBadge tone="ok">Activa</StatusBadge> : <StatusBadge tone="muted">Pausada</StatusBadge>}</td>
                    <td>
                      <button type="button" className="iconButton" aria-label={item.active ? `Pausar ${item.label}` : `Reanudar ${item.label}`} onClick={() => void toggle(item)}>
                        {item.active ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel" aria-label="Editar plantilla recurrente">
        <form className="stackForm" onSubmit={save}>
          <div className="formTitle">
            <h2>{editingId ? "Editar plantilla" : "Nueva plantilla"}</h2>
            {editingId ? (
              <button type="button" className="linkButton" onClick={reset}>
                Nueva plantilla
              </button>
            ) : null}
          </div>
          <div className="formGrid four">
            <label className="fieldBlock">
              <span>Nombre</span>
              <input aria-label="Nombre recurrente" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Cuota mensual mantenimiento" />
            </label>
            <label className="fieldBlock">
              <span>Cliente</span>
              <select aria-label="Cliente recurrente" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="">Selecciona cliente</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.display_name} - {c.tax_id}
                  </option>
                ))}
              </select>
            </label>
            <label className="fieldBlock">
              <span>Serie</span>
              <select aria-label="Serie recurrente" value={seriesCode} onChange={(e) => setSeriesCode(e.target.value)}>
                {series.length === 0 ? <option value="">Sin series</option> : null}
                {series.map((s) => (
                  <option key={s.id} value={s.resolved_series}>
                    {s.label} - {s.preview}
                  </option>
                ))}
              </select>
            </label>
            <label className="fieldBlock">
              <span>Frecuencia</span>
              <select aria-label="Frecuencia recurrente" value={frequency} onChange={(e) => setFrequency(e.target.value as Recurring["frequency"])}>
                <option value="monthly">Mensual</option>
                <option value="quarterly">Trimestral</option>
                <option value="yearly">Anual</option>
              </select>
            </label>
            <label className="fieldBlock">
              <span>Proxima generacion</span>
              <input aria-label="Proxima generacion" type="date" value={nextRun} onChange={(e) => setNextRun(e.target.value)} />
            </label>
            <label className="fieldBlock">
              <span>Fin (opcional)</span>
              <input aria-label="Fin recurrente" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </label>
          </div>
          <LinesEditor lines={lines} onChange={setLines} idPrefix="Recurrente" />
          <button className="primary" disabled={!canSave}>
            Guardar plantilla
          </button>
        </form>
      </section>
    </>
  );
}
