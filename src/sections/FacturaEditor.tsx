/**
 * Editor de factura y confirmación de emisión (UX_UI.md §Pantallas 2–3, maquetas 2 y 3).
 * Rutas: `#/facturas/nueva` (en blanco) y `#/facturas/:id/editar` (cualquier borrador: de esta
 * pantalla, de un recurrente o de una conversión; se lee con `invoice_get` y se guarda con
 * `invoice_draft_update`). Pantalla partida 1fr / 420 px: a la izquierda hero, aviso de líneas sin
 * precio (D8), cliente · serie · fecha, «Se numerará A-129 al emitir», líneas, «Observaciones» (D2)
 * y totales; a la derecha la vista previa (hoja blanca, misma maqueta que el PDF).
 * Emitir (botón o Ctrl+Enter) abre ConfirmDialog con «Lo entiendo»; tras emitir se va a la ficha.
 * Estado en useCumpleFactura: emitir exige el borrador guardado y sin cambios (`dirty`) y ninguna
 * línea «pendiente de precio» a 0 €. Al salir de un borrador abierto, el editor queda en blanco.
 */
import { useEffect, useRef, useState } from "react";
import { t } from "../i18n/es";
import { invoiceDate, todayIso } from "../lib/invoiceDate";
import { formatCents } from "../lib/moneyFormat";
import { invoiceNumber } from "../lib/numberProposal";
import { recurringOrigin } from "../lib/periods";
import { href } from "../lib/routes";
import { go } from "../shell/useRoute";
import { Button } from "../ui/Button";
import { Callout } from "../ui/Callout";
import { Card } from "../ui/Card";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { DateInput, Field, Select } from "../ui/Field";
import { DocPreview, partyOf } from "../ui/DocPreview";
import { EmptyState } from "../ui/EmptyState";
import { Accent, Hero } from "../ui/Hero";
import { Skeleton } from "../ui/Skeleton";
import { SourceBreakdown } from "../ui/SourceBreakdown";
import { toast } from "../ui/Toast";
import type { Ctx } from "./ctx";
import { LinesEditor, previewOf } from "./LinesEditor";

export function FacturaEditor({ m, route }: Ctx) {
  const [confirming, setConfirming] = useState(false);
  const issuedBefore = useRef(m.issued?.invoice.id);
  const editId = route.action === "editar" ? route.id : null;
  const preview = previewOf(m.invoiceLines);
  const number = m.proposedNumber;
  const reason = !m.company
    ? t("editor.motivoEmpresa")
    : !m.customer
      ? t("editor.motivoCliente")
      : !m.canDraft
        ? t("editor.motivoLineas")
        : m.pricePending > 0
          ? t("editor.motivoPrecio")
          : !m.canIssue
            ? t("editor.motivoBorrador")
            : null;

  // Abrir un borrador guardado cuando ya están cargados clientes y series (entrada directa por URL).
  // Una sola lectura por borrador abierto (tras emitir, el borrador ya no existe).
  const loadedFor = useRef<string | null>(null);
  const notDraft = m.detail?.id === editId && m.detail.status !== "Draft";
  useEffect(() => {
    if (!editId || m.loading || loadedFor.current === editId || m.draft?.id === editId) return;
    loadedFor.current = editId;
    void m.loadDraft(editId);
  }, [editId, m.loading]);
  // Al salir de un borrador abierto, editor en blanco para la siguiente «Nueva factura».
  useEffect(
    () => () => {
      if (!editId) return;
      loadedFor.current = null;
      m.newInvoice();
    },
    [editId],
  );

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

  if (editId && m.draft?.id !== editId) {
    if (notDraft)
      return <EmptyState text={t("editor.soloBorradores")} action={<a className="bdr-btn bdr-btn--secondary" href={href({ section: "facturas", id: editId })}>{t("editor.verFactura")}</a>} />;
    return m.loading || m.detailLoading || m.detail?.id === editId ? <Skeleton /> : <EmptyState text={t("ficha.noEncontrada")} />;
  }

  const origin = editId && m.detail?.id === editId ? recurringOrigin(m.detail.recurring_label, m.detail.recurring_period_key) : null;
  const pendingTitle = m.pricePending === 1 ? t("editor.pendiente1") : t("editor.pendientes", { n: m.pricePending });

  return (
    <div className="cf-split">
      <div className="cf-stack">
        <Hero
          label={`${editId ? t("editor.borrador") : t("editor.nueva")} · ${t("facturas.serie")} ${m.activeSeries}`}
          title={
            <>
              {t("editor.facturaPara")} <Accent>{m.customer?.display_name ?? t("editor.sinCliente")}</Accent>
            </>
          }
          support={origin ?? undefined}
          secondary={
            <Button onClick={() => void m.saveDraft()} disabled={!m.canDraft}>
              {m.draft && !m.dirty ? t("editor.borradorGuardado") : t("editor.guardarBorrador")}
            </Button>
          }
          primary={
            <Button variant="primary" onClick={() => setConfirming(true)} disabled={!m.canIssue} reason={reason} aria-keyshortcuts="Control+Enter">
              {t("acciones.emitirFactura")}
            </Button>
          }
        />
        {m.pricePending > 0 ? <Callout tone="warn" title={pendingTitle}>{t("editor.pendientesAyuda")}</Callout> : null}
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
        <Field label={t("editor.observaciones")} help={t("editor.observacionesAyuda")}>
          <textarea className="bdr-input cf-textarea" value={m.notes} onChange={(e) => m.setNotes(e.target.value)} />
        </Field>
        <Card>
          <SourceBreakdown rows={preview.rows} total={{ label: t("totales.total"), cents: preview.totals.total_cents }} />
        </Card>
      </div>
      <DocPreview
        caption={t("preview.caption")}
        title={t("preview.factura")}
        number={null}
        date={invoiceDate(new Date().toISOString())}
        issuer={partyOf(m.company)}
        customer={partyOf(m.customer)}
        logo={m.company?.logo_path}
        lines={preview.lines}
        totals={preview.rows}
        total={preview.totals.total_cents}
        notes={m.notes}
        qr="pending"
        note={m.draft && !m.dirty ? t("preview.borradorGuardado") : t("preview.provisional")}
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
