/** Helpers puros UI: formato, factories de form, totales, filtros. */
import type {
  Company,
  CompanyForm,
  Customer,
  CustomerForm,
  Invoice,
  InvoiceFilterForm,
  InvoiceLineForm,
  InvoiceLineInput,
  VatTreatment,
  PathKey,
  Product,
  ProductForm,
} from "../types";
import { PAGE_SIZE } from "../types.ts"; // con extensión: lo importan los tests de node

/** Acorta huellas para tablas: `C02E·77B4` (la completa va en `title`). */
export function short(value?: string | null) {
  return value ? `${value.slice(0, 4)}·${value.slice(-4)}` : "—";
}

/** Compone código de serie (opcionalmente con año fiscal). */
export function resolvedSeriesCode(code: string, year: number, includeYear: boolean) {
  const normalized = code.trim().toUpperCase() || "A";
  return includeYear ? `${normalized}${year}` : normalized;
}

/** Línea de editor vacía con IVA 21% por defecto. */
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

/** Formulario empresa en blanco (país ES, serie A). */
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

/** Formulario cliente en blanco. */
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
    id_type: "",
  };
}

/** Formulario producto/servicio en blanco. */
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

/** Entidad persistida → campos editables del form. */
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

/** Cliente persistido → form editable. */
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
    id_type: value.id_type ?? "",
  };
}

/** Producto SQLite → form (céntimos/basis points → strings UI). */
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

/** `1.234,56` o `1234.56` → número; con coma, los puntos son de miles. Vacío o basura → NaN. */
export function decimal(value: string) {
  const text = String(value).trim();
  if (!text) return Number.NaN;
  return Number(text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text);
}

/** String euros UI → céntimos enteros para Rust. */
export function eurosToCents(value: string) {
  return Math.round(decimal(value) * 100);
}

/** % UI → basis points (vacío = 0; 21 → 2100). */
export function percentToBasisPoints(value: string) {
  if (value.trim() === "") return 0;
  return Math.round(decimal(value) * 100);
}

/** N3: calificaciones del editor, en el orden de las listas L9/L10. */
export const VAT_TREATMENTS: VatTreatment[] = ["S1", "S2", "E1", "E2", "E3", "E4", "E5", "E6", "N1", "N2"];

/** Solo S1 repercute IVA y recargo; el resto va a 0 % (Rust lo exige). */
export function chargesVat(line: Pick<InvoiceLineForm, "vat_treatment">) {
  return (line.vat_treatment ?? "S1") === "S1";
}

/** `n / d` al céntimo más próximo; la mitad se aleja de cero, igual que `round_div` en Rust. */
export function roundDiv(n: number, d: number) {
  const q = Math.trunc(n / d);
  const r = n - q * d;
  return 2 * Math.abs(r) >= d ? q + Math.sign(n) : q;
}

/** Valida línea lista para draft/issue (qty entera > 0, importes finitos). */
export function isInvoiceLineReady(line: InvoiceLineForm) {
  const quantity = decimal(line.quantity);
  const unitPrice = decimal(line.unit_price_euros);
  const discount = percentToBasisPoints(line.discount_rate_percent);
  const tax = percentToBasisPoints(line.tax_rate_percent);
  const withholding = percentToBasisPoints(line.withholding_rate_percent);
  const surcharge = percentToBasisPoints(line.surcharge_rate_percent ?? "");
  return (
    line.description.trim().length > 0 &&
    Number.isFinite(surcharge) &&
    surcharge >= 0 &&
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

/** Línea UI → payload `InvoiceLineInput` del comando draft/issue. */
export function lineToInput(line: InvoiceLineForm): InvoiceLineInput {
  const discount = percentToBasisPoints(line.discount_rate_percent);
  const withholding = percentToBasisPoints(line.withholding_rate_percent);
  const surcharge = percentToBasisPoints(line.surcharge_rate_percent ?? "");
  const vat = chargesVat(line);
  return {
    description: line.description.trim(),
    quantity: decimal(line.quantity),
    unit_price_cents: eurosToCents(line.unit_price_euros),
    discount_rate_basis_points: discount > 0 ? discount : null,
    tax_rate_basis_points: vat ? percentToBasisPoints(line.tax_rate_percent) : 0,
    withholding_rate_basis_points: withholding > 0 ? withholding : null,
    // Se reenvía la marca de Rust; omitida, Rust conserva la de esa posición (contrato R2).
    ...(line.price_pending ? { price_pending: true } : {}),
    // S1 sin recargo no añade campos: el payload de las facturas normales no cambia.
    ...(vat ? {} : { vat_treatment: line.vat_treatment }),
    ...(vat && surcharge > 0 ? { surcharge_rate_basis_points: surcharge } : {}),
  };
}

/** D8: líneas marcadas «pendiente de precio» que siguen a 0 € (bloquean la emisión, `price_pending_lines:<n>`). */
export function pendingPriceLines(lines: InvoiceLineForm[]): number {
  return lines.filter((line) => line.price_pending && !(eurosToCents(line.unit_price_euros) > 0)).length;
}

/** “Usar en línea”: rellena la primera línea editable desde el catálogo. */
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

/** Líneas de Rust (céntimos y puntos básicos) → formulario del editor. */
export function invoiceToLines(invoice: Pick<Invoice, "lines">): InvoiceLineForm[] {
  const lines = invoice.lines ?? [];
  if (lines.length === 0) return [newInvoiceLine()];
  const percent = (bp?: number | null) => (bp ? String(bp / 100).replace(".", ",") : "");
  return lines.map((line, index) => ({
    id: `line-${index}-${line.id ?? Date.now()}`,
    description: line.description,
    quantity: String(line.quantity),
    unit_price_euros: String(line.unit_price_cents / 100).replace(".", ","),
    discount_rate_percent: percent(line.discount_rate_basis_points) || "0",
    tax_rate_percent: percent(line.tax_rate_basis_points) || "0",
    withholding_rate_percent: percent(line.withholding_rate_basis_points),
    ...(line.price_pending ? { price_pending: true } : {}),
    ...(line.vat_treatment && line.vat_treatment !== "S1" ? { vat_treatment: line.vat_treatment } : {}),
    ...(line.surcharge_rate_basis_points ? { surcharge_rate_percent: percent(line.surcharge_rate_basis_points) } : {}),
  }));
}

/**
 * Totales preview en cliente con el mismo cálculo que Rust (`build_lines`): base por línea al
 * céntimo; IVA y recargo sobre la base agregada de cada grupo (calificación, tipo y recargo).
 * `tax_cents` es solo IVA; `surcharge_cents`, el recargo; `total_cents` incluye ambos.
 */
export function editorTotals(lines: InvoiceLineForm[]) {
  const groups = new Map<string, { base: number; tax: number; surcharge: number }>();
  let base = 0;
  let withholding = 0;
  for (const line of lines) {
    if (!isInvoiceLineReady(line)) continue;
    const input = lineToInput(line);
    const discount = input.discount_rate_basis_points ?? 0;
    const lineBase = roundDiv(input.quantity * input.unit_price_cents * (10_000 - discount), 10_000);
    base += lineBase;
    withholding += roundDiv(lineBase * (input.withholding_rate_basis_points ?? 0), 10_000);
    const tax = input.tax_rate_basis_points;
    const surcharge = input.surcharge_rate_basis_points ?? 0;
    const key = `${input.vat_treatment ?? "S1"}|${tax}|${surcharge}`;
    const group = groups.get(key) ?? { base: 0, tax, surcharge };
    group.base += lineBase;
    groups.set(key, group);
  }
  let taxCents = 0;
  let surchargeCents = 0;
  for (const group of groups.values()) {
    taxCents += roundDiv(group.base * group.tax, 10_000);
    surchargeCents += roundDiv(group.base * group.surcharge, 10_000);
  }
  return {
    taxable_base_cents: base,
    tax_cents: taxCents,
    surcharge_cents: surchargeCents,
    withholding_cents: withholding,
    total_cents: base + taxCents + surchargeCents - withholding,
  };
}

/** Une dir+file asumiendo separador Windows o Unix según `dir`. */
function joinPath(dir: string, file: string) {
  const separator = dir.includes("\\") ? "\\" : "/";
  return `${dir.replace(/[\\/]+$/, "")}${separator}${file}`;
}

/** Stamp compacto para nombres de export. */
function timestamp() {
  return new Date().toISOString().replace(/[-:T.]/g, "").slice(0, 14);
}

function optionalText(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function optionalNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Formulario de filtros vacío. */
export function emptyFilterForm(): InvoiceFilterForm {
  return { search: "", company_id: "", customer_id: "", fiscal_year: "", series: "", status: "", kind: "" };
}

/** Filtros de `invoice_list`: campo vacío = sin restringir (`null`). */
export function filtersToInput(form: InvoiceFilterForm) {
  return {
    company_id: optionalText(form.company_id),
    customer_id: optionalText(form.customer_id),
    fiscal_year: optionalNumber(form.fiscal_year),
    series: optionalText(form.series.toUpperCase()),
    status: optionalText(form.status),
    kind: optionalText(form.kind),
    search: optionalText(form.search),
  };
}

/** Rutas por defecto de cada exportación dentro de `dir`, con marca de tiempo. */
export function exportPaths(dir: string): Record<PathKey, string> {
  const stamp = timestamp();
  const file = (name: string) => joinPath(dir, `cumplefactura-${name}-${stamp}`);
  return {
    backup: file("backup") + ".sqlite3",
    restore: "",
    pdf: file("factura") + ".pdf",
    xml: file("verifactu") + ".xml",
    cancelXml: file("verifactu-anulacion") + ".xml",
    json: file("factura") + ".json",
    csv: file("facturas") + ".csv",
    audit: file("auditoria") + ".json",
  };
}

/** Contrato ListPagination Rust: limit fijo PAGE_SIZE + offset. */
export function listPagination(page: number) {
  return { limit: PAGE_SIZE, offset: page * PAGE_SIZE };
}
