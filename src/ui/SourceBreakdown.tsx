/**
 * SourceBreakdown (design.md §7.12): de dónde sale una cifra calculada. Bloque --surface-2 con
 * las líneas (concepto · importe) y el total, más el chip de origen: CALCULADA (neu),
 * MANUAL (warn) o CONTABILIDAD (info). Sin estado.
 */
import { t } from "../i18n/es";
import { formatCents } from "../lib/moneyFormat";
import { StatusChip } from "./StatusChip";

type Origin = "calculada" | "manual" | "contabilidad";
const ORIGIN = {
  calculada: { tone: "neu", label: "origen.calculada" },
  manual: { tone: "warn", label: "origen.manual" },
  contabilidad: { tone: "info", label: "origen.contabilidad" },
} as const;

type Props = { rows: { label: string; cents: number }[]; total: { label: string; cents: number }; origin?: Origin };

export function SourceBreakdown({ rows, total, origin = "calculada" }: Props) {
  return (
    <div className="bdr-source" aria-label={t("origen.desglose")} role="group">
      <div className="cf-row cf-between">
        <span className="bdr-label">{t("origen.desglose")}</span>
        <StatusChip status={ORIGIN[origin]} />
      </div>
      {rows.map((row) => (
        <div key={row.label} className="bdr-source__row">
          <span>{row.label}</span>
          <span>{formatCents(row.cents)}</span>
        </div>
      ))}
      <div className="bdr-source__row bdr-source__total">
        <span>{total.label}</span>
        <span>{formatCents(total.cents)}</span>
      </div>
    </div>
  );
}
