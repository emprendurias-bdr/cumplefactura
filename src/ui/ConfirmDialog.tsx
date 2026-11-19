/**
 * ConfirmDialog (design.md §7.7) sobre <dialog> nativo (Esc cierra, foco atrapado por el navegador;
 * entrada y salida en motion.css). Título en pregunta, 2–4 consecuencias concretas, lo que no se
 * podrá deshacer en un aviso warn/err y los botones «Cancelar» (ghost) + verbo concreto.
 * Estado: casilla «Lo entiendo» (`acknowledge`, solo emitir y anular) y motivo (`reason`,
 * obligatorio en borrados y anulaciones de documentos). El botón queda deshabilitado hasta cumplirlos.
 * Ctrl+Enter confirma si está permitido.
 */
import { useEffect, useId, useRef, useState } from "react";
import { t } from "../i18n/es";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { Checkbox, Field } from "./Field";

type Props = {
  open: boolean;
  title: string;
  consequences: string[];
  irreversible?: string;
  verb: string;
  danger?: boolean;
  acknowledge?: boolean;
  reason?: boolean;
  loading?: boolean;
  loadingText?: string;
  /** Si devuelve una promesa, el botón queda en «cargando» hasta que termine. */
  onConfirm: (reason: string) => void | Promise<unknown>;
  onCancel: () => void;
};

export function ConfirmDialog(props: Props) {
  const { open, title, consequences, irreversible, verb, danger, acknowledge, reason, loadingText, onConfirm, onCancel } = props;
  const [busy, setBusy] = useState(false);
  const loading = props.loading || busy;
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [understood, setUnderstood] = useState(false);
  const [motive, setMotive] = useState("");

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setUnderstood(false);
      setMotive("");
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const allowed = (!acknowledge || understood) && (!reason || motive.trim().length > 0) && !loading;
  async function confirm() {
    if (!allowed) return;
    setBusy(true);
    try {
      await onConfirm(motive.trim());
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={ref}
      className="bdr-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!loading) onCancel();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
          event.stopPropagation();
          void confirm();
        }
      }}
    >
      {open ? (
        <form
          className="bdr-dialog__body"
          method="dialog"
          onSubmit={(event) => {
            event.preventDefault();
            void confirm();
          }}
        >
          <h2 id={titleId} className="bdr-h2">
            {title}
          </h2>
          <ul>
            {consequences.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          {irreversible ? <Callout tone={danger ? "err" : "warn"} title={irreversible} /> : null}
          {reason ? (
            <Field label={t("confirm.motivo")} help={t("confirm.motivoAyuda")}>
              <textarea className="bdr-input cf-textarea" value={motive} required onChange={(event) => setMotive(event.target.value)} />
            </Field>
          ) : null}
          {acknowledge ? (
            <Checkbox label={t("confirm.loEntiendo")} checked={understood} onChange={(event) => setUnderstood(event.target.checked)} />
          ) : null}
          <div className="bdr-dialog__actions">
            <Button variant="ghost" onClick={onCancel} disabled={loading}>
              {t("comun.cancelar")}
            </Button>
            <Button type="submit" variant={danger ? "danger" : "primary"} disabled={!allowed} loading={loading} loadingText={loadingText}>
              {verb}
            </Button>
          </div>
        </form>
      ) : null}
    </dialog>
  );
}
