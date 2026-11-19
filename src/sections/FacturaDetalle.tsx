/**
 * Ficha de factura `#/facturas/:id`: hero con número, cliente, total y origen recurrente (D3); los 5
 * pasos VERI*FACTU con su evidencia; desglose (`SourceBreakdown`), «Observaciones» (D2), «Cobros» y
 * vencimiento (D6); vista previa en hoja blanca; registro de actividad de esa factura.
 * Todo sale de `invoice_get` (cualquier factura, de esta sesión o no); mientras llega se usa la fila
 * de la lista. Acciones: Descargar PDF · Rectificar · Anular (confirmación) · principal: Enviar a la
 * AEAT (emitida) o Editar borrador (borrador).
 */
import { useEffect, useState } from "react";
import { t } from "../i18n/es";
import { invoiceDate, isoDate } from "../lib/invoiceDate";
import { formatCents } from "../lib/moneyFormat";
import { invoiceNumber } from "../lib/numberProposal";
import { recurringOrigin } from "../lib/periods";
import { href } from "../lib/routes";
import { go } from "../shell/useRoute";
import type { InvoiceSummary } from "../types";
import { type Activity, ActivityLog } from "../ui/ActivityLog";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { DocPreview, partyOf } from "../ui/DocPreview";
import { EmptyState } from "../ui/EmptyState";
import { Hero } from "../ui/Hero";
import { Skeleton } from "../ui/Skeleton";
import { invoiceKind, invoiceStatus, paymentStatus, submissionStatus } from "../ui/status";
import { StatusChip } from "../ui/StatusChip";
import { Stepper } from "../ui/Stepper";
import { SourceBreakdown } from "../ui/SourceBreakdown";
import { AnularDialog } from "./AnularDialog";
import { usePayments } from "../usePayments";
import { CobrosCard } from "./CobrosCard";
import { customerName, invoiceProgress, type Ctx } from "./ctx";

export function FacturaDetalle(c: Ctx) {
  const { m, vf, route } = c;
  const [toVoid, setToVoid] = useState(false);
  const id = route.id ?? "";
  useEffect(() => {
    void m.loadDetail(id);
  }, [id]);
  const pay = usePayments({ invoiceId: id }, async () => {
    await m.loadDetail(id);
    await m.refreshData();
  });

  const detail = m.detail?.id === id ? m.detail : null;
  const listed = m.invoices.find((item) => item.id === id);
  // La fila de la lista lleva la huella (pasos VERI*FACTU); la ficha, líneas, cobros y notas.
  const invoice: InvoiceSummary | undefined = detail
    ? { ...listed, ...detail, company_id: detail.company_id ?? "", customer_id: detail.customer_id ?? "", kind: detail.kind ?? "Complete", status: detail.status ?? "Draft", total_cents: detail.totals.total_cents }
    : listed;
  if (!invoice) {
    return m.detailLoading || m.loading ? <Skeleton /> : <EmptyState text={t("ficha.noEncontrada")} action={<a className="bdr-btn bdr-btn--secondary" href="#/facturas">{t("ficha.volver")}</a>} />;
  }

  const totals = detail?.totals ?? null;
  const progress = invoiceProgress(c, invoice);
  const number = invoiceNumber(invoice);
  const customer = m.customers.find((item) => item.id === invoice.customer_id);
  const issuer = m.companies.find((item) => item.id === invoice.company_id);
  const issued = invoice.status === "Issued";
  const draft = invoice.status === "Draft";
  const kind = invoiceKind(invoice.kind);
  const origin = recurringOrigin(invoice.recurring_label, invoice.recurring_period_key);
  const rows = totals
    ? [
        { label: t("totales.base"), cents: totals.taxable_base_cents },
        { label: t("totales.iva"), cents: totals.tax_cents },
        { label: t("totales.irpf"), cents: -totals.withholding_cents },
      ]
    : [];

  const activity: Activity[] = [
    { id: "creada", when: invoice.created_at ?? null, what: t("ficha.creada"), type: t("ficha.tipoFactura") },
    ...(invoice.issued_at ? [{ id: "emitida", when: invoice.issued_at, what: t("ficha.emitidaEvento", { n: number ?? "" }), type: t("ficha.tipoFactura") }] : []),
    ...m.progressRecords
      .filter((record) => record.invoice_id === invoice.id)
      .map((record) => ({ id: record.id, when: record.generated_at, what: t("ficha.registro", { tipo: record.record_type }), type: t("ficha.tipoRegistro") })),
    ...vf.submissions
      .filter((row) => row.invoice_id === invoice.id)
      .map((row) => ({ id: row.id, when: row.submitted_at, what: `${t("ficha.envio")} · ${t(submissionStatus(row.status).label)}`, type: t("ficha.tipoEnvio"), reason: row.descripcion_error })),
  ];

  return (
    <>
      <Hero
        label={`${t("ficha.etiqueta")} · ${invoice.series} · ${invoice.fiscal_year ?? ""}`}
        title={`${number ?? t("estado.borrador")} · ${customerName(m, invoice.customer_id)}`}
        chip={
          <>
            <StatusChip status={invoiceStatus(invoice.status)} />
            {kind ? <StatusChip status={kind} /> : null}
          </>
        }
        support={
          <>
            <span className="bdr-num">{formatCents(invoice.total_cents)}</span>
            {origin ? <div>{origin}</div> : null}
          </>
        }
        secondary={
          <>
            <Button icon="download" onClick={() => void m.exportPdf(invoice.id)}>{t("facturas.pdf")}</Button>
            {draft ? null : (
              <>
                <Button disabled={!issued || invoice.kind === "Rectifying"} onClick={() => go(href({ section: "facturas", id: invoice.id, action: "rectificar" }))}>
                  {t("facturas.rectificar")}
                </Button>
                <Button variant="danger" disabled={!issued} onClick={() => setToVoid(true)}>{t("facturas.anular")}</Button>
              </>
            )}
          </>
        }
        primary={
          draft ? (
            <a className="bdr-btn bdr-btn--primary" href={href({ section: "facturas", id: invoice.id, action: "editar" })}>{t("ficha.editar")}</a>
          ) : issued && progress.summary !== "aceptada" ? (
            <Button variant="primary" icon="send" onClick={() => { vf.selectInvoice(invoice.id); go("#/verifactu"); }}>
              {t("facturas.enviar")}
            </Button>
          ) : undefined
        }
      />

      <Card title={t("ficha.estadoFiscal")}>
        <Stepper steps={progress.labeled} label={t("ficha.estadoFiscal")} />
        <p className="bdr-small">
          {t(`progreso.${progress.summary}`)}
          {progress.csv ? <> · {t("ficha.csv")} <span className="m">{progress.csv}</span></> : null}
        </p>
      </Card>

      <div className="cf-split">
        <div className="cf-stack">
          <Card title={t("ficha.importe")}>
            {totals ? <SourceBreakdown rows={rows} total={{ label: t("totales.total"), cents: totals.total_cents }} /> : <Skeleton rows={3} />}
          </Card>
          {detail?.notes.trim() ? (
            <Card title={t("ficha.observaciones")} label={t("ficha.observaciones")}>
              <p className="cf-prewrap">{detail.notes}</p>
            </Card>
          ) : null}
          {detail && invoice.status !== "Void" ? (
            <CobrosCard
              pay={pay}
              target={{ invoiceId: invoice.id }}
              totalCents={invoice.total_cents}
              status={paymentStatus(invoice)}
              blocked={draft ? t("cobros.motivoEmitir") : invoice.total_cents < 0 ? t("cobros.negativa") : null}
              dueDate={draft ? undefined : detail.due_date}
            />
          ) : null}
          <Card title={t("ficha.actividad")}>
            <ActivityLog items={activity} label={t("ficha.actividad")} />
          </Card>
        </div>
        <DocPreview
          caption={t("preview.caption")}
          title={invoice.kind === "Rectifying" ? t("preview.rectificativa") : t("preview.factura")}
          number={number}
          date={invoiceDate(invoice.issued_at)}
          issuer={partyOf(issuer)}
          customer={partyOf(customer)}
          logo={issuer?.logo_path}
          lines={(detail?.lines ?? []).map((line) => ({ ...line, amount_cents: line.taxable_base_cents ?? null }))}
          totals={rows}
          total={invoice.total_cents}
          notes={detail?.notes}
          dueDate={detail?.due_date ? isoDate(detail.due_date) : null}
          qr={number ? "pdf" : "pending"}
        />
      </div>
      <AnularDialog c={c} invoice={toVoid ? invoice : null} onClose={() => setToVoid(false)} />
    </>
  );
}
