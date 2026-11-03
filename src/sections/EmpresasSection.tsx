/** Empresas: emisor, catálogo de productos/servicios y series de facturación. */
import { type Field, TextField } from "../components/forms";
import { DataList } from "../components/lists";
import { cents } from "../lib/format";
import type { CompanyForm, ProductForm } from "../types";
import type { Model } from "../useCumpleFactura";


const companyFields: Field<keyof CompanyForm>[] = [
  { key: "legal_name", label: "Nombre legal", aria: "Nombre legal empresa", required: true },
  { key: "tax_id", label: "NIF/CIF", aria: "NIF empresa", required: true },
  { key: "address", label: "Direccion", aria: "Direccion empresa", wide: true, required: true },
  { key: "postal_code", label: "CP", aria: "CP empresa", required: true },
  { key: "municipality", label: "Municipio", aria: "Municipio empresa", required: true },
  { key: "province", label: "Provincia", aria: "Provincia empresa", required: true },
  { key: "country_code", label: "Pais", aria: "Pais empresa", upper: true, required: true },
  { key: "default_series", label: "Serie por defecto", aria: "Serie por defecto empresa", upper: true },
];

type ProductTextKey = Exclude<keyof ProductForm, "active" | "kind">;

const productFields: Field<ProductTextKey>[] = [
  { key: "sku", label: "SKU", aria: "SKU producto", upper: true, required: true },
  { key: "name", label: "Nombre", aria: "Nombre producto", required: true },
  { key: "description", label: "Descripcion linea", aria: "Descripcion producto", wide: true, required: true },
];

const productNumberFields: Field<ProductTextKey>[] = [
  { key: "unit_price_euros", label: "Precio EUR", aria: "Precio producto EUR", decimal: true, required: true },
  { key: "tax_rate_percent", label: "IVA %", aria: "IVA producto", decimal: true, required: true },
  { key: "withholding_rate_percent", label: "IRPF %", aria: "IRPF producto", decimal: true },
  { key: "discount_rate_percent", label: "Dto %", aria: "Descuento producto", decimal: true },
];

const seriesPresets = [
  { preset: "VENDI", label: "Usar VENDI2026XX" },
  { preset: "AL", label: "Usar AL-XXX" },
  { preset: "C", label: "Usar C-XXX" },
  { preset: "I", label: "Usar I-XXX" },
] as const;

export function EmpresasSection(p: Model) {
  const productInput = (field: Field<ProductTextKey>) => (
    <TextField key={field.key} field={field} value={p.productForm[field.key]} onChange={p.updateProductForm} />
  );

  return (
    <>
      <section className="panel entityForms">
        <form onSubmit={p.saveCompany}>
          <div className="formTitle">
            <h2>Empresa emisora</h2>
            <button type="button" className="linkButton" onClick={p.newCompanyForm}>
              Nueva empresa
            </button>
          </div>
          <label className="fieldBlock">
            <span>Empresa activa</span>
            <select aria-label="Empresa activa" value={p.company?.id ?? ""} onChange={(event) => p.selectCompany(event.target.value)}>
              <option value="">Nueva empresa</option>
              {p.companies.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.legal_name} - {item.tax_id}
                </option>
              ))}
            </select>
          </label>
          <div className="formGrid">
            {companyFields.map((field) => (
              <TextField key={field.key} field={field} value={p.companyForm[field.key]} onChange={p.updateCompanyForm} />
            ))}
          </div>
          <button className="primary">Guardar emisor</button>
        </form>
      </section>

      <section className="panel productCatalog" aria-label="Catalogo productos/servicios">
        <div className="editorTop">
          <div>
            <h2>Catalogo productos/servicios</h2>
            <p>{p.company ? `${p.products.length} ficha(s) para ${p.company.legal_name}` : "Crea empresa para activar catalogo."}</p>
          </div>
          <button type="button" className="linkButton" onClick={p.newProductForm}>
            Nuevo producto
          </button>
        </div>
        <form className="productForm" onSubmit={p.saveProduct}>
          <label className="fieldBlock">
            <span>Producto activo</span>
            <select
              aria-label="Producto activo"
              value={p.product?.id ?? ""}
              onChange={(event) => p.selectProduct(event.target.value)}
              disabled={!p.company || p.products.length === 0}
            >
              <option value="">Nuevo producto</option>
              {p.products.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.sku} - {item.name}
                </option>
              ))}
            </select>
          </label>
          {productFields.map(productInput)}
          <label className="fieldBlock">
            <span>Tipo</span>
            <select aria-label="Tipo producto" value={p.productForm.kind} onChange={(event) => p.updateProductForm("kind", event.target.value)}>
              <option value="Service">Servicio</option>
              <option value="Product">Producto</option>
            </select>
          </label>
          {productNumberFields.map(productInput)}
          <label className="checkLine">
            <input type="checkbox" checked={p.productForm.active} onChange={(event) => p.updateProductForm("active", event.target.checked)} />
            Activo
          </label>
          <button className="primary" disabled={!p.company}>
            Guardar producto
          </button>
        </form>
        <div className="productList">
          {p.products.length === 0 ? <p>Sin productos/servicios guardados.</p> : null}
          {p.products.map((item) => (
            <div key={item.id} className="productRow">
              <div>
                <strong>
                  {item.sku} - {item.name}
                </strong>
                <p>
                  {cents(item.unit_price_cents)} - IVA {item.tax_rate_basis_points / 100}% - {item.active ? "activo" : "inactivo"}
                </p>
              </div>
              <button type="button" className="linkButton" onClick={() => p.productToFirstLine(item)}>
                Usar en linea
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="panel seriesPanel">
        <div>
          <h2>Series de facturacion</h2>
          <p>Configura continuar numeracion anterior o crear serie nueva. Ejemplos: VENDI202601, AL-001, C-001, I-001.</p>
        </div>
        <form className="seriesForm" onSubmit={p.configureSeries}>
          <input value={p.seriesForm.label} onChange={(event) => p.updateSeriesForm("label", event.target.value)} placeholder="Nombre" />
          <input value={p.seriesForm.series_code} onChange={(event) => p.updateSeriesForm("series_code", event.target.value)} placeholder="Serie" />
          <input type="number" value={p.seriesForm.fiscal_year} onChange={(event) => p.updateSeriesForm("fiscal_year", Number(event.target.value))} />
          <label className="checkLine">
            <input type="checkbox" checked={p.seriesForm.include_year} onChange={(event) => p.updateSeriesForm("include_year", event.target.checked)} />
            Incluir año
          </label>
          <input value={p.seriesForm.separator} onChange={(event) => p.updateSeriesForm("separator", event.target.value)} placeholder="Separador" />
          <input
            type="number"
            value={p.seriesForm.padding}
            min={1}
            max={12}
            onChange={(event) => p.updateSeriesForm("padding", Number(event.target.value))}
          />
          <input type="number" value={p.seriesForm.next_number} min={1} onChange={(event) => p.updateSeriesForm("next_number", Number(event.target.value))} />
          <button className="primary" disabled={!p.company}>
            Guardar serie
          </button>
        </form>
        <div className="seriesQuick">
          {seriesPresets.map(({ preset, label }) => (
            <button key={preset} type="button" onClick={() => p.applySeriesPreset(preset)}>
              {label}
            </button>
          ))}
        </div>
        <p>Activa: {p.selectedSeries ? `${p.selectedSeries.label} - ${p.selectedSeries.preview}` : `${p.activeSeriesPreview} sin configurar`}</p>
        <DataList
          title="Series"
          empty="Sin series configuradas"
          rows={p.seriesConfigs.map((item) => `${item.label} - ${item.preview} - siguiente ${item.next_number}`)}
        />
      </section>

      <section className="panel lists">
        <DataList title="Empresas" empty="Sin empresas" rows={p.companies.map((item) => `${item.legal_name} - ${item.tax_id}`)} />
      </section>
    </>
  );
}
