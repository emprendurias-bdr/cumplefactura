import { DataList, Pager } from "../../shared/components";
import { useWorkspaceState } from "../../shared/context";
import { PAGE_SIZE, cents, short } from "../../shared/forms";
export function InvoiceLists() {
  const {
    companies,
    customers,
    invoices,
    status,
    invoicePage,
    changeInvoicePage,
    audit,
    auditPage,
    changeAuditPage,
    fiscalRecords,
    fiscalPage,
    changeFiscalPage,
  } = useWorkspaceState();
  return (
    <section className="panel lists">
      <DataList
        title="Empresas"
        empty="Sin empresas"
        rows={companies.map((item) => `${item.legal_name} - ${item.tax_id}`)}
      />
      <DataList
        title="Clientes"
        empty="Sin clientes"
        rows={customers.map((item) => `${item.display_name} - ${item.tax_id}`)}
      />
      <DataList
        title="Facturas"
        empty="Sin facturas"
        rows={invoices.map(
          (item) =>
            `${item.series}-${item.number ?? "BOR"} - ${item.kind} - ${item.status} - ${cents(item.total_cents)} - ${short(item.fiscal_hash)}`,
        )}
        footer={
          <Pager
            regionLabel="Pagina facturas"
            prevLabel="Anterior facturas"
            nextLabel="Siguiente facturas"
            page={invoicePage}
            hasNext={invoices.length === PAGE_SIZE}
            onPrev={() => void changeInvoicePage(invoicePage - 1)}
            onNext={() => void changeInvoicePage(invoicePage + 1)}
          />
        }
      />
      <DataList
        title="Auditoria"
        empty="Sin eventos"
        rows={audit.map(
          (item) => `${item.action} - ${item.actor} - ${short(item.hash)}`,
        )}
        footer={
          <Pager
            regionLabel="Pagina auditoria"
            prevLabel="Anterior auditoria"
            nextLabel="Siguiente auditoria"
            page={auditPage}
            hasNext={audit.length === PAGE_SIZE}
            onPrev={() => void changeAuditPage(auditPage - 1)}
            onNext={() => void changeAuditPage(auditPage + 1)}
          />
        }
      />
      <DataList
        title="Fiscal"
        empty="Sin registros"
        rows={fiscalRecords.map(
          (item) =>
            `${item.record_type} - ${short(item.fiscal_hash)} - prev ${short(item.previous_fiscal_hash)} - ${item.status}`,
        )}
        footer={
          <Pager
            regionLabel="Pagina fiscal"
            prevLabel="Anterior fiscal"
            nextLabel="Siguiente fiscal"
            page={fiscalPage}
            hasNext={fiscalRecords.length === PAGE_SIZE}
            onPrev={() => void changeFiscalPage(fiscalPage - 1)}
            onNext={() => void changeFiscalPage(fiscalPage + 1)}
          />
        }
      />
    </section>
  );
}
