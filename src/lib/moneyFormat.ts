/**
 * Importes es-ES (`1.234,56 €`) desde céntimos enteros, sin dividir en coma flotante.
 * Rescatado de fase-2 sin `@bdr/ui/format`: la agrupación de miles se hace aquí.
 */
const NBSP = " ";

function group(digits: string) {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Solo presentación: un valor nulo o no representable no se redondea ni se inventa. */
export function formatCents(value: number | null | undefined): string {
  if (value == null) return "Importe no disponible";
  if (!Number.isSafeInteger(value)) return "Importe no representable";
  const minor = BigInt(value);
  const abs = minor < 0n ? -minor : minor;
  const amount = `${group((abs / 100n).toString())},${(abs % 100n).toString().padStart(2, "0")}`;
  return `${minor < 0n ? "−" : ""}${amount}${NBSP}€`;
}

/** Puntos básicos → `21 %` (2100 → 21, 1050 → 10,5). */
export function formatPercent(basisPoints: number | null | undefined): string {
  if (basisPoints == null || !Number.isFinite(basisPoints)) return "—";
  const value = (basisPoints / 100).toLocaleString("es-ES", { maximumFractionDigits: 2 });
  return `${value}${NBSP}%`;
}
