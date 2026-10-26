import { Button, ConfirmDialog } from "@bdr/ui";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useWorkspaceState } from "../../shared/context";
export function RectificationWizard() {
  const s = useWorkspaceState();
  const [step, setStep] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const lock = useRef(false);
  const eventRef = useRef<FormEvent | null>(null);
  const alertRef = useRef<HTMLParagraphElement | null>(null);
  useEffect(() => {
    if (uncertain && !confirm) alertRef.current?.focus();
  }, [uncertain, confirm]);
  const source = s.rectifiableInvoice;
  const sameCompany = Boolean(source && s.company?.id === source.company_id);
  const canRectify = s.canRectify && sameCompany && !uncertain;
  async function suggest() {
    s.setRectificationAdvice(null);
    setBusy(true);
    try {
      await s.adviseRectification();
      setStep(1);
    } catch {
      /* Workspace exposes the native error as visible status. */
    } finally {
      setBusy(false);
    }
  }
  async function emit() {
    if (lock.current || !canRectify || !eventRef.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await s.issueRectifyingInvoice(eventRef.current);
      setConfirm(false);
      setStep(0);
    } catch {
      setConfirm(false);
      setUncertain(true);
      setStep(0);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section
      className="rectification-wizard"
      aria-label="Asistente de rectificativa"
    >
      <ol className="wizard-steps" aria-label="Pasos de rectificativa">
        {["Qué ha ocurrido", "Propuesta", "Revisión"].map((name, index) => (
          <li key={name} aria-current={step === index ? "step" : undefined}>
            {index + 1} · {name}
          </li>
        ))}
      </ol>
      {uncertain && (
        <p role="alert" className="phase2-info" tabIndex={-1} ref={alertRef}>
          No hemos recibido confirmación del abono. Revisa la lista de facturas
          antes de crear otra rectificativa. No reintentamos automáticamente.
        </p>
      )}
      <p>
        Factura de origen:{" "}
        <strong className="bdr-mono">
          {source
            ? `${source.series}-${source.number}`
            : "Ninguna factura emitida"}
        </strong>
        . La causa jurídica la decides tú.
      </p>
      {!sameCompany && (
        <p className="phase2-info">
          No hay una factura de origen disponible para la empresa activa. Revisa
          la empresa y los filtros antes de continuar.
        </p>
      )}
      {step === 0 && (
        <>
          <h3>¿Qué ha ocurrido?</h3>
          <label className="fieldLabel">
            Qué ha ocurrido
            <select
              value={s.rectificationScenario}
              onChange={(e) => {
                s.setRectificationScenario(e.target.value);
                s.setRectificationAdvice(null);
              }}
            >
              <option value="Article80OneTwoOrLegalError">
                Supuestos del artículo 80.1/80.2 o error de derecho
              </option>
              <option value="Article80Three">Supuesto del artículo 80.3</option>
              <option value="Article80Four">Supuesto del artículo 80.4</option>
              <option value="Other">Otro supuesto</option>
              <option value="SimplifiedInvoice">Factura simplificada</option>
            </select>
          </label>
          <Button onClick={() => void suggest()} disabled={!canRectify || busy}>
            Sugerir
          </Button>
        </>
      )}
      {step === 1 && (
        <>
          <h3>Propuesta de rectificativa</h3>
          <p>
            {s.rectificationAdvice
              ? `Sugerencia: ${s.rectificationAdvice.reason_code} · método ${s.rectificationAdvice.method}. Revisa los requisitos.`
              : "No se ha podido obtener una propuesta. Vuelve al paso anterior para intentarlo."}
          </p>
          <label className="fieldLabel">
            Causa de rectificación
            <select
              value={s.rectificationReason}
              onChange={(e) => s.setRectificationReason(e.target.value)}
            >
              {["R1", "R2", "R3", "R4", "R5"].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="fieldLabel">
            Método de rectificación
            <select
              value={s.rectificationMethod}
              onChange={(e) => s.setRectificationMethod(e.target.value)}
            >
              <option value="I">I · Por diferencias</option>
              <option value="S">S · Por sustitución</option>
            </select>
          </label>
          {s.rectificationAdvice?.warnings.map((message) => (
            <p key={message}>{message}</p>
          ))}
          <div className="phase2-actions">
            <Button variant="secondary" onClick={() => setStep(0)}>
              Atrás
            </Button>
            <Button
              onClick={() => setStep(2)}
              disabled={!s.rectificationAdvice || !canRectify}
            >
              Revisar rectificativa
            </Button>
          </div>
        </>
      )}
      {step === 2 && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            eventRef.current = event;
            setConfirm(true);
          }}
        >
          <h3>Revisa el abono</h3>
          <p>
            Causa elegida:{" "}
            <span className="bdr-mono">{s.rectificationReason}</span>. Método:{" "}
            {s.rectificationMethod === "I"
              ? "Por diferencias"
              : "Por sustitución"}
            .
          </p>
          <aside className="phase2-info">
            Base fija del abono actual: −10,00 €. IVA: −2,10 € (21 %). Total:
            −12,10 €. Esta versión no permite configurar otro importe; comprueba
            que corresponde a tu caso.
          </aside>
          <div className="phase2-actions">
            <Button variant="secondary" onClick={() => setStep(1)}>
              Atrás
            </Button>
            <Button type="submit" disabled={!canRectify}>
              Emitir rectificativa
            </Button>
          </div>
        </form>
      )}
      <ConfirmDialog
        open={confirm}
        title="Emitir rectificativa (abono)"
        confirmLabel="Confirmar rectificativa"
        busy={busy}
        onConfirm={() => void emit()}
        onCancel={() => setConfirm(false)}
        consequences={[
          "Vas a emitir un abono de −12,10 € (base −10,00 € e IVA −2,10 €).",
          `Rectifica la factura ${source?.series ?? ""}-${source?.number ?? ""}; causa ${s.rectificationReason}, método ${s.rectificationMethod}.`,
          "Se asignará numeración definitiva y se creará un registro encadenado. No se puede editar después.",
          "El envío a la AEAT no queda confirmado al emitir. Revisa la causa jurídica y los importes antes de continuar.",
        ]}
      />
    </section>
  );
}
