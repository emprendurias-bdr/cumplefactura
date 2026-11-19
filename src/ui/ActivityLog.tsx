/**
 * ActivityLog (design.md §7.11): lista cronológica quién · qué · cuándo · motivo, con la fecha en
 * mono. Filtro por tipo con un <select> cuando hay más de un tipo. Mismo componente para la
 * auditoría de la app y la historia de una factura o documento.
 * Estado: el tipo filtrado.
 */
import { useState } from "react";
import { t } from "../i18n/es";
import { invoiceDate, timeOf } from "../lib/invoiceDate";

export type Activity = { id: string; when: string | null; what: string; who?: string; type: string; reason?: string | null };

export function ActivityLog({ items, label, empty }: { items: Activity[]; label: string; empty?: string }) {
  const [type, setType] = useState("");
  const types = [...new Set(items.map((item) => item.type))];
  const shown = items
    .filter((item) => !type || item.type === type)
    .sort((a, b) => (b.when ?? "").localeCompare(a.when ?? ""));

  return (
    <div className="cf-stack-sm" aria-label={label} role="region">
      {types.length > 1 ? (
        <label className="cf-row cf-filter-inline">
          <span className="bdr-label">{t("actividad.tipo")}</span>
          <select className="bdr-ctx" value={type} onChange={(event) => setType(event.target.value)}>
            <option value="">{t("comun.todos")}</option>
            {types.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {shown.length === 0 ? (
        <p className="bdr-muted bdr-small">{empty ?? t("actividad.vacia")}</p>
      ) : (
        <ul className="bdr-log">
          {shown.map((item) => (
            <li key={item.id}>
              <time dateTime={item.when ?? undefined}>
                {invoiceDate(item.when)} {timeOf(item.when)}
              </time>
              <span>
                <strong>{item.what}</strong>
                {item.who ? <span className="bdr-muted"> · {item.who}</span> : null}
                {item.reason ? <span className="bdr-muted"> · {t("actividad.motivo")}: {item.reason}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
