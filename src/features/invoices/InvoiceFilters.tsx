import { useWorkspaceState } from "../../shared/context";
export function InvoiceFilters() {
  const {
    invoices,
    clearInvoiceFilters,
    searchInvoices,
    invoiceSearch,
    setInvoiceSearch,
    invoiceCompanyFilter,
    setInvoiceCompanyFilter,
    companies,
    invoiceCustomerFilter,
    setInvoiceCustomerFilter,
    customers,
    invoiceYearFilter,
    setInvoiceYearFilter,
    invoiceSeriesFilter,
    setInvoiceSeriesFilter,
    invoiceStatusFilter,
    setInvoiceStatusFilter,
    invoiceKindFilter,
    setInvoiceKindFilter,
  } = useWorkspaceState();
  return (
    <section className="panel invoiceFilters" aria-label="Buscar facturas">
      <div className="editorTop">
        <div>
          <h2>Buscar facturas</h2>
          <p>{invoices.length} resultado(s) con filtros actuales.</p>
        </div>
        <button
          type="button"
          className="linkButton"
          onClick={clearInvoiceFilters}
        >
          Limpiar filtros
        </button>
      </div>
      <form className="filterForm" onSubmit={searchInvoices}>
        <label className="fieldBlock">
          <span>Texto</span>
          <input
            aria-label="Buscar texto factura"
            value={invoiceSearch}
            onChange={(event) => setInvoiceSearch(event.target.value)}
            placeholder="serie, numero, cliente, NIF, hash"
          />
        </label>
        <label className="fieldBlock">
          <span>Empresa</span>
          <select
            aria-label="Filtro empresa factura"
            value={invoiceCompanyFilter}
            onChange={(event) => setInvoiceCompanyFilter(event.target.value)}
          >
            <option value="">Todas</option>
            {companies.map((item) => (
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
            value={invoiceCustomerFilter}
            onChange={(event) => setInvoiceCustomerFilter(event.target.value)}
          >
            <option value="">Todos</option>
            {customers.map((item) => (
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
            value={invoiceYearFilter}
            onChange={(event) => setInvoiceYearFilter(event.target.value)}
            placeholder="2026"
          />
        </label>
        <label className="fieldBlock">
          <span>Serie</span>
          <input
            aria-label="Filtro serie factura"
            value={invoiceSeriesFilter}
            onChange={(event) =>
              setInvoiceSeriesFilter(event.target.value.toUpperCase())
            }
            placeholder="A, AL, VENDI2026"
          />
        </label>
        <label className="fieldBlock">
          <span>Estado</span>
          <select
            aria-label="Filtro estado factura"
            value={invoiceStatusFilter}
            onChange={(event) => setInvoiceStatusFilter(event.target.value)}
          >
            <option value="">Todos</option>
            <option value="Draft">Draft</option>
            <option value="Issued">Issued</option>
            <option value="Void">Void</option>
            <option value="Rectified">Rectified</option>
          </select>
        </label>
        <label className="fieldBlock">
          <span>Tipo</span>
          <select
            aria-label="Filtro tipo factura"
            value={invoiceKindFilter}
            onChange={(event) => setInvoiceKindFilter(event.target.value)}
          >
            <option value="">Todos</option>
            <option value="Complete">Complete</option>
            <option value="Simplified">Simplified</option>
            <option value="Rectifying">Rectifying</option>
          </select>
        </label>
        <button className="primary">Buscar facturas</button>
      </form>
    </section>
  );
}
