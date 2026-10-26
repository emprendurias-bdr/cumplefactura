import { RefreshCw } from "lucide-react";
import { CustomerCompanyForms } from "./features/customers/CustomerCompanyForms";
import { InvoiceEditor } from "./features/invoices/InvoiceEditor";
import { InvoiceFilters } from "./features/invoices/InvoiceFilters";
import { InvoiceFlow } from "./features/invoices/InvoiceFlow";
import { InvoiceLists } from "./features/invoices/InvoiceLists";
import { Onboarding } from "./features/onboarding/Onboarding";
import { ProductCatalog } from "./features/products/ProductCatalog";
import { ExportsSettings } from "./features/settings/ExportsSettings";
import { SeriesSettings } from "./features/settings/SeriesSettings";
import { FiscalAudit } from "./features/verifactu/FiscalAudit";
import { RuntimeStatus } from "./features/verifactu/RuntimeStatus";
import { SidecarChannels } from "./features/verifactu/SidecarChannels";
import { WorkspaceContext } from "./shared/context";
import { cards } from "./shared/forms";
import { SuiteShell } from "./shared/SuiteShell";
import { useWorkspace } from "./shared/useWorkspace";
export default function App() {
  const state = useWorkspace();
  const { flowState, status, refreshData, issueInvoice, canIssue } = state;
  return (
    <WorkspaceContext.Provider value={state}>
      <SuiteShell state={state}>
        <section className="content">
          <header>
            <div>
              <h1>Facturacion local-first</h1>
              <p>
                {flowState} - {status}
              </p>
            </div>
            <div className="headerActions">
              <button
                className="iconButton"
                onClick={() => void refreshData()}
                title="Refrescar"
              >
                <RefreshCw size={18} aria-hidden="true" />
              </button>
              <button
                className="primary"
                onClick={() => void issueInvoice()}
                disabled={!canIssue}
              >
                Emitir
              </button>
            </div>
          </header>
          <div className="grid">
            {cards.map(({ icon: Icon, title, text }) => (
              <article key={title} className="card">
                <Icon size={22} aria-hidden="true" />
                <h2>{title}</h2>
                <p>{text}</p>
              </article>
            ))}
          </div>
          <RuntimeStatus />
          <Onboarding />
          <CustomerCompanyForms />
          <ProductCatalog />
          <SeriesSettings />
          <InvoiceEditor />
          <InvoiceFlow />
          <InvoiceFilters />
          <InvoiceLists />
          <FiscalAudit />
          <SidecarChannels />
          <ExportsSettings />
        </section>
      </SuiteShell>
    </WorkspaceContext.Provider>
  );
}
