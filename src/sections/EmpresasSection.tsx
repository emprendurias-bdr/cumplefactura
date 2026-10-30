// @ts-nocheck
import { FileCode2, FolderOpen, Plus, RefreshCw, Trash2 } from "lucide-react";
import { DataList, Pager } from "../components/lists";
import { cents, short } from "../lib/format";
import { PAGE_SIZE } from "../types";

export function EmpresasSection(p: Record<string, any>) {
  return (
    <>
<section className="panel entityForms">
                <form onSubmit={p.saveCompany}>
                  <div className="formTitle">
                    <h2>Empresa emisora</h2>
                    <button type="button" className="linkButton" onClick={p.newCompanyForm}>Nueva empresa</button>
                  </div>
                  <label className="fieldBlock">
                    <span>Empresa activa</span>
                    <select aria-label="Empresa activa" value={p.company?.id ?? ""} onChange={(event) => p.selectCompany(event.target.value)}>
                      <option value="">Nueva empresa</option>
                      {p.companies.map((item) => <option key={item.id} value={item.id}>{item.legal_name} - {item.tax_id}</option>)}
                    </select>
                  </label>
                  <div className="formGrid">
                    <label className="fieldBlock"><span>Nombre legal</span><input aria-label="Nombre legal empresa" required value={p.companyForm.legal_name} onChange={(event) => p.updateCompanyForm("legal_name", event.target.value)} /></label>
                    <label className="fieldBlock"><span>NIF/CIF</span><input aria-label="NIF empresa" required value={p.companyForm.tax_id} onChange={(event) => p.updateCompanyForm("tax_id", event.target.value)} /></label>
                    <label className="fieldBlock wide"><span>Direccion</span><input aria-label="Direccion empresa" required value={p.companyForm.address} onChange={(event) => p.updateCompanyForm("address", event.target.value)} /></label>
                    <label className="fieldBlock"><span>CP</span><input aria-label="CP empresa" required value={p.companyForm.postal_code} onChange={(event) => p.updateCompanyForm("postal_code", event.target.value)} /></label>
                    <label className="fieldBlock"><span>Municipio</span><input aria-label="Municipio empresa" required value={p.companyForm.municipality} onChange={(event) => p.updateCompanyForm("municipality", event.target.value)} /></label>
                    <label className="fieldBlock"><span>Provincia</span><input aria-label="Provincia empresa" required value={p.companyForm.province} onChange={(event) => p.updateCompanyForm("province", event.target.value)} /></label>
                    <label className="fieldBlock"><span>Pais</span><input aria-label="Pais empresa" required value={p.companyForm.country_code} onChange={(event) => p.updateCompanyForm("country_code", event.target.value.toUpperCase())} /></label>
                    <label className="fieldBlock"><span>Serie por defecto</span><input aria-label="Serie por defecto empresa" value={p.companyForm.default_series} onChange={(event) => p.updateCompanyForm("default_series", event.target.value.toUpperCase())} /></label>
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
                  <button type="button" className="linkButton" onClick={p.newProductForm}>Nuevo producto</button>
                </div>
                <form className="productForm" onSubmit={p.saveProduct}>
                  <label className="fieldBlock">
                    <span>Producto activo</span>
                    <select aria-label="Producto activo" value={p.product?.id ?? ""} onChange={(event) => p.selectProduct(event.target.value)} disabled={!p.company || p.products.length === 0}>
                      <option value="">Nuevo producto</option>
                      {p.products.map((item) => <option key={item.id} value={item.id}>{item.sku} - {item.name}</option>)}
                    </select>
                  </label>
                  <label className="fieldBlock"><span>SKU</span><input aria-label="SKU producto" required value={p.productForm.sku} onChange={(event) => p.updateProductForm("sku", event.target.value.toUpperCase())} /></label>
                  <label className="fieldBlock"><span>Nombre</span><input aria-label="Nombre producto" required value={p.productForm.name} onChange={(event) => p.updateProductForm("name", event.target.value)} /></label>
                  <label className="fieldBlock wide"><span>Descripcion linea</span><input aria-label="Descripcion producto" required value={p.productForm.description} onChange={(event) => p.updateProductForm("description", event.target.value)} /></label>
                  <label className="fieldBlock"><span>Tipo</span><select aria-label="Tipo producto" value={p.productForm.kind} onChange={(event) => p.updateProductForm("kind", event.target.value)}><option value="Service">Servicio</option><option value="Product">Producto</option></select></label>
                  <label className="fieldBlock"><span>Precio EUR</span><input aria-label="Precio producto EUR" inputMode="decimal" required value={p.productForm.unit_price_euros} onChange={(event) => p.updateProductForm("unit_price_euros", event.target.value)} /></label>
                  <label className="fieldBlock"><span>IVA %</span><input aria-label="IVA producto" inputMode="decimal" required value={p.productForm.tax_rate_percent} onChange={(event) => p.updateProductForm("tax_rate_percent", event.target.value)} /></label>
                  <label className="fieldBlock"><span>IRPF %</span><input aria-label="IRPF producto" inputMode="decimal" value={p.productForm.withholding_rate_percent} onChange={(event) => p.updateProductForm("withholding_rate_percent", event.target.value)} /></label>
                  <label className="fieldBlock"><span>Dto %</span><input aria-label="Descuento producto" inputMode="decimal" value={p.productForm.discount_rate_percent} onChange={(event) => p.updateProductForm("discount_rate_percent", event.target.value)} /></label>
                  <label className="checkLine">
                    <input type="checkbox" checked={p.productForm.active} onChange={(event) => p.updateProductForm("active", event.target.checked)} />
                    Activo
                  </label>
                  <button className="primary" disabled={!p.company}>Guardar producto</button>
                </form>
                <div className="productList">
                  {p.products.length === 0 ? <p>Sin productos/servicios guardados.</p> : null}
                  {p.products.map((item) => (
                    <div key={item.id} className="productRow">
                      <div>
                        <strong>{item.sku} - {item.name}</strong>
                        <p>{p.cents(item.unit_price_cents)} - IVA {item.tax_rate_basis_points / 100}% - {item.active ? "activo" : "inactivo"}</p>
                      </div>
                      <button type="button" className="linkButton" onClick={() => p.useProductInFirstLine(item)}>Usar en linea</button>
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
                  <input value={p.seriesLabel} onChange={(event) => p.setSeriesLabel(event.target.value)} placeholder="Nombre" />
                  <input value={p.seriesCode} onChange={(event) => p.setSeriesCode(event.target.value)} placeholder="Serie" />
                  <input type="number" value={p.seriesFiscalYear} onChange={(event) => p.setSeriesFiscalYear(Number(event.target.value))} />
                  <label className="checkLine">
                    <input type="checkbox" checked={p.seriesIncludeYear} onChange={(event) => p.setSeriesIncludeYear(event.target.checked)} />
                    Incluir año
                  </label>
                  <input value={p.seriesSeparator} onChange={(event) => p.setSeriesSeparator(event.target.value)} placeholder="Separador" />
                  <input type="number" value={p.seriesPadding} min={1} max={12} onChange={(event) => p.setSeriesPadding(Number(event.target.value))} />
                  <input type="number" value={p.seriesNextNumber} min={1} onChange={(event) => p.setSeriesNextNumber(Number(event.target.value))} />
                  <button className="primary" disabled={!p.company}>Guardar serie</button>
                </form>
                <div className="seriesQuick">
                  <button type="button" onClick={() => { p.setSeriesLabel("Vendingsaiz Aragon"); p.setSeriesCode("VENDI"); p.setSeriesIncludeYear(true); p.setSeriesSeparator(""); p.setSeriesPadding(2); } }>
                    Usar VENDI2026XX
                  </button>
                  <button type="button" onClick={() => { p.setSeriesLabel("Alquiler"); p.setSeriesCode("AL"); p.setSeriesIncludeYear(false); p.setSeriesSeparator("-"); p.setSeriesPadding(3); } }>
                    Usar AL-XXX
                  </button>
                  <button type="button" onClick={() => { p.setSeriesLabel("Construccion"); p.setSeriesCode("C"); p.setSeriesIncludeYear(false); p.setSeriesSeparator("-"); p.setSeriesPadding(3); } }>
                    Usar C-XXX
                  </button>
                  <button type="button" onClick={() => { p.setSeriesLabel("Inmovilizado"); p.setSeriesCode("I"); p.setSeriesIncludeYear(false); p.setSeriesSeparator("-"); p.setSeriesPadding(3); } }>
                    Usar I-XXX
                  </button>
                </div>
                <p>Activa: {p.selectedSeries ? `${p.selectedSeries.label} - ${p.selectedSeries.preview}` : `${p.activeSeriesPreview} sin configurar`}</p>
                <DataList title="Series" empty="Sin series configuradas" rows={p.seriesConfigs.map((item) => `${item.label} - ${item.preview} - siguiente ${item.next_number}`)} />
              </section>
<section className="panel lists">
<DataList title="Empresas" empty="Sin empresas" rows={p.companies.map((item) => `${item.legal_name} - ${item.tax_id}`)} />
</section>
    
    </>
  );
}
