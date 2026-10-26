import type {
  FiscalRecordSummary,
  InvoiceSummary,
  SubmissionPreparation,
  VerifactuSubmitSidecarInvocation,
} from "../../shared/types";
export type FiscalProgressState = {
  steps: { label: string; confirmed: boolean }[];
  responseLabel: string;
  csv: string | null;
};
/** Presentation only: never infer AEAT acceptance from a preflight, hash or local status. */
export function fiscalProgress(
  invoice: InvoiceSummary,
  records: FiscalRecordSummary[],
  invocation?: VerifactuSubmitSidecarInvocation | null,
  submission?: Pick<
    SubmissionPreparation,
    "invoice_id" | "export_id" | "xml_sha256"
  > | null,
): FiscalProgressState {
  const issued =
    ["Issued", "Void", "Rectified"].includes(invoice.status) &&
    invoice.number != null &&
    invoice.number > 0;
  const recorded =
    issued &&
    records.some(
      (r) =>
        r.invoice_id === invoice.id &&
        r.record_type.toLowerCase() === "alta" &&
        /^[a-f0-9]{64}$/i.test(r.fiscal_hash) &&
        r.fiscal_hash === invoice.fiscal_hash,
    );
  const sent = Boolean(
    issued &&
    invoice.status === "Issued" &&
    recorded &&
    submission?.invoice_id === invoice.id &&
    invocation?.invoice_id === invoice.id &&
    invocation.source_export_id === submission?.export_id &&
    invocation.xml_sha256 === submission?.xml_sha256 &&
    invocation.external_call_performed &&
    invocation.sidecar_call_performed &&
    invocation.status === "submitted",
  );
  const state = sent ? invocation?.estado_registro : null;
  const accepted = state === "Correcto" && Boolean(invocation?.csv?.trim());
  const withErrors =
    state === "AceptadoConErrores" && Boolean(invocation?.csv?.trim());
  const rejected = state === "Incorrecto";
  const responseLabel = accepted
    ? "Aceptada por la AEAT"
    : withErrors
      ? "Aceptada con errores · revisa la respuesta"
      : rejected
        ? "Rechazada por la AEAT"
        : sent
          ? "Enviada · sin respuesta confirmada"
          : recorded
            ? "Registro de alta · envío sin confirmar"
            : issued
              ? "Emitida · registro sin verificar en esta página"
              : "Aún sin emitir";
  return {
    steps: [
      { label: "Emitida", confirmed: issued },
      { label: "Registro de alta", confirmed: recorded },
      { label: "Enviada", confirmed: sent },
      {
        label: "Respuesta de la AEAT",
        confirmed: accepted || withErrors || rejected,
      },
    ],
    responseLabel,
    csv: sent && (accepted || withErrors) ? (invocation?.csv ?? null) : null,
  };
}
