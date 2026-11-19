/**
 * Estado y llamadas del envío VERI*FACTU: XML, comprobación previa, envío, lista de envíos (F3),
 * reintento manual y contraseña del certificado.
 *
 * Flujo: Exportar XML → Comprobación previa (el sidecar no llama a la AEAT) → Enviar.
 * Sin firma XAdES (RD 1007/2023, art. 16.3): la AEAT autentica el certificado en la conexión.
 * Contraseña (ADR-002, modo «Solo durante esta sesión»): vive SOLO en el estado de React; nunca
 * en localStorage, SQLite ni logs, y se olvida al cerrar la app. En modo `env` va `null`.
 * No hay reintentos automáticos ni cola: «Reintentar» lo pulsa la persona.
 */
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { t } from "./i18n/es";
import { isMissingCommand } from "./lib/tauri";
import type {
  SubmissionPackage,
  SubmitPreflight,
  VerifactuSubmission,
  VerifactuSubmissionSummary,
  VerifactuXmlResult,
} from "./types";
import { action, need, type Model } from "./useCumpleFactura";

/** Fila «como en la tabla» a partir de la respuesta del envío de esta sesión. */
function asSummary(result: VerifactuSubmission): VerifactuSubmissionSummary {
  return {
    id: result.submission_id ?? `sesion-${result.export_id}`,
    invoice_id: result.invoice_id,
    fiscal_export_id: result.export_id,
    endpoint_name: result.endpoint_name,
    xml_sha256: result.xml_sha256,
    status: result.status,
    csv: result.csv,
    estado_envio: result.estado_envio,
    estado_registro: result.estado_registro,
    codigo_error: result.codigo_error,
    descripcion_error: result.descripcion_error,
    tiempo_espera_envio_seconds: result.tiempo_espera_envio_seconds,
    submitted_at: new Date().toISOString(),
  };
}

/** Segundos que aún pide esperar la AEAT según el último envío con respuesta. */
export function waitSecondsLeft(rows: VerifactuSubmissionSummary[], now = Date.now()): number {
  const last = rows.find((row) => row.tiempo_espera_envio_seconds != null && row.status !== "transport_error");
  if (!last?.tiempo_espera_envio_seconds) return 0;
  const until = Date.parse(last.submitted_at) + last.tiempo_espera_envio_seconds * 1000;
  return Number.isFinite(until) ? Math.max(0, Math.ceil((until - now) / 1000)) : 0;
}

export function useVerifactu(m: Model) {
  const [selectedId, setSelectedId] = useState<string>("");
  const [xmlResult, setXmlResult] = useState<VerifactuXmlResult | null>(null);
  const [cancelXmlResult, setCancelXmlResult] = useState<VerifactuXmlResult | null>(null);
  const [submission, setSubmission] = useState<SubmissionPackage | null>(null);
  const [exportsThisSession, setExports] = useState<SubmissionPackage[]>([]);
  const [certificateRef, setCertificateRef] = useState("vault://certs/empresa");
  const [certificatePassword, setCertificatePassword] = useState("");
  const [submitPreflight, setSubmitPreflight] = useState<SubmitPreflight | null>(null);
  const [submitResult, setSubmitResult] = useState<VerifactuSubmission | null>(null);
  const [submissions, setSubmissions] = useState<VerifactuSubmissionSummary[]>([]);
  const [submissionsAvailable, setSubmissionsAvailable] = useState(true);
  const [now, setNow] = useState(Date.now());

  const issuedInvoices = m.invoices.filter((item) => item.status === "Issued" || item.status === "Void" || item.status === "Rectified");
  const selected = m.invoices.find((item) => item.id === selectedId) ?? issuedInvoices[0] ?? null;
  const needsPassword = m.passwordMode !== "env";
  const waitLeft = waitSecondsLeft(submissions, now);
  const canPreflight = Boolean(submission) && (!needsPassword || certificatePassword.length > 0);
  const canSubmit = Boolean(submission) && submitPreflight?.status === "ready" && waitLeft === 0;

  useEffect(() => {
    void loadSubmissions();
  }, [m.invoices]);

  useEffect(() => {
    if (waitLeft === 0) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [waitLeft > 0]);

  /** F3: `verifactu_submission_list`. Si el comando aún no existe, solo se ve el envío de esta sesión. */
  async function loadSubmissions() {
    try {
      setSubmissions(await invoke<VerifactuSubmissionSummary[]>("verifactu_submission_list", { invoiceId: null }));
      setSubmissionsAvailable(true);
    } catch (error) {
      if (isMissingCommand(error)) setSubmissionsAvailable(false);
    }
  }

  function selectInvoice(id: string) {
    setSelectedId(id);
    const pkg = exportsThisSession.find((item) => item.invoice_id === id) ?? null;
    setSubmission(pkg);
    setSubmitPreflight(null);
    setSubmitResult(null);
  }

  /** El último XML exportado pasa a ser el que se envía; reinicia comprobación y envío. */
  function useForSubmission(invoiceId: string, result: VerifactuXmlResult) {
    const pkg = { invoice_id: invoiceId, export_id: result.export_id, xml_path: result.target_path, xml_sha256: result.xml_sha256 };
    setSubmission(pkg);
    setExports((current) => [pkg, ...current.filter((item) => item.invoice_id !== invoiceId)]);
    setSubmitPreflight(null);
    setSubmitResult(null);
  }

  const exportXml = action(
    t("ok.xml"),
    async (invoiceId: string) => {
      const result = await invoke<VerifactuXmlResult>("verifactu_xml_draft_export", { invoiceId, targetPath: m.paths.xml });
      return { invoiceId, result };
    },
    ({ invoiceId, result }) => {
      setSelectedId(invoiceId);
      setXmlResult(result);
      useForSubmission(invoiceId, result);
    },
  );

  /** Anular: XML de anulación encadenado; la factura pasa a Anulada en Rust. */
  const exportCancelXml = action(
    t("ok.anulacion"),
    async (invoiceId: string, reason: string) => {
      const result = await invoke<VerifactuXmlResult>("verifactu_xml_anulacion_draft_export", { invoiceId, targetPath: m.paths.cancelXml, reason });
      return { invoiceId, result };
    },
    async ({ invoiceId, result }) => {
      setCancelXmlResult(result);
      useForSubmission(invoiceId, result);
      await m.refreshData();
    },
  );

  /** Entrada común de comprobación y envío: paquete exportado, certificado y contraseña en memoria. */
  const submitInput = (pkg: SubmissionPackage) => ({
    input: {
      ...pkg,
      certificate_ref: certificateRef,
      certificate_password: needsPassword ? certificatePassword || null : null,
    },
  });
  const doPreflight = (pkg: SubmissionPackage) => invoke<SubmitPreflight>("verifactu_submit_preflight", submitInput(pkg));
  const doSubmit = (pkg: SubmissionPackage) => invoke<VerifactuSubmission>("verifactu_submit", submitInput(pkg));

  async function afterSubmit(result: VerifactuSubmission | null) {
    if (!result) return;
    setSubmitResult(result);
    if (!submissionsAvailable) setSubmissions((current) => [asSummary(result), ...current]);
    else await loadSubmissions();
  }

  const preflightSubmit = action(null, () => doPreflight(need(submission, t("error.sinXml"))), setSubmitPreflight);
  const submitToAeat = action(null, () => doSubmit(need(submission, t("error.sinXml"))), afterSubmit);

  /** Reintento manual de un envío «Sin confirmar»: repite comprobación previa y envío del mismo XML. */
  const retry = action(
    null,
    async (row: Pick<VerifactuSubmissionSummary, "fiscal_export_id" | "invoice_id">) => {
      const pkg = need(exportsThisSession.find((item) => item.export_id === row.fiscal_export_id), t("error.sinXml"));
      setSelectedId(row.invoice_id);
      setSubmission(pkg);
      const check = await doPreflight(pkg);
      setSubmitPreflight(check);
      return check.status === "ready" ? doSubmit(pkg) : null;
    },
    afterSubmit,
  );

  return {
    selected,
    selectedId: selected?.id ?? "",
    issuedInvoices,
    selectInvoice,
    xmlResult,
    cancelXmlResult,
    submission,
    exportsThisSession,
    certificateRef,
    setCertificateRef,
    certificatePassword,
    setCertificatePassword,
    needsPassword,
    submitPreflight,
    submitResult,
    submissions,
    submissionsAvailable,
    waitLeft,
    canPreflight,
    canSubmit,
    exportXml,
    exportCancelXml,
    preflightSubmit,
    submitToAeat,
    retry,
    canRetry: (row: VerifactuSubmissionSummary) => exportsThisSession.some((item) => item.export_id === row.fiscal_export_id),
    loadSubmissions,
  };
}

export type Verifactu = ReturnType<typeof useVerifactu>;
