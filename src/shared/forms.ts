import { FileCheck2,Hash,LockKeyhole,ShieldCheck } from "lucide-react";
import type { Company,CompanyForm,Customer,CustomerForm,InvoiceLineForm,InvoiceLineInput,Product,ProductForm } from './types';
export const PAGE_SIZE = 5;
export function cents(value: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(value / 100);
}
export function short(value?: string | null) {
  return value ? `${value.slice(0, 12)}...` : "-";
}
export function resolvedSeriesCode(code: string, year: number, includeYear: boolean) {
  const normalized = code.trim().toUpperCase() || "A";
  return includeYear ? `${normalized}${year}` : normalized;
}
export function newInvoiceLine(): InvoiceLineForm {
  return {
    id: `line-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`,
    description: "Servicio profesional",
    quantity: "1",
    unit_price_euros: "100",
    discount_rate_percent: "0",
    tax_rate_percent: "21",
    withholding_rate_percent: "",
  };
}
export function emptyCompanyForm(): CompanyForm {
  return {
    legal_name: "",
    tax_id: "",
    address: "",
    postal_code: "",
    municipality: "",
    province: "",
    country_code: "ES",
    default_series: "A",
  };
}
export function emptyCustomerForm(): CustomerForm {
  return {
    display_name: "",
    tax_id: "",
    kind: "Business",
    address: "",
    postal_code: "",
    municipality: "",
    province: "",
    country_code: "ES",
  };
}
export function emptyProductForm(): ProductForm {
  return {
    sku: "SVC-001",
    name: "Servicio profesional",
    description: "Servicio profesional",
    kind: "Service",
    unit_price_euros: "100",
    tax_rate_percent: "21",
    withholding_rate_percent: "",
    discount_rate_percent: "0",
    active: true,
  };
}
export function companyToForm(value: Company): CompanyForm {
  return {
    legal_name: value.legal_name,
    tax_id: value.tax_id,
    address: value.address,
    postal_code: value.postal_code,
    municipality: value.municipality,
    province: value.province,
    country_code: value.country_code,
    default_series: value.default_series,
  };
}
export function customerToForm(value: Customer): CustomerForm {
  return {
    display_name: value.display_name,
    tax_id: value.tax_id,
    kind: value.kind,
    address: value.address,
    postal_code: value.postal_code,
    municipality: value.municipality,
    province: value.province,
    country_code: value.country_code,
  };
}
export function productToForm(value: Product): ProductForm {
  return {
    sku: value.sku,
    name: value.name,
    description: value.description,
    kind: value.kind,
    unit_price_euros: (value.unit_price_cents / 100).toString(),
    tax_rate_percent: (value.tax_rate_basis_points / 100).toString(),
    withholding_rate_percent: value.withholding_rate_basis_points ? (value.withholding_rate_basis_points / 100).toString() : "",
    discount_rate_percent: value.discount_rate_basis_points ? (value.discount_rate_basis_points / 100).toString() : "0",
    active: value.active,
  };
}
export function decimal(value: string) {
  return Number(String(value).replace(",", "."));
}
export function eurosToCents(value: string) {
  return Math.round(decimal(value) * 100);
}
export function percentToBasisPoints(value: string) {
  if (value.trim() === "") return 0;
  return Math.round(decimal(value) * 100);
}
export function isInvoiceLineReady(line: InvoiceLineForm) {
  const quantity = decimal(line.quantity);
  const unitPrice = decimal(line.unit_price_euros);
  const discount = percentToBasisPoints(line.discount_rate_percent);
  const tax = percentToBasisPoints(line.tax_rate_percent);
  const withholding = percentToBasisPoints(line.withholding_rate_percent);
  return (
    line.description.trim().length > 0 &&
    Number.isFinite(quantity) &&
    quantity > 0 &&
    Number.isInteger(quantity) &&
    Number.isFinite(unitPrice) &&
    unitPrice >= 0 &&
    Number.isFinite(discount) &&
    discount >= 0 &&
    discount <= 10_000 &&
    Number.isFinite(tax) &&
    tax >= 0 &&
    Number.isFinite(withholding) &&
    withholding >= 0
  );
}
export function lineToInput(line: InvoiceLineForm): InvoiceLineInput {
  const discount = percentToBasisPoints(line.discount_rate_percent);
  const withholding = percentToBasisPoints(line.withholding_rate_percent);
  return {
    description: line.description.trim(),
    quantity: decimal(line.quantity),
    unit_price_cents: eurosToCents(line.unit_price_euros),
    discount_rate_basis_points: discount > 0 ? discount : null,
    tax_rate_basis_points: percentToBasisPoints(line.tax_rate_percent),
    withholding_rate_basis_points: withholding > 0 ? withholding : null,
  };
}
export function productToInvoiceLine(product: Product, lineId: string): InvoiceLineForm {
  return {
    id: lineId,
    description: product.description || product.name,
    quantity: "1",
    unit_price_euros: (product.unit_price_cents / 100).toString(),
    discount_rate_percent: product.discount_rate_basis_points ? (product.discount_rate_basis_points / 100).toString() : "0",
    tax_rate_percent: (product.tax_rate_basis_points / 100).toString(),
    withholding_rate_percent: product.withholding_rate_basis_points ? (product.withholding_rate_basis_points / 100).toString() : "",
  };
}
export function editorTotals(lines: InvoiceLineForm[]) {
  return lines.reduce(
    (totals, line) => {
      if (!isInvoiceLineReady(line)) return totals;
      const input = lineToInput(line);
      const discount = input.discount_rate_basis_points ?? 0;
      const base = Math.trunc((input.quantity * input.unit_price_cents * (10_000 - discount)) / 10_000);
      const tax = Math.trunc((base * input.tax_rate_basis_points) / 10_000);
      const withholding = Math.trunc((base * (input.withholding_rate_basis_points ?? 0)) / 10_000);
      return {
        taxable_base_cents: totals.taxable_base_cents + base,
        tax_cents: totals.tax_cents + tax,
        withholding_cents: totals.withholding_cents + withholding,
        total_cents: totals.total_cents + base + tax - withholding,
      };
    },
    { taxable_base_cents: 0, tax_cents: 0, withholding_cents: 0, total_cents: 0 },
  );
}
export function joinPath(dir: string, file: string) {
  const separator = dir.includes("\\") ? "\\" : "/";
  return `${dir.replace(/[\\/]+$/, "")}${separator}${file}`;
}
export function timestamp() {
  return new Date().toISOString().replace(/[-:T.]/g, "").slice(0, 14);
}
export function optionalText(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
export function optionalNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}
export function emptyInvoiceFilters() {
  return {
    company_id: null as string | null,
    customer_id: null as string | null,
    fiscal_year: null as number | null,
    series: null as string | null,
    status: null as string | null,
    kind: null as string | null,
    search: null as string | null,
  };
}
export const cards = [
  { icon: FileCheck2, title: "Facturas", text: "Borradores, emision, series y export local." },
  { icon: LockKeyhole, title: "Auditoria", text: "Registro append-only preparado para RRSIF." },
  { icon: Hash, title: "Huella", text: "Cadena de hashes estable antes de enviar payload fiscal." },
  { icon: ShieldCheck, title: "Fiscal", text: "XML VERI*FACTU borrador con XSD local, sin envio ni firma." },
];

export function listPagination(page: number) {
  return { limit: PAGE_SIZE, offset: page * PAGE_SIZE };
}
