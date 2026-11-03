/**
 * Confirmación de «Anular factura» (design.md §7.7), compartida por la lista y la ficha.
 * Anular genera el registro de anulación encadenado (XML de anulación) y la factura pasa a
 * Anulada. Pide «Lo entiendo» porque no se deshace; no pide motivo porque Rust aún no lo guarda.
 */
import { t } from "../i18n/es";
import { invoiceNumber } from "../lib/numberProposal";
import type { InvoiceSummary } from "../types";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import type { Ctx } from "./ctx";

export function AnularDialog({ c, invoice, onClose }: { c: Ctx; invoice: InvoiceSummary | null; onClose: () => void }) {
  const number = invoice ? (invoiceNumber(invoice) ?? "") : "";
  return (
    <ConfirmDialog
      open={Boolean(invoice)}
      title={t("anular.titulo", { n: number })}
      consequences={[t("anular.c1"), t("anular.c2"), t("anular.c3")]}
      irreversible={t("anular.irreversible")}
      verb={t("anular.verbo")}
      danger
      acknowledge
      loadingText={t("anular.cargando")}
      onCancel={onClose}
      onConfirm={async () => {
        if (invoice && (await c.vf.exportCancelXml(invoice.id))) onClose();
      }}
    />
  );
}
