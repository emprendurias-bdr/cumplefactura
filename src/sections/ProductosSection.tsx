/**
 * Productos y servicios de la empresa activa: lista (SKU · Nombre · Tipo · Precio · IVA · Activo · ⋯)
 * y formulario lateral (`#/productos/nuevo` o `/:id`). «Usar en factura» lleva el producto a la
 * primera línea del editor.
 */
import { useEffect } from "react";
import { t } from "../i18n/es";
import { formatCents, formatPercent } from "../lib/moneyFormat";
import { href, isNew } from "../lib/routes";
import { go } from "../shell/useRoute";
import type { Product, ProductForm } from "../types";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { DataTable } from "../ui/DataTable";
import { EmptyState } from "../ui/EmptyState";
import { Checkbox, Field, Input, MoneyInput, Select } from "../ui/Field";
import { Accent, Hero } from "../ui/Hero";
import { activeStatus } from "../ui/status";
import { StatusChip } from "../ui/StatusChip";
import type { Ctx } from "./ctx";

type TextKey = Exclude<keyof ProductForm, "active" | "kind" | "unit_price_euros">;
const TEXT: { key: TextKey; mono?: boolean; wide?: boolean }[] = [
  { key: "sku", mono: true },
  { key: "name" },
  { key: "description", wide: true },
];
const PERCENT: TextKey[] = ["tax_rate_percent", "withholding_rate_percent", "discount_rate_percent"];

export function ProductosSection({ m, route }: Ctx) {
  const editing = route.id !== null;
  useEffect(() => {
    if (isNew(route.id)) m.newProductForm();
  }, [route.id]);
  // Separado: al guardar uno nuevo la lista crece y no debe vaciar otra vez el formulario.
  useEffect(() => {
    if (route.id && !isNew(route.id)) m.selectProduct(route.id);
  }, [route.id, m.products.length]);

  const open = (item: Product) => go(href({ section: "productos", id: item.id }));
  const use = (item: Product) => {
    m.productToFirstLine(item);
    go("#/facturas/nueva");
  };

  return (
    <>
      <Hero
        plain
        label={m.company?.legal_name}
        title={<>{t("facturas.tus")} <Accent>{t("productos.productos")}</Accent></>}
        primary={<a className={editing ? "bdr-btn bdr-btn--secondary" : "bdr-btn bdr-btn--primary"} href="#/productos/nuevo">{t("acciones.nuevoProducto")}</a>}
      />
      <div className={editing ? "cf-split" : undefined}>
        <div className="cf-stack">
          {!m.company ? (
            <EmptyState text={t("productos.sinEmpresa")} action={<a className="bdr-btn bdr-btn--secondary" href="#/ajustes/empresa">{t("productos.crearEmpresa")}</a>} />
          ) : m.products.length === 0 ? (
            <EmptyState text={t("productos.vacio")} action={editing ? undefined : <a className="bdr-btn bdr-btn--secondary" href="#/productos/nuevo">{t("acciones.nuevoProducto")}</a>} />
          ) : (
            <DataTable
              label={t("nav.productos")}
              rows={m.products}
              rowKey={(row) => row.id}
              onOpen={open}
              rowActions={(row) => [
                { label: t("comun.editar"), onSelect: () => open(row) },
                { label: t("productos.usar"), onSelect: () => use(row), disabled: !row.active },
              ]}
              columns={[
                { key: "sku", header: t("productos.f.sku"), cell: (row) => <span className="m">{row.sku}</span> },
                { key: "nombre", header: t("productos.f.name"), cell: (row) => row.name },
                { key: "tipo", header: t("productos.tipo"), cell: (row) => t(row.kind === "Product" ? "productos.producto" : "productos.servicio") },
                { key: "precio", header: t("productos.precio"), num: true, cell: (row) => formatCents(row.unit_price_cents) },
                { key: "iva", header: t("lineas.iva"), num: true, cell: (row) => formatPercent(row.tax_rate_basis_points) },
                { key: "activo", header: t("productos.estado"), cell: (row) => <StatusChip status={activeStatus(row.active)} /> },
              ]}
            />
          )}
        </div>
        {editing ? (
          <Card title={m.product && !isNew(route.id) ? m.product.name : t("acciones.nuevoProducto")} className="cf-sidepanel">
            <form className="cf-form-grid cf-form-grid--panel" onSubmit={async (e) => { if (await m.saveProduct(e)) go("#/productos"); }}>
              {TEXT.map((field) => (
                <Field key={field.key} label={t(`productos.f.${field.key}`)} wide={field.wide}>
                  <Input required mono={field.mono} value={m.productForm[field.key]} onChange={(e) => m.updateProductForm(field.key, field.key === "sku" ? e.target.value.toUpperCase() : e.target.value)} />
                </Field>
              ))}
              <Field label={t("productos.tipo")}>
                <Select value={m.productForm.kind} onChange={(e) => m.updateProductForm("kind", e.target.value)}>
                  <option value="Service">{t("productos.servicio")}</option>
                  <option value="Product">{t("productos.producto")}</option>
                </Select>
              </Field>
              <Field label={t("productos.precio")}>
                <MoneyInput required value={m.productForm.unit_price_euros} onChange={(e) => m.updateProductForm("unit_price_euros", e.target.value)} />
              </Field>
              {PERCENT.map((key) => (
                <Field key={key} label={t(`productos.f.${key}`)}>
                  <Input mono inputMode="decimal" value={m.productForm[key]} required={key === "tax_rate_percent"} onChange={(e) => m.updateProductForm(key, e.target.value)} />
                </Field>
              ))}
              <Checkbox label={t("productos.activo")} checked={m.productForm.active} onChange={(e) => m.updateProductForm("active", e.target.checked)} />
              <div className="cf-row cf-end cf-wide">
                <a className="bdr-btn bdr-btn--ghost" href="#/productos">{t("comun.cancelar")}</a>
                <Button type="submit" variant="primary" disabled={!m.company}>{t("productos.guardar")}</Button>
              </div>
            </form>
          </Card>
        ) : null}
      </div>
    </>
  );
}
