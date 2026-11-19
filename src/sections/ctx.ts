/** Lo que recibe cada pantalla: un hook por dominio y la ruta actual. */
import { t } from "../i18n/es";
import { fiscalProgress } from "../lib/progress";
import type { Route } from "../lib/routes";
import type { InvoiceSummary } from "../types";
import type { Model } from "../useCumpleFactura";
import type { Documents } from "../useDocuments";
import type { Recurring } from "../useRecurring";
import type { Verifactu } from "../useVerifactu";

export type Ctx = { m: Model; vf: Verifactu; docs: Documents; rec: Recurring; route: Route };

/** Nombre del cliente por id (las listas de Rust solo traen el id). */
export function customerName(m: Model, id: string | null | undefined) {
  return m.customers.find((item) => item.id === id)?.display_name ?? "—";
}

/** Los 5 pasos VERI*FACTU de una factura con la evidencia que hay cargada (lib/progress.ts). */
export function invoiceProgress(c: Ctx, invoice: InvoiceSummary) {
  const progress = fiscalProgress(invoice, c.m.progressRecords, c.vf.exportsThisSession, c.vf.submissions);
  return { ...progress, labeled: progress.steps.map((step) => ({ label: t(`paso.${step.key}`), state: step.state })) };
}
