/**
 * Ficha / editor de presupuesto, proforma o albarán (ESPEC §5.1–§5.3). Mismo editor que la factura
 * (cliente, fechas, líneas, notas) con la vista previa en hoja blanca: título del tipo, «Documento
 * sin valor fiscal», sin QR ni huella. Editable solo en borrador; después, las acciones que permite
 * su estado (`lib/documents.ts`): enviar/entregar, aceptar, rechazar, pagar, crear proforma o
 * albarán, convertir en factura (abre el borrador en el editor de facturas) y anular con motivo.
 * Proforma (D6): tarjeta «Cobros» (el anticipo); «Marcar como pagada» pide al menos un cobro y,
 * al convertir, los cobros pasan a la factura. La serie de un documento nuevo es la configurada en
 * Ajustes › Series (D7): no se manda `series_code` y Rust la pone.
 */
import { useEffect, useState } from "react";
import { t } from "../i18n/es";
import { DEFAULT_SERIES, docActions, KIND_BY_TAB } from "../lib/documents";
import { lineToInput } from "../lib/format";
import { isoDate, todayIso } from "../lib/invoiceDate";
import { href, isNew, type DocTab } from "../lib/routes";
import { go } from "../shell/useRoute";
import type { CommercialKind } from "../types";
import { ActivityLog } from "../ui/ActivityLog";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Checkbox, DateInput, Field, Select } from "../ui/Field";
import { DocPreview, partyOf } from "../ui/DocPreview";
import { EmptyState } from "../ui/EmptyState";
import { Accent, Hero } from "../ui/Hero";
import { documentStatus } from "../ui/status";
import { StatusChip } from "../ui/StatusChip";
import { SourceBreakdown } from "../ui/SourceBreakdown";
import { usePayments } from "../usePayments";
import { CobrosCard } from "./CobrosCard";
import type { Ctx } from "./ctx";
import { LinesEditor, previewOf, useLines } from "./LinesEditor";

type Dialog = "void" | "delete" | null;

export function DocumentoEditor({ c, tab }: { c: Ctx; tab: DocTab }) {
  const { m, docs, route } = c;
  const kind = KIND_BY_TAB[tab];
  const creating = isNew(route.id);
  const doc = creating ? null : docs.current?.id === route.id ? docs.current : null;
  const [customerId, setCustomerId] = useState(m.customer?.id ?? "");
  const [issueDate, setIssueDate] = useState(todayIso());
  const [validUntil, setValidUntil] = useState("");
  const [deliveryDate, setDeliveryDate] = useState(todayIso());
  const [showPrices, setShowPrices] = useState(true);
  const [notes, setNotes] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);
  const lines = useLines();
  const proformaId = !creating && kind === "proforma" ? route.id : null;
  const pay = usePayments(proformaId ? { commercialDocumentId: proformaId } : null, () => (proformaId ? docs.open(proformaId) : undefined));

  useEffect(() => {
    if (!creating && route.id) void docs.open(route.id);
    if (docs.series.length === 0) void docs.loadSeries();
  }, [route.id]);

  useEffect(() => {
    if (!doc) return;
    setCustomerId(doc.customer_id);
    setIssueDate(doc.issue_date);
    setValidUntil(doc.valid_until ?? "");
    setDeliveryDate(doc.delivery_date ?? todayIso());
    setShowPrices(doc.show_prices);
    setNotes(doc.notes);
    lines.reset(doc);
  }, [doc?.id, doc?.updated_at]);

  if (docs.available === false) return <EmptyState title={t("docs.proximamenteTitulo")} text={t("docs.proximamente")} />;
  if (!creating && !doc) return <EmptyState text={t("comun.cargando")} />;

  const status = doc?.status ?? "draft";
  const editable = status === "draft";
  const actions = doc ? docActions(kind, status) : [];
  const preview = previewOf(lines.lines);
  const customer = m.customers.find((item) => item.id === customerId);
  const title = t(`docs.tipo.${kind}`);
  const seriesCode = doc?.series_code ?? docs.series.find((row) => row.kind === kind)?.series_code ?? DEFAULT_SERIES[kind];

  async function save() {
    if (!m.company) return;
    const saved = await docs.saveDraft({
      id: doc?.id,
      company_id: m.company.id,
      customer_id: customerId,
      kind,
      series_code: doc?.series_code,
      issue_date: issueDate,
      valid_until: kind === "delivery_note" ? null : validUntil || null,
      delivery_date: kind === "delivery_note" ? deliveryDate || null : null,
      show_prices: showPrices,
      notes,
      lines: lines.lines.map((line, position) => ({ ...lineToInput(line), position })),
    });
    if (saved && creating) go(href({ section: "documentos", tab, id: saved.id }));
  }

  const toInvoice = async () => {
    if (doc) await docs.toInvoiceDraft([doc.id]);
  };
  const derive = (target: CommercialKind) => doc && void docs.derive(doc.id, target);
  const primary = !doc ? null : actions.includes("send") || actions.includes("deliver") ? "send" : actions.includes("accept") ? "accept" : actions.includes("convert") ? "convert" : null;

  return (
    <div className="cf-split">
      <div className="cf-stack">
        <Hero
          label={`${doc?.display_number ?? t("docs.nuevoEtiqueta", { tipo: title })} · ${t("facturas.serie")} ${seriesCode} · ${t("docs.sinValorFiscal")}`}
          title={<>{title} {t("docs.para")} <Accent>{customer?.display_name ?? t("editor.sinCliente")}</Accent></>}
          chip={<StatusChip status={documentStatus(status)} />}
          secondary={
            <>
              {editable ? <Button onClick={() => void save()} disabled={!customerId || !m.company}>{t("editor.guardarBorrador")}</Button> : null}
              {doc && !editable ? <Button icon="download" onClick={() => void docs.savePdf(doc.id)}>{t("docs.guardarPdf")}</Button> : null}
              {doc?.display_number ? (
                <a className="bdr-btn bdr-btn--ghost" href={`mailto:?subject=${encodeURIComponent(`${title} ${doc.display_number}`)}&body=${encodeURIComponent(t("docs.correoCuerpo"))}`}>
                  {t("docs.correo")}
                </a>
              ) : null}
            </>
          }
          primary={
            primary === "send" ? (
              <Button variant="primary" icon="send" onClick={() => doc && void docs.send(doc.id)}>{t(kind === "delivery_note" ? "docs.entregado" : "docs.enviar")}</Button>
            ) : primary === "accept" ? (
              <Button variant="primary" onClick={() => doc && void docs.setStatus(doc.id, "accepted", null)}>{t("docs.aceptar")}</Button>
            ) : primary === "convert" ? (
              <Button variant="primary" onClick={() => void toInvoice()}>{t("docs.convertir")}</Button>
            ) : creating ? (
              <Button variant="primary" disabled reason={t("docs.motivoGuardar")}>{t(kind === "delivery_note" ? "docs.entregado" : "docs.enviar")}</Button>
            ) : undefined
          }
        />
        {doc && actions.some((a) => ["reject", "pay", "derive", "void", "delete"].includes(a)) ? (
          <div className="cf-row">
            {actions.includes("reject") ? <Button size="sm" onClick={() => void docs.setStatus(doc.id, "rejected", null)}>{t("docs.rechazar")}</Button> : null}
            {actions.includes("pay") ? (
              <Button size="sm" disabled={pay.payments.length === 0} reason={pay.payments.length === 0 ? t("docs.motivoCobro") : null} onClick={() => void docs.setStatus(doc.id, "paid", null)}>
                {t("docs.pagada")}
              </Button>
            ) : null}
            {actions.includes("derive") && kind === "quote" ? <Button size="sm" onClick={() => derive("proforma")}>{t("docs.crearProforma")}</Button> : null}
            {actions.includes("derive") ? <Button size="sm" onClick={() => derive("delivery_note")}>{t("docs.crearAlbaran")}</Button> : null}
            {actions.includes("delete") ? <Button size="sm" variant="danger" onClick={() => setDialog("delete")}>{t("docs.borrar")}</Button> : null}
            {actions.includes("void") ? <Button size="sm" variant="danger" onClick={() => setDialog("void")}>{t("docs.anular")}</Button> : null}
          </div>
        ) : null}
        <div className="cf-form-grid">
          <Field label={t("facturas.cliente")}>
            <Select value={customerId} disabled={!editable} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">{t("editor.sinCliente")}</option>
              {m.customers.map((item) => <option key={item.id} value={item.id}>{item.display_name}</option>)}
            </Select>
          </Field>
          <Field label={t("facturas.fecha")}>
            <DateInput value={issueDate} disabled={!editable} onChange={(e) => setIssueDate(e.target.value)} />
          </Field>
          {kind === "delivery_note" ? (
            <Field label={t("docs.entrega")}>
              <DateInput value={deliveryDate} disabled={!editable} onChange={(e) => setDeliveryDate(e.target.value)} />
            </Field>
          ) : (
            <Field label={t("docs.validez")}>
              <DateInput value={validUntil} disabled={!editable} onChange={(e) => setValidUntil(e.target.value)} />
            </Field>
          )}
        </div>
        {kind === "delivery_note" ? <Checkbox label={t("docs.mostrarPrecios")} checked={showPrices} disabled={!editable} onChange={(e) => setShowPrices(e.target.checked)} /> : null}
        <LinesEditor {...lines} products={m.products} readOnly={!editable} />
        <Field label={t("docs.notas")}>
          <textarea className="bdr-input cf-textarea" value={notes} readOnly={!editable} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <Card>
          <SourceBreakdown rows={preview.rows} total={{ label: t("totales.total"), cents: preview.totals.total_cents }} />
        </Card>
        {doc && proformaId ? (
          <CobrosCard
            pay={pay}
            target={{ commercialDocumentId: doc.id }}
            totalCents={doc.total_cents}
            status={null}
            blocked={["sent", "paid"].includes(status) ? null : t("cobros.motivoEnviar")}
            note={t("cobros.proformaPasa")}
          />
        ) : null}
        {doc ? (
          <Card title={t("ficha.actividad")}>
            <ActivityLog
              label={t("ficha.actividad")}
              items={[
                { id: "c", when: doc.created_at, what: t("docs.creado"), type: t("docs.documento") },
                { id: "u", when: doc.updated_at, what: `${t("docs.actualizado")} · ${t(documentStatus(doc.status).label)}`, type: t("docs.documento"), reason: doc.void_reason },
                ...(doc.invoice_id ? [{ id: "i", when: doc.updated_at, what: t("docs.enFactura"), type: t("ficha.tipoFactura") }] : []),
              ]}
            />
          </Card>
        ) : null}
      </div>
      <DocPreview
        caption={t("preview.caption")}
        title={title}
        number={doc?.display_number ?? null}
        date={isoDate(issueDate)}
        issuer={partyOf(m.company)}
        customer={partyOf(customer)}
        logo={m.company?.logo_path}
        lines={preview.lines}
        prices={showPrices}
        totals={preview.rows}
        total={preview.totals.total_cents}
        legend={<strong>{kind === "proforma" ? t("docs.leyendaProforma") : t("docs.leyenda")}</strong>}
        qr="none"
        notes={notes}
      />
      <ConfirmDialog
        open={dialog !== null}
        title={dialog === "delete" ? t("docs.borrarTitulo", { tipo: title }) : t("docs.anularTitulo", { n: doc?.display_number ?? "" })}
        consequences={dialog === "delete" ? [t("docs.borrarC1"), t("docs.borrarC2")] : [t("docs.anularC1"), t("docs.anularC2")]}
        irreversible={dialog === "delete" ? t("docs.borrarIrreversible") : t("docs.anularIrreversible")}
        verb={dialog === "delete" ? t("docs.borrar") : t("docs.anular")}
        danger
        reason={dialog === "void"}
        onCancel={() => setDialog(null)}
        onConfirm={async (reason) => {
          if (!doc) return;
          if (dialog === "delete") {
            if (await docs.removeDraft(doc)) go(href({ section: "documentos", tab }));
          } else await docs.setStatus(doc.id, "void", reason);
          setDialog(null);
        }}
      />
    </div>
  );
}
