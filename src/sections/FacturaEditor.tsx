/**
 * Editor de factura y confirmación de emisión (UX_UI.md §Pantallas 2–3, maquetas 2 y 3).
 * Pantalla partida 1fr / 420 px: a la izquierda hero, cliente · serie · fecha, «Se numerará A-129
 * al emitir», líneas y totales con su desglose; a la derecha la vista previa (hoja blanca).
 * Emitir (botón o Ctrl+Enter) abre ConfirmDialog con «Lo entiendo»; tras emitir se va a la ficha.
 * Lógica de borrador/emisión intacta en useCumpleFactura: emitir exige borrador guardado, y
 * editar una línea invalida el borrador (como antes).
 */
import { useEffect, useRef, useState } from "react";
import { t } from "../i18n/es";
import { invoiceDate, todayIso } from "../lib/invoiceDate";
import { formatCents } from "../lib/moneyFormat";
import { invoiceNumber } from "../lib/numberProposal";
import { href } from "../lib/routes";
import { go } from "../shell/useRoute";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { DateInput, Field, Select } from "../ui/Field";
import { DocPreview } from "../ui/DocPreview";
import { Accent, Hero } from "../ui/Hero";
import { SourceBreakdown } from "../ui/SourceBreakdown";
import { toast } from "../ui/Toast";
import type { Ctx } from "./ctx";
import { LinesEditor, previewOf } from "./LinesEditor";

export function FacturaEditor({ m }: Ctx) {
  const [confirming, setConfirming] = useState(false);
  const issuedBefore = useRef(m.issued?.invoice.id);
  const preview = previewOf(m.invoiceLines);
  const number = m.proposedNumber;
  const reason = !m.company
    ? t("editor.motivoEmpresa")
    : !m.customer
      ? t("editor.motivoCliente")
      : !m.canDraft
        ? t("editor.motivoLineas")
        : !m.canIssue
          ? t("editor.motivoBorrador")
          : null;

  useEffect(() => {
    const open = () => m.canIssue && setConfirming(true);
    addEventListener("cf:emitir", open);
    return () => removeEventListener("cf:emitir", open);
  }, [m.canIssue]);

  // Tras emitir: aviso con enlace y salto a la ficha de la factura nueva.
  useEffect(() => {
    const issued = m.issued?.invoice;
    if (!issued || issued.id === issuedBefore.current) return;
    issuedBefore.current = issued.id;
    const target = href({ section: "facturas", id: issued.id });
    toast(t("editor.emitida", { n: invoiceNumber(issued) ?? "" }), "ok", { label: t("facturas.ver"), run: () => go(target) });
    go(target);
  }, [m.issued]);

  return (
    <div className="cf-split">
      <div className="cf-stack">
        <Hero
          label={`${t("editor.nueva")} · ${t("facturas.serie")} ${m.activeSeries}`}
          title={
            <>
              {t("editor.facturaPara")} <Accent>{m.customer?.display_name ?? t("editor.sinCliente")}</Accent>
            </>
          }
          secondary={
            <Button onClick={() => void m.createDraft()} disabled={!m.canDraft}>
              {m.draft ? t("editor.borradorGuardado") : t("editor.guardarBorrador")}
            </Button>
          }
          primary={
            <Button variant="primary" onClick={() => setConfirming(true)} disabled={!m.canIssue} reason={reason} aria-keyshortcuts="Control+Enter">
              {t("acciones.emitirFactura")}
            </Button>
          }
        />
        <div className="cf-form-grid">
          <Field label={t("facturas.cliente")} help={<a href="#/clientes/nuevo">{t("acciones.nuevoCliente")}</a>}>
            <Select value={m.customer?.id ?? ""} onChange={(e) => m.selectCustomer(e.target.value)} disabled={m.customers.length === 0}>
              {m.customers.length === 0 ? <option value="">{t("editor.sinClientes")}</option> : null}
              {m.customers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.display_name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("editor.serieFactura")}>
            <Select value={m.selectedSeries?.id ?? ""} onChange={(e) => void m.selectInvoiceSeries(e.target.value)} disabled={m.seriesConfigs.length === 0}>
              {m.seriesConfigs.length === 0 ? <option value="">{t("contexto.sinSerie")}</option> : null}
              {m.seriesConfigs.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label} · {item.resolved_series}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("facturas.fecha")} help={t("editor.fechaAyuda")}>
            <DateInput value={todayIso()} disabled readOnly />
          </Field>
        </div>
        <p className="bdr-small">
          {number ? (
            <>
              {t("editor.seNumerara")} <strong className="m">{number}</strong> {t("editor.alEmitir")}
            </>
          ) : (
            t("editor.numeroAlEmitir")
          )}
        </p>
        <LinesEditor lines={m.invoiceLines} products={m.products} onChange={m.updateInvoiceLine} onAdd={m.addInvoiceLine} onRemove={m.removeInvoiceLine} />
        <Card>
          <SourceBreakdown rows={preview.rows} total={{ label: t("totales.total"), cents: preview.totals.total_cents }} />
        </Card>
      </div>
      <DocPreview
        caption={t("preview.caption")}
        title={t("preview.factura")}
        number={null}
        date={invoiceDate(new Date().toISOString())}
        issuer={m.company ? { name: m.company.legal_name, tax_id: m.company.tax_id } : null}
        customer={m.customer ? { name: m.customer.display_name, tax_id: m.customer.tax_id } : null}
        lines={preview.lines}
        totals={preview.rows}
        total={preview.totals.total_cents}
        qr="pending"
        note={m.draft ? t("preview.borradorGuardado") : t("preview.provisional")}
      />
      <ConfirmDialog
        open={confirming}
        title={t("emitir.titulo", { n: number ?? m.activeSeries })}
        consequences={[
          t("emitir.c1", { total: formatCents(preview.totals.total_cents), cliente: m.customer?.display_name ?? "" }),
          t("emitir.c2"),
          t("emitir.c3"),
          t("emitir.c4"),
        ]}
        irreversible={t("emitir.irreversible")}
        verb={t("emitir.verbo")}
        acknowledge
        loadingText={t("emitir.cargando")}
        onCancel={() => setConfirming(false)}
        onConfirm={async () => {
          if (await m.issueInvoice()) setConfirming(false);
        }}
      />
    </div>
  );
}
