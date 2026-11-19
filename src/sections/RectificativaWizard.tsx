/**
 * Asistente de rectificativa `#/facturas/:id/rectificar` (UX_UI.md §6): 4 pasos
 * Qué ha pasado → Propuesta → Revisión → Confirmar. La app PROPONE causa R1–R5 y método
 * (`rectification_advice`) y lo dice: «La causa jurídica la decides tú». El importe es el abono
 * fijo heredado de la versión anterior (−10,00 € + 21 % IVA), que se enseña tal cual.
 * Estado: paso actual y diálogo de confirmación; la propuesta vive en useCumpleFactura.
 */
import { useState } from "react";
import { t } from "../i18n/es";
import { formatCents } from "../lib/moneyFormat";
import { invoiceNumber } from "../lib/numberProposal";
import { href } from "../lib/routes";
import { go } from "../shell/useRoute";
import { Button } from "../ui/Button";
import { Callout } from "../ui/Callout";
import { Card } from "../ui/Card";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Checkbox, Field, Select } from "../ui/Field";
import { EmptyState } from "../ui/EmptyState";
import { Hero } from "../ui/Hero";
import { Stepper } from "../ui/Stepper";
import { customerName, type Ctx } from "./ctx";

const SCENARIOS = ["Article80OneTwoOrLegalError", "Article80Three", "Article80Four", "Other", "SimplifiedInvoice"] as const;
const REASONS = ["R1", "R2", "R3", "R4", "R5"] as const;
const STEPS = ["rect.paso1", "rect.paso2", "rect.paso3", "rect.paso4"] as const;
const ABONO = { base: -1000, iva: -210 };

export function RectificativaWizard({ m, route }: Ctx) {
  const [step, setStep] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const source = m.invoices.find((item) => item.id === route.id);
  if (!source || source.status !== "Issued") {
    return <EmptyState text={t("rect.noRectificable")} action={<a className="bdr-btn bdr-btn--secondary" href="#/facturas">{t("ficha.volver")}</a>} />;
  }
  const number = invoiceNumber(source) ?? "";
  const steps = STEPS.map((key, index) => ({ label: t(key), state: index < step ? ("done" as const) : index === step ? ("current" as const) : ("future" as const) }));
  const advice = m.rectificationAdvice;

  return (
    <>
      <Hero
        label={`${t("rect.etiqueta")} · ${number}`}
        title={t("rect.titulo", { n: number })}
        support={customerName(m, source.customer_id)}
        secondary={<a className="bdr-btn bdr-btn--ghost" href={href({ section: "facturas", id: source.id })}>{t("comun.cancelar")}</a>}
      />
      <Stepper steps={steps} label={t("rect.pasos")} />

      {step === 0 ? (
        <Card title={t("rect.paso1")}>
          <div className="cf-form-grid">
            <Field label={t("rect.escenario")}>
              <Select value={m.rectificationScenario} onChange={(e) => m.setRectificationScenario(e.target.value)}>
                {SCENARIOS.map((item) => (
                  <option key={item} value={item}>{t(`rect.esc.${item}`)}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Checkbox label={t("rect.sustituye")} checked={m.rectificationReplacesFull} onChange={(e) => m.setRectificationReplacesFull(e.target.checked)} />
          <div className="cf-row cf-end">
            <Button variant="primary" onClick={async () => (await m.adviseRectification()) && setStep(1)}>{t("rect.verPropuesta")}</Button>
          </div>
        </Card>
      ) : null}

      {step === 1 ? (
        <Card title={t("rect.paso2")}>
          <Callout tone="info" title={t("rect.propuesta", { r: advice?.reason_code ?? m.rectificationReason, metodo: t(`rect.metodo.${m.rectificationMethod === "S" ? "S" : "I"}`) })}>
            {t("rect.decidesTu")}
          </Callout>
          {advice?.warnings.length ? <Callout tone="warn" title={t("rect.avisos")}>{advice.warnings.join(" · ")}</Callout> : null}
          <div className="cf-form-grid">
            <Field label={t("rect.causa")}>
              <Select value={m.rectificationReason} onChange={(e) => m.setRectificationReason(e.target.value)}>
                {REASONS.map((item) => <option key={item} value={item}>{item}</option>)}
              </Select>
            </Field>
            <Field label={t("rect.metodoLabel")}>
              <Select value={m.rectificationMethod} onChange={(e) => m.setRectificationMethod(e.target.value)}>
                <option value="I">{t("rect.metodo.I")}</option>
                <option value="S">{t("rect.metodo.S")}</option>
              </Select>
            </Field>
          </div>
          <div className="cf-row cf-end">
            <Button variant="ghost" onClick={() => setStep(0)}>{t("comun.atras")}</Button>
            <Button variant="primary" onClick={() => setStep(2)}>{t("comun.siguiente")}</Button>
          </div>
        </Card>
      ) : null}

      {step >= 2 ? (
        <Card title={t("rect.paso3")}>
          <Callout tone="warn" title={t("rect.abonoTitulo", { base: formatCents(ABONO.base), iva: formatCents(ABONO.iva), total: formatCents(ABONO.base + ABONO.iva) })}>
            {t("rect.abono")}
          </Callout>
          <dl className="cf-dl">
            <dt>{t("rect.rectifica")}</dt>
            <dd className="m">{number}</dd>
            <dt>{t("rect.causa")}</dt>
            <dd className="m">{m.rectificationReason}</dd>
            <dt>{t("rect.metodoLabel")}</dt>
            <dd>{t(`rect.metodo.${m.rectificationMethod === "S" ? "S" : "I"}`)}</dd>
          </dl>
          <div className="cf-row cf-end">
            <Button variant="ghost" onClick={() => setStep(1)}>{t("comun.atras")}</Button>
            <Button variant="primary" onClick={() => { setStep(3); setConfirming(true); }}>{t("rect.emitir")}</Button>
          </div>
        </Card>
      ) : null}

      <ConfirmDialog
        open={confirming}
        title={t("rect.confirmTitulo")}
        consequences={[t("rect.c1", { n: number }), t("rect.c2", { total: formatCents(ABONO.base + ABONO.iva) }), t("rect.c3")]}
        irreversible={t("rect.irreversible")}
        verb={t("rect.verbo")}
        acknowledge
        loadingText={t("emitir.cargando")}
        onCancel={() => { setConfirming(false); setStep(2); }}
        onConfirm={async () => {
          if (await m.issueRectifyingInvoice(source.id)) {
            setConfirming(false);
            go("#/facturas");
          }
        }}
      />
    </>
  );
}
