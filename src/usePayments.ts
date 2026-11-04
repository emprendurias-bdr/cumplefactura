/**
 * Cobros y vencimiento (R2, D6): gestión operativa, nunca fiscal (no toca huella, XML ni cadena).
 * Un cobro va a una factura emitida o a una proforma enviada/pagada (anticipo); al convertir la
 * proforma, Rust pasa sus cobros a la factura. Lo usa la tarjeta «Cobros» (`CobrosCard`) con su
 * propio objetivo; `onChange` refresca lo que dependa del cobro (ficha, lista, estado de proforma).
 * Estado: los cobros del objetivo, recargados al cambiar de objetivo o tras cada acción.
 */
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { t } from "./i18n/es";
import type { Payment, PaymentInput } from "./types";
import { action } from "./useCumpleFactura";

export type PaymentTarget = { invoiceId: string } | { commercialDocumentId: string };

export function usePayments(target: PaymentTarget | null, onChange: () => void | Promise<void>) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const key = target ? JSON.stringify(target) : "";

  async function load() {
    if (!target) return setPayments([]);
    try {
      setPayments(await invoke<Payment[]>("payment_list", target));
    } catch {
      setPayments([]);
    }
  }

  useEffect(() => {
    void load();
  }, [key]);

  const after = async () => {
    await load();
    await onChange();
  };
  const register = action(t("ok.cobro"), (input: PaymentInput) => invoke<Payment>("payment_register", { input }), after);
  const remove = action(t("ok.cobroBorrado"), (id: string) => invoke<null>("payment_delete", { id }), after);
  const setDueDate = action(
    t("ok.vencimiento"),
    (invoiceId: string, dueDate: string | null) => invoke<null>("invoice_due_date_set", { invoiceId, dueDate }),
    onChange,
  );

  return { payments, paidCents: payments.reduce((sum, row) => sum + row.amount_cents, 0), register, remove, setDueDate };
}

export type Payments = ReturnType<typeof usePayments>;
