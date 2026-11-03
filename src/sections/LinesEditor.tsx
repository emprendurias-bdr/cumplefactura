/**
 * Tabla de líneas editable, la misma en facturas, documentos y plantillas recurrentes:
 * Descripción · Cant. · Precio (MoneyInput) · Dto · IVA · IRPF · Importe · quitar.
 * Un importe mal escrito se marca en la fila con «Importe no válido. Usa coma decimal: 1.234,56».
 * `useLines` guarda las líneas en estado local para documentos y recurrentes (las de la factura
 * viven en useCumpleFactura). Al final, «Añadir línea» y añadir desde el catálogo de productos.
 */
import { useState } from "react";
import { Icon } from "../components/Icon";
import { t } from "../i18n/es";
import { decimal, editorTotals, invoiceToLines, isInvoiceLineReady, newInvoiceLine, productToInvoiceLine } from "../lib/format";
import { formatCents } from "../lib/moneyFormat";
import type { InvoiceLineForm, InvoiceLineInput, Product } from "../types";
import { Button } from "../ui/Button";
import { MoneyInput } from "../ui/Field";

type Field = Exclude<keyof InvoiceLineForm, "id">;
const PERCENT: { key: Field; label: "lineas.dto" | "lineas.iva" | "lineas.irpf" }[] = [
  { key: "discount_rate_percent", label: "lineas.dto" },
  { key: "tax_rate_percent", label: "lineas.iva" },
  { key: "withholding_rate_percent", label: "lineas.irpf" },
];

type Props = {
  lines: InvoiceLineForm[];
  products: Product[];
  onChange: (id: string, field: Field, value: string) => void;
  onAdd: (line?: InvoiceLineForm) => void;
  onRemove: (id: string) => void;
  readOnly?: boolean;
};

export function LinesEditor({ lines, products, onChange, onAdd, onRemove, readOnly }: Props) {
  return (
    <div className="bdr-table-wrap">
      <table className="bdr-table cf-lines" aria-label={t("lineas.titulo")}>
        <thead>
          <tr>
            <th scope="col">{t("lineas.descripcion")}</th>
            <th scope="col" className="num">{t("lineas.cantidad")}</th>
            <th scope="col" className="num">{t("lineas.precio")}</th>
            {PERCENT.map((p) => (
              <th key={p.key} scope="col" className="num">{t(p.label)}</th>
            ))}
            <th scope="col" className="num">{t("lineas.importe")}</th>
            <th scope="col" aria-label={t("lineas.quitar")} />
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => {
            const n = index + 1;
            const badPrice = line.unit_price_euros.trim() !== "" && !Number.isFinite(decimal(line.unit_price_euros));
            return (
              <tr key={line.id} className={isInvoiceLineReady(line) ? undefined : "cf-line--incomplete"}>
                <td>
                  <input className="bdr-input cf-cell" aria-label={t("lineas.ariaDescripcion", { n })} value={line.description} readOnly={readOnly} onChange={(e) => onChange(line.id, "description", e.target.value)} />
                </td>
                <td className="num">
                  <input className="bdr-input bdr-input--money cf-cell cf-cell--xs" aria-label={t("lineas.ariaCantidad", { n })} inputMode="numeric" value={line.quantity} readOnly={readOnly} onChange={(e) => onChange(line.id, "quantity", e.target.value)} />
                </td>
                <td className="num">
                  <MoneyInput aria-label={t("lineas.ariaPrecio", { n })} value={line.unit_price_euros} invalid={badPrice} readOnly={readOnly} onChange={(e) => onChange(line.id, "unit_price_euros", e.target.value)} />
                  {badPrice ? <span className="bdr-help bdr-help--err cf-cell-err">✕ {t("lineas.importeNoValido")}</span> : null}
                </td>
                {PERCENT.map((p) => (
                  <td key={p.key} className="num">
                    <input className="bdr-input bdr-input--money cf-cell cf-cell--xs" aria-label={t(`${p.label}Aria`, { n })} inputMode="decimal" value={line[p.key]} readOnly={readOnly} onChange={(e) => onChange(line.id, p.key, e.target.value)} />
                  </td>
                ))}
                <td className="num">{isInvoiceLineReady(line) ? formatCents(editorTotals([line]).taxable_base_cents) : "—"}</td>
                <td>
                  {readOnly ? null : (
                    <button type="button" className="bdr-icon-btn" aria-label={t("lineas.ariaQuitar", { n })} title={t("lineas.ariaQuitar", { n })} disabled={lines.length === 1} onClick={() => onRemove(line.id)}>
                      <Icon name="x" />
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {readOnly ? null : (
        <div className="cf-lines__foot cf-row">
          <Button variant="secondary" size="sm" icon="plus" onClick={() => onAdd()}>
            {t("lineas.anadir")}
          </Button>
          {products.length > 0 ? (
            <select
              className="bdr-ctx"
              aria-label={t("lineas.catalogo")}
              value=""
              onChange={(e) => {
                const product = products.find((item) => item.id === e.target.value);
                if (product) onAdd(productToInvoiceLine(product, newInvoiceLine().id));
              }}
            >
              <option value="">{t("lineas.catalogo")}</option>
              {products.filter((item) => item.active).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.sku} · {item.name}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** Líneas del formulario → filas y totales de DocPreview / SourceBreakdown. */
export function previewOf(lines: InvoiceLineForm[]) {
  const totals = editorTotals(lines);
  return {
    totals,
    lines: lines.filter(isInvoiceLineReady).map((line) => ({
      description: line.description,
      quantity: Number(line.quantity),
      amount_cents: editorTotals([line]).taxable_base_cents,
    })),
    rows: [
      { label: t("totales.base"), cents: totals.taxable_base_cents },
      { label: t("totales.iva"), cents: totals.tax_cents },
      { label: t("totales.irpf"), cents: -totals.withholding_cents },
    ],
  };
}

/** Líneas en estado local (documentos, plantillas) con las mismas operaciones que la factura. */
export function useLines(initial?: { lines?: InvoiceLineInput[] }) {
  const [lines, setLines] = useState<InvoiceLineForm[]>(() => invoiceToLines({ lines: initial?.lines }));
  return {
    lines,
    reset: (next?: { lines?: InvoiceLineInput[] }) => setLines(invoiceToLines({ lines: next?.lines })),
    onChange: (id: string, field: Field, value: string) => setLines((all) => all.map((l) => (l.id === id ? { ...l, [field]: value } : l))),
    onAdd: (line?: InvoiceLineForm) => setLines((all) => [...all, line ?? newInvoiceLine()]),
    onRemove: (id: string) => setLines((all) => (all.length === 1 ? all : all.filter((l) => l.id !== id))),
  };
}
