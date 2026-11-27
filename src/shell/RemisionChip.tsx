/**
 * Remisión a la AEAT (S4) en la barra superior y al cerrar la app.
 * - RemisionChip: ✓ REMITIDO, o «SIN REMITIR · N · último intento HH:MM». Aviso (!) si el envío
 *   real está apagado, si el pendiente más antiguo pasa de una hora o si falta la contraseña.
 *   Orden HAC/1177/2024, art. 16.4: el aviso de cuántos faltan se ve mientras quede alguno.
 *   Clic → Verifactu.
 * - RemisionAviso: el mismo aviso explicado, en la pantalla Verifactu.
 * - RemisionCierre: al cerrar la ventana con pendientes, ConfirmDialog que avisa pero no bloquea
 *   («Cerrar igualmente» cierra). Fuera de Tauri (navegador) no hace nada.
 */
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useRef, useState } from "react";
import { errorText, t } from "../i18n/es";
import { timeOf } from "../lib/invoiceDate";
import { href } from "../lib/routes";
import { Callout } from "../ui/Callout";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { remisionStatus } from "../ui/status";
import { StatusChip } from "../ui/StatusChip";
import type { Verifactu } from "../useVerifactu";
import { remisionOverdue } from "../useVerifactu";

/** Motivos de aviso de la cola, en orden de importancia. */
function reasons(vf: Verifactu): string[] {
  const status = vf.remision;
  if (!status?.pending) return [];
  const list: string[] = [];
  if (!status.sending_enabled) list.push(t("remision.avisoApagado"));
  else if (vf.needsPassword && !vf.certificatePassword) list.push(t("remision.avisoPassword"));
  if (remisionOverdue(status)) list.push(t("remision.avisoHora"));
  return list;
}

export function RemisionChip({ vf }: { vf: Verifactu }) {
  const status = vf.remision;
  if (!status) return null;
  const last = status.last_attempt_at ? t("remision.ultimo", { h: timeOf(status.last_attempt_at) }) : "";
  const detail = status.pending ? [status.pending, last].filter(Boolean).join(" · ") : undefined;
  return (
    <a className="cf-chainchip" href={href({ section: "verifactu" })} title={[t("remision.ayuda"), ...reasons(vf)].join(" ")}>
      <StatusChip status={remisionStatus(status.pending, reasons(vf).length > 0)} detail={detail} />
    </a>
  );
}

export function RemisionAviso({ vf }: { vf: Verifactu }) {
  const status = vf.remision;
  const list = reasons(vf);
  if (!status?.pending || (!list.length && !status.last_error)) return null;
  return (
    <Callout tone="warn" live title={t("remision.avisoTitulo", { n: status.pending })}>
      {[...list, status.last_error ? t("remision.avisoError", { d: errorText(status.last_error) }) : ""].filter(Boolean).join(" ")}
    </Callout>
  );
}

export function RemisionCierre({ vf }: { vf: Verifactu }) {
  const [asking, setAsking] = useState(false);
  const pending = useRef(0);
  pending.current = vf.remision?.pending ?? 0;

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    try {
      getCurrentWindow()
        .onCloseRequested((event) => {
          if (pending.current > 0) {
            event.preventDefault();
            setAsking(true);
          }
        })
        .then((stop) => (unlisten = stop))
        .catch(() => undefined);
    } catch {
      // Navegador sin Tauri: no hay ventana que vigilar.
    }
    return () => unlisten?.();
  }, []);

  return (
    <ConfirmDialog
      open={asking}
      title={t("remision.cerrarTitulo", { n: pending.current })}
      consequences={[t("remision.cerrar1"), t("remision.cerrar2")]}
      verb={t("remision.cerrarVerbo")}
      onConfirm={() => getCurrentWindow().destroy()}
      onCancel={() => setAsking(false)}
    />
  );
}
