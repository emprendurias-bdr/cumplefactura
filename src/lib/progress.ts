/**
 * Los 5 pasos VERI*FACTU de design.md §10: Emitida → Registro → XML → Enviada → Aceptada.
 * Sin «Firmando»: en modo VERI*FACTU no se firma (RD 1007/2023, art. 16.3).
 *
 * Regla (§7.8 y docs/PLAN_TRABAJO §F2): un paso solo se marca con evidencia.
 * - Emitida: factura con número y estado emitido/anulado/rectificado.
 * - Registro: registro de alta de esa factura con la misma huella.
 * - XML: XML exportado en esta sesión o fila de envío de esa factura.
 * - Enviada: la AEAT respondió (fila de `verifactu_submissions` distinta de `transport_error`).
 * - Aceptada: `accepted` (ok), `accepted_with_errors` (warn) o `rejected` (err).
 * Un `transport_error` no es «enviada»: queda «Sin confirmar» y se reintenta a mano.
 */
export type StepKey = "emitida" | "registro" | "xml" | "enviada" | "aceptada";
export type StepState = "done" | "current" | "future" | "warn" | "error";
export type ProgressSummary =
  | "sinEmitir" | "emitida" | "registrada" | "xml" | "sinConfirmar" | "aceptada" | "conErrores" | "rechazada";

type InvoiceLike = { id: string; status: string; number?: number | null; fiscal_hash?: string | null };
type RecordLike = { invoice_id: string; record_type: string; fiscal_hash: string };
type ExportLike = { invoice_id: string };
type SubmissionLike = { invoice_id: string; status: string; csv: string | null; submitted_at?: string };

export type FiscalProgress = {
  steps: { key: StepKey; state: StepState }[];
  summary: ProgressSummary;
  csv: string | null;
};

export const STEP_KEYS: StepKey[] = ["emitida", "registro", "xml", "enviada", "aceptada"];

export function fiscalProgress(
  invoice: InvoiceLike,
  records: RecordLike[],
  exports: ExportLike[] = [],
  submissions: SubmissionLike[] = [],
): FiscalProgress {
  const issued = ["Issued", "Void", "Rectified"].includes(invoice.status) && (invoice.number ?? 0) > 0;
  const recorded =
    issued &&
    records.some(
      (r) =>
        r.invoice_id === invoice.id &&
        r.record_type.toLowerCase() === "alta" &&
        /^[a-f0-9]{64}$/i.test(r.fiscal_hash) &&
        r.fiscal_hash === invoice.fiscal_hash,
    );
  const own = submissions
    .filter((s) => s.invoice_id === invoice.id)
    .sort((a, b) => (b.submitted_at ?? "").localeCompare(a.submitted_at ?? ""));
  const xml = recorded && (exports.some((e) => e.invoice_id === invoice.id) || own.length > 0);
  const answered = xml ? own.filter((s) => s.status !== "transport_error") : [];
  const accepted = answered.find((s) => s.status === "accepted" && s.csv?.trim());
  const withErrors = !accepted ? answered.find((s) => s.status === "accepted_with_errors" && s.csv?.trim()) : undefined;
  const rejected = !accepted && !withErrors && answered[0]?.status === "rejected";
  const sent = answered.length > 0;
  const pending = xml && !accepted && !withErrors && own[0]?.status === "transport_error";

  const done = [issued, recorded, xml, sent];
  const states: StepState[] = done.map((ok) => (ok ? "done" : "future"));
  states.push(accepted ? "done" : withErrors ? "warn" : rejected ? "error" : "future");
  const firstPending = states.findIndex((state) => state === "future");
  if (firstPending >= 0 && states.slice(firstPending).every((state) => state === "future")) states[firstPending] = "current";

  const summary: ProgressSummary = accepted
    ? "aceptada"
    : withErrors
      ? "conErrores"
      : rejected
        ? "rechazada"
        : pending
          ? "sinConfirmar"
          : xml
            ? "xml"
            : recorded
              ? "registrada"
              : issued
                ? "emitida"
                : "sinEmitir";
  return {
    steps: STEP_KEYS.map((key, index) => ({ key, state: states[index] })),
    summary,
    csv: (accepted ?? withErrors)?.csv ?? null,
  };
}
