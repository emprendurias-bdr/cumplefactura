/** Clientes: alta/edición y listado. */
import { type Field, TextField } from "../components/forms";
import { DataList } from "../components/lists";
import type { CustomerForm } from "../types";
import type { Model } from "../useCumpleFactura";

const fields: Field<Exclude<keyof CustomerForm, "kind">>[] = [
  { key: "display_name", label: "Nombre", aria: "Nombre cliente", required: true },
  { key: "tax_id", label: "NIF/CIF", aria: "NIF cliente", required: true },
  { key: "address", label: "Direccion", aria: "Direccion cliente", wide: true, required: true },
  { key: "postal_code", label: "CP", aria: "CP cliente", required: true },
  { key: "municipality", label: "Municipio", aria: "Municipio cliente", required: true },
  { key: "province", label: "Provincia", aria: "Provincia cliente", required: true },
  { key: "country_code", label: "Pais", aria: "Pais cliente", upper: true, required: true },
];

export function ClientesSection(p: Model) {
  return (
    <>
      <section className="panel entityForms">
        <form onSubmit={p.saveCustomer}>
          <div className="formTitle">
            <h2>Cliente</h2>
            <button type="button" className="linkButton" onClick={p.newCustomerForm}>
              Nuevo cliente
            </button>
          </div>
          <label className="fieldBlock">
            <span>Cliente activo</span>
            <select aria-label="Cliente activo" value={p.customer?.id ?? ""} onChange={(event) => p.selectCustomer(event.target.value)}>
              <option value="">Nuevo cliente</option>
              {p.customers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.display_name} - {item.tax_id}
                </option>
              ))}
            </select>
          </label>
          <div className="formGrid">
            {fields.slice(0, 2).map((field) => (
              <TextField key={field.key} field={field} value={p.customerForm[field.key]} onChange={p.updateCustomerForm} />
            ))}
            <label className="fieldBlock">
              <span>Tipo</span>
              <select aria-label="Tipo cliente" value={p.customerForm.kind} onChange={(event) => p.updateCustomerForm("kind", event.target.value)}>
                <option value="Business">Empresa</option>
                <option value="Individual">Persona fisica</option>
                <option value="PublicAdministration">Administracion</option>
              </select>
            </label>
            {fields.slice(2).map((field) => (
              <TextField key={field.key} field={field} value={p.customerForm[field.key]} onChange={p.updateCustomerForm} />
            ))}
          </div>
          <button className="primary">Guardar cliente</button>
        </form>
      </section>
      <section className="panel lists">
        <DataList title="Clientes" empty="Sin clientes" rows={p.customers.map((item) => `${item.display_name} - ${item.tax_id}`)} />
      </section>
    </>
  );
}
