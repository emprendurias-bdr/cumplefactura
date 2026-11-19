/**
 * Editor de plantilla recurrente `#/recurrentes/nueva` o `/:id` (ESPEC §5.4.1): nombre, cliente,
 * serie de factura, frecuencia, día del periodo (1–28), inicio y fin, líneas y notas. Debajo,
 * las próximas 3 fechas con su importe (`recurring_preview` con el formulario, antes de guardar).
 * Recordatorio fijo: la plantilla solo prepara borradores; emitir siempre lo haces tú.
 */
import { useEffect, useState } from "react";
import { t } from "../i18n/es";
import { lineToInput } from "../lib/format";
import { isoDate, todayIso } from "../lib/invoiceDate";
import { formatCents } from "../lib/moneyFormat";
import { isValidDay, periodLabel } from "../lib/periods";
import { isNew } from "../lib/routes";
import { go } from "../shell/useRoute";
import type { Frequency, RecurringInput, RecurringRun } from "../types";
import { Button } from "../ui/Button";
import { Callout } from "../ui/Callout";
import { Card } from "../ui/Card";
import { DateInput, Field, Input, Select } from "../ui/Field";
import { EmptyState } from "../ui/EmptyState";
import { Hero } from "../ui/Hero";
import type { Ctx } from "./ctx";
import { LinesEditor, useLines } from "./LinesEditor";

const FREQUENCIES: Frequency[] = ["monthly", "quarterly", "yearly"];

export function RecurrenteEditor({ m, rec, route }: Ctx) {
  const existing = isNew(route.id) ? null : (rec.items.find((item) => item.id === route.id) ?? null);
  const [label, setLabel] = useState(existing?.label ?? "");
  const [customerId, setCustomerId] = useState(existing?.customer_id ?? m.customer?.id ?? "");
  const [series, setSeries] = useState(existing?.series_code ?? m.activeSeries);
  const [frequency, setFrequency] = useState<Frequency>(existing?.frequency ?? "monthly");
  const [day, setDay] = useState(existing?.day_of_period ?? 1);
  const [start, setStart] = useState(existing?.start_date ?? todayIso());
  const [end, setEnd] = useState(existing?.end_date ?? "");
  const [notes, setNotes] = useState(existing?.template.notes ?? "");
  const [runs, setRuns] = useState<RecurringRun[]>([]);
  const lines = useLines(existing?.template);

  useEffect(() => {
    if (rec.available === null) void rec.load();
  }, []);

  const input: RecurringInput | null = m.company
    ? {
        id: existing?.id,
        company_id: m.company.id,
        customer_id: customerId,
        label: label.trim(),
        series_code: series,
        frequency,
        day_of_period: day,
        start_date: start,
        end_date: end || null,
        template: { lines: lines.lines.map(lineToInput), notes },
      }
    : null;
  const ready = Boolean(input && input.label && input.customer_id && isValidDay(day));

  useEffect(() => {
    if (!ready || !input) return setRuns([]);
    const timer = setTimeout(() => void rec.preview(existing?.id ?? null, input, 3).then(setRuns), 400);
    return () => clearTimeout(timer);
  }, [ready, JSON.stringify(input)]);

  if (rec.available === false) return <EmptyState title={t("recurrentes.proximamenteTitulo")} text={t("recurrentes.proximamente")} />;
  if (!isNew(route.id) && !existing) return <EmptyState text={t("comun.cargando")} />;

  return (
    <>
      <Hero
        label={`${t("nav.recurrentes")} · ${existing ? t("recurrentes.editar") : t("recurrentes.nueva")}`}
        title={label || t("recurrentes.sinNombre")}
        secondary={<a className="bdr-btn bdr-btn--ghost" href="#/recurrentes">{t("comun.cancelar")}</a>}
        primary={
          <Button variant="primary" disabled={!ready} reason={ready ? null : t("recurrentes.motivo")} onClick={async () => { if (input && (await rec.save(input))) go("#/recurrentes"); }}>
            {t("recurrentes.guardar")}
          </Button>
        }
      />
      <Callout tone="info" title={t("recurrentes.nuncaSolaTitulo")}>{t("recurrentes.nuncaSola")}</Callout>
      <Card>
        <div className="cf-form-grid">
          <Field label={t("recurrentes.nombre")}>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t("recurrentes.nombreEjemplo")} />
          </Field>
          <Field label={t("facturas.cliente")}>
            <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">{t("editor.sinCliente")}</option>
              {m.customers.map((item) => <option key={item.id} value={item.id}>{item.display_name}</option>)}
            </Select>
          </Field>
          <Field label={t("editor.serieFactura")}>
            <Select value={series} onChange={(e) => setSeries(e.target.value)}>
              {[...new Set([series, ...m.seriesConfigs.map((item) => item.resolved_series)])].map((code) => <option key={code} value={code}>{code}</option>)}
            </Select>
          </Field>
          <Field label={t("recurrentes.frecuencia")}>
            <Select value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}>
              {FREQUENCIES.map((item) => <option key={item} value={item}>{t(`frecuencia.${item}`)}</option>)}
            </Select>
          </Field>
          <Field label={t("recurrentes.dia")} help={t("recurrentes.diaAyuda")} error={isValidDay(day) ? null : t("recurrentes.diaError")}>
            <Input mono type="number" min={1} max={28} value={day} invalid={!isValidDay(day)} onChange={(e) => setDay(Number(e.target.value))} />
          </Field>
          <Field label={t("recurrentes.inicio")}>
            <DateInput value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label={t("recurrentes.fin")} help={t("recurrentes.finAyuda")}>
            <DateInput value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>
      </Card>
      <LinesEditor {...lines} products={m.products} />
      <Field label={t("docs.notas")}>
        <textarea className="bdr-input cf-textarea" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <Card title={t("recurrentes.proximas")}>
        {runs.length === 0 ? (
          <p className="bdr-small bdr-muted">{ready ? t("recurrentes.sinPrevia") : t("recurrentes.completa")}</p>
        ) : (
          <ul className="bdr-log">
            {runs.map((run) => (
              <li key={run.period_key}>
                <time>{isoDate(run.run_date)}</time>
                <span className="cf-row cf-between">
                  <span>{periodLabel(run.period_key)}</span>
                  <strong className="m">{formatCents(run.total_cents)}</strong>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
