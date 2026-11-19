/**
 * Único mapa estado → tono de la app (design.md §7.2). Cada estado del dominio sale de aquí con
 * su tono (`ok/info/warn/err/neu`, §4.4) y la clave de su palabra en `i18n/es.ts`; el icono lo
 * pone el tono. Ninguna pantalla decide colores de estado por su cuenta.
 */
import type { Key } from "../i18n/es";

export type Tone = "ok" | "info" | "warn" | "err" | "neu";
export type Status = { tone: Tone; label: Key };

export const TONE_ICON: Record<Tone, string> = { ok: "✓", info: "◷", warn: "!", err: "✕", neu: "—" };

const s = (tone: Tone, label: Key): Status => ({ tone, label });
const UNKNOWN = s("neu", "estado.desconocido");

const INVOICE: Record<string, Status> = {
  Draft: s("warn", "estado.borrador"),
  Issued: s("ok", "estado.emitida"),
  Rectified: s("info", "estado.rectificada"),
  Void: s("neu", "estado.anulada"),
};

const SUBMISSION: Record<string, Status> = {
  accepted: s("ok", "estado.aceptada"),
  accepted_with_errors: s("warn", "estado.aceptadaConErrores"),
  rejected: s("err", "estado.rechazada"),
  transport_error: s("warn", "estado.sinConfirmar"),
};

const DOCUMENT: Record<string, Status> = {
  draft: s("warn", "estado.borrador"),
  sent: s("info", "estado.enviado"),
  accepted: s("ok", "estado.aceptado"),
  rejected: s("err", "estado.rechazado"),
  expired: s("neu", "estado.caducado"),
  converted: s("ok", "estado.convertido"),
  paid: s("ok", "estado.pagado"),
  delivered: s("ok", "estado.entregado"),
  invoiced: s("ok", "estado.facturado"),
  void: s("neu", "estado.anulado"),
  superseded: s("neu", "estado.sustituido"),
};

export const invoiceStatus = (status: string) => INVOICE[status] ?? UNKNOWN;
/** Las rectificativas llevan su propio chip además del estado. */
export const invoiceKind = (kind: string) => (kind === "Rectifying" ? s("warn", "estado.rectificativa") : null);
export const submissionStatus = (status: string | null | undefined) =>
  status ? (SUBMISSION[status] ?? UNKNOWN) : s("neu", "estado.noEnviada");
export const documentStatus = (status: string) => DOCUMENT[status] ?? UNKNOWN;
export const recordType = (type: string) =>
  type.toLowerCase() === "alta" ? s("info", "estado.alta") : s("neu", "estado.anulacion");
/** Sin verificación → «Sin comprobar»; sin registros → «Sin registros»: nunca ok sin evidencia. */
export const chainStatus = (valid: boolean | null | undefined, records?: number) =>
  valid == null
    ? s("neu", "estado.sinComprobar")
    : records === 0
      ? s("neu", "estado.sinRegistros")
      : valid
        ? s("ok", "estado.cadenaIntegra")
        : s("err", "estado.cadenaIncidencias");
export const preflightStatus = (status: string | null | undefined) =>
  status === "ready" ? s("ok", "estado.listo") : status === "blocked" ? s("err", "estado.bloqueado") : s("neu", "estado.sinComprobar");
export const activeStatus = (active: boolean, feminine = false) =>
  active
    ? s("ok", feminine ? "estado.activa" : "estado.activo")
    : s("neu", feminine ? "estado.inactiva" : "estado.inactivo");
export const recurringStatus = (active: boolean) => (active ? s("ok", "estado.activa") : s("neu", "estado.pausada"));
const PAYMENT: Record<string, Status> = {
  unpaid: s("neu", "estado.pendiente"),
  partial: s("info", "estado.parcial"),
  paid: s("ok", "estado.cobrada"),
  overdue: s("err", "estado.vencida"),
};
/**
 * D6: cobro de una factura. Solo las emitidas (o rectificadas) se cobran; una rectificativa en
 * negativo no se «cobra» (Rust la daría por pagada): null = la pantalla enseña «—».
 */
export const paymentStatus = (invoice: { status: string; total_cents: number; payment_status?: string | null }) =>
  !["Issued", "Rectified"].includes(invoice.status) || invoice.total_cents < 0 || !invoice.payment_status
    ? null
    : (PAYMENT[invoice.payment_status] ?? UNKNOWN);
/** Caducidad del certificado leída en la comprobación previa (F3). */
export const expiryStatus = (days: number | null | undefined) =>
  days == null ? s("neu", "estado.sinComprobar") : days < 0 ? s("err", "estado.caducado") : days <= 30 ? s("warn", "estado.porCaducar") : s("ok", "estado.vigente");
