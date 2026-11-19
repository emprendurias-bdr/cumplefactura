/**
 * Reglas de interfaz de los documentos comerciales (ESPEC §3.4 y §5.3). La regla de verdad
 * está en Rust; aquí solo se decide qué botón se ofrece y por qué está deshabilitado.
 */
import type { CommercialKind, CommercialStatus } from "../types";
import type { DocTab } from "./routes";

export const KIND_BY_TAB: Record<DocTab, CommercialKind> = {
  presupuestos: "quote",
  proformas: "proforma",
  albaranes: "delivery_note",
};

export const DEFAULT_SERIES: Record<CommercialKind, string> = { quote: "P", proforma: "PF", delivery_note: "AL" };

export type GroupReason = "none" | "mixedCustomers" | "mixedMonths" | "notDelivered" | "alreadyInvoiced";

/** Albaranes que se pueden facturar juntos: mismo cliente, mismo mes natural, entregados y sin facturar. */
export function groupInvoiceReason(
  docs: { customer_id: string; status: CommercialStatus; delivery_date: string | null; issue_date: string; invoice_id: string | null }[],
): GroupReason | null {
  if (docs.length === 0) return "none";
  if (docs.some((d) => d.status === "invoiced" || d.invoice_id)) return "alreadyInvoiced";
  if (docs.some((d) => d.status !== "delivered")) return "notDelivered";
  if (new Set(docs.map((d) => d.customer_id)).size > 1) return "mixedCustomers";
  if (new Set(docs.map((d) => (d.delivery_date ?? d.issue_date).slice(0, 7))).size > 1) return "mixedMonths";
  return null;
}

export type DocAction = "send" | "deliver" | "accept" | "reject" | "pay" | "convert" | "derive" | "void" | "delete";

/** Acciones permitidas por tipo y estado (transiciones de ESPEC §3.4). */
export function docActions(kind: CommercialKind, status: CommercialStatus): DocAction[] {
  if (status === "draft") return [kind === "delivery_note" ? "deliver" : "send", "delete"];
  if (kind === "quote") {
    if (status === "sent") return ["accept", "reject", "void"];
    if (status === "accepted") return ["convert", "derive", "void"];
  }
  if (kind === "proforma") {
    if (status === "sent") return ["convert", "pay", "derive", "void"];
    if (status === "paid") return ["convert", "derive", "void"];
  }
  if (kind === "delivery_note" && status === "delivered") return ["convert", "void"];
  return [];
}
