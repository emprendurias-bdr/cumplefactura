/**
 * Carcasa de CumpleFactura: barra lateral, cabecera y la sección activa.
 * El estado y las llamadas a Rust viven en `useCumpleFactura`; cada pantalla en `sections/`.
 */
import { type ReactElement, useState } from "react";
import { Icon } from "./components/Icon";
import { AjustesSection } from "./sections/AjustesSection";
import { ClientesSection } from "./sections/ClientesSection";
import { EmpresasSection } from "./sections/EmpresasSection";
import { FacturasSection } from "./sections/FacturasSection";
import { FiscalSection } from "./sections/FiscalSection";
import { PanelSection } from "./sections/PanelSection";
import { NAV_ITEMS, type AppSection } from "./types";
import { useCumpleFactura, type Model } from "./useCumpleFactura";

const SECTIONS: Record<AppSection, (p: Model) => ReactElement> = {
  panel: PanelSection,
  empresas: EmpresasSection,
  clientes: ClientesSection,
  facturas: FacturasSection,
  fiscal: FiscalSection,
  ajustes: AjustesSection,
};

export default function App() {
  const [section, setSection] = useState<AppSection>("panel");
  const model = useCumpleFactura();
  const Section = SECTIONS[section];

  return (
    <main className="shell">
      <section className="workspace">
        <aside className="sidebar">
          <div className="brand">CumpleFactura</div>
          <nav aria-label="Principal">
            {NAV_ITEMS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                className={section === id ? "active" : undefined}
                aria-current={section === id ? "page" : undefined}
                onClick={() => setSection(id)}
              >
                {label}
              </button>
            ))}
          </nav>
        </aside>
        <section className="content">
          <header>
            <div>
              <h1>Facturacion local-first</h1>
              <p>
                {model.flowState} - {model.status}
              </p>
            </div>
            <div className="headerActions">
              <button className="iconButton" onClick={() => void model.refreshData()} title="Refrescar">
                <Icon name="refresh" size={18} />
              </button>
              <button className="primary" onClick={() => void model.issueInvoice()} disabled={!model.canIssue}>
                Emitir
              </button>
            </div>
          </header>
          <Section {...model} />
        </section>
      </section>
    </main>
  );
}
