/**
 * Estado y llamadas del envío VERI*FACTU: XML, comprobación previa, cola de remisión (S4), lista
 * de envíos (F3) y contraseña del certificado.
 *
 * Cola (S4, Orden HAC/1177/2024, art. 16.4): `remision_run` remite en orden los registros
 * pendientes. La app la mueve sola al abrir, cuando cambian las facturas (emitir, anular), cada
 * hora y cuando acaba la espera que pidió la AEAT. «Reintentar ahora» lanza la misma vuelta a mano.
 * Con el envío real apagado, las vueltas automáticas no envían nada (lo comprueba Rust).
 * Sin firma XAdES (RD 1007/2023, art. 16.3): la AEAT autentica el certificado en la conexión.
 * Contraseña (ADR-002, modo «Solo durante esta sesión»): vive SOLO en el estado de React; nunca
 * en localStorage, SQLite ni logs, y se olvida al cerrar la app. En modo `env` va `null`.
 * En ese modo, sin contraseña la cola no se mueve sola y el chip lo avisa.
 */
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { t } from "./i18n/es";
import { isMissingCommand } from "./lib/tauri";
import type {
  AnulacionRejection,
  RemisionStatus,
  SubmissionPackage,
  SubmitPreflight,
  VerifactuSubmissionSummary,
  VerifactuXmlResult,
} from "./types";
import { action, need, run, type Model } from "./useCumpleFactura";

/** Una hora: reintento mínimo de la Orden HAC/1177/2024, art. 16.4. */
export const RETRY_MS = 60 * 60 * 1000;

/** `true` si el registro pendiente más antiguo lleva más de una hora sin remitir. */
export function remisionOverdue(status: RemisionStatus | null, now = Date.now()): boolean {
  const oldest = status?.oldest_pending_at ? Date.parse(status.oldest_pending_at) : NaN;
  return Boolean(status?.pending) && Number.isFinite(oldest) && now - oldest > RETRY_MS;
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
  const [submissions, setSubmissions] = useState<VerifactuSubmissionSummary[]>([]);
  const [submissionsAvailable, setSubmissionsAvailable] = useState(true);
  const [remision, setRemision] = useState<RemisionStatus | null>(null);
  const [remisionRunning, setRemisionRunning] = useState(false);

  const issuedInvoices = m.invoices.filter((item) => ["Issued", "VoidPending", "VoidRejected", "Void", "Rectified"].includes(item.status));
  const selected = m.invoices.find((item) => item.id === selectedId) ?? issuedInvoices[0] ?? null;
  const needsPassword = m.passwordMode !== "env";
  const canPreflight = Boolean(submission) && (!needsPassword || certificatePassword.length > 0);
  const waitUntil = remision?.next_attempt_at ? Date.parse(remision.next_attempt_at) : 0;
  // Última respuesta guardada de la factura elegida (la lista va de la más reciente a la más antigua).
  const submitResult = submissions.find((row) => row.invoice_id === selected?.id) ?? null;
  // Las vueltas lanzadas por temporizador leen siempre lo último que escribió la persona.
  const latest = useRef({ certificateRef, certificatePassword, needsPassword, lastAttempt: remision?.last_attempt_at });
  latest.current = { certificateRef, certificatePassword, needsPassword, lastAttempt: remision?.last_attempt_at };

  /** S4: una vuelta de la cola. La automática va en silencio y no sale sin contraseña si hace falta. */
  async function runRemision(automatic: boolean) {
    const { certificateRef: ref, certificatePassword: password, needsPassword: needs, lastAttempt } = latest.current;
    if (automatic && needs && !password) return loadRemision();
    setRemisionRunning(true);
    try {
      const call = () =>
        invoke<RemisionStatus>("remision_run", { certificateRef: ref, certificatePassword: needs ? password || null : null, automatic });
      const status = automatic ? await call() : await run(call);
      setRemision(status);
      // Solo si hubo intento: la respuesta a una anulación cambia la factura en Rust.
      if (status.last_attempt_at !== lastAttempt) {
        await loadSubmissions();
        await m.refreshData();
      }
    } catch (error) {
      if (!isMissingCommand(error) && automatic) console.warn("remision_run", error);
    } finally {
      setRemisionRunning(false);
    }
  }

  async function loadRemision() {
    try {
      setRemision(await invoke<RemisionStatus>("remision_status"));
    } catch {
      // Sin comando (navegador o versión anterior): no hay chip de remisión.
    }
  }

  // Al abrir la app y cada vez que se emite o anula: remitir lo nuevo. La clave es de ids y estados,
  // no del array: refrescar tras un intento fallido no debe lanzar otra vuelta en bucle.
  const invoicesKey = m.invoices.map((item) => `${item.id}:${item.status}`).join(",");
  useEffect(() => {
    void loadSubmissions();
    void runRemision(true);
  }, [invoicesKey]);

  // Reintento al menos cada hora (art. 16.4); la antigüedad del pendiente se refresca cada minuto.
  useEffect(() => {
    const retry = setInterval(() => void runRemision(true), RETRY_MS);
    const refresh = setInterval(() => void loadRemision(), 60 * 1000);
    return () => {
      clearInterval(retry);
      clearInterval(refresh);
    };
  }, []);

  // Cuando acaba la espera que pidió la AEAT (TiempoEsperaEnvio), sale el siguiente.
  useEffect(() => {
    if (!remision?.pending || !waitUntil) return;
    const timer = setTimeout(() => void runRemision(true), Math.max(0, waitUntil - Date.now()) + 1000);
    return () => clearTimeout(timer);
  }, [waitUntil, remision?.pending]);

  // Modo sesión: al escribir la contraseña, la cola ya puede moverse.
  useEffect(() => {
    if (certificatePassword && remision?.pending) void runRemision(true);
  }, [certificatePassword.length > 0]);

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
    if (!pkg) void recoverPendingAnulacion(id);
  }

  /** S1: tras reiniciar, la anulación pendiente se recupera de la base (no se puede volver a exportar). */
  async function recoverPendingAnulacion(invoiceId: string): Promise<SubmissionPackage | null> {
    if (m.invoices.find((item) => item.id === invoiceId)?.status !== "VoidPending") return null;
    try {
      const pkg = await invoke<SubmissionPackage | null>("verifactu_pending_anulacion", { invoiceId });
      if (pkg) {
        setSubmission(pkg);
        setExports((current) => [pkg, ...current.filter((item) => item.invoice_id !== invoiceId)]);
      }
      return pkg;
    } catch {
      return null;
    }
  }

  /** El último XML exportado pasa a ser el que se envía; reinicia comprobación y envío. */
  function useForSubmission(invoiceId: string, result: VerifactuXmlResult) {
    const pkg = { invoice_id: invoiceId, export_id: result.export_id, xml_path: result.target_path, xml_sha256: result.xml_sha256 };
    setSubmission(pkg);
    setExports((current) => [pkg, ...current.filter((item) => item.invoice_id !== invoiceId)]);
    setSubmitPreflight(null);
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

  /**
   * Anular: XML de anulación encadenado; la factura queda «Anulación pendiente» en Rust.
   * `sinRegistroPrevio` solo tras confirmarlo la persona (decisión 12.2); Rust lo vuelve a comprobar.
   */
  const exportCancelXml = action(
    t("ok.anulacion"),
    async (invoiceId: string, reason: string, sinRegistroPrevio = false) => {
      const result = await invoke<VerifactuXmlResult>("verifactu_xml_anulacion_draft_export", {
        invoiceId,
        targetPath: m.paths.cancelXml,
        reason,
        sinRegistroPrevio,
      });
      return { invoiceId, result };
    },
    async ({ invoiceId, result }) => {
      setCancelXmlResult(result);
      useForSubmission(invoiceId, result);
      await m.refreshData();
    },
  );

  /** S1b: códigos del rechazo de la última anulación; `null` si no la hay o si el comando no existe. Otro error sale en el toast. */
  async function loadAnulacionRejection(invoiceId: string): Promise<AnulacionRejection | null> {
    try {
      return await invoke<AnulacionRejection | null>("invoice_anulacion_rejection", { invoiceId });
    } catch (error) {
      if (isMissingCommand(error)) return null;
      return run(() => Promise.reject(error));
    }
  }

  /** S1b: desistir de la anulación rechazada; la factura vuelve a Emitida en Rust. */
  const desistVoid = action(
    t("ok.desistir"),
    (invoiceId: string) => invoke<void>("invoice_void_desist", { invoiceId }),
    () => m.refreshData(),
  );

  /** Entrada de la comprobación previa: paquete exportado, certificado y contraseña en memoria. */
  const submitInput = (pkg: SubmissionPackage) => ({
    input: {
      ...pkg,
      certificate_ref: certificateRef,
      certificate_password: needsPassword ? certificatePassword || null : null,
    },
  });
  const preflightSubmit = action(
    null,
    () => invoke<SubmitPreflight>("verifactu_submit_preflight", submitInput(need(submission, t("error.sinXml")))),
    setSubmitPreflight,
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
    waitUntil,
    canPreflight,
    exportXml,
    exportCancelXml,
    loadAnulacionRejection,
    desistVoid,
    preflightSubmit,
    remision,
    remisionRunning,
    /** «Reintentar ahora»: la misma vuelta de la cola, lanzada por la persona. */
    retryNow: () => runRemision(false),
    canRetryNow: Boolean(remision?.pending) && !remisionRunning && (!needsPassword || certificatePassword.length > 0),
    loadSubmissions,
  };
}

export type Verifactu = ReturnType<typeof useVerifactu>;
