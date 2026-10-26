import { useWorkspaceState } from "../../shared/context";
export function CustomerCompanyForms() {
  const {
    saveCompany,
    newCompanyForm,
    company,
    selectCompany,
    companies,
    companyForm,
    updateCompanyForm,
    saveCustomer,
    newCustomerForm,
    customer,
    selectCustomer,
    customers,
    customerForm,
    updateCustomerForm,
  } = useWorkspaceState();
  return (
    <section className="panel entityForms">
      <form onSubmit={saveCompany}>
        <div className="formTitle">
          <h2>Empresa emisora</h2>
          <button type="button" className="linkButton" onClick={newCompanyForm}>
            Nueva empresa
          </button>
        </div>
        <label className="fieldBlock">
          <span>Empresa activa</span>
          <select
            aria-label="Empresa activa"
            value={company?.id ?? ""}
            onChange={(event) => selectCompany(event.target.value)}
          >
            <option value="">Nueva empresa</option>
            {companies.map((item) => (
              <option key={item.id} value={item.id}>
                {item.legal_name} - {item.tax_id}
              </option>
            ))}
          </select>
        </label>
        <div className="formGrid">
          <label className="fieldBlock">
            <span>Nombre legal</span>
            <input
              aria-label="Nombre legal empresa"
              required
              value={companyForm.legal_name}
              onChange={(event) =>
                updateCompanyForm("legal_name", event.target.value)
              }
            />
          </label>
          <label className="fieldBlock">
            <span>NIF/CIF</span>
            <input
              aria-label="NIF empresa"
              required
              value={companyForm.tax_id}
              onChange={(event) =>
                updateCompanyForm("tax_id", event.target.value)
              }
            />
          </label>
          <label className="fieldBlock wide">
            <span>Direccion</span>
            <input
              aria-label="Direccion empresa"
              required
              value={companyForm.address}
              onChange={(event) =>
                updateCompanyForm("address", event.target.value)
              }
            />
          </label>
          <label className="fieldBlock">
            <span>CP</span>
            <input
              aria-label="CP empresa"
              required
              value={companyForm.postal_code}
              onChange={(event) =>
                updateCompanyForm("postal_code", event.target.value)
              }
            />
          </label>
          <label className="fieldBlock">
            <span>Municipio</span>
            <input
              aria-label="Municipio empresa"
              required
              value={companyForm.municipality}
              onChange={(event) =>
                updateCompanyForm("municipality", event.target.value)
              }
            />
          </label>
          <label className="fieldBlock">
            <span>Provincia</span>
            <input
              aria-label="Provincia empresa"
              required
              value={companyForm.province}
              onChange={(event) =>
                updateCompanyForm("province", event.target.value)
              }
            />
          </label>
          <label className="fieldBlock">
            <span>Pais</span>
            <input
              aria-label="Pais empresa"
              required
              value={companyForm.country_code}
              onChange={(event) =>
                updateCompanyForm(
                  "country_code",
                  event.target.value.toUpperCase(),
                )
              }
            />
          </label>
          <label className="fieldBlock">
            <span>Serie por defecto</span>
            <input
              aria-label="Serie por defecto empresa"
              value={companyForm.default_series}
              onChange={(event) =>
                updateCompanyForm(
                  "default_series",
                  event.target.value.toUpperCase(),
                )
              }
            />
          </label>
        </div>
        <button className="primary">Guardar emisor</button>
      </form>

      <form onSubmit={saveCustomer}>
        <div className="formTitle">
          <h2>Cliente</h2>
          <button
            type="button"
            className="linkButton"
            onClick={newCustomerForm}
          >
            Nuevo cliente
          </button>
        </div>
        <label className="fieldBlock">
          <span>Cliente activo</span>
          <select
            aria-label="Cliente activo"
            value={customer?.id ?? ""}
            onChange={(event) => selectCustomer(event.target.value)}
          >
            <option value="">Nuevo cliente</option>
            {customers.map((item) => (
              <option key={item.id} value={item.id}>
                {item.display_name} - {item.tax_id}
              </option>
            ))}
          </select>
        </label>
        <div className="formGrid">
          <label className="fieldBlock">
            <span>Nombre</span>
            <input
              aria-label="Nombre cliente"
              required
              value={customerForm.display_name}
              onChange={(event) =>
                updateCustomerForm("display_name", event.target.value)
              }
            />
          </label>
          <label className="fieldBlock">
            <span>NIF/CIF</span>
            <input
              aria-label="NIF cliente"
              required
              value={customerForm.tax_id}
              onChange={(event) =>
                updateCustomerForm("tax_id", event.target.value)
              }
            />
          </label>
          <label className="fieldBlock">
            <span>Tipo</span>
            <select
              aria-label="Tipo cliente"
              value={customerForm.kind}
              onChange={(event) =>
                updateCustomerForm("kind", event.target.value)
              }
            >
              <option value="Business">Empresa</option>
              <option value="Individual">Persona fisica</option>
              <option value="PublicAdministration">Administracion</option>
            </select>
          </label>
          <label className="fieldBlock wide">
            <span>Direccion</span>
            <input
              aria-label="Direccion cliente"
              required
              value={customerForm.address}
              onChange={(event) =>
                updateCustomerForm("address", event.target.value)
              }
            />
          </label>
          <label className="fieldBlock">
            <span>CP</span>
            <input
              aria-label="CP cliente"
              required
              value={customerForm.postal_code}
              onChange={(event) =>
                updateCustomerForm("postal_code", event.target.value)
              }
            />
          </label>
          <label className="fieldBlock">
            <span>Municipio</span>
            <input
              aria-label="Municipio cliente"
              required
              value={customerForm.municipality}
              onChange={(event) =>
                updateCustomerForm("municipality", event.target.value)
              }
            />
          </label>
          <label className="fieldBlock">
            <span>Provincia</span>
            <input
              aria-label="Provincia cliente"
              required
              value={customerForm.province}
              onChange={(event) =>
                updateCustomerForm("province", event.target.value)
              }
            />
          </label>
          <label className="fieldBlock">
            <span>Pais</span>
            <input
              aria-label="Pais cliente"
              required
              value={customerForm.country_code}
              onChange={(event) =>
                updateCustomerForm(
                  "country_code",
                  event.target.value.toUpperCase(),
                )
              }
            />
          </label>
        </div>
        <button className="primary">Guardar cliente</button>
      </form>
    </section>
  );
}
