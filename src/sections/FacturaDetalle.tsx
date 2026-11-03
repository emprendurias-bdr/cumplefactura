/**
 * Ficha de factura `#/facturas/:id`: hero con número, cliente y total; los 5 pasos VERI*FACTU con
 * su evidencia; desglose (si la factura se emitió o guardó en esta sesión: Rust aún no tiene
 * `invoice_get`); vista previa en hoja blanca; registro de actividad de esa factura.
 * Acciones: Descargar PDF · Rectificar · Anular (confirmación) · Enviar a la AEAT (principal).
 */
import { useState } from "react";
import { t } from "../i18n/es";
import { invoiceDate } from "../lib/invoiceDate";
import { formatCents } from "../lib/moneyFormat";
import { invoiceNumber } from "../lib/numberProposal";
import { href } from "../lib/routes";
import { go } from "../shell/useRoute";
import { type Activity, ActivityLog } from "../ui/ActivityLog";
import { Button } from "../ui/Button";
import { Callout } from "../ui/Callout";
import { Card } from "../ui/Card";
import { DocPreview } from "../ui/DocPreview";
import { EmptyState } from "../ui/EmptyState";
import { Hero } from "../ui/Hero";
import { Skeleton } from "../ui/Skeleton";
import { invoiceKind, invoiceStatus, submissionStatus } from "../ui/status";
import { StatusChip } from "../ui/StatusChip";
import { Stepper } from "../ui/Stepper";
import { SourceBreakdown } from "../ui/SourceBreakdown";
import { AnularDialog } from "./AnularDialog";
import { customerName, invoiceProgress, type Ctx } from "./ctx";

export function FacturaDetalle(c: Ctx) {
  const { m, vf, route } = c;
  const [toVoid, setToVoid] = useState(false);
  const invoice = m.invoices.find((item) => item.id === route.id);
  if (!invoice) {
    return m.loading ? <Skeleton /> : <EmptyState text={t("ficha.noEncontrada")} action={<a className="bdr-btn bdr-btn--secondary" href="#/facturas">{t("ficha.volver")}</a>} />;
  }

  const details = m.invoiceDetails[invoice.id];
  const totals = details && "taxable_base_cents" in details.totals ? details.totals : null;
  const progress = invoiceProgress(c, invoice);
  const number = invoiceNumber(invoice);
  const customer = m.customers.find((item) => item.id === invoice.customer_id);
  const issuer = m.companies.find((item) => item.id === invoice.company_id);
  const issued = invoice.status === "Issued";
  const kind = invoiceKind(invoice.kind);
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
        support={<span className="bdr-num">{formatCents(invoice.total_cents)}</span>}
        secondary={
          <>
            <Button icon="download" onClick={() => void m.exportPdf(invoice.id)}>{t("facturas.pdf")}</Button>
            <Button disabled={!issued || invoice.kind === "Rectifying"} onClick={() => go(href({ section: "facturas", id: invoice.id, action: "rectificar" }))}>
              {t("facturas.rectificar")}
            </Button>
            <Button variant="danger" disabled={!issued} onClick={() => setToVoid(true)}>{t("facturas.anular")}</Button>
          </>
        }
        primary={
          issued && progress.summary !== "aceptada" ? (
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
            {totals ? (
              <SourceBreakdown rows={rows} total={{ label: t("totales.total"), cents: totals.total_cents }} />
            ) : (
              <Callout tone="neu" title={t("ficha.sinDesgloseTitulo")}>{t("ficha.sinDesglose")}</Callout>
            )}
          </Card>
          <Card title={t("ficha.actividad")}>
            <ActivityLog items={activity} label={t("ficha.actividad")} />
          </Card>
        </div>
        <DocPreview
          caption={t("preview.caption")}
          title={invoice.kind === "Rectifying" ? t("preview.rectificativa") : t("preview.factura")}
          number={number}
          date={invoiceDate(invoice.issued_at)}
          issuer={issuer ? { name: issuer.legal_name, tax_id: issuer.tax_id } : null}
          customer={customer ? { name: customer.display_name, tax_id: customer.tax_id } : null}
          lines={(details?.lines ?? []).map((line) => ({ description: line.description, quantity: line.quantity, amount_cents: line.taxable_base_cents ?? null }))}
          totals={rows}
          total={invoice.total_cents}
          qr={number ? "pdf" : "pending"}
          note={details ? undefined : t("ficha.lineasEnPdf")}
        />
      </div>
      <AnularDialog c={c} invoice={toVoid ? invoice : null} onClose={() => setToVoid(false)} />
    </>
  );
}
