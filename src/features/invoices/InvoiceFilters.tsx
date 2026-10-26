import { useWorkspaceState } from "../../shared/context";
export function InvoiceFilters({
  delivery,
  onDeliveryChange,
}: {
  delivery: string;
  onDeliveryChange: (value: string) => void;
}) {
  const s = useWorkspaceState();
  const extraCount = [
    s.invoiceCompanyFilter,
    s.invoiceCustomerFilter,
    s.invoiceYearFilter,
    s.invoiceKindFilter,
  ].filter(Boolean).length;
  const companyScope =
    s.companies.find((company) => company.id === s.invoiceCompanyFilter)
      ?.legal_name ?? "Todas las empresas";
  return (
    <section className="invoiceFilters" aria-label="Buscar facturas">
      <form
        className="filterForm"
        onSubmit={(event) => {
          void s.searchInvoices(event).catch(() => {});
        }}
      >
        <label className="fieldBlock">
          <span>Buscar</span>
          <input
            aria-label="Buscar texto factura"
            value={s.invoiceSearch}
            onChange={(e) => s.setInvoiceSearch(e.target.value)}
            placeholder="Número, cliente o NIF"
          />
        </label>
        <label className="fieldBlock">
          <span>Serie</span>
          <input
            aria-label="Filtro serie factura"
            value={s.invoiceSeriesFilter}
            onChange={(e) =>
              s.setInvoiceSeriesFilter(e.target.value.toUpperCase())
            }
            placeholder="Todas"
          />
        </label>
        <label className="fieldBlock">
          <span>Estado</span>
          <select
            aria-label="Filtro estado factura"
            value={s.invoiceStatusFilter}
            onChange={(e) => s.setInvoiceStatusFilter(e.target.value)}
          >
            <option value="">Todos</option>
            <option value="Draft">Borrador</option>
            <option value="Issued">Emitida</option>
            <option value="Void">Anulada</option>
            <option value="Rectified">Rectificada</option>
          </select>
        </label>
        <label className="fieldBlock">
          <span>Envío AEAT · esta página</span>
          <select
            aria-label="Envío AEAT en esta página"
            value={delivery}
            onChange={(e) => onDeliveryChange(e.target.value)}
          >
            <option value="all">Todos</option>
            <option value="pending">Sin envío confirmado</option>
            <option value="sent">Envío confirmado</option>
            <option value="responded">Con respuesta confirmada</option>
          </select>
        </label>
        <button className="primary">Buscar facturas</button>
      </form>
      <details className="filters-more">
        <summary>Más filtros{extraCount ? ` (${extraCount})` : ""}</summary>
        <div className="extra-filters">
          <label className="fieldBlock">
            <span>Empresa</span>
            <select
              aria-label="Filtro empresa factura"
              value={s.invoiceCompanyFilter}
              onChange={(e) => s.setInvoiceCompanyFilter(e.target.value)}
            >
              <option value="">Todas</option>
              {s.companies.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.legal_name}
                </option>
              ))}
            </select>
          </label>
          <label className="fieldBlock">
            <span>Cliente</span>
            <select
              aria-label="Filtro cliente factura"
              value={s.invoiceCustomerFilter}
              onChange={(e) => s.setInvoiceCustomerFilter(e.target.value)}
            >
              <option value="">Todos</option>
              {s.customers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.display_name}
                </option>
              ))}
            </select>
          </label>
          <label className="fieldBlock">
            <span>Año</span>
            <input
              aria-label="Filtro año factura"
              inputMode="numeric"
              value={s.invoiceYearFilter}
              onChange={(e) => s.setInvoiceYearFilter(e.target.value)}
              placeholder="2026"
            />
          </label>
          <label className="fieldBlock">
            <span>Tipo</span>
            <select
              aria-label="Filtro tipo factura"
              value={s.invoiceKindFilter}
              onChange={(e) => s.setInvoiceKindFilter(e.target.value)}
            >
              <option value="">Todos</option>
              <option value="Complete">Completa</option>
              <option value="Simplified">Simplificada</option>
              <option value="Rectifying">Rectificativa (abono)</option>
            </select>
          </label>
        </div>
      </details>
      <div className="filter-footer">
        <small>
          {s.invoices.length} resultado(s) en la página cargada. · Empresa:{" "}
          {companyScope}
        </small>
        <button
          type="button"
          className="linkButton"
          onClick={() => {
            s.clearInvoiceFilters();
            onDeliveryChange("all");
          }}
        >
          Limpiar filtros
        </button>
      </div>
    </section>
  );
}
