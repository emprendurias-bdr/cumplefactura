// @ts-nocheck
import { FileCode2, FolderOpen, Plus, RefreshCw, Trash2 } from "lucide-react";
import { DataList, Pager } from "../components/lists";
import { cents, short } from "../lib/format";
import { PAGE_SIZE } from "../types";

export function ClientesSection(p: Record<string, any>) {
  return (
    <>
<section className="panel entityForms">
<form onSubmit={p.saveCustomer}>
                  <div className="formTitle">
                    <h2>Cliente</h2>
                    <button type="button" className="linkButton" onClick={p.newCustomerForm}>Nuevo cliente</button>
                  </div>
                  <label className="fieldBlock">
                    <span>Cliente activo</span>
                    <select aria-label="Cliente activo" value={p.customer?.id ?? ""} onChange={(event) => p.selectCustomer(event.target.value)}>
                      <option value="">Nuevo cliente</option>
                      {p.customers.map((item) => <option key={item.id} value={item.id}>{item.display_name} - {item.tax_id}</option>)}
                    </select>
                  </label>
                  <div className="formGrid">
                    <label className="fieldBlock"><span>Nombre</span><input aria-label="Nombre cliente" required value={p.customerForm.display_name} onChange={(event) => p.updateCustomerForm("display_name", event.target.value)} /></label>
                    <label className="fieldBlock"><span>NIF/CIF</span><input aria-label="NIF cliente" required value={p.customerForm.tax_id} onChange={(event) => p.updateCustomerForm("tax_id", event.target.value)} /></label>
                    <label className="fieldBlock"><span>Tipo</span><select aria-label="Tipo cliente" value={p.customerForm.kind} onChange={(event) => p.updateCustomerForm("kind", event.target.value)}><option value="Business">Empresa</option><option value="Individual">Persona fisica</option><option value="PublicAdministration">Administracion</option></select></label>
                    <label className="fieldBlock wide"><span>Direccion</span><input aria-label="Direccion cliente" required value={p.customerForm.address} onChange={(event) => p.updateCustomerForm("address", event.target.value)} /></label>
                    <label className="fieldBlock"><span>CP</span><input aria-label="CP cliente" required value={p.customerForm.postal_code} onChange={(event) => p.updateCustomerForm("postal_code", event.target.value)} /></label>
                    <label className="fieldBlock"><span>Municipio</span><input aria-label="Municipio cliente" required value={p.customerForm.municipality} onChange={(event) => p.updateCustomerForm("municipality", event.target.value)} /></label>
                    <label className="fieldBlock"><span>Provincia</span><input aria-label="Provincia cliente" required value={p.customerForm.province} onChange={(event) => p.updateCustomerForm("province", event.target.value)} /></label>
                    <label className="fieldBlock"><span>Pais</span><input aria-label="Pais cliente" required value={p.customerForm.country_code} onChange={(event) => p.updateCustomerForm("country_code", event.target.value.toUpperCase())} /></label>
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
