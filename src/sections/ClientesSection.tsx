/**
 * Clientes: lista (Nombre · NIF · Tipo · Municipio · ⋯) con búsqueda y formulario en panel
 * lateral de 420 px (`#/clientes/nuevo` o `#/clientes/:id`). Con el panel abierto, la acción
 * principal es «Guardar cliente»; si no, «Nuevo cliente».
 */
import { useEffect, useState } from "react";
import { t } from "../i18n/es";
import { href, isNew } from "../lib/routes";
import { go } from "../shell/useRoute";
import type { Customer, CustomerForm } from "../types";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { DataTable } from "../ui/DataTable";
import { EmptyState } from "../ui/EmptyState";
import { Field, Input, Select } from "../ui/Field";
import { Accent, Hero } from "../ui/Hero";
import type { Ctx } from "./ctx";

type TextKey = Exclude<keyof CustomerForm, "kind">;
const FIELDS: { key: TextKey; mono?: boolean; wide?: boolean; upper?: boolean }[] = [
  { key: "display_name" },
  { key: "tax_id", mono: true, upper: true },
  { key: "address", wide: true },
  { key: "postal_code", mono: true },
  { key: "municipality" },
  { key: "province" },
  { key: "country_code", mono: true, upper: true },
];
const KINDS = ["Business", "Individual", "PublicAdministration"] as const;
const fold = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function ClientesSection({ m, route }: Ctx) {
  const [query, setQuery] = useState("");
  const editing = route.id !== null;

  useEffect(() => {
    if (isNew(route.id)) m.newCustomerForm();
  }, [route.id]);
  // Separado: al guardar uno nuevo la lista crece y no debe vaciar otra vez el formulario.
  useEffect(() => {
    if (route.id && !isNew(route.id)) m.selectCustomer(route.id);
  }, [route.id, m.customers.length]);

  const rows = m.customers.filter((item) => fold(`${item.display_name} ${item.tax_id} ${item.municipality}`).includes(fold(query)));
  const open = (item: Customer) => go(href({ section: "clientes", id: item.id }));

  return (
    <>
      <Hero
        plain
        title={<>{t("facturas.tus")} <Accent>{t("clientes.clientes")}</Accent></>}
        primary={<a className={editing ? "bdr-btn bdr-btn--secondary" : "bdr-btn bdr-btn--primary"} href="#/clientes/nuevo">{t("acciones.nuevoCliente")}</a>}
      />
      <div className={editing ? "cf-split" : undefined}>
        <div className="cf-stack">
          <label className="bdr-search cf-filters__search">
            <span className="cf-sr">{t("clientes.buscar")}</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("clientes.buscarPlaceholder")} />
          </label>
          {m.customers.length === 0 ? (
            <EmptyState text={t("clientes.vacio")} action={editing ? undefined : <a className="bdr-btn bdr-btn--secondary" href="#/clientes/nuevo">{t("acciones.nuevoCliente")}</a>} />
          ) : (
            <DataTable
              label={t("nav.clientes")}
              rows={rows}
              rowKey={(row) => row.id}
              onOpen={open}
              rowActions={(row) => [
                { label: t("comun.editar"), onSelect: () => open(row) },
                { label: t("clientes.facturar"), onSelect: () => { m.selectCustomer(row.id); go("#/facturas/nueva"); } },
              ]}
              columns={[
                { key: "nombre", header: t("clientes.f.display_name"), cell: (row) => row.display_name },
                { key: "nif", header: t("clientes.f.tax_id"), cell: (row) => <span className="m">{row.tax_id}</span> },
                { key: "tipo", header: t("clientes.tipo"), cell: (row) => t(`clientes.kind.${KINDS.includes(row.kind as (typeof KINDS)[number]) ? (row.kind as (typeof KINDS)[number]) : "Business"}`) },
                { key: "municipio", header: t("clientes.f.municipality"), cell: (row) => row.municipality },
              ]}
            />
          )}
        </div>
        {editing ? (
          <Card title={m.customer && !isNew(route.id) ? m.customer.display_name : t("acciones.nuevoCliente")} className="cf-sidepanel">
            <form className="cf-form-grid cf-form-grid--panel" onSubmit={async (e) => { if (await m.saveCustomer(e)) go("#/clientes"); }}>
              {FIELDS.slice(0, 2).map((field) => (
                <Field key={field.key} label={t(`clientes.f.${field.key}`)}>
                  <Input required mono={field.mono} value={m.customerForm[field.key]} onChange={(e) => m.updateCustomerForm(field.key, field.upper ? e.target.value.toUpperCase() : e.target.value)} />
                </Field>
              ))}
              <Field label={t("clientes.tipo")}>
                <Select value={m.customerForm.kind} onChange={(e) => m.updateCustomerForm("kind", e.target.value)}>
                  {KINDS.map((kind) => <option key={kind} value={kind}>{t(`clientes.kind.${kind}`)}</option>)}
                </Select>
              </Field>
              {FIELDS.slice(2).map((field) => (
                <Field key={field.key} label={t(`clientes.f.${field.key}`)} wide={field.wide}>
                  <Input required mono={field.mono} value={m.customerForm[field.key]} onChange={(e) => m.updateCustomerForm(field.key, field.upper ? e.target.value.toUpperCase() : e.target.value)} />
                </Field>
              ))}
              <div className="cf-row cf-end cf-wide">
                <a className="bdr-btn bdr-btn--ghost" href="#/clientes">{t("comun.cancelar")}</a>
                <Button type="submit" variant="primary">{t("clientes.guardar")}</Button>
              </div>
            </form>
          </Card>
        ) : null}
      </div>
    </>
  );
}
