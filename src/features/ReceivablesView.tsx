import { invoke } from "@tauri-apps/api/core";
import { Mail, RefreshCw, Trash2 } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { attempt, CustomerOption, euros, Runner, shortDate, StatusBadge, todayIso } from "./shared";

type CollectionStatus = "paid" | "partial" | "pending" | "overdue";

type Receivable = {
  invoice_id: string;
  customer_id: string;
  customer_name: string;
  customer_tax_id: string;
  series: string;
  number?: number | null;
  issued_at?: string | null;
  due_date?: string | null;
  total_cents: number;
  paid_cents: number;
  outstanding_cents: number;
  status: CollectionStatus;
  days_overdue: number;
};

type Payment = { id: string; amount_cents: number; paid_at: string; method: string; reference?: string | null };
type EmailLogEntry = { id: string; kind: string; recipient: string; status: string; error?: string | null; sent_at: string };

const STATUS_LABEL: Record<CollectionStatus, { text: string; tone: "ok" | "warn" | "danger" | "muted" }> = {
  paid: { text: "Cobrada", tone: "ok" },
  partial: { text: "Parcial", tone: "warn" },
  pending: { text: "Pendiente", tone: "muted" },
  overdue: { text: "Vencida", tone: "danger" },
};

const METHODS = [
  ["transfer", "Transferencia"],
  ["card", "Tarjeta"],
  ["cash", "Efectivo"],
  ["direct_debit", "Domiciliacion"],
  ["bizum", "Bizum"],
  ["other", "Otro"],
] as const;

export function ReceivablesView({ companyId, customers, run }: { companyId?: string; customers: CustomerOption[]; run: Runner }) {
  const [items, setItems] = useState<Receivable[]>([]);
  const [filter, setFilter] = useState<"open" | "all" | "overdue">("open");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [emails, setEmails] = useState<EmailLogEntry[]>([]);
  const [dueDate, setDueDate] = useState("");
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState(todayIso());
  const [method, setMethod] = useState("transfer");
  const [reference, setReference] = useState("");
  const [recipient, setRecipient] = useState("");

  const selected = items.find((item) => item.invoice_id === selectedId) ?? null;
  const visible = useMemo(
    () =>
      items.filter((item) =>
        filter === "all" ? true : filter === "overdue" ? item.status === "overdue" : item.status !== "paid",
      ),
    [items, filter],
  );
  const totals = useMemo(
    () => ({
      outstanding: items.reduce((sum, item) => sum + item.outstanding_cents, 0),
      overdue: items.filter((item) => item.status === "overdue").reduce((sum, item) => sum + item.outstanding_cents, 0),
      overdueCount: items.filter((item) => item.status === "overdue").length,
    }),
    [items],
  );

  async function load() {
    const result = await attempt(run, "Cobros", () => invoke<Receivable[]>("receivables_list", { companyId: companyId ?? null }));
    if (result) setItems(result);
  }

  async function loadDetail(item: Receivable) {
    const [paymentList, emailList] = await Promise.all([
      attempt(run, "Cobros de factura", () => invoke<Payment[]>("payment_list", { invoiceId: item.invoice_id })),
      attempt(run, "Emails de factura", () => invoke<EmailLogEntry[]>("email_log_list", { invoiceId: item.invoice_id })),
    ]);
    setPayments(paymentList ?? []);
    setEmails(emailList ?? []);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  function select(item: Receivable) {
    setSelectedId(item.invoice_id);
    setDueDate(item.due_date ?? "");
    setAmount((item.outstanding_cents / 100).toFixed(2));
    setPaidAt(todayIso());
    setReference("");
    setRecipient(customers.find((c) => c.id === item.customer_id)?.email ?? "");
    void loadDetail(item);
  }

  async function refreshSelected(invoiceId: string) {
    const result = await attempt(run, "Cobros", () => invoke<Receivable[]>("receivables_list", { companyId: companyId ?? null }));
    if (!result) return;
    setItems(result);
    const item = result.find((r) => r.invoice_id === invoiceId);
    if (item) {
      setAmount((item.outstanding_cents / 100).toFixed(2));
      await loadDetail(item);
    }
  }

  async function saveDueDate(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    const ok = await attempt(run, "Guardar vencimiento", () =>
      invoke("invoice_due_date_set", { invoiceId: selected.invoice_id, dueDate: dueDate || null }).then(() => true),
    );
    if (ok) await refreshSelected(selected.invoice_id);
  }

  async function registerPayment(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    const cents = Math.round(Number(amount.replace(",", ".")) * 100);
    const ok = await attempt(run, "Registrar cobro", () =>
      invoke("payment_register", {
        input: { invoice_id: selected.invoice_id, amount_cents: cents, paid_at: paidAt, method, reference: reference || null },
      }).then(() => true),
    );
    if (ok) await refreshSelected(selected.invoice_id);
  }

  async function deletePayment(paymentId: string) {
    if (!selected) return;
    const ok = await attempt(run, "Eliminar cobro", () => invoke("payment_delete", { paymentId }).then(() => true));
    if (ok) await refreshSelected(selected.invoice_id);
  }

  async function sendMail(kind: "invoice" | "reminder") {
    if (!selected) return;
    const args = { invoiceId: selected.invoice_id, to: recipient, subject: null, body: null };
    await attempt(run, kind === "invoice" ? "Enviar factura" : "Enviar recordatorio", () =>
      kind === "invoice" ? invoke("email_send_invoice", args) : invoke("email_send_reminder", args),
    );
    await loadDetail(selected);
  }

  return (
    <>
      <section className="panel" aria-label="Resumen de cobros">
        <div className="kpiRow">
          <div className="kpi">
            <span>Pendiente de cobro</span>
            <strong>{euros(totals.outstanding)}</strong>
          </div>
          <div className="kpi">
            <span>Vencido</span>
            <strong className={totals.overdue > 0 ? "danger" : ""}>{euros(totals.overdue)}</strong>
          </div>
          <div className="kpi">
            <span>Facturas vencidas</span>
            <strong>{totals.overdueCount}</strong>
          </div>
        </div>
      </section>

      <section className="panel receivablesPanel" aria-label="Facturas por cobrar">
        <div className="editorTop">
          <div>
            <h2>Facturas por cobrar</h2>
            <p>{visible.length} factura(s). Sin vencimiento se consideran al contado.</p>
          </div>
          <div className="inlineActions">
            <select aria-label="Filtro cobros" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
              <option value="open">Pendientes</option>
              <option value="overdue">Vencidas</option>
              <option value="all">Todas</option>
            </select>
            <button type="button" className="iconButton" aria-label="Recargar cobros" onClick={() => void load()}>
              <RefreshCw size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
        {visible.length === 0 ? (
          <p className="emptyState">No hay facturas en este filtro.</p>
        ) : (
          <div className="tableWrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Factura</th>
                  <th>Cliente</th>
                  <th>Emitida</th>
                  <th>Vence</th>
                  <th className="num">Total</th>
                  <th className="num">Pendiente</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => {
                  const label = STATUS_LABEL[item.status];
                  return (
                    <tr key={item.invoice_id} className={item.invoice_id === selectedId ? "selected" : ""}>
                      <td>
                        <button type="button" className="rowLink" onClick={() => select(item)}>
                          {item.series}-{item.number}
                        </button>
                      </td>
                      <td>{item.customer_name}</td>
                      <td>{shortDate(item.issued_at)}</td>
                      <td>{shortDate(item.due_date)}</td>
                      <td className="num">{euros(item.total_cents)}</td>
                      <td className="num">{euros(item.outstanding_cents)}</td>
                      <td>
                        <StatusBadge tone={label.tone}>{item.status === "overdue" ? `${label.text} (${item.days_overdue} d)` : label.text}</StatusBadge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected ? (
        <section className="panel detailGrid" aria-label="Detalle de cobro">
          <div className="detailColumn">
            <h2>
              Factura {selected.series}-{selected.number} · {selected.customer_name}
            </h2>
            <p>
              Total {euros(selected.total_cents)} · Cobrado {euros(selected.paid_cents)} · Pendiente {euros(selected.outstanding_cents)}
            </p>
            <form className="inlineForm" onSubmit={saveDueDate}>
              <label className="fieldBlock">
                <span>Vencimiento</span>
                <input aria-label="Fecha de vencimiento" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </label>
              <button className="linkButton">Guardar vencimiento</button>
            </form>
            <form className="paymentForm" onSubmit={registerPayment}>
              <label className="fieldBlock">
                <span>Importe EUR</span>
                <input aria-label="Importe cobro" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </label>
              <label className="fieldBlock">
                <span>Fecha</span>
                <input aria-label="Fecha cobro" type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
              </label>
              <label className="fieldBlock">
                <span>Metodo</span>
                <select aria-label="Metodo cobro" value={method} onChange={(e) => setMethod(e.target.value)}>
                  {METHODS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="fieldBlock">
                <span>Referencia</span>
                <input aria-label="Referencia cobro" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Opcional" />
              </label>
              <button className="primary" disabled={selected.outstanding_cents <= 0}>
                Registrar cobro
              </button>
            </form>
            <h3>Cobros registrados</h3>
            {payments.length === 0 ? (
              <p>Sin cobros.</p>
            ) : (
              <ul className="auditList">
                {payments.map((payment) => (
                  <li key={payment.id} className="rowWithAction">
                    <span>
                      {shortDate(payment.paid_at)} · {euros(payment.amount_cents)} · {payment.method}
                      {payment.reference ? ` · ${payment.reference}` : ""}
                    </span>
                    <button type="button" className="iconButton" aria-label="Eliminar cobro" onClick={() => void deletePayment(payment.id)}>
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="detailColumn">
            <h2>Enviar por email</h2>
            <p>Se adjunta el PDF con el QR tributario. Configura el servidor en Ajustes › Email.</p>
            <label className="fieldBlock">
              <span>Destinatario</span>
              <input aria-label="Email destinatario" type="email" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="cliente@empresa.es" />
            </label>
            <div className="inlineActions">
              <button type="button" className="primary" disabled={!recipient} onClick={() => void sendMail("invoice")}>
                <Mail size={16} aria-hidden="true" />
                Enviar factura
              </button>
              <button type="button" className="linkButton" disabled={!recipient || selected.outstanding_cents <= 0} onClick={() => void sendMail("reminder")}>
                Enviar recordatorio
              </button>
            </div>
            <h3>Historial de envios</h3>
            {emails.length === 0 ? (
              <p>Sin envios.</p>
            ) : (
              <ul className="auditList">
                {emails.map((entry) => (
                  <li key={entry.id}>
                    <strong>
                      {entry.kind === "reminder" ? "Recordatorio" : entry.kind === "invoice" ? "Factura" : "Prueba"} · {entry.status === "sent" ? "enviado" : "error"}
                    </strong>
                    <span>
                      {entry.recipient} · {shortDate(entry.sent_at)}
                      {entry.error ? ` · ${entry.error}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      ) : null}
    </>
  );
}
