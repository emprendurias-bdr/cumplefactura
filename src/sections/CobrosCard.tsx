/**
 * Tarjeta «Cobros» (D6) de la ficha de factura y de la proforma. Cabecera con el chip de cobro y
 * «Cobrado X de Y» en mono; tabla de cobros (fecha · forma de pago · referencia · importe · borrar
 * con ConfirmDialog); formulario «Registrar cobro» (importe MoneyInput, fecha, forma de pago,
 * referencia); en facturas, «Vencimiento» (`invoice_due_date_set`). Todo en botones secundarios:
 * la acción principal de la pantalla sigue en el hero.
 * Estado: el formulario y el cobro a borrar; los cobros los da `usePayments` (en la pantalla, que
 * también los necesita: la proforma no se marca pagada sin cobros).
 * `blocked`: motivo por el que aún no se cobra (borrador, proforma sin enviar…).
 */
import { useEffect, useState } from "react";
import { Icon } from "../components/Icon";
import { t } from "../i18n/es";
import { eurosToCents } from "../lib/format";
import { isoDate, todayIso } from "../lib/invoiceDate";
import { formatCents } from "../lib/moneyFormat";
import { PAYMENT_METHODS, type Payment, type PaymentMethod } from "../types";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { DateInput, Field, Input, MoneyInput, Select } from "../ui/Field";
import type { Status } from "../ui/status";
import { StatusChip } from "../ui/StatusChip";
import type { Payments, PaymentTarget } from "../usePayments";

type Props = {
  pay: Payments;
  target: PaymentTarget;
  totalCents: number;
  status: Status | null;
  blocked: string | null;
  /** Solo facturas: vencimiento actual (`AAAA-MM-DD`) o null. */
  dueDate?: string | null;
  note?: string;
};

export function CobrosCard({ pay, target, totalCents, status, blocked, dueDate, note }: Props) {
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState(todayIso());
  const [method, setMethod] = useState<PaymentMethod>("transferencia");
  const [reference, setReference] = useState("");
  const [due, setDue] = useState(dueDate ?? "");
  const [toDelete, setToDelete] = useState<Payment | null>(null);
  useEffect(() => setDue(dueDate ?? ""), [dueDate]);

  const cents = eurosToCents(amount);
  const pending = totalCents - pay.paidCents;
  const reason = blocked ?? (pending <= 0 ? t("cobros.motivoCobrada") : !(cents > 0) ? t("cobros.motivoImporte") : null);

  async function register() {
    const input = {
      ...("invoiceId" in target ? { invoice_id: target.invoiceId } : { commercial_document_id: target.commercialDocumentId }),
      amount_cents: cents,
      paid_at: paidAt,
      method,
      reference: reference.trim() || null,
    };
    if (await pay.register(input)) {
      setAmount("");
      setReference("");
    }
  }

  return (
    <Card
      title={t("cobros.titulo")}
      label={t("cobros.titulo")}
      actions={
        <>
          {status ? <StatusChip status={status} /> : null}
          <span className="m bdr-small">{t("cobros.cobrado", { pagado: formatCents(pay.paidCents), total: formatCents(totalCents) })}</span>
        </>
      }
    >
      {pay.payments.length === 0 ? (
        <p className="bdr-small bdr-muted">{t("cobros.vacio")}</p>
      ) : (
        <table className="bdr-table cf-payments" aria-label={t("cobros.lista")}>
          <tbody>
            {pay.payments.map((row) => (
              <tr key={row.id}>
                <td className="m">{isoDate(row.paid_at)}</td>
                <td>{PAYMENT_METHODS.includes(row.method as PaymentMethod) ? t(`metodo.${row.method as PaymentMethod}`) : row.method}</td>
                <td className="m bdr-muted">{row.reference ?? ""}</td>
                <td className="num m">{formatCents(row.amount_cents)}</td>
                <td>
                  <button type="button" className="bdr-icon-btn" aria-label={t("cobros.borrar")} title={t("cobros.borrar")} onClick={() => setToDelete(row)}>
                    <Icon name="x" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {note ? <p className="bdr-small bdr-muted">{note}</p> : null}
      <div className="cf-form-grid">
        <Field label={t("cobros.importe")} help={pending > 0 && !blocked ? t("cobros.pendiente", { importe: formatCents(pending) }) : undefined}>
          <MoneyInput value={amount} onChange={(e) => setAmount(e.target.value)} disabled={Boolean(blocked)} />
        </Field>
        <Field label={t("cobros.fecha")}>
          <DateInput value={paidAt} onChange={(e) => setPaidAt(e.target.value)} disabled={Boolean(blocked)} />
        </Field>
        <Field label={t("cobros.metodo")}>
          <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} disabled={Boolean(blocked)}>
            {PAYMENT_METHODS.map((item) => (
              <option key={item} value={item}>{t(`metodo.${item}`)}</option>
            ))}
          </Select>
        </Field>
        <Field label={t("cobros.referencia")} help={t("cobros.referenciaAyuda")}>
          <Input mono value={reference} onChange={(e) => setReference(e.target.value)} disabled={Boolean(blocked)} />
        </Field>
      </div>
      <div className="cf-row">
        <Button onClick={() => void register()} disabled={reason !== null} reason={reason}>{t("cobros.registrar")}</Button>
      </div>
      {"invoiceId" in target && dueDate !== undefined ? (
        <div className="cf-row cf-due">
          <Field label={t("cobros.vencimiento")} help={t("cobros.vencimientoAyuda")}>
            <DateInput value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
          <Button variant="ghost" size="sm" disabled={due === (dueDate ?? "")} onClick={() => void pay.setDueDate(target.invoiceId, due || null)}>
            {t("cobros.guardarVencimiento")}
          </Button>
        </div>
      ) : null}
      <ConfirmDialog
        open={toDelete !== null}
        title={t("cobros.borrarTitulo", { importe: formatCents(toDelete?.amount_cents ?? 0) })}
        consequences={[t("cobros.borrarC1"), t("cobros.borrarC2")]}
        irreversible={t("cobros.borrarIrreversible")}
        verb={t("cobros.borrar")}
        danger
        onCancel={() => setToDelete(null)}
        onConfirm={async () => {
          if (toDelete) await pay.remove(toDelete.id); // si Rust lo impide, el toast dice por qué
          setToDelete(null);
        }}
      />
    </Card>
  );
}
