import { Button, Chip, EmptyState } from "@bdr/ui";
import { Download, Plus, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useWorkspaceState } from "../../shared/context";
import { PAGE_SIZE, cents } from "../../shared/forms";
import { Pager } from "../../shared/components";
import { FiscalProgress } from "../verifactu/FiscalProgress";
import { fiscalProgress } from "../verifactu/progress";
import { InvoiceFilters } from "./InvoiceFilters";
import { invoiceDate } from "../../shared/invoiceDate";
export function InvoiceTable({ onNew }: { onNew: () => void }) {
  const s = useWorkspaceState();
  const [delivery, setDelivery] = useState("all");
  const searchRegion = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (document.querySelector("dialog[open]")) return;
      if (
        event.target instanceof HTMLElement &&
        (event.target.matches("input,textarea,select") ||
          event.target.isContentEditable)
      )
        return;
      if (event.key === "/" && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        searchRegion.current?.querySelector<HTMLInputElement>("input")?.focus();
      }
      if (
        event.key.toLowerCase() === "n" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        event.preventDefault();
        onNew();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onNew]);
  const rows = s.invoices
    .map((invoice) => ({
      invoice,
      progress: fiscalProgress(
        invoice,
        s.fiscalRecords,
        s.submitInvocation,
        s.submission,
      ),
    }))
    .filter(
      ({ progress }) =>
        delivery === "all" ||
        (delivery === "pending" && !progress.steps[2].confirmed) ||
        (delivery === "sent" && progress.steps[2].confirmed) ||
        (delivery === "responded" && progress.steps[3].confirmed),
    );
  const baseAvailable = rows.every(
    ({ invoice }) => invoice.taxable_base_cents != null,
  );
  const base = rows.reduce(
    (sum, { invoice }) => sum + (invoice.taxable_base_cents ?? 0),
    0,
  );
  const total = rows.reduce((sum, { invoice }) => sum + invoice.total_cents, 0);
  return (
    <section className="phase2-screen" aria-label="Facturas">
      <header className="phase2-head">
        <div>
          <p className="eyebrow">
            Facturas · <span className="bdr-mono">{s.fiscalYear}</span>
          </p>
          <h1>
            Tus <span className="bdr-highlight">facturas</span>
          </h1>
        </div>
        <div className="phase2-actions">
          <Button
            variant="secondary"
            onClick={() => {
              void s.refreshData().catch(() => {});
            }}
            aria-label="Refrescar"
          >
            <RefreshCw size={16} />
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              location.hash = "/ajustes";
            }}
          >
            <Download size={16} /> Exportar
          </Button>
          <Button onClick={onNew}>
            <Plus size={16} />
            Nueva factura
          </Button>
        </div>
      </header>
      <p role="status" aria-live="polite">
        {s.status === "Refrescar: OK" ? "Datos actualizados" : s.status}
      </p>
      <div ref={searchRegion}>
        <InvoiceFilters delivery={delivery} onDeliveryChange={setDelivery} />
      </div>
      {rows.length ? (
        <div className="invoice-table-wrap">
          <table className="invoice-table">
            <caption className="sr-only">
              Facturas cargadas y estado fiscal confirmado
            </caption>
            <thead>
              <tr>
                <th scope="col">Número</th>
                <th scope="col">Fecha</th>
                <th scope="col">Cliente</th>
                <th scope="col">Estado</th>
                <th scope="col">Verifactu</th>
                <th scope="col" className="numeric">
                  Base
                </th>
                <th scope="col" className="numeric">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ invoice, progress }) => (
                <tr key={invoice.id}>
                  <th scope="row" className="bdr-mono">
                    {invoice.number == null
                      ? "Borrador"
                      : `${invoice.series}-${invoice.number}`}
                  </th>
                  <td className="bdr-mono">{invoiceDate(invoice.issued_at)}</td>
                  <td>
                    {s.customers.find((c) => c.id === invoice.customer_id)
                      ?.display_name ?? "Cliente no disponible"}
                  </td>
                  <td>
                    <Chip
                      status={
                        invoice.status === "Issued"
                          ? "issued"
                          : invoice.status === "Void"
                            ? "void"
                            : invoice.status === "Draft"
                              ? "draft"
                              : "review"
                      }
                    />
                    {invoice.status === "Rectified" && (
                      <span className="invoice-kind">Rectificada</span>
                    )}
                    {invoice.kind === "Rectifying" && (
                      <span className="invoice-kind">
                        Rectificativa (abono)
                      </span>
                    )}
                  </td>
                  <td>
                    <FiscalProgress compact state={progress} />
                  </td>
                  <td className="numeric bdr-mono">
                    {invoice.taxable_base_cents == null ? (
                      <span aria-label="Base no disponible">—</span>
                    ) : (
                      cents(invoice.taxable_base_cents)
                    )}
                  </td>
                  <td className="numeric bdr-mono">
                    {cents(invoice.total_cents)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" colSpan={5}>
                  {rows.length} facturas en esta página · total visible
                </th>
                <td className="numeric bdr-mono">
                  {baseAvailable ? cents(base) : "—"}
                </td>
                <td className="numeric bdr-mono">{cents(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <EmptyState
          title={
            s.invoices.length
              ? "No hay facturas con este estado de envío."
              : "Aún no hay facturas."
          }
          description="Crea la primera factura o revisa los filtros de búsqueda."
          action={<Button onClick={onNew}>Nueva factura</Button>}
        />
      )}
      <Pager
        regionLabel="Pagina facturas"
        prevLabel="Anterior facturas"
        nextLabel="Siguiente facturas"
        page={s.invoicePage}
        hasNext={s.invoices.length === PAGE_SIZE}
        onPrev={() => void s.changeInvoicePage(s.invoicePage - 1)}
        onNext={() => void s.changeInvoicePage(s.invoicePage + 1)}
      />
      <aside className="phase2-info">
        Cómo leer Verifactu: emitida, registro de alta, enviada y respuesta de
        la AEAT. Un paso solo se confirma con evidencia. La cola y el envío
        automático todavía no están disponibles; los registros locales no
        acreditan su presentación.
      </aside>
    </section>
  );
}
