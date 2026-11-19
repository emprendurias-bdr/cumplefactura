/**
 * Claves de periodo de las recurrentes (ESPEC §3.6): `2026-11` mensual, `2026-T4` trimestral,
 * `2026` anual. Aquí solo se calculan y se nombran para mostrarlas; la idempotencia la hace Rust.
 */
import { t } from "../i18n/es.ts"; // con extensión: lo importan los tests de node
import type { Frequency } from "../types";

const MONTHS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** Fecha ISO → clave de su periodo. */
export function periodKey(isoDate: string, frequency: Frequency): string {
  const [year, month] = isoDate.split("-").map(Number);
  if (frequency === "yearly") return String(year);
  if (frequency === "quarterly") return `${year}-T${Math.ceil(month / 3)}`;
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** Clave → texto: «noviembre de 2026», «4.º trimestre de 2026», «2026». */
export function periodLabel(key: string | null | undefined): string {
  if (!key) return "—";
  const quarter = /^(\d{4})-T([1-4])$/.exec(key);
  if (quarter) return `${quarter[2]}.º trimestre de ${quarter[1]}`;
  const month = /^(\d{4})-(\d{2})$/.exec(key);
  if (month && Number(month[2]) >= 1 && Number(month[2]) <= 12) return `${MONTHS[Number(month[2]) - 1]} de ${month[1]}`;
  return /^\d{4}$/.test(key) ? key : "—";
}

/** D3: «Recurrente · Cuota web · noviembre de 2026»; null si la factura no viene de una plantilla. */
export function recurringOrigin(label: string | null | undefined, key: string | null | undefined): string | null {
  if (!label) return null;
  const origin = `${t("origen.recurrente")} · ${label}`;
  return key ? `${origin} · ${periodLabel(key)}` : origin;
}

/** Día del periodo válido en todos los meses (1–28), como exige la especificación. */
export function isValidDay(day: number): boolean {
  return Number.isInteger(day) && day >= 1 && day <= 28;
}
