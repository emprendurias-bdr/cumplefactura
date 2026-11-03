/**
 * Facturas · lista (UX_UI.md §Pantallas 1, maqueta 1). Hero sencillo con «Nueva factura» (N).
 * Filtros en una fila: búsqueda al escribir (300 ms, atajo /), serie, estado y envío AEAT; el resto
 * en «Más filtros». Tabla: Número · Fecha · Cliente · Estado · Verifactu (5 puntos + texto) ·
 * Total; clic → ficha; menú ⋯ con PDF, JSON, Rectificar, Enviar y Anular (confirmación).
 * El filtro «Envío AEAT» se aplica sobre la página cargada (lo dice el chip de resultado).
 */
import { useEffect, useState } from "react";
import { t } from "../i18n/es";
import { invoiceDate } from "../lib/invoiceDate";
import { formatCents } from "../lib/moneyFormat";
import { invoiceNumber } from "../lib/numberProposal";
import { href } from "../lib/routes";
import { go } from "../shell/useRoute";
import { SEARCH_ID } from "../shell/Shell";
import type { InvoiceSummary } from "../types";
import { Button } from "../ui/Button";
import { Callout } from "../ui/Callout";
import { DataTable, type Column } from "../ui/DataTable";
import { EmptyState } from "../ui/EmptyState";
import { Accent, Hero } from "../ui/Hero";
import { Skeleton, useDelayedLoading } from "../ui/Skeleton";
import { invoiceKind, invoiceStatus } from "../ui/status";
import { StatusChip } from "../ui/StatusChip";
import { Stepper } from "../ui/Stepper";
import { AnularDialog } from "./AnularDialog";
import { customerName, invoiceProgress, type Ctx } from "./ctx";

const STATUSES = ["Draft", "Issued", "Rectified", "Void"] as const;
const KINDS = ["Complete", "Simplified", "Rectifying"] as const;
const SENDING = ["sinEnviar", "sinConfirmar", "aceptada", "conErrores", "rechazada"] as const;

export function FacturasSection(c: Ctx) {
  const { m } = c;
  const [search, setSearch] = useState(m.filters.search);
  const [sending, setSending] = useState("");
  const [toVoid, setToVoid] = useState<InvoiceSummary | null>(null);
  const showSkeleton = useDelayedLoading(m.loading && m.invoices.length === 0);

  useEffect(() => {
    if (search === m.filters.search) return;
    const timer = setTimeout(() => {
      const next = { ...m.filters, search };
      m.setFilters(next);
      void m.searchInvoices(next);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const filterNow = (field: keyof typeof m.filters, value: string) => {
    const next = { ...m.filters, [field]: value };
    m.setFilters(next);
    void m.searchInvoices(next);
  };

  const withProgress = m.invoices.map((invoice) => ({ invoice, progress: invoiceProgress(c, invoice) }));
  const rows = withProgress.filter(({ progress }) => {
    if (!sending) return true;
    if (sending === "sinEnviar") return ["sinEmitir", "emitida", "registrada", "xml"].includes(progress.summary);
    return progress.summary === sending;
  });
  const pageTotal = rows.reduce((sum, row) => sum + row.invoice.total_cents, 0);
  type Row = (typeof rows)[number];

  const columns: Column<Row>[] = [
    { key: "numero", header: t("facturas.numero"), cell: ({ invoice }) => <span className="m">{invoiceNumber(invoice) ?? t("estado.borrador")}</span> },
    { key: "fecha", header: t("facturas.fecha"), cell: ({ invoice }) => <span className="m">{invoiceDate(invoice.issued_at)}</span> },
    { key: "cliente", header: t("facturas.cliente"), cell: ({ invoice }) => customerName(m, invoice.customer_id) },
    {
      key: "estado",
      header: t("facturas.estado"),
      cell: ({ invoice }) => {
        const kind = invoiceKind(invoice.kind);
        return (
          <span className="cf-row cf-row--tight">
            <StatusChip status={invoiceStatus(invoice.status)} />
            {kind ? <StatusChip status={kind} /> : null}
          </span>
        );
      },
    },
    {
      key: "verifactu",
      header: t("facturas.verifactu"),
      cell: ({ progress }) => (
        <span className="cf-progress-cell">
          <Stepper compact steps={progress.labeled} label={t("facturas.verifactu")} />
          <span className="bdr-small bdr-muted">{t(`progreso.${progress.summary}`)}</span>
        </span>
      ),
    },
    { key: "total", header: t("facturas.total"), num: true, cell: ({ invoice }) => formatCents(invoice.total_cents) },
  ];

  const company = m.company?.legal_name ?? t("contexto.sinEmpresa");
  const filtered = Object.values(m.filters).some(Boolean) || Boolean(sending);

  return (
    <>
      <Hero
        plain
        label={`${t("nav.facturas")} · ${m.selectedSeries?.resolved_series ?? t("contexto.sinSerie")} · ${m.fiscalYear}`}
        title={
          <>
            {t("facturas.tus")} <Accent>{t("facturas.facturas")}</Accent>
          </>
        }
        secondary={
          <Button onClick={() => void m.exportCsv()} disabled={m.invoices.length === 0}>
            {t("facturas.exportarCsv")}
          </Button>
        }
        primary={
          <a className="bdr-btn bdr-btn--primary" href="#/facturas/nueva" aria-keyshortcuts="N">
            {t("acciones.nuevaFactura")}
          </a>
        }
      />

      <div className="cf-filters" role="search" aria-label={t("facturas.filtros")}>
        <label className="bdr-search cf-filters__search">
          <span className="cf-sr">{t("facturas.buscar")}</span>
          <input id={SEARCH_ID} value={search} placeholder={t("facturas.buscarPlaceholder")} onChange={(event) => setSearch(event.target.value)} aria-keyshortcuts="/" />
          <span className="bdr-kbd">/</span>
        </label>
        <FilterSelect label={t("facturas.serie")} value={m.filters.series} onChange={(v) => filterNow("series", v)} options={m.seriesConfigs.map((s) => [s.resolved_series, s.resolved_series])} />
        <FilterSelect label={t("facturas.estado")} value={m.filters.status} onChange={(v) => filterNow("status", v)} options={STATUSES.map((s) => [s, t(invoiceStatus(s).label)])} />
        <FilterSelect label={t("facturas.envio")} value={sending} onChange={setSending} options={SENDING.map((s) => [s, t(`filtroEnvio.${s}`)])} />
        <details className="cf-more">
          <summary className="bdr-btn bdr-btn--ghost bdr-btn--sm">{t("facturas.masFiltros")}</summary>
          <div className="cf-more__body">
            <FilterSelect label={t("contexto.empresa")} value={m.filters.company_id} onChange={(v) => filterNow("company_id", v)} options={m.companies.map((x) => [x.id, x.legal_name])} />
            <FilterSelect label={t("facturas.cliente")} value={m.filters.customer_id} onChange={(v) => filterNow("customer_id", v)} options={m.customers.map((x) => [x.id, x.display_name])} />
            <FilterSelect label={t("facturas.anio")} value={m.filters.fiscal_year} onChange={(v) => filterNow("fiscal_year", v)} options={[m.fiscalYear - 1, m.fiscalYear].map((y) => [String(y), String(y)])} />
            <FilterSelect label={t("facturas.tipo")} value={m.filters.kind} onChange={(v) => filterNow("kind", v)} options={KINDS.map((k) => [k, t(`tipo.${k}`)])} />
          </div>
        </details>
        {filtered ? (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setSending(""); m.clearInvoiceFilters(); }}>
            {t("facturas.limpiar")}
          </Button>
        ) : null}
        <span className="bdr-chip bdr-chip--neu cf-filters__count" role="status">
          {t("facturas.enPagina", { n: rows.length })} · {company}
        </span>
      </div>

      {m.loadError ? (
        <Callout tone="err" title={t("error.cargaTitulo")} actions={<Button variant="dark" onClick={() => void m.refreshData()}>{t("comun.reintentar")}</Button>}>
          {m.loadError}
        </Callout>
      ) : showSkeleton ? (
        <Skeleton />
      ) : rows.length === 0 ? (
        <EmptyState
          text={filtered ? t("facturas.vacioFiltros") : t("facturas.vacio")}
          action={filtered ? undefined : <a className="bdr-btn bdr-btn--secondary" href="#/facturas/nueva">{t("acciones.nuevaFactura")}</a>}
        />
      ) : (
        <DataTable
          label={t("nav.facturas")}
          rows={rows}
          columns={columns}
          rowKey={(row) => row.invoice.id}
          onOpen={(row) => go(href({ section: "facturas", id: row.invoice.id }))}
          rowActions={({ invoice }) => {
            const issued = invoice.status === "Issued";
            return [
              { label: t("facturas.ver"), onSelect: () => go(href({ section: "facturas", id: invoice.id })) },
              { label: t("facturas.pdf"), onSelect: () => void m.exportPdf(invoice.id) },
              { label: t("facturas.json"), onSelect: () => void m.exportJson(invoice.id) },
              { label: t("facturas.enviar"), disabled: !issued, onSelect: () => { c.vf.selectInvoice(invoice.id); go("#/verifactu"); } },
              { label: t("facturas.rectificar"), disabled: !issued || invoice.kind === "Rectifying", onSelect: () => go(href({ section: "facturas", id: invoice.id, action: "rectificar" })) },
              { label: t("facturas.anular"), danger: true, disabled: !issued, onSelect: () => setToVoid(invoice) },
            ];
          }}
          footer={
            <div className="cf-row cf-between">
              <strong>{t("facturas.enVista", { n: rows.length })}</strong>
              <span className="cf-row">
                <Button size="sm" variant="ghost" disabled={m.pages.invoice === 0} onClick={() => void m.changePage("invoice", m.pages.invoice - 1)}>
                  {t("comun.anterior")}
                </Button>
                <span className="m bdr-small">{t("comun.pagina", { n: m.pages.invoice + 1 })}</span>
                <Button size="sm" variant="ghost" disabled={m.invoices.length < 25} onClick={() => void m.changePage("invoice", m.pages.invoice + 1)}>
                  {t("comun.siguiente")}
                </Button>
                <strong className="m">{formatCents(pageTotal)}</strong>
              </span>
            </div>
          }
        />
      )}

      <Callout tone="neu" title={t("facturas.leerVerifactuTitulo")}>
        {t("facturas.leerVerifactu")}
      </Callout>
      <AnularDialog c={c} invoice={toVoid} onClose={() => setToVoid(null)} />
    </>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[][] }) {
  return (
    <label className="cf-filter">
      <span className="cf-sr">{label}</span>
      <select className="bdr-select cf-filter__select" value={value} onChange={(event) => onChange(event.target.value)} aria-label={label}>
        <option value="">{t("facturas.filtroTodos", { label })}</option>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}
