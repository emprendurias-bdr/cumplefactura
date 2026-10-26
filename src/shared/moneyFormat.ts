import { formatAmount } from "@bdr/ui/format";
/** Presentation only: avoids floating-point division of native integer cents. */
export function formatCents(value: number | null | undefined): string {
  if (value == null) return "Importe no disponible";
  if (!Number.isSafeInteger(value)) return "Importe no representable";
  const minor = BigInt(value);
  const abs = minor < 0n ? -minor : minor;
  return `${formatAmount(`${minor < 0n ? "-" : ""}${abs / 100n}.${(abs % 100n).toString().padStart(2, "0")}`)}\u00a0€`;
}
