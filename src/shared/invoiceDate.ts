import { formatDate } from "@bdr/ui/format";
/** Matches the civil date used by the native XML, not the workstation timezone. */
export function invoiceDate(value?: string | null): string {
  if (typeof value !== "string") return "—";
  const match =
    /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.exec(
      value,
    );
  if (!match) return "—";
  try {
    return formatDate(match[1]);
  } catch {
    return "—";
  }
}
