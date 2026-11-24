/**
 * Confirmación de «Anular factura» (design.md §7.7), compartida por la lista y la ficha.
 * Anular genera el registro de anulación encadenado (XML de anulación) y la factura queda en
 * «Anulación pendiente». Pide «Lo entiendo» porque no se deshace y un motivo obligatorio, que Rust
 * guarda en la factura y en la auditoría (no entra en el XML ni en la huella).
 * S1b: con «Anulación rechazada» el mismo diálogo reintenta (`RechazoPrevio=S`) y, si la AEAT dijo
 * que el alta no consta, `sinRegistro` reenvía con `SinRegistroPrevio=S` (decisión 12.2).
 */
import { t } from "../i18n/es";
import { invoiceNumber } from "../lib/numberProposal";
import type { InvoiceSummary } from "../types";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import type { Ctx } from "./ctx";

type Props = { c: Ctx; invoice: InvoiceSummary | null; onClose: () => void; sinRegistro?: boolean };

export function AnularDialog({ c, invoice, onClose, sinRegistro = false }: Props) {
  const number = invoice ? (invoiceNumber(invoice) ?? "") : "";
  const retry = invoice?.status === "VoidRejected";
  const title = sinRegistro ? t("anular.tituloSinRegistro", { n: number }) : retry ? t("anular.tituloReintento", { n: number }) : t("anular.titulo", { n: number });
  const consequences = sinRegistro
    ? [t("anular.sinRegistro1"), t("anular.sinRegistro2"), t("anular.sinRegistro3")]
    : retry
      ? [t("anular.reintento1"), t("anular.c2"), t("anular.c3")]
      : [t("anular.c1"), t("anular.c2"), t("anular.c3")];
  const verb = sinRegistro ? t("anular.verboSinRegistro") : retry ? t("anular.verboReintento") : t("anular.verbo");
  return (
    <ConfirmDialog
      open={Boolean(invoice)}
      title={title}
      consequences={consequences}
      irreversible={t("anular.irreversible")}
      verb={verb}
      danger
      acknowledge
      reason
      loadingText={t("anular.cargando")}
      onCancel={onClose}
      onConfirm={async (reason) => {
        if (invoice && (await c.vf.exportCancelXml(invoice.id, reason, sinRegistro))) onClose();
      }}
    />
  );
}
