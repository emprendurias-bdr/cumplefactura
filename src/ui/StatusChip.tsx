/**
 * StatusChip (design.md §7.2): pastilla mono en MAYÚSCULAS con icono + palabra, nunca solo color.
 * Recibe un `Status` de `status.ts` (tono y clave de texto); `detail` añade «· 3» o similar.
 * Estructura: <span class="bdr-chip bdr-chip--tono"><span aria-hidden>✓</span> Emitida</span>.
 */
import { t } from "../i18n/es";
import { TONE_ICON, type Status } from "./status";

export function StatusChip({ status, detail }: { status: Status; detail?: string | number }) {
  return (
    <span className={`bdr-chip bdr-chip--${status.tone}`}>
      <span aria-hidden="true">{TONE_ICON[status.tone]}</span>
      {t(status.label)}
      {detail != null && detail !== "" ? ` · ${detail}` : null}
    </span>
  );
}
