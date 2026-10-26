import { useWorkspaceState } from "../../shared/context";
import { cents } from "../../shared/forms";
export function ProductCatalog() {
  const {
    company,
    products,
    newProductForm,
    saveProduct,
    product,
    selectProduct,
    productForm,
    updateProductForm,
    useProductInFirstLine,
  } = useWorkspaceState();
  return (
    <section
      className="panel productCatalog"
      aria-label="Catalogo productos/servicios"
    >
      <div className="editorTop">
        <div>
          <h2>Catalogo productos/servicios</h2>
          <p>
            {company
              ? `${products.length} ficha(s) para ${company.legal_name}`
              : "Crea empresa para activar catalogo."}
          </p>
        </div>
        <button type="button" className="linkButton" onClick={newProductForm}>
          Nuevo producto
        </button>
      </div>
      <form className="productForm" onSubmit={saveProduct}>
        <label className="fieldBlock">
          <span>Producto activo</span>
          <select
            aria-label="Producto activo"
            value={product?.id ?? ""}
            onChange={(event) => selectProduct(event.target.value)}
            disabled={!company || products.length === 0}
          >
            <option value="">Nuevo producto</option>
            {products.map((item) => (
              <option key={item.id} value={item.id}>
                {item.sku} - {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="fieldBlock">
          <span>SKU</span>
          <input
            aria-label="SKU producto"
            required
            value={productForm.sku}
            onChange={(event) =>
              updateProductForm("sku", event.target.value.toUpperCase())
            }
          />
        </label>
        <label className="fieldBlock">
          <span>Nombre</span>
          <input
            aria-label="Nombre producto"
            required
            value={productForm.name}
            onChange={(event) => updateProductForm("name", event.target.value)}
          />
        </label>
        <label className="fieldBlock wide">
          <span>Descripcion linea</span>
          <input
            aria-label="Descripcion producto"
            required
            value={productForm.description}
            onChange={(event) =>
              updateProductForm("description", event.target.value)
            }
          />
        </label>
        <label className="fieldBlock">
          <span>Tipo</span>
          <select
            aria-label="Tipo producto"
            value={productForm.kind}
            onChange={(event) => updateProductForm("kind", event.target.value)}
          >
            <option value="Service">Servicio</option>
            <option value="Product">Producto</option>
          </select>
        </label>
        <label className="fieldBlock">
          <span>Precio EUR</span>
          <input
            aria-label="Precio producto EUR"
            inputMode="decimal"
            required
            value={productForm.unit_price_euros}
            onChange={(event) =>
              updateProductForm("unit_price_euros", event.target.value)
            }
          />
        </label>
        <label className="fieldBlock">
          <span>IVA %</span>
          <input
            aria-label="IVA producto"
            inputMode="decimal"
            required
            value={productForm.tax_rate_percent}
            onChange={(event) =>
              updateProductForm("tax_rate_percent", event.target.value)
            }
          />
        </label>
        <label className="fieldBlock">
          <span>IRPF %</span>
          <input
            aria-label="IRPF producto"
            inputMode="decimal"
            value={productForm.withholding_rate_percent}
            onChange={(event) =>
              updateProductForm("withholding_rate_percent", event.target.value)
            }
          />
        </label>
        <label className="fieldBlock">
          <span>Dto %</span>
          <input
            aria-label="Descuento producto"
            inputMode="decimal"
            value={productForm.discount_rate_percent}
            onChange={(event) =>
              updateProductForm("discount_rate_percent", event.target.value)
            }
          />
        </label>
        <label className="checkLine">
          <input
            type="checkbox"
            checked={productForm.active}
            onChange={(event) =>
              updateProductForm("active", event.target.checked)
            }
          />
          Activo
        </label>
        <button className="primary" disabled={!company}>
          Guardar producto
        </button>
      </form>
      <div className="productList">
        {products.length === 0 ? (
          <p>Sin productos/servicios guardados.</p>
        ) : null}
        {products.map((item) => (
          <div key={item.id} className="productRow">
            <div>
              <strong>
                {item.sku} - {item.name}
              </strong>
              <p>
                {cents(item.unit_price_cents)} - IVA{" "}
                {item.tax_rate_basis_points / 100}% -{" "}
                {item.active ? "activo" : "inactivo"}
              </p>
            </div>
            <button
              type="button"
              className="linkButton"
              onClick={() => useProductInFirstLine(item)}
            >
              Usar en linea
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
