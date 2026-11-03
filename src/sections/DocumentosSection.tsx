/**
 * Documentos `#/documentos/<pestaña>` (ESPEC §6): Presupuestos · Proformas · Albaranes. Ninguno tiene
 * valor fiscal. Lista con Número · Fecha · Cliente · Validez/Entrega · Estado · Total · ⋯; en
 * Albaranes, casillas y barra «N seleccionados · Facturar juntos», deshabilitada con su motivo
 * (otro cliente, otro mes, no entregado, ya facturado). Si Rust aún no tiene los comandos, se ve
 * el EmptyState explicativo de la especificación, sin botones.
 */
import { useEffect, useState } from "react";
import { t } from "../i18n/es";
import { groupInvoiceReason, KIND_BY_TAB } from "../lib/documents";
import { isoDate } from "../lib/invoiceDate";
import { formatCents } from "../lib/moneyFormat";
import { DOC_TABS, href, type DocTab } from "../lib/routes";
import { go } from "../shell/useRoute";
import type { CommercialDocumentSummary } from "../types";
import { Button } from "../ui/Button";
import { DataTable, type Column } from "../ui/DataTable";
import { EmptyState } from "../ui/EmptyState";
import { Accent, Hero } from "../ui/Hero";
import { Skeleton, useDelayedLoading } from "../ui/Skeleton";
import { documentStatus } from "../ui/status";
import { StatusChip } from "../ui/StatusChip";
import { customerName, type Ctx } from "./ctx";
import { DocumentoEditor } from "./DocumentoEditor";

export function DocumentosSection(c: Ctx) {
  const tab = (DOC_TABS.find((item) => item === c.route.tab) ?? "presupuestos") as DocTab;
  if (c.route.id) return <DocumentoEditor c={c} tab={tab} />;
  return <DocumentList c={c} tab={tab} />;
}

function DocumentList({ c, tab }: { c: Ctx; tab: DocTab }) {
  const { m, docs } = c;
  const kind = KIND_BY_TAB[tab];
  const [selected, setSelected] = useState<string[]>([]);
  const skeleton = useDelayedLoading(docs.loading && docs.items.length === 0);

  useEffect(() => {
    setSelected([]);
    void docs.load(kind);
  }, [kind, m.company?.id]);

  const open = (doc: CommercialDocumentSummary) => go(href({ section: "documentos", tab, id: doc.id }));
  const chosen = docs.items.filter((item) => selected.includes(item.id));
  const reason = groupInvoiceReason(chosen);
  const dateKey = kind === "delivery_note" ? "docs.entrega" : "docs.validez";

  const columns: Column<CommercialDocumentSummary>[] = [
    { key: "n", header: t("facturas.numero"), cell: (row) => <span className="m">{row.display_number ?? t("estado.borrador")}</span> },
    { key: "fecha", header: t("facturas.fecha"), cell: (row) => <span className="m">{isoDate(row.issue_date)}</span> },
    { key: "cliente", header: t("facturas.cliente"), cell: (row) => customerName(m, row.customer_id) },
    { key: "fecha2", header: t(dateKey), cell: (row) => <span className="m">{isoDate(kind === "delivery_note" ? row.delivery_date : row.valid_until)}</span> },
    { key: "estado", header: t("facturas.estado"), cell: (row) => <StatusChip status={documentStatus(row.status)} /> },
    { key: "total", header: t("facturas.total"), num: true, cell: (row) => (row.show_prices ? formatCents(row.total_cents) : t("docs.sinPrecios")) },
  ];

  return (
    <>
      <Hero
        plain
        label={`${t("nav.documentos")} · ${t("docs.sinValorFiscal")}`}
        title={<>{t("facturas.tus")} <Accent>{t(`docs.${tab}`)}</Accent></>}
        primary={docs.available === false ? undefined : <a className="bdr-btn bdr-btn--primary" href={href({ section: "documentos", tab, id: "nuevo" })}>{t(`docs.nuevo.${tab}`)}</a>}
      />
      <nav className="cf-tabs" aria-label={t("nav.documentos")}>
        {DOC_TABS.map((item) => (
          <a key={item} href={href({ section: "documentos", tab: item })} aria-current={item === tab ? "page" : undefined}>
            {t(`docs.tab.${item}`)}
          </a>
        ))}
      </nav>

      {docs.available === false ? (
        <EmptyState title={t("docs.proximamenteTitulo")} text={t("docs.proximamente")} />
      ) : skeleton ? (
        <Skeleton />
      ) : docs.items.length === 0 ? (
        <EmptyState text={t(`docs.vacio.${tab}`)} action={<a className="bdr-btn bdr-btn--secondary" href={href({ section: "documentos", tab, id: "nuevo" })}>{t(`docs.nuevo.${tab}`)}</a>} />
      ) : (
        <DataTable
          label={t(`docs.${tab}`)}
          rows={docs.items}
          rowKey={(row) => row.id}
          columns={columns}
          onOpen={open}
          rowActions={(row) => [
            { label: t("facturas.ver"), onSelect: () => open(row) },
            { label: t("docs.guardarPdf"), onSelect: () => void docs.savePdf(row.id), disabled: row.status === "draft" },
          ]}
          selection={
            kind === "delivery_note"
              ? {
                  selected,
                  onChange: setSelected,
                  actions: (
                    <Button variant="primary" size="sm" disabled={reason !== null} reason={reason ? t(`docs.motivo.${reason}`) : null} onClick={async () => { if (await docs.toInvoiceDraft(selected)) go("#/facturas/nueva"); }}>
                      {t("docs.facturarJuntos")}
                    </Button>
                  ),
                }
              : undefined
          }
          footer={<span className="bdr-small">{t("docs.total", { n: docs.total })}</span>}
        />
      )}
    </>
  );
}
