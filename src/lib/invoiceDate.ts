/**
 * Fechas `dd/mm/aaaa` (design.md §8). Se usa la fecha civil que escribe Rust, no la zona
 * horaria del equipo: `2026-10-26T23:30:00-03:00` es el 26/10/2026. Rescatado de fase-2.
 */
function civil(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) return "—";
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

/** Marca de tiempo RFC 3339 de Rust → `dd/mm/aaaa`; nunca inventa una fecha. */
export function invoiceDate(value?: string | null): string {
  if (typeof value !== "string") return "—";
  const match = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  return match ? civil(match[1]) : "—";
}

/** Fecha ISO `AAAA-MM-DD` (documentos, recurrentes) → `dd/mm/aaaa`. */
export function isoDate(value?: string | null): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "—";
  return civil(value);
}

/** Hora `hh:mm` de una marca de tiempo, para el registro de actividad. */
export function timeOf(value?: string | null): string {
  const match = typeof value === "string" ? /T(\d{2}:\d{2})/.exec(value) : null;
  return match ? match[1] : "";
}

/** Hoy en ISO civil del equipo (para formularios). */
export function todayIso(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
