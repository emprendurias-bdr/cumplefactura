/**
 * Ajustes › Series: series de facturación de la empresa activa (continuar la numeración anterior
 * o crear una nueva) con atajos de ejemplo. `SeriesFields` se reutiliza en FirstRun.
 * El ejercicio se gestiona aquí; la barra superior solo cambia de serie.
 * Segundo bloque (D7): series de presupuestos, proformas y albaranes (código y cifras, con el
 * siguiente número de ejemplo); se guardan juntas y no renumeran lo ya enviado.
 * Estado: las filas editadas de documentos (copia local de `docs.series` hasta guardar).
 */
import { useEffect, useState } from "react";
import { t } from "../../i18n/es";
import type { CommercialSeriesConfig } from "../../types";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { DataTable } from "../../ui/DataTable";
import { Checkbox, Field, Input } from "../../ui/Field";
import { activeStatus } from "../../ui/status";
import { StatusChip } from "../../ui/StatusChip";
import type { Model } from "../../useCumpleFactura";
import type { Ctx } from "../ctx";

const PRESETS = [
  { preset: "VENDI", example: "VENDI202601" },
  { preset: "AL", example: "AL-001" },
  { preset: "C", example: "C-001" },
  { preset: "I", example: "I-001" },
] as const;

export function SeriesFields({ m }: { m: Model }) {
  const f = m.seriesForm;
  return (
    <>
      <Field label={t("series.nombre")}>
        <Input required value={f.label} onChange={(e) => m.updateSeriesForm("label", e.target.value)} />
      </Field>
      <Field label={t("series.codigo")}>
        <Input required mono value={f.series_code} onChange={(e) => m.updateSeriesForm("series_code", e.target.value.toUpperCase())} />
      </Field>
      <Field label={t("series.ejercicio")}>
        <Input mono type="number" value={f.fiscal_year} onChange={(e) => m.updateSeriesForm("fiscal_year", Number(e.target.value))} />
      </Field>
      <Field label={t("series.separador")}>
        <Input mono value={f.separator} onChange={(e) => m.updateSeriesForm("separator", e.target.value)} />
      </Field>
      <Field label={t("series.cifras")}>
        <Input mono type="number" min={1} max={12} value={f.padding} onChange={(e) => m.updateSeriesForm("padding", Number(e.target.value))} />
      </Field>
      <Field label={t("series.siguiente")} help={t("series.siguienteAyuda")}>
        <Input mono type="number" min={1} value={f.next_number} onChange={(e) => m.updateSeriesForm("next_number", Number(e.target.value))} />
      </Field>
      <Checkbox label={t("series.incluirAnio")} checked={f.include_year} onChange={(e) => m.updateSeriesForm("include_year", e.target.checked)} />
      <div className="cf-row cf-wide">
        <span className="bdr-label">{t("series.ejemplos")}</span>
        {PRESETS.map(({ preset, example }) => (
          <Button key={preset} size="sm" variant="ghost" onClick={() => m.applySeriesPreset(preset)}>
            {t("series.usar", { ejemplo: example })}
          </Button>
        ))}
      </div>
    </>
  );
}

export function AjustesSeries({ m, docs }: Ctx) {
  return (
    <>
      <Card title={t("series.nueva")}>
        <form className="cf-form-grid" onSubmit={m.configureSeries}>
          <SeriesFields m={m} />
          <div className="cf-row cf-end cf-wide">
            <Button type="submit" variant="primary" disabled={!m.company} reason={m.company ? null : t("error.sinEmpresa")}>
              {t("series.guardar")}
            </Button>
          </div>
        </form>
      </Card>
      {m.seriesConfigs.length > 0 ? (
        <DataTable
          label={t("series.titulo")}
          rows={m.seriesConfigs}
          rowKey={(row) => row.id}
          onOpen={(row) => void m.selectInvoiceSeries(row.id)}
          columns={[
            { key: "nombre", header: t("series.nombre"), cell: (row) => row.label },
            { key: "codigo", header: t("series.codigo"), cell: (row) => <span className="m">{row.resolved_series}</span> },
            { key: "siguiente", header: t("series.proxima"), cell: (row) => <span className="m">{row.preview}</span> },
            { key: "ejercicio", header: t("series.ejercicio"), cell: (row) => <span className="m">{row.fiscal_year}</span> },
            { key: "estado", header: t("productos.estado"), cell: (row) => <StatusChip status={activeStatus(row.active, true)} detail={row.id === m.selectedSeries?.id ? t("series.enUso") : undefined} /> },
          ]}
        />
      ) : null}
      <DocumentSeries docs={docs} companyId={m.company?.id ?? null} />
    </>
  );
}

function DocumentSeries({ docs, companyId }: { docs: Ctx["docs"]; companyId: string | null }) {
  const [rows, setRows] = useState<CommercialSeriesConfig[]>(docs.series);
  useEffect(() => {
    void docs.loadSeries();
  }, [companyId]);
  useEffect(() => setRows(docs.series), [docs.series]);
  const edit = (kind: string, change: Partial<CommercialSeriesConfig>) => setRows((all) => all.map((row) => (row.kind === kind ? { ...row, ...change } : row)));
  const changed = rows.some((row, i) => row.series_code !== docs.series[i]?.series_code || row.padding !== docs.series[i]?.padding);

  return (
    <Card title={t("seriesDocs.titulo")} actions={<Button variant="secondary" disabled={!changed} onClick={() => void docs.configureSeries(rows)}>{t("seriesDocs.guardar")}</Button>}>
      <p className="bdr-small">{t("seriesDocs.ayuda")}</p>
      <div className="bdr-table-wrap">
        <table className="bdr-table cf-series-docs" aria-label={t("seriesDocs.titulo")}>
          <thead>
            <tr>
              <th scope="col">{t("seriesDocs.tipo")}</th>
              <th scope="col">{t("series.codigo")}</th>
              <th scope="col">{t("series.cifras")}</th>
              <th scope="col">{t("series.proxima")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const tipo = t(`docs.tipo.${row.kind}`);
              return (
                <tr key={row.kind}>
                  <td>
                    {tipo} {row.configured ? null : <span className="bdr-small bdr-muted">· {t("seriesDocs.porDefecto")}</span>}
                  </td>
                  <td>
                    <Input mono aria-label={t("seriesDocs.ariaCodigo", { tipo })} maxLength={10} value={row.series_code} onChange={(e) => edit(row.kind, { series_code: e.target.value.toUpperCase() })} />
                  </td>
                  <td>
                    <Input mono type="number" min={1} max={10} aria-label={t("seriesDocs.ariaCifras", { tipo })} value={row.padding} onChange={(e) => edit(row.kind, { padding: Number(e.target.value) })} />
                  </td>
                  <td className="m">{row.preview}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
