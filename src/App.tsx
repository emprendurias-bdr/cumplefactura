import { invoke } from "@tauri-apps/api/core";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import {
  Archive,
  BookOpenCheck,
  Banknote,
  ClipboardList,
  Building2,
  FileCheck2,
  FileCode2,
  FileDown,
  FilePlus2,
  FileText,
  FolderOpen,
  Hash,
  Home,
  Inbox,
  Mail,
  QrCode,
  Repeat,
  ListOrdered,
  LockKeyhole,
  Network,
  Package,
  Plug,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
  Users,
  type LucideIcon,
} from "lucide-react";
import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { QuotesView } from "./features/QuotesView";
import { ReceivablesView } from "./features/ReceivablesView";
import { RecurringView } from "./features/RecurringView";
import { EmailSettingsView, QrSettingsView } from "./features/SettingsViews";

type Company = {
  id: string;
  legal_name: string;
  tax_id: string;
  address: string;
  postal_code: string;
  municipality: string;
  province: string;
  country_code: string;
  default_series: string;
  created_at?: string;
};
type InvoiceSeriesConfig = {
  id: string;
  company_id: string;
  label: string;
  series_code: string;
  fiscal_year: number;
  include_year: boolean;
  separator: string;
  padding: number;
  next_number: number;
  is_default: boolean;
  active: boolean;
  resolved_series: string;
  preview: string;
  created_at: string;
};
type Customer = {
  id: string;
  display_name: string;
  tax_id: string;
  kind: string;
  address: string;
  postal_code: string;
  municipality: string;
  province: string;
  country_code: string;
  email?: string | null;
  updated_at?: string;
};
type Product = {
  id: string;
  company_id: string;
  sku: string;
  name: string;
  description: string;
  kind: string;
  unit_price_cents: number;
  tax_rate_basis_points: number;
  withholding_rate_basis_points?: number | null;
  discount_rate_basis_points?: number | null;
  active: boolean;
  updated_at: string;
};
type Invoice = { id: string; series: string; number?: number | null; totals: { total_cents: number } };
type IssuedInvoice = { invoice: Invoice; fiscal_hash: string; audit_hash: string };
type InvoiceSummary = {
  id: string;
  company_id: string;
  customer_id: string;
  series: string;
  number?: number | null;
  kind: string;
  status: string;
  rectifies_invoice_id?: string | null;
  rectification_reason_code?: string | null;
  rectification_method?: string | null;
  total_cents: number;
  fiscal_hash?: string | null;
};
type AuditSummary = { id: string; action: string; actor: string; hash: string; occurred_at: string };
type FiscalRecordSummary = {
  id: string;
  invoice_id: string;
  record_type: string;
  generated_at: string;
  fiscal_hash: string;
  previous_fiscal_hash?: string | null;
  xml_path?: string | null;
  status: string;
};
type FiscalChainIssue = {
  record_id: string;
  invoice_id: string;
  severity: string;
  code: string;
  message: string;
};
type FiscalCompanyChainHead = {
  company_id: string;
  last_hash: string;
};
type FiscalChainVerification = {
  valid: boolean;
  total_records: number;
  issue_count: number;
  last_hash_by_company: FiscalCompanyChainHead[];
  issues: FiscalChainIssue[];
};
type RectificationAdvice = {
  reason_code: string;
  method: string;
  confidence: string;
  source_refs: string[];
  notes: string[];
  warnings: string[];
};
type BackupResult = { target_path: string; status: string; notes: string[] };
type BackupRestoreResult = { source_path: string; status: string; destructive_restore_performed: boolean; notes: string[] };
type ExportResult = { target_path: string; status: string; notes: string[] };
type AppDefaults = {
  app_data_dir: string;
  export_dir: string;
  default_backup_path: string;
  default_pdf_path: string;
  default_verifactu_xml_path: string;
  default_cancel_xml_path: string;
  default_signed_xml_path: string;
  default_json_export_path: string;
  default_csv_export_path: string;
  default_audit_export_path: string;
  notes: string[];
};
type AppSettings = {
  export_dir?: string | null;
  default_territory_flags: string[];
  onboarding_completed: boolean;
  updated_at: string;
  qr_environment?: "test" | "production";
};
type NextNumberPreview = {
  company_id: string;
  fiscal_year: number;
  series: string;
  next_number: number;
  source: string;
};
type InvoiceLineForm = {
  id: string;
  description: string;
  quantity: string;
  unit_price_euros: string;
  discount_rate_percent: string;
  tax_rate_percent: string;
  withholding_rate_percent: string;
};
type InvoiceLineInput = {
  description: string;
  quantity: number;
  unit_price_cents: number;
  discount_rate_basis_points: number | null;
  tax_rate_basis_points: number;
  withholding_rate_basis_points: number | null;
};
type CompanyForm = Omit<Company, "id" | "created_at">;
type CustomerForm = Omit<Customer, "id" | "updated_at">;
type ProductForm = {
  sku: string;
  name: string;
  description: string;
  kind: string;
  unit_price_euros: string;
  tax_rate_percent: string;
  withholding_rate_percent: string;
  discount_rate_percent: string;
  active: boolean;
};
type VerifactuXmlResult = { target_path: string; status: string; xsd_validated: boolean; notes: string[] };
type SubmissionPreparation = {
  invoice_id: string;
  export_id: string;
  xml_path: string;
  xml_sha256: string;
  xml_bytes: number;
  signature_status: string;
  transmission_status: string;
};
type AeatTransportPreflight = {
  ready: boolean;
  status: string;
  endpoint_name: string;
  endpoint_url: string;
  xml_sha256: string;
  xml_bytes: number;
  external_call_performed: boolean;
  blockers: string[];
  warnings: string[];
};
type XadesSidecarPreflight = {
  ready: boolean;
  status: string;
  sidecar_url: string;
  sidecar_endpoint: string;
  xml_sha256: string;
  xml_bytes: number;
  certificate_ref_status: string;
  current_signature_status: string;
  signature_status_after_success: string;
  external_call_performed: boolean;
  blockers: string[];
  warnings: string[];
};
type XadesSidecarSignature = SubmissionPreparation & {
  source_export_id: string;
  source_xml_path: string;
  source_xml_sha256: string;
  xsd_validated_before_signature: boolean;
  signature_mode: string;
  certificate_source?: string | null;
  sidecar_url: string;
  sidecar_call_performed: boolean;
  external_call_performed: boolean;
  notes: string[];
  warnings: string[];
};
type VerifactuSubmitSidecarPreflight = {
  ready: boolean;
  status: string;
  sidecar_url: string;
  sidecar_endpoint: string;
  endpoint_name: string;
  xml_sha256: string;
  xml_bytes: number;
  certificate_ref_status: string;
  current_signature_status: string;
  wsdl_name?: string | null;
  wsdl_sha256?: string | null;
  operation_available: boolean;
  endpoint_allowed: boolean;
  transport_enabled: boolean;
  soap_calls_enabled: boolean;
  certificate_loaded: boolean;
  certificate_source?: string | null;
  certificate_days_remaining?: number | null;
  sidecar_call_performed: boolean;
  external_call_performed: boolean;
  blockers: string[];
  warnings: string[];
};
type VerifactuSubmitSidecarInvocation = SubmissionPreparation & {
  source_export_id: string;
  sidecar_url: string;
  sidecar_endpoint: string;
  endpoint_name: string;
  wsdl_name: string;
  operation: string;
  status: string;
  csv?: string | null;
  estado_registro?: string | null;
  codigo_error?: string | null;
  descripcion_error?: string | null;
  transport_mode: string;
  certificate_source: string;
  sidecar_call_performed: boolean;
  external_call_performed: boolean;
  notes: string[];
  warnings: string[];
};
type ImportedSidecarChannel = {
  channel: string;
  status: string;
  source: string;
  blockers: string[];
  mvp_importable: boolean;
  acceptance_status?: string | null;
  acceptance_validation_status?: string | null;
  acceptance_manifest?: string | null;
  deferred_reason?: string | null;
  notes: string[];
};
type ImportedSidecarCapabilities = {
  source_project: string;
  source_readiness_status: string;
  source_gate_status: string;
  source_generated_at?: string | null;
  channels: ImportedSidecarChannel[];
  mvp_channels: string[];
  deferred_channels: string[];
  external_call_performed_by_importer: boolean;
  notes: string[];
};
type SiiSidecarPreflight = {
  ready: boolean;
  status: string;
  sidecar_url: string;
  sidecar_endpoint: string;
  book: string;
  endpoint_name: string;
  wsdl_name?: string | null;
  transport_enabled: boolean;
  soap_calls_enabled: boolean;
  certificate_loaded: boolean;
  sidecar_call_performed: boolean;
  external_call_performed: boolean;
  blockers: string[];
  warnings: string[];
};
type TicketBaiSidecarPreflight = {
  ready: boolean;
  status: string;
  sidecar_url: string;
  sidecar_endpoint: string;
  territorio: string;
  endpoint: string;
  xsd_name?: string | null;
  xsd_available: boolean;
  endpoint_allowed: boolean;
  submission_enabled: boolean;
  certificate_loaded: boolean;
  sidecar_call_performed: boolean;
  external_call_performed: boolean;
  blockers: string[];
  warnings: string[];
};

const cards = [
  { icon: FileCheck2, title: "Facturas", text: "Borradores, emision, series y export local." },
  { icon: LockKeyhole, title: "Auditoria", text: "Registro append-only preparado para RRSIF." },
  { icon: Hash, title: "Huella", text: "Cadena de hashes estable antes de enviar payload fiscal." },
  { icon: ShieldCheck, title: "Fiscal", text: "XML VERI*FACTU borrador con XSD local, sin envio ni firma." },
];

const PAGE_SIZE = 5;

type ViewId =
  | "panel"
  | "nueva"
  | "emitidas"
  | "cobros"
  | "recurrentes"
  | "presupuestos"
  | "recibidas"
  | "exportar"
  | "clientes"
  | "empresas"
  | "catalogo"
  | "auditoria"
  | "verifactu"
  | "sidecar"
  | "emisor"
  | "series"
  | "qr"
  | "email"
  | "copias";

type NavView = { id: ViewId; label: string; icon: LucideIcon; soon?: boolean };
type NavArea = { id: string; label: string; icon: LucideIcon; views: NavView[] };

// Misma arquitectura de navegacion que ContaPro: areas en la barra superior y vistas en la sub-sidebar.
const NAV_AREAS: NavArea[] = [
  { id: "inicio", label: "Inicio", icon: Home, views: [{ id: "panel", label: "Panel", icon: Home }] },
  {
    id: "facturas",
    label: "Facturas",
    icon: FileText,
    views: [
      { id: "nueva", label: "Nueva factura", icon: FilePlus2 },
      { id: "emitidas", label: "Emitidas", icon: FileCheck2 },
      { id: "cobros", label: "Cobros", icon: Banknote },
      { id: "recurrentes", label: "Recurrentes", icon: Repeat },
      { id: "presupuestos", label: "Presupuestos", icon: ClipboardList },
      { id: "recibidas", label: "Recibidas", icon: Inbox, soon: true },
      { id: "exportar", label: "Exportar", icon: FileDown },
    ],
  },
  {
    id: "contactos",
    label: "Contactos",
    icon: Users,
    views: [
      { id: "clientes", label: "Clientes", icon: Users },
      { id: "empresas", label: "Red de empresas", icon: Network, soon: true },
      { id: "catalogo", label: "Catalogo", icon: Package },
    ],
  },
  {
    id: "fiscal",
    label: "Fiscal",
    icon: ShieldCheck,
    views: [
      { id: "auditoria", label: "Auditoria", icon: BookOpenCheck },
      { id: "verifactu", label: "VERI*FACTU", icon: FileCode2 },
      { id: "sidecar", label: "Canales sidecar", icon: Plug },
    ],
  },
  {
    id: "ajustes",
    label: "Ajustes",
    icon: Settings,
    views: [
      { id: "emisor", label: "Empresa emisora", icon: Building2 },
      { id: "series", label: "Series", icon: ListOrdered },
      { id: "qr", label: "QR tributario", icon: QrCode },
      { id: "email", label: "Email", icon: Mail },
      { id: "copias", label: "Copias de seguridad", icon: Archive },
    ],
  },
];

const PAGE_HEADS: Record<ViewId, { title: string; subtitle: string }> = {
  panel: { title: "Facturacion local-first", subtitle: "" },
  nueva: { title: "Nueva factura", subtitle: "Lineas, borrador, emision y rectificativas con numeracion por serie." },
  emitidas: { title: "Facturas emitidas", subtitle: "Busca por texto, empresa, cliente, año, serie, estado o tipo." },
  cobros: { title: "Cobros y vencimientos", subtitle: "Que esta pendiente, que ha vencido y quien te debe; registra cobros y envia recordatorios." },
  recurrentes: { title: "Facturas recurrentes", subtitle: "Cuotas, alquileres y mantenimientos que se preparan solos cada periodo." },
  presupuestos: { title: "Presupuestos", subtitle: "Ofertas a clientes que pasan a factura con un clic al aceptarse." },
  recibidas: { title: "Facturas recibidas", subtitle: "Facturas que otras empresas de la red te emiten, registradas automaticamente." },
  exportar: { title: "Exportar facturas", subtitle: "PDF, JSON y CSV generados en local." },
  clientes: { title: "Clientes", subtitle: "Empresas, personas fisicas y administraciones a las que facturas." },
  empresas: { title: "Red de empresas", subtitle: "Busca empresas que usan CumpleFactura y conectalas para intercambiar facturas." },
  catalogo: { title: "Catalogo", subtitle: "Productos y servicios reutilizables en las lineas de factura." },
  auditoria: { title: "Auditoria", subtitle: "Cadena de hashes, registros fiscales y eventos append-only." },
  verifactu: { title: "VERI*FACTU", subtitle: "XML de alta y anulacion, firma XAdES y envio a traves del sidecar." },
  sidecar: { title: "Canales sidecar", subtitle: "SII y TicketBAI a traves del sidecar fiscal de ContaPro." },
  emisor: { title: "Empresa emisora", subtitle: "Datos fiscales de las empresas que emiten facturas." },
  series: { title: "Series", subtitle: "Numeracion por serie y ejercicio." },
  qr: { title: "QR tributario", subtitle: "Codigo QR de cotejo VERI*FACTU impreso en cada factura emitida." },
  email: { title: "Email", subtitle: "Servidor de correo propio para enviar facturas y recordatorios." },
  copias: { title: "Copias de seguridad", subtitle: "Backup y restauracion de la base SQLite local." },
};

function cents(value: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(value / 100);
}

function short(value?: string | null) {
  return value ? `${value.slice(0, 12)}...` : "-";
}

function resolvedSeriesCode(code: string, year: number, includeYear: boolean) {
  const normalized = code.trim().toUpperCase() || "A";
  return includeYear ? `${normalized}${year}` : normalized;
}

function newInvoiceLine(): InvoiceLineForm {
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

function emptyCompanyForm(): CompanyForm {
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

function emptyCustomerForm(): CustomerForm {
  return {
    display_name: "",
    tax_id: "",
    kind: "Business",
    address: "",
    postal_code: "",
    municipality: "",
    province: "",
    country_code: "ES",
    email: "",
  };
}

function emptyProductForm(): ProductForm {
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

function companyToForm(value: Company): CompanyForm {
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

function customerToForm(value: Customer): CustomerForm {
  return {
    display_name: value.display_name,
    tax_id: value.tax_id,
    kind: value.kind,
    address: value.address,
    postal_code: value.postal_code,
    municipality: value.municipality,
    province: value.province,
    country_code: value.country_code,
    email: value.email ?? "",
  };
}

function productToForm(value: Product): ProductForm {
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

function decimal(value: string) {
  return Number(String(value).replace(",", "."));
}

function eurosToCents(value: string) {
  return Math.round(decimal(value) * 100);
}

function percentToBasisPoints(value: string) {
  if (value.trim() === "") return 0;
  return Math.round(decimal(value) * 100);
}

function isInvoiceLineReady(line: InvoiceLineForm) {
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

function lineToInput(line: InvoiceLineForm): InvoiceLineInput {
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

function productToInvoiceLine(product: Product, lineId: string): InvoiceLineForm {
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

function editorTotals(lines: InvoiceLineForm[]) {
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

function joinPath(dir: string, file: string) {
  const separator = dir.includes("\\") ? "\\" : "/";
  return `${dir.replace(/[\\/]+$/, "")}${separator}${file}`;
}

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

function emptyInvoiceFilters() {
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

function listPagination(page: number) {
  return { limit: PAGE_SIZE, offset: page * PAGE_SIZE };
}

export default function App() {
  const [view, setView] = useState<ViewId>("panel");
  const [company, setCompany] = useState<Company | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [companyForm, setCompanyForm] = useState<CompanyForm>(emptyCompanyForm());
  const [customerForm, setCustomerForm] = useState<CustomerForm>(emptyCustomerForm());
  const [productForm, setProductForm] = useState<ProductForm>(emptyProductForm());
  const [draft, setDraft] = useState<Invoice | null>(null);
  const [issued, setIssued] = useState<IssuedInvoice | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([]);
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [invoiceCompanyFilter, setInvoiceCompanyFilter] = useState("");
  const [invoiceCustomerFilter, setInvoiceCustomerFilter] = useState("");
  const [invoiceYearFilter, setInvoiceYearFilter] = useState("");
  const [invoiceSeriesFilter, setInvoiceSeriesFilter] = useState("");
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState("");
  const [invoiceKindFilter, setInvoiceKindFilter] = useState("");
  const [invoicePage, setInvoicePage] = useState(0);
  const [auditPage, setAuditPage] = useState(0);
  const [fiscalPage, setFiscalPage] = useState(0);
  const [audit, setAudit] = useState<AuditSummary[]>([]);
  const [fiscalRecords, setFiscalRecords] = useState<FiscalRecordSummary[]>([]);
  const [fiscalChain, setFiscalChain] = useState<FiscalChainVerification | null>(null);
  const [status, setStatus] = useState("Listo");
  const [demoSeedEnabled, setDemoSeedEnabled] = useState(false);
  const [nextNumber, setNextNumber] = useState(1);
  const [seriesConfigs, setSeriesConfigs] = useState<InvoiceSeriesConfig[]>([]);
  const [selectedSeries, setSelectedSeries] = useState<InvoiceSeriesConfig | null>(null);
  const [seriesLabel, setSeriesLabel] = useState("General");
  const [seriesCode, setSeriesCode] = useState("A");
  const [seriesFiscalYear, setSeriesFiscalYear] = useState(new Date().getFullYear());
  const [seriesIncludeYear, setSeriesIncludeYear] = useState(false);
  const [seriesSeparator, setSeriesSeparator] = useState("-");
  const [seriesPadding, setSeriesPadding] = useState(3);
  const [seriesNextNumber, setSeriesNextNumber] = useState(1);
  const [invoiceLines, setInvoiceLines] = useState<InvoiceLineForm[]>([newInvoiceLine()]);
  const [appDefaults, setAppDefaults] = useState<AppDefaults | null>(null);
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const [exportDir, setExportDir] = useState("");
  const [defaultTerritoryFlags, setDefaultTerritoryFlags] = useState<string[]>(["CommonTerritory", "VeriFactu"]);
  const [numberPreview, setNumberPreview] = useState<NextNumberPreview | null>(null);
  const [rectificationScenario, setRectificationScenario] = useState("Other");
  const [rectificationReason, setRectificationReason] = useState("R4");
  const [rectificationMethod, setRectificationMethod] = useState("I");
  const [rectificationAdvice, setRectificationAdvice] = useState<RectificationAdvice | null>(null);
  const [backupPath, setBackupPath] = useState("");
  const [pdfPath, setPdfPath] = useState("");
  const [xmlPath, setXmlPath] = useState("");
  const [cancelXmlPath, setCancelXmlPath] = useState("");
  const [signedXmlPath, setSignedXmlPath] = useState("");
  const [jsonPath, setJsonPath] = useState("");
  const [csvPath, setCsvPath] = useState("");
  const [auditExportPath, setAuditExportPath] = useState("");
  const [restorePath, setRestorePath] = useState("");
  const [aeatEndpoint, setAeatEndpoint] = useState(
    "https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP",
  );
  const [aeatEndpointName, setAeatEndpointName] = useState("SistemaVerifactuPruebas");
  const [xadesCertRef, setXadesCertRef] = useState("vault://certs/prod");
  const [xadesSidecarUrl, setXadesSidecarUrl] = useState("http://127.0.0.1:8000/verifactu/sign-xml");
  const [submitSidecarUrl, setSubmitSidecarUrl] = useState("http://127.0.0.1:8000/verifactu/submit-preflight");
  const [invokeSidecarUrl, setInvokeSidecarUrl] = useState("http://127.0.0.1:8000/verifactu/invoke-submit");
  const [backup, setBackup] = useState<BackupResult | null>(null);
  const [restore, setRestore] = useState<BackupRestoreResult | null>(null);
  const [pdfResult, setPdfResult] = useState<string | null>(null);
  const [jsonResult, setJsonResult] = useState<ExportResult | null>(null);
  const [csvResult, setCsvResult] = useState<ExportResult | null>(null);
  const [auditExportResult, setAuditExportResult] = useState<ExportResult | null>(null);
  const [xmlResult, setXmlResult] = useState<VerifactuXmlResult | null>(null);
  const [cancelXmlResult, setCancelXmlResult] = useState<VerifactuXmlResult | null>(null);
  const [submission, setSubmission] = useState<SubmissionPreparation | null>(null);
  const [xadesPreflight, setXadesPreflight] = useState<XadesSidecarPreflight | null>(null);
  const [xadesSignature, setXadesSignature] = useState<XadesSidecarSignature | null>(null);
  const [transportPreflight, setTransportPreflight] = useState<AeatTransportPreflight | null>(null);
  const [submitPreflight, setSubmitPreflight] = useState<VerifactuSubmitSidecarPreflight | null>(null);
  const [submitInvocation, setSubmitInvocation] = useState<VerifactuSubmitSidecarInvocation | null>(null);
  const [sidecarCapabilities, setSidecarCapabilities] = useState<ImportedSidecarCapabilities | null>(null);
  const [siiBook, setSiiBook] = useState("issued");
  const [siiEndpointName, setSiiEndpointName] = useState("SuministroFactEmitidasPruebas");
  const [siiSidecarUrl, setSiiSidecarUrl] = useState("http://127.0.0.1:8000/sii/submit-preflight");
  const [siiPreflight, setSiiPreflight] = useState<SiiSidecarPreflight | null>(null);
  const [ticketbaiTerritorio, setTicketbaiTerritorio] = useState("bizkaia");
  const [ticketbaiEndpoint, setTicketbaiEndpoint] = useState("https://batuz.eus/TicketBai/submit");
  const [ticketbaiSidecarUrl, setTicketbaiSidecarUrl] = useState("http://127.0.0.1:8000/ticketbai/submit-preflight");
  const [ticketbaiPreflight, setTicketbaiPreflight] = useState<TicketBaiSidecarPreflight | null>(null);
  const invoiceLinesReady = invoiceLines.length > 0 && invoiceLines.every(isInvoiceLineReady);
  const invoiceTotals = useMemo(() => editorTotals(invoiceLines), [invoiceLines]);
  const canDraft = Boolean(company && customer && invoiceLinesReady);
  const canIssue = Boolean(draft && invoiceLinesReady);
  const issuedInvoiceId = issued?.invoice.id ?? invoices.find((item) => item.status === "Issued")?.id;
  const rectifiableInvoice = invoices.find((item) => item.status === "Issued" && item.kind !== "Rectifying");
  const canExportXml = Boolean(issuedInvoiceId);
  const canRectify = Boolean(rectifiableInvoice);
  const fiscalYear = seriesFiscalYear || new Date().getFullYear();
  const activeSeries = selectedSeries?.resolved_series ?? company?.default_series ?? "A";
  const activeSeriesPreview = selectedSeries?.preview ?? `${activeSeries}-${String(nextNumber).padStart(3, "0")}`;
  const onboardingSteps = [
    { label: "Empresa", ok: Boolean(company) },
    { label: "Fiscalidad", ok: defaultTerritoryFlags.length > 0 },
    { label: "Serie", ok: Boolean(selectedSeries) },
    { label: "Export", ok: Boolean(exportDir.trim()) },
  ];
  const onboardingReady = onboardingSteps.every((step) => step.ok);
  const siiChannel = sidecarCapabilities?.channels.find((channel) => channel.channel === "sii");
  const ticketbaiChannel = sidecarCapabilities?.channels.find((channel) => channel.channel === "ticketbai");
  const mvpSidecarChannels = useMemo(
    () => sidecarCapabilities?.mvp_channels.map((channel) => channel.toUpperCase()).join(", ") || "pendiente",
    [sidecarCapabilities],
  );
  const deferredSidecarChannels = useMemo(
    () => sidecarCapabilities?.deferred_channels.map((channel) => channel.toUpperCase()).join(", ") || "pendiente",
    [sidecarCapabilities],
  );

  const flowState = useMemo(() => {
    if (issued) return "Factura emitida";
    if (draft) return "Borrador persistido";
    if (company && customer) return "Emisor y cliente creados";
    if (company) return "Emisor creado";
    return "Inicio";
  }, [company, customer, draft, issued]);

  useEffect(() => {
    void loadDefaults();
  }, []);

  // Al abrir la app se preparan los borradores de las facturas recurrentes vencidas (nunca se emiten solas).
  useEffect(() => {
    void (async () => {
      try {
        const runs = await invoke<{ label: string }[]>("recurring_generate_due");
        if (runs.length > 0) {
          setStatus(`${runs.length} borrador(es) recurrente(s) generado(s): ${runs.map((item) => item.label).join(", ")}`);
          await refreshData();
        }
      } catch {
        // Sin base inicializada todavia: se reintenta al abrir Facturas > Recurrentes.
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (company) {
      void loadSeries(company);
      void loadProducts(company.id);
    } else {
      setProducts([]);
    }
  }, [company]);

  async function run<T>(label: string, action: () => Promise<T>) {
    setStatus(`${label}...`);
    try {
      const result = await action();
      setStatus(`${label}: OK`);
      return result;
    } catch (error) {
      setStatus(`${label}: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  function updateCompanyForm(field: keyof CompanyForm, value: string) {
    setCompanyForm((current) => ({ ...current, [field]: value }));
  }

  function updateCustomerForm(field: keyof CustomerForm, value: string) {
    setCustomerForm((current) => ({ ...current, [field]: value }));
  }

  function updateProductForm<K extends keyof ProductForm>(field: K, value: ProductForm[K]) {
    setProductForm((current) => ({ ...current, [field]: value }));
  }

  function applyExportDirPaths(dir: string) {
    if (!dir.trim()) return;
    const stamp = timestamp();
    setBackupPath(joinPath(dir, `cumplefactura-backup-${stamp}.sqlite3`));
    setPdfPath(joinPath(dir, `cumplefactura-factura-${stamp}.pdf`));
    setXmlPath(joinPath(dir, `cumplefactura-verifactu-${stamp}.xml`));
    setCancelXmlPath(joinPath(dir, `cumplefactura-verifactu-anulacion-${stamp}.xml`));
    setSignedXmlPath(joinPath(dir, `cumplefactura-verifactu-firmado-${stamp}.xml`));
    setJsonPath(joinPath(dir, `cumplefactura-factura-${stamp}.json`));
    setCsvPath(joinPath(dir, `cumplefactura-facturas-${stamp}.csv`));
    setAuditExportPath(joinPath(dir, `cumplefactura-auditoria-${stamp}.json`));
  }

  async function pickExportDirectory() {
    const selected = await openDialog({
      title: "Elegir carpeta export",
      directory: true,
      multiple: false,
      defaultPath: exportDir || appDefaults?.export_dir,
    });
    if (typeof selected !== "string") return;
    setExportDir(selected);
    applyExportDirPaths(selected);
  }

  async function pickSavePath(
    title: string,
    currentPath: string,
    extensions: string[],
    setter: (value: string) => void,
  ) {
    const selected = await saveDialog({
      title,
      defaultPath: currentPath || exportDir || appDefaults?.export_dir,
      filters: [{ name: title, extensions }],
      canCreateDirectories: true,
    });
    if (typeof selected === "string") setter(selected);
  }

  async function pickRestoreFile() {
    const selected = await openDialog({
      title: "Elegir restore",
      defaultPath: restorePath || exportDir || appDefaults?.export_dir,
      multiple: false,
      directory: false,
      filters: [{ name: "SQLite backup", extensions: ["sqlite", "sqlite3", "db"] }],
    });
    if (typeof selected === "string") setRestorePath(selected);
  }

  function toggleTerritoryFlag(flag: string, checked: boolean) {
    setDefaultTerritoryFlags((current) => {
      const next = checked ? [...new Set([...current, flag])] : current.filter((item) => item !== flag);
      return next.length > 0 ? next : current;
    });
  }

  function invoiceFiltersInput() {
    return {
      company_id: optionalText(invoiceCompanyFilter),
      customer_id: optionalText(invoiceCustomerFilter),
      fiscal_year: optionalNumber(invoiceYearFilter),
      series: optionalText(invoiceSeriesFilter.toUpperCase()),
      status: optionalText(invoiceStatusFilter),
      kind: optionalText(invoiceKindFilter),
      search: optionalText(invoiceSearch),
    };
  }

  function newCompanyForm() {
    setCompany(null);
    setCompanyForm(emptyCompanyForm());
    setDraft(null);
    setIssued(null);
  }

  function newCustomerForm() {
    setCustomer(null);
    setCustomerForm(emptyCustomerForm());
    setDraft(null);
    setIssued(null);
  }

  function newProductForm() {
    setProduct(null);
    setProductForm(emptyProductForm());
  }

  function fillDemoData() {
    const stamp = String(Date.now() % 100_000_000).padStart(8, "0");
    setDemoSeedEnabled(true);
    setCompanyForm({
      legal_name: "Demo CumpleFactura SL",
      tax_id: `B${stamp}`,
      address: "Calle Fiscal 1",
      postal_code: "28001",
      municipality: "Madrid",
      province: "Madrid",
      country_code: "ES",
      default_series: resolvedSeriesCode(seriesCode, fiscalYear, seriesIncludeYear),
    });
    setCustomerForm({
      display_name: "Cliente Demo",
      tax_id: `${stamp}T`,
      kind: "Business",
      address: "Calle Cliente 2",
      postal_code: "28002",
      municipality: "Madrid",
      province: "Madrid",
      country_code: "ES",
    });
    setProductForm({
      sku: "SVC-DEMO",
      name: "Servicio mensual",
      description: "Servicio mensual de mantenimiento",
      kind: "Service",
      unit_price_euros: "250",
      tax_rate_percent: "21",
      withholding_rate_percent: "15",
      discount_rate_percent: "10",
      active: true,
    });
  }

  function selectCompany(companyId: string) {
    const selected = companies.find((item) => item.id === companyId) ?? null;
    if (!selected) return;
    setCompany(selected);
    setCompanyForm(companyToForm(selected));
    setDraft(null);
    setIssued(null);
    void loadSeries(selected);
    void loadProducts(selected.id);
  }

  function selectCustomer(customerId: string) {
    const selected = customers.find((item) => item.id === customerId) ?? null;
    if (!selected) return;
    setCustomer(selected);
    setCustomerForm(customerToForm(selected));
    setDraft(null);
    setIssued(null);
  }

  function selectProduct(productId: string) {
    const selected = products.find((item) => item.id === productId) ?? null;
    if (!selected) return;
    setProduct(selected);
    setProductForm(productToForm(selected));
  }

  function markInvoiceEditorDirty() {
    setDraft(null);
    setIssued(null);
  }

  function useProductInFirstLine(item: Product) {
    markInvoiceEditorDirty();
    setInvoiceLines((current) => {
      const firstId = current[0]?.id ?? newInvoiceLine().id;
      const nextLine = productToInvoiceLine(item, firstId);
      return current.length === 0 ? [nextLine] : [nextLine, ...current.slice(1)];
    });
  }

  function updateInvoiceLine(id: string, field: keyof InvoiceLineForm, value: string) {
    markInvoiceEditorDirty();
    setInvoiceLines((current) => current.map((line) => (line.id === id ? { ...line, [field]: value } : line)));
  }

  function addInvoiceLine() {
    markInvoiceEditorDirty();
    setInvoiceLines((current) => [...current, newInvoiceLine()]);
  }

  function removeInvoiceLine(id: string) {
    markInvoiceEditorDirty();
    setInvoiceLines((current) => (current.length === 1 ? current : current.filter((line) => line.id !== id)));
  }

  function currentInvoiceLineInputs() {
    if (!invoiceLinesReady) {
      setStatus("Factura: completa descripcion, cantidad, precio, descuento, IVA e IRPF");
      return null;
    }
    return invoiceLines.map(lineToInput);
  }

  async function selectInvoiceSeries(seriesId: string) {
    const series = seriesConfigs.find((item) => item.id === seriesId) ?? null;
    if (!series || !company) return;
    markInvoiceEditorDirty();
    setSelectedSeries(series);
    setSeriesFiscalYear(series.fiscal_year);
    await previewNextNumber(company, series.resolved_series, series.fiscal_year);
  }

  async function refreshData(
    filters = invoiceFiltersInput(),
    pages = { invoice: invoicePage, audit: auditPage, fiscal: fiscalPage },
  ) {
    const [companyRows, customerRows, invoiceRows, auditRows, fiscalRows, chainResult] = await run("Refrescar", () =>
      Promise.all([
        invoke<Company[]>("company_list"),
        invoke<Customer[]>("customer_list"),
        invoke<InvoiceSummary[]>("invoice_list", { filters, pagination: listPagination(pages.invoice) }),
        invoke<AuditSummary[]>("audit_list", { pagination: listPagination(pages.audit) }),
        invoke<FiscalRecordSummary[]>("fiscal_record_list", { pagination: listPagination(pages.fiscal) }),
        invoke<FiscalChainVerification>("fiscal_chain_verify"),
      ]),
    );
    setCompanies(companyRows);
    setCustomers(customerRows);
    setInvoices(invoiceRows);
    setAudit(auditRows);
    setFiscalRecords(fiscalRows);
    setFiscalChain(chainResult);
    const selectedCompany = companyRows.find((item) => item.id === company?.id) ?? companyRows[0] ?? null;
    const selectedCustomer = customerRows.find((item) => item.id === customer?.id) ?? customerRows[0] ?? null;
    setCompany(selectedCompany);
    setCustomer(selectedCustomer);
    if (selectedCompany) setCompanyForm(companyToForm(selectedCompany));
    if (selectedCustomer) setCustomerForm(customerToForm(selectedCustomer));
    if (selectedCompany) {
      await loadSeries(selectedCompany);
      await loadProducts(selectedCompany.id);
    }
  }

  async function searchInvoices(event: FormEvent) {
    event.preventDefault();
    setInvoicePage(0);
    await refreshData(invoiceFiltersInput(), { invoice: 0, audit: auditPage, fiscal: fiscalPage });
  }

  function clearInvoiceFilters() {
    setInvoiceSearch("");
    setInvoiceCompanyFilter("");
    setInvoiceCustomerFilter("");
    setInvoiceYearFilter("");
    setInvoiceSeriesFilter("");
    setInvoiceStatusFilter("");
    setInvoiceKindFilter("");
    setInvoicePage(0);
    void refreshData(emptyInvoiceFilters(), { invoice: 0, audit: auditPage, fiscal: fiscalPage });
  }

  async function changeInvoicePage(nextPage: number) {
    const page = Math.max(0, nextPage);
    setInvoicePage(page);
    await refreshData(invoiceFiltersInput(), { invoice: page, audit: auditPage, fiscal: fiscalPage });
  }

  async function changeAuditPage(nextPage: number) {
    const page = Math.max(0, nextPage);
    setAuditPage(page);
    await refreshData(invoiceFiltersInput(), { invoice: invoicePage, audit: page, fiscal: fiscalPage });
  }

  async function changeFiscalPage(nextPage: number) {
    const page = Math.max(0, nextPage);
    setFiscalPage(page);
    await refreshData(invoiceFiltersInput(), { invoice: invoicePage, audit: auditPage, fiscal: page });
  }

  async function verifyFiscalChain() {
    const result = await run("Verificar cadena fiscal", () =>
      invoke<FiscalChainVerification>("fiscal_chain_verify"),
    );
    setFiscalChain(result);
  }

  async function loadProducts(companyId: string) {
    const rows = await invoke<Product[]>("product_list", { companyId });
    setProducts(rows);
    const preferred = rows.find((item) => item.id === product?.id) ?? rows[0] ?? null;
    setProduct(preferred);
    if (preferred) {
      setProductForm(productToForm(preferred));
    }
  }

  async function loadSeries(targetCompany: Company) {
    const rows = await invoke<InvoiceSeriesConfig[]>("company_series_list", {
      companyId: targetCompany.id,
      fiscalYear,
    });
    setSeriesConfigs(rows);
    const preferred = rows.find((item) => item.is_default) ?? rows[0] ?? null;
    setSelectedSeries(preferred);
    if (preferred) {
      setSeriesLabel(preferred.label);
      setSeriesCode(preferred.series_code);
      setSeriesFiscalYear(preferred.fiscal_year);
      setSeriesIncludeYear(preferred.include_year);
      setSeriesSeparator(preferred.separator);
      setSeriesPadding(preferred.padding);
      setSeriesNextNumber(preferred.next_number);
      await previewNextNumber(targetCompany, preferred.resolved_series, preferred.fiscal_year);
    } else {
      await previewNextNumber(targetCompany, targetCompany.default_series, fiscalYear);
    }
  }

  async function configureSeries(event: FormEvent) {
    event.preventDefault();
    if (!company) return;
    const config = await run("Guardar serie", () =>
      invoke<InvoiceSeriesConfig>("company_series_configure", {
        input: {
          company_id: company.id,
          label: seriesLabel,
          series_code: seriesCode,
          fiscal_year: fiscalYear,
          include_year: seriesIncludeYear,
          separator: seriesSeparator,
          padding: seriesPadding,
          next_number: seriesNextNumber,
          is_default: true,
        },
      }),
    );
    if (config) {
      const updatedCompany = { ...company, default_series: config.resolved_series };
      setCompany(updatedCompany);
      setSelectedSeries(config);
      await loadSeries(updatedCompany);
      await refreshData();
    }
  }

  async function saveCompany(event: FormEvent) {
    event.preventDefault();
    const input = {
      legal_name: companyForm.legal_name,
      tax_id: companyForm.tax_id,
      address: companyForm.address,
      postal_code: companyForm.postal_code,
      municipality: companyForm.municipality,
      province: companyForm.province,
      country_code: companyForm.country_code,
      default_series: companyForm.default_series || resolvedSeriesCode(seriesCode, fiscalYear, seriesIncludeYear),
    };
    const saved = await run(company ? "Editar emisor" : "Alta emisor", () =>
      company
        ? invoke<Company>("company_update", { input: { id: company.id, ...input } })
        : invoke<Company>("company_create", { input }),
    );
    if (saved) {
      setCompany(saved);
      setCompanyForm(companyToForm(saved));
      await refreshData();
    }
  }

  async function saveCustomer(event: FormEvent) {
    event.preventDefault();
    const saved = await run(customer ? "Editar cliente" : "Alta cliente", () =>
      invoke<Customer>("customer_upsert", {
        input: {
          id: customer?.id ?? null,
          display_name: customerForm.display_name,
          tax_id: customerForm.tax_id,
          kind: customerForm.kind,
          address: customerForm.address,
          postal_code: customerForm.postal_code,
          municipality: customerForm.municipality,
          province: customerForm.province,
          country_code: customerForm.country_code,
          email: customerForm.email?.trim() || null,
        },
      }),
    );
    if (saved) {
      setCustomer(saved);
      setCustomerForm(customerToForm(saved));
      await refreshData();
    }
  }

  async function saveProduct(event: FormEvent) {
    event.preventDefault();
    if (!company) {
      setStatus("Catalogo: crea empresa primero");
      return;
    }
    const withholding = percentToBasisPoints(productForm.withholding_rate_percent);
    const discount = percentToBasisPoints(productForm.discount_rate_percent);
    const saved = await run(product ? "Editar producto" : "Guardar producto", () =>
      invoke<Product>("product_upsert", {
        input: {
          id: product?.id ?? null,
          company_id: company.id,
          sku: productForm.sku,
          name: productForm.name,
          description: productForm.description,
          kind: productForm.kind,
          unit_price_cents: eurosToCents(productForm.unit_price_euros),
          tax_rate_basis_points: percentToBasisPoints(productForm.tax_rate_percent),
          withholding_rate_basis_points: withholding > 0 ? withholding : null,
          discount_rate_basis_points: discount > 0 ? discount : null,
          active: productForm.active,
        },
      }),
    );
    if (saved) {
      setProduct(saved);
      setProductForm(productToForm(saved));
      await loadProducts(company.id);
    }
  }

  async function createDraft(event: FormEvent) {
    event.preventDefault();
    if (!company || !customer) return;
    const lines = currentInvoiceLineInputs();
    if (!lines) return;
    const created = await run("Crear borrador", () =>
      invoke<Invoice>("invoice_draft_create", {
        input: {
          company_id: company.id,
          customer_id: customer.id,
          fiscal_year: fiscalYear,
          series: activeSeries,
          number: null,
          kind: "Complete",
          territory_flags: defaultTerritoryFlags,
          rectifies_invoice_id: null,
          rectification_reason_code: null,
          rectification_method: null,
          lines,
        },
      }),
    );
    if (created) {
      setDraft(created);
      await refreshData();
    }
  }

  async function issueInvoice(event?: FormEvent) {
    event?.preventDefault();
    if (!company || !customer) return;
    const lines = currentInvoiceLineInputs();
    if (!lines) return;
    const result = await run("Emitir factura", () =>
      invoke<IssuedInvoice>("invoice_issue", {
        input: {
          draft: {
            company_id: company.id,
            customer_id: customer.id,
            fiscal_year: fiscalYear,
            series: activeSeries,
            number: null,
            kind: "Complete",
            territory_flags: defaultTerritoryFlags,
            rectifies_invoice_id: null,
            rectification_reason_code: null,
            rectification_method: null,
            lines,
          },
          number: nextNumber,
          issued_at: new Date().toISOString(),
          actor: "local-user",
          previous_audit_hash: null,
        },
      }),
    );
    if (result) {
      setIssued(result);
      setNextNumber((result.invoice.number ?? nextNumber) + 1);
      await refreshData();
    }
  }

  async function exportBackup(event: FormEvent) {
    event.preventDefault();
    const result = await run("Backup", () => invoke<BackupResult>("backup_export", { targetPath: backupPath }));
    if (result) setBackup(result);
  }

  async function exportPdf(event: FormEvent) {
    event.preventDefault();
    const invoiceId = issued?.invoice.id ?? invoices[0]?.id ?? draft?.id;
    if (!invoiceId) {
      setStatus("PDF: no hay factura");
      return;
    }
    const result = await run("PDF", () => invoke<string>("invoice_export_pdf", { invoiceId, targetPath: pdfPath }));
    if (result) setPdfResult(result);
  }

  async function exportJson(event: FormEvent) {
    event.preventDefault();
    const invoiceId = issued?.invoice.id ?? invoices[0]?.id ?? draft?.id;
    if (!invoiceId) {
      setStatus("JSON: no hay factura");
      return;
    }
    const result = await run("Export JSON", () =>
      invoke<ExportResult>("invoice_export_json", { invoiceId, targetPath: jsonPath }),
    );
    if (result) setJsonResult(result);
  }

  async function exportCsv(event: FormEvent) {
    event.preventDefault();
    const result = await run("Export CSV", () =>
      invoke<ExportResult>("invoice_export_csv", { filters: null, targetPath: csvPath }),
    );
    if (result) setCsvResult(result);
  }

  async function exportFiscalAudit(event: FormEvent) {
    event.preventDefault();
    const result = await run("Export auditoria fiscal", () =>
      invoke<ExportResult>("fiscal_audit_export", { filters: null, targetPath: auditExportPath }),
    );
    if (result) setAuditExportResult(result);
  }

  async function restoreBackup(event: FormEvent) {
    event.preventDefault();
    const result = await run("Restore preflight", () =>
      invoke<BackupRestoreResult>("backup_restore", { sourcePath: restorePath }),
    );
    if (result) setRestore(result);
  }

  async function exportXml(event: FormEvent) {
    event.preventDefault();
    if (!issuedInvoiceId) {
      setStatus("XML: no hay factura emitida");
      return;
    }
    const result = await run("XML VERI*FACTU", () =>
      invoke<VerifactuXmlResult>("verifactu_xml_draft_export", { invoiceId: issuedInvoiceId, targetPath: xmlPath }),
    );
    if (result) setXmlResult(result);
  }

  async function loadDefaults() {
    const [defaults, settings, capabilities] = await run("Cargar defaults", () =>
      Promise.all([
        invoke<AppDefaults>("app_defaults_get"),
        invoke<AppSettings>("app_settings_get"),
        invoke<ImportedSidecarCapabilities>("fiscal_sidecar_capabilities_get"),
      ]),
    );
    if (!defaults || !settings) return;
    setAppDefaults(defaults);
    setAppSettings(settings);
    setSidecarCapabilities(capabilities);
    setDefaultTerritoryFlags(settings.default_territory_flags);
    const resolvedExportDir = settings.export_dir || defaults.export_dir;
    setExportDir(resolvedExportDir);
    if (settings.export_dir) {
      applyExportDirPaths(settings.export_dir);
      return;
    }
    setBackupPath((current) => current || defaults.default_backup_path);
    setPdfPath((current) => current || defaults.default_pdf_path);
    setXmlPath((current) => current || defaults.default_verifactu_xml_path);
    setCancelXmlPath((current) => current || defaults.default_cancel_xml_path);
    setSignedXmlPath((current) => current || defaults.default_signed_xml_path);
    setJsonPath((current) => current || defaults.default_json_export_path);
    setCsvPath((current) => current || defaults.default_csv_export_path);
    setAuditExportPath((current) => current || defaults.default_audit_export_path);
  }

  async function saveOnboarding(event: FormEvent) {
    event.preventDefault();
    const saved = await run("Guardar onboarding", () =>
      invoke<AppSettings>("app_settings_update", {
        input: {
          export_dir: exportDir,
          default_territory_flags: defaultTerritoryFlags,
          onboarding_completed: onboardingReady,
        },
      }),
    );
    if (saved) {
      setAppSettings(saved);
      if (saved.export_dir) applyExportDirPaths(saved.export_dir);
    }
  }

  async function previewNextNumber(targetCompany: Company, series = activeSeries, year = fiscalYear) {
    const preview = await invoke<NextNumberPreview>("invoice_next_number_preview", {
      companyId: targetCompany.id,
      fiscalYear: year,
      series,
    });
    setNumberPreview(preview);
    setNextNumber(preview.next_number);
  }

  async function adviseRectification() {
    const result = await run("Asistente rectificativa", () =>
      invoke<RectificationAdvice>("rectification_advice", {
        input: {
          scenario: rectificationScenario,
          method_preference: null,
          replaces_full_invoice: rectificationMethod === "S",
        },
      }),
    );
    if (result) {
      setRectificationReason(result.reason_code);
      setRectificationMethod(result.method);
      setRectificationAdvice(result);
    }
  }

  async function issueRectifyingInvoice(event: FormEvent) {
    event.preventDefault();
    const source = rectifiableInvoice;
    if (!source) {
      setStatus("Rectificativa: no hay factura emitida rectificable");
      return;
    }
    const result = await run("Emitir rectificativa", () =>
      invoke<IssuedInvoice>("invoice_issue", {
        input: {
          draft: {
            company_id: source.company_id,
            customer_id: source.customer_id,
            fiscal_year: new Date().getFullYear(),
            series: source.series,
            number: null,
            kind: "Rectifying",
            territory_flags: defaultTerritoryFlags,
            rectifies_invoice_id: source.id,
            rectification_reason_code: rectificationReason,
            rectification_method: rectificationMethod,
            lines: [
              {
                description: `Rectificacion parcial ${source.series}-${source.number ?? "BOR"}`,
                quantity: 1,
                unit_price_cents: -1000,
                discount_rate_basis_points: null,
                tax_rate_basis_points: 2100,
                withholding_rate_basis_points: null,
              },
            ],
          },
          number: nextNumber,
          issued_at: new Date().toISOString(),
          actor: "local-user",
          previous_audit_hash: null,
        },
      }),
    );
    if (result) {
      setIssued(result);
      setNextNumber((result.invoice.number ?? nextNumber) + 1);
      await refreshData();
    }
  }

  async function exportCancelXml(event: FormEvent) {
    event.preventDefault();
    if (!issuedInvoiceId) {
      setStatus("XML anulacion: no hay factura emitida");
      return;
    }
    const result = await run("XML anulacion", () =>
      invoke<VerifactuXmlResult>("verifactu_xml_anulacion_draft_export", {
        invoiceId: issuedInvoiceId,
        targetPath: cancelXmlPath,
      }),
    );
    if (result) {
      setCancelXmlResult(result);
      setIssued(null);
      await refreshData();
    }
  }

  async function prepareSubmission(event: FormEvent) {
    event.preventDefault();
    if (!issuedInvoiceId) {
      setStatus("Preparar envio: no hay factura");
      return;
    }
    const sourcePath = xmlResult?.target_path ?? cancelXmlResult?.target_path;
    if (!sourcePath) {
      setStatus("Preparar envio: exporta XML primero");
      return;
    }
    const result = await run("Preparar firma/envio", () =>
      invoke<SubmissionPreparation>("verifactu_submission_prepare", {
        invoiceId: issuedInvoiceId,
        xmlPath: sourcePath,
      }),
    );
    if (result) setSubmission(result);
  }

  async function preflightXadesSidecar(event: FormEvent) {
    event.preventDefault();
    if (!submission) {
      setStatus("Preflight XAdES: prepara firma/envio primero");
      return;
    }
    const result = await run("Preflight XAdES", () =>
      invoke<XadesSidecarPreflight>("verifactu_xades_sidecar_preflight", {
        input: {
          invoice_id: submission.invoice_id,
          export_id: submission.export_id,
          xml_path: submission.xml_path,
          xml_sha256: submission.xml_sha256,
          signature_status: submission.signature_status,
          certificate_secret_ref: xadesCertRef,
          sidecar_url: xadesSidecarUrl,
        },
      }),
    );
    if (result) setXadesPreflight(result);
  }

  async function signWithXadesSidecar(event: FormEvent) {
    event.preventDefault();
    if (!submission) {
      setStatus("Firmar XAdES: prepara firma/envio primero");
      return;
    }
    const result = await run("Firmar XAdES", () =>
      invoke<XadesSidecarSignature>("verifactu_xades_sidecar_sign", {
        input: {
          invoice_id: submission.invoice_id,
          export_id: submission.export_id,
          xml_path: submission.xml_path,
          xml_sha256: submission.xml_sha256,
          signature_status: submission.signature_status,
          certificate_secret_ref: xadesCertRef,
          sidecar_url: xadesSidecarUrl,
          signed_xml_path: signedXmlPath,
          reference_uri: null,
          id_attribute: "Id",
        },
      }),
    );
    if (result) {
      setXadesSignature(result);
      setSubmission(result);
    }
  }

  async function preflightAeatTransport(event: FormEvent) {
    event.preventDefault();
    if (!submission) {
      setStatus("Preflight AEAT: prepara firma/envio primero");
      return;
    }
    const result = await run("Preflight AEAT", () =>
      invoke<AeatTransportPreflight>("verifactu_transport_preflight", {
        input: {
          invoice_id: submission.invoice_id,
          export_id: submission.export_id,
          xml_path: submission.xml_path,
          xml_sha256: submission.xml_sha256,
          signature_status: submission.signature_status,
          endpoint_url: aeatEndpoint,
        },
      }),
    );
    if (result) setTransportPreflight(result);
  }

  async function preflightSubmitSidecar(event: FormEvent) {
    event.preventDefault();
    if (!submission) {
      setStatus("Preflight envio sidecar: firma XAdES primero");
      return;
    }
    const result = await run("Preflight envio sidecar", () =>
      invoke<VerifactuSubmitSidecarPreflight>("verifactu_submit_sidecar_preflight", {
        input: {
          invoice_id: submission.invoice_id,
          export_id: submission.export_id,
          xml_path: submission.xml_path,
          xml_sha256: submission.xml_sha256,
          signature_status: submission.signature_status,
          certificate_secret_ref: xadesCertRef,
          endpoint_name: aeatEndpointName,
          sidecar_url: submitSidecarUrl,
          require_soap_enabled: true,
        },
      }),
    );
    if (result) setSubmitPreflight(result);
  }

  async function preflightSiiSidecar(event: FormEvent) {
    event.preventDefault();
    if (!siiChannel?.mvp_importable) {
      setStatus("Preflight SII sidecar: canal no importable MVP");
      return;
    }
    const result = await run("Preflight SII sidecar", () =>
      invoke<SiiSidecarPreflight>("sii_submit_sidecar_preflight", {
        input: {
          book: siiBook,
          endpoint_name: siiEndpointName,
          certificate_secret_ref: xadesCertRef,
          sidecar_url: siiSidecarUrl,
          require_soap_enabled: true,
        },
      }),
    );
    if (result) setSiiPreflight(result);
  }

  async function preflightTicketBaiSidecar(event: FormEvent) {
    event.preventDefault();
    if (!ticketbaiChannel?.mvp_importable) {
      setStatus("TicketBAI sidecar: diferido, no importado al MVP");
      return;
    }
    const result = await run("Preflight TicketBAI sidecar", () =>
      invoke<TicketBaiSidecarPreflight>("ticketbai_submit_sidecar_preflight", {
        input: {
          territorio: ticketbaiTerritorio,
          endpoint: ticketbaiEndpoint,
          certificate_secret_ref: xadesCertRef,
          sidecar_url: ticketbaiSidecarUrl,
        },
      }),
    );
    if (result) setTicketbaiPreflight(result);
  }

  async function invokeSubmitSidecar(event: FormEvent) {
    event.preventDefault();
    if (!submission) {
      setStatus("Enviar via sidecar: firma XAdES primero");
      return;
    }
    const result = await run("Enviar via sidecar", () =>
      invoke<VerifactuSubmitSidecarInvocation>("verifactu_submit_sidecar_invoke", {
        input: {
          invoice_id: submission.invoice_id,
          export_id: submission.export_id,
          xml_path: submission.xml_path,
          xml_sha256: submission.xml_sha256,
          signature_status: submission.signature_status,
          certificate_secret_ref: xadesCertRef,
          endpoint_name: aeatEndpointName,
          sidecar_url: invokeSidecarUrl,
          timeout_seconds: 20,
        },
      }),
    );
    if (result) setSubmitInvocation(result);
  }

  const activeArea = NAV_AREAS.find((area) => area.views.some((item) => item.id === view)) ?? NAV_AREAS[0];
  const activeView = activeArea.views.find((item) => item.id === view) ?? activeArea.views[0];
  const ActiveAreaIcon = activeArea.icon;
  const pageHead = PAGE_HEADS[view];

  return (
    <div className="appShell">
      <header className="topNav">
        <div className="topNavInner">
          <button type="button" className="brandLink" onClick={() => setView("panel")} aria-label="CumpleFactura, ir a Panel">
            <img className="brandMark" src="/cf-mark.png" alt="" aria-hidden="true" />
            <span className="brandName">CumpleFactura</span>
            <span className="moduleBadge">Facturacion</span>
          </button>
          <span className="topDivider" aria-hidden="true" />
          <nav className="areaNav" aria-label="Areas principales">
            {NAV_AREAS.map((area) => {
              const Icon = area.icon;
              const active = area.id === activeArea.id;
              return (
                <button
                  key={area.id}
                  type="button"
                  className={active ? "areaTab active" : "areaTab"}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setView(area.views[0].id)}
                >
                  <Icon size={16} aria-hidden="true" />
                  {area.label}
                </button>
              );
            })}
          </nav>
          <div className="topActions">
            <span className="flowPill" title={status}>{flowState}</span>
            <button className="iconButton" onClick={() => void refreshData()} title="Refrescar" aria-label="Refrescar">
              <RefreshCw size={16} aria-hidden="true" />
            </button>
            <button className="primary" onClick={() => void issueInvoice()} disabled={!canIssue}>Emitir</button>
          </div>
        </div>
      </header>

      <div className="appBody">
        <aside className="subSidebar" aria-label={`Navegacion ${activeArea.label}`}>
          <div className="subSidebarHead">
            <ActiveAreaIcon size={16} aria-hidden="true" />
            <span>{activeArea.label}</span>
          </div>
          <nav className="subNav">
            {activeArea.views.map((item) => {
              const Icon = item.icon;
              const active = item.id === view;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={active ? "subItem active" : "subItem"}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setView(item.id)}
                >
                  <Icon size={16} aria-hidden="true" />
                  <span>{item.label}</span>
                  {item.soon ? <span className="soonBadge" aria-hidden="true" title="Pendiente del servicio de red">Pronto</span> : null}
                </button>
              );
            })}
          </nav>
          <div className="subSidebarFoot">
            <span>Cadena fiscal</span>
            <strong>{fiscalChain?.valid && fiscalChain.total_records > 0 ? `Cadena fiscal OK (${fiscalChain.total_records})` : "Sin emisiones verificadas"}</strong>
          </div>
        </aside>

        <main className="content">
          <div className="pageHead">
            <p className="eyebrow">{activeArea.label} / {activeView.label}</p>
            <h1>{pageHead.title}</h1>
            <p>{view === "panel" ? `${flowState} - ${status}` : pageHead.subtitle}</p>
          </div>

          {view === "panel" ? (
            <>
              <div className="grid">
                {cards.map(({ icon: Icon, title, text }) => (
                  <article key={title} className="card">
                    <Icon size={20} aria-hidden="true" />
                    <h2>{title}</h2>
                    <p>{text}</p>
                  </article>
                ))}
              </div>

              <section className="panel statusGrid" aria-label="Estado pre-MVP">
                <div>
                  <strong>Roadmap local MVP</strong>
                  <p>Pre-MVP local-first: evidencia local activa, externo bloqueado.</p>
                  <button type="button" className="linkButton" onClick={fillDemoData}>
                    {demoSeedEnabled ? "Datos demo cargados" : "Rellenar demo"}
                  </button>
                </div>
                <div>
                  <strong>local_evidence</strong>
                  <p>{fiscalChain?.valid ? `OK (${fiscalChain.total_records} registros)` : "pendiente de primera emision"}</p>
                </div>
                <div>
                  <strong>external_blocked</strong>
                  <p>Sin certificado real, vault, flags ni manifiesto AEAT.</p>
                </div>
                <div>
                  <strong>Export dir</strong>
                  <p>{appDefaults?.export_dir ?? "Cargando ubicacion segura..."}</p>
                </div>
              </section>

              <section className="panel onboardingPanel" aria-label="Onboarding inicial">
                <div className="editorTop">
                  <div>
                    <h2>Onboarding inicial</h2>
                    <p>{appSettings?.onboarding_completed ? "Completado" : "Pendiente"} - empresa, fiscalidad, serie y carpeta export.</p>
                  </div>
                  <div className="stepBadges">
                    {onboardingSteps.map((step) => (
                      <span key={step.label} className={step.ok ? "ok" : ""}>{step.label}</span>
                    ))}
                  </div>
                </div>
                <form className="onboardingForm" onSubmit={saveOnboarding}>
                  <div className="pathField">
                    <label className="fieldBlock">
                      <span>Carpeta export</span>
                      <input
                        aria-label="Carpeta export"
                        value={exportDir}
                        onChange={(event) => setExportDir(event.target.value)}
                        readOnly
                        required
                      />
                    </label>
                    <button type="button" className="linkButton" onClick={() => void pickExportDirectory()}>
                      <FolderOpen size={16} aria-hidden="true" />
                      Elegir carpeta
                    </button>
                  </div>
                  <fieldset className="flagGroup">
                    <legend>Fiscalidad local</legend>
                    <label><input type="checkbox" checked={defaultTerritoryFlags.includes("CommonTerritory")} onChange={(event) => toggleTerritoryFlag("CommonTerritory", event.target.checked)} /> Territorio comun</label>
                    <label><input type="checkbox" checked={defaultTerritoryFlags.includes("VeriFactu")} onChange={(event) => toggleTerritoryFlag("VeriFactu", event.target.checked)} /> VERI*FACTU local</label>
                    <label><input type="checkbox" checked={defaultTerritoryFlags.includes("Sii")} onChange={(event) => toggleTerritoryFlag("Sii", event.target.checked)} /> SII pendiente</label>
                  </fieldset>
                  <button className="primary" disabled={!onboardingReady}>Guardar onboarding</button>
                </form>
              </section>
            </>
          ) : null}

          {view === "nueva" ? (
            <>
              <section className="panel invoiceEditor">
                <div className="editorTop">
                  <div>
                    <h2>Editor de factura</h2>
                    <p>{invoiceLines.length} linea(s) - Base {cents(invoiceTotals.taxable_base_cents)} - Total {cents(invoiceTotals.total_cents)}</p>
                  </div>
                  <label className="fieldBlock">
                    <span>Serie de esta factura</span>
                    <select
                      aria-label="Serie de esta factura"
                      value={selectedSeries?.id ?? ""}
                      onChange={(event) => void selectInvoiceSeries(event.target.value)}
                      disabled={seriesConfigs.length === 0}
                    >
                      {seriesConfigs.length === 0 ? <option value="">Sin series</option> : null}
                      {seriesConfigs.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label} - {item.preview}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="lineTable" aria-label="Lineas de factura">
                  <div className="lineHeader">
                    <span>Descripcion</span>
                    <span>Cant.</span>
                    <span>Precio EUR</span>
                    <span>Dto %</span>
                    <span>IVA %</span>
                    <span>IRPF %</span>
                    <span />
                  </div>
                  {invoiceLines.map((line, index) => (
                    <div className="lineRow" key={line.id}>
                      <input
                        aria-label={`Descripcion linea ${index + 1}`}
                        value={line.description}
                        onChange={(event) => updateInvoiceLine(line.id, "description", event.target.value)}
                      />
                      <input
                        aria-label={`Cantidad linea ${index + 1}`}
                        type="number"
                        min={1}
                        step={1}
                        value={line.quantity}
                        onChange={(event) => updateInvoiceLine(line.id, "quantity", event.target.value)}
                      />
                      <input
                        aria-label={`Precio EUR linea ${index + 1}`}
                        inputMode="decimal"
                        value={line.unit_price_euros}
                        onChange={(event) => updateInvoiceLine(line.id, "unit_price_euros", event.target.value)}
                      />
                      <input
                        aria-label={`Descuento linea ${index + 1}`}
                        inputMode="decimal"
                        value={line.discount_rate_percent}
                        onChange={(event) => updateInvoiceLine(line.id, "discount_rate_percent", event.target.value)}
                      />
                      <input
                        aria-label={`IVA linea ${index + 1}`}
                        inputMode="decimal"
                        value={line.tax_rate_percent}
                        onChange={(event) => updateInvoiceLine(line.id, "tax_rate_percent", event.target.value)}
                      />
                      <input
                        aria-label={`IRPF linea ${index + 1}`}
                        inputMode="decimal"
                        value={line.withholding_rate_percent}
                        onChange={(event) => updateInvoiceLine(line.id, "withholding_rate_percent", event.target.value)}
                      />
                      <button
                        type="button"
                        className="iconButton"
                        aria-label={`Quitar linea ${index + 1}`}
                        title={`Quitar linea ${index + 1}`}
                        onClick={() => removeInvoiceLine(line.id)}
                        disabled={invoiceLines.length === 1}
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="editorFooter">
                  <button type="button" className="linkButton" onClick={addInvoiceLine}>
                    <Plus size={16} aria-hidden="true" />
                    Añadir linea
                  </button>
                  <p>IVA {cents(invoiceTotals.tax_cents)} - IRPF {cents(invoiceTotals.withholding_cents)} - Numero {activeSeriesPreview}</p>
                </div>
              </section>

              <section className="panel flow">
                <form onSubmit={createDraft}>
                  <h2>1. Borrador</h2>
                  <p>{draft ? `${draft.series} - ${cents(draft.totals.total_cents)}` : `${invoiceLines.length} linea(s) - ${cents(invoiceTotals.total_cents)}`}</p>
                  <button className="primary" disabled={!canDraft}>Crear borrador</button>
                </form>
                <form onSubmit={issueInvoice}>
                  <h2>2. Emision</h2>
                  <p>{issued ? `Hash ${short(issued.fiscal_hash)}` : `Numero ${activeSeriesPreview} (${numberPreview?.source ?? "secuencia Rust"})`}</p>
                  <button className="primary" disabled={!canIssue}>Emitir factura</button>
                </form>
                <form onSubmit={issueRectifyingInvoice}>
                  <h2>3. Rectificativa</h2>
                  <p>{rectifiableInvoice ? `${rectifiableInvoice.series}-${rectifiableInvoice.number}` : "Sin factura emitida"}</p>
                  <div className="miniControls">
                    <select value={rectificationScenario} onChange={(event) => setRectificationScenario(event.target.value)}>
                      <option value="Article80OneTwoOrLegalError">80.1/80.2/error</option>
                      <option value="Article80Three">80.3</option>
                      <option value="Article80Four">80.4</option>
                      <option value="Other">Resto</option>
                      <option value="SimplifiedInvoice">Simplificada</option>
                    </select>
                    <select value={rectificationReason} onChange={(event) => setRectificationReason(event.target.value)}>
                      {["R1", "R2", "R3", "R4", "R5"].map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                    <select value={rectificationMethod} onChange={(event) => setRectificationMethod(event.target.value)}>
                      <option value="I">I</option>
                      <option value="S">S</option>
                    </select>
                  </div>
                  <button type="button" onClick={() => void adviseRectification()} disabled={!canRectify}>Sugerir</button>
                  <p>{rectificationAdvice ? `${rectificationAdvice.reason_code}/${rectificationAdvice.method} - ${rectificationAdvice.confidence}` : "Selector tecnico R1-R5/I-S."}</p>
                  <button className="primary" disabled={!canRectify}>Emitir rectificativa</button>
                </form>
              </section>
            </>
          ) : null}

          {view === "emitidas" ? (
            <>
              <section className="panel invoiceFilters" aria-label="Buscar facturas">
                <div className="editorTop">
                  <div>
                    <h2>Buscar facturas</h2>
                    <p>{invoices.length} resultado(s) con filtros actuales.</p>
                  </div>
                  <button type="button" className="linkButton" onClick={clearInvoiceFilters}>Limpiar filtros</button>
                </div>
                <form className="filterForm" onSubmit={searchInvoices}>
                  <label className="fieldBlock">
                    <span>Texto</span>
                    <input aria-label="Buscar texto factura" value={invoiceSearch} onChange={(event) => setInvoiceSearch(event.target.value)} placeholder="serie, numero, cliente, NIF, hash" />
                  </label>
                  <label className="fieldBlock">
                    <span>Empresa</span>
                    <select aria-label="Filtro empresa factura" value={invoiceCompanyFilter} onChange={(event) => setInvoiceCompanyFilter(event.target.value)}>
                      <option value="">Todas</option>
                      {companies.map((item) => <option key={item.id} value={item.id}>{item.legal_name}</option>)}
                    </select>
                  </label>
                  <label className="fieldBlock">
                    <span>Cliente</span>
                    <select aria-label="Filtro cliente factura" value={invoiceCustomerFilter} onChange={(event) => setInvoiceCustomerFilter(event.target.value)}>
                      <option value="">Todos</option>
                      {customers.map((item) => <option key={item.id} value={item.id}>{item.display_name}</option>)}
                    </select>
                  </label>
                  <label className="fieldBlock">
                    <span>Año</span>
                    <input aria-label="Filtro año factura" inputMode="numeric" value={invoiceYearFilter} onChange={(event) => setInvoiceYearFilter(event.target.value)} placeholder="2026" />
                  </label>
                  <label className="fieldBlock">
                    <span>Serie</span>
                    <input aria-label="Filtro serie factura" value={invoiceSeriesFilter} onChange={(event) => setInvoiceSeriesFilter(event.target.value.toUpperCase())} placeholder="A, AL, VENDI2026" />
                  </label>
                  <label className="fieldBlock">
                    <span>Estado</span>
                    <select aria-label="Filtro estado factura" value={invoiceStatusFilter} onChange={(event) => setInvoiceStatusFilter(event.target.value)}>
                      <option value="">Todos</option>
                      <option value="Draft">Draft</option>
                      <option value="Issued">Issued</option>
                      <option value="Void">Void</option>
                      <option value="Rectified">Rectified</option>
                    </select>
                  </label>
                  <label className="fieldBlock">
                    <span>Tipo</span>
                    <select aria-label="Filtro tipo factura" value={invoiceKindFilter} onChange={(event) => setInvoiceKindFilter(event.target.value)}>
                      <option value="">Todos</option>
                      <option value="Complete">Complete</option>
                      <option value="Simplified">Simplified</option>
                      <option value="Rectifying">Rectifying</option>
                    </select>
                  </label>
                  <button className="primary">Buscar facturas</button>
                </form>
              </section>

              <section className="panel lists single" aria-label="Listado facturas">
                <DataList
                  title="Facturas"
                  empty="Sin facturas"
                  rows={invoices.map((item) => `${item.series}-${item.number ?? "BOR"} - ${item.kind} - ${item.status} - ${cents(item.total_cents)} - ${short(item.fiscal_hash)}`)}
                  footer={<Pager regionLabel="Pagina facturas" prevLabel="Anterior facturas" nextLabel="Siguiente facturas" page={invoicePage} hasNext={invoices.length === PAGE_SIZE} onPrev={() => void changeInvoicePage(invoicePage - 1)} onNext={() => void changeInvoicePage(invoicePage + 1)} />}
                />
              </section>
            </>
          ) : null}

          {view === "cobros" ? <ReceivablesView companyId={company?.id} customers={customers} run={run} /> : null}

          {view === "recurrentes" ? (
            <RecurringView
              companyId={company?.id}
              customers={customers}
              series={seriesConfigs}
              territoryFlags={defaultTerritoryFlags}
              run={run}
              onDraftsCreated={() => void refreshData()}
            />
          ) : null}

          {view === "presupuestos" ? (
            <QuotesView
              companyId={company?.id}
              customers={customers}
              series={seriesConfigs}
              territoryFlags={defaultTerritoryFlags}
              run={run}
              onInvoiced={() => void refreshData()}
            />
          ) : null}

          {view === "recibidas" ? <ReceivedInvoicesView /> : null}

          {view === "exportar" ? (
            <section className="panel exportPanel">
              <div className="stack">
                <h2>PDF factura</h2>
                <form className="backupForm pathForm" onSubmit={exportPdf}>
                  <input aria-label="Ruta PDF factura" value={pdfPath} readOnly />
                  <button type="button" className="linkButton" onClick={() => void pickSavePath("PDF factura", pdfPath, ["pdf"], setPdfPath)}>
                    <FolderOpen size={16} aria-hidden="true" />
                    Elegir PDF
                  </button>
                  <button className="primary" disabled={!draft && invoices.length === 0}>Exportar PDF</button>
                </form>
                <p>{pdfResult ? `PDF creado - ${pdfResult}` : "Exporta la factura/borrador seleccionado."}</p>
                <h2>JSON factura</h2>
                <form className="backupForm pathForm" onSubmit={exportJson}>
                  <input aria-label="Ruta JSON factura" value={jsonPath} readOnly />
                  <button type="button" className="linkButton" onClick={() => void pickSavePath("JSON factura", jsonPath, ["json"], setJsonPath)}>
                    <FolderOpen size={16} aria-hidden="true" />
                    Elegir JSON
                  </button>
                  <button className="primary" disabled={!draft && invoices.length === 0}>Exportar JSON</button>
                </form>
                <p>{jsonResult ? `${jsonResult.status} - ${jsonResult.target_path}` : "Exporta datos de factura a JSON local."}</p>
                <h2>CSV facturas</h2>
                <form className="backupForm pathForm" onSubmit={exportCsv}>
                  <input aria-label="Ruta CSV facturas" value={csvPath} readOnly />
                  <button type="button" className="linkButton" onClick={() => void pickSavePath("CSV facturas", csvPath, ["csv"], setCsvPath)}>
                    <FolderOpen size={16} aria-hidden="true" />
                    Elegir CSV
                  </button>
                  <button className="primary" disabled={invoices.length === 0}>Exportar CSV</button>
                </form>
                <p>{csvResult ? `${csvResult.status} - ${csvResult.target_path}` : "Exporta listado local de facturas; filtros en contrato MVP."}</p>
              </div>
            </section>
          ) : null}

          {view === "clientes" ? (
            <>
              <section className="panel entityForms single">
                <form onSubmit={saveCustomer}>
                  <div className="formTitle">
                    <h2>Cliente</h2>
                    <button type="button" className="linkButton" onClick={newCustomerForm}>Nuevo cliente</button>
                  </div>
                  <label className="fieldBlock">
                    <span>Cliente activo</span>
                    <select aria-label="Cliente activo" value={customer?.id ?? ""} onChange={(event) => selectCustomer(event.target.value)}>
                      <option value="">Nuevo cliente</option>
                      {customers.map((item) => <option key={item.id} value={item.id}>{item.display_name} - {item.tax_id}</option>)}
                    </select>
                  </label>
                  <div className="formGrid">
                    <label className="fieldBlock"><span>Nombre</span><input aria-label="Nombre cliente" required value={customerForm.display_name} onChange={(event) => updateCustomerForm("display_name", event.target.value)} /></label>
                    <label className="fieldBlock"><span>NIF/CIF</span><input aria-label="NIF cliente" required value={customerForm.tax_id} onChange={(event) => updateCustomerForm("tax_id", event.target.value)} /></label>
                    <label className="fieldBlock"><span>Tipo</span><select aria-label="Tipo cliente" value={customerForm.kind} onChange={(event) => updateCustomerForm("kind", event.target.value)}><option value="Business">Empresa</option><option value="Individual">Persona fisica</option><option value="PublicAdministration">Administracion</option></select></label>
                    <label className="fieldBlock wide"><span>Direccion</span><input aria-label="Direccion cliente" required value={customerForm.address} onChange={(event) => updateCustomerForm("address", event.target.value)} /></label>
                    <label className="fieldBlock"><span>CP</span><input aria-label="CP cliente" required value={customerForm.postal_code} onChange={(event) => updateCustomerForm("postal_code", event.target.value)} /></label>
                    <label className="fieldBlock"><span>Municipio</span><input aria-label="Municipio cliente" required value={customerForm.municipality} onChange={(event) => updateCustomerForm("municipality", event.target.value)} /></label>
                    <label className="fieldBlock"><span>Provincia</span><input aria-label="Provincia cliente" required value={customerForm.province} onChange={(event) => updateCustomerForm("province", event.target.value)} /></label>
                    <label className="fieldBlock"><span>Pais</span><input aria-label="Pais cliente" required value={customerForm.country_code} onChange={(event) => updateCustomerForm("country_code", event.target.value.toUpperCase())} /></label>
                <label className="fieldBlock wide"><span>Email (envio de facturas)</span><input aria-label="Email cliente" type="email" value={customerForm.email ?? ""} onChange={(event) => updateCustomerForm("email", event.target.value)} placeholder="administracion@cliente.es" /></label>
                  </div>
                  <button className="primary">Guardar cliente</button>
                </form>
              </section>
              <section className="panel lists single" aria-label="Listado clientes">
                <DataList title="Clientes" empty="Sin clientes" rows={customers.map((item) => `${item.display_name} - ${item.tax_id}`)} />
              </section>
            </>
          ) : null}

          {view === "empresas" ? <CompanyNetworkView /> : null}

          {view === "catalogo" ? (
            <section className="panel productCatalog" aria-label="Catalogo productos/servicios">
              <div className="editorTop">
                <div>
                  <h2>Catalogo productos/servicios</h2>
                  <p>{company ? `${products.length} ficha(s) para ${company.legal_name}` : "Crea empresa para activar catalogo."}</p>
                </div>
                <button type="button" className="linkButton" onClick={newProductForm}>Nuevo producto</button>
              </div>
              <form className="productForm" onSubmit={saveProduct}>
                <label className="fieldBlock">
                  <span>Producto activo</span>
                  <select aria-label="Producto activo" value={product?.id ?? ""} onChange={(event) => selectProduct(event.target.value)} disabled={!company || products.length === 0}>
                    <option value="">Nuevo producto</option>
                    {products.map((item) => <option key={item.id} value={item.id}>{item.sku} - {item.name}</option>)}
                  </select>
                </label>
                <label className="fieldBlock"><span>SKU</span><input aria-label="SKU producto" required value={productForm.sku} onChange={(event) => updateProductForm("sku", event.target.value.toUpperCase())} /></label>
                <label className="fieldBlock"><span>Nombre</span><input aria-label="Nombre producto" required value={productForm.name} onChange={(event) => updateProductForm("name", event.target.value)} /></label>
                <label className="fieldBlock wide"><span>Descripcion linea</span><input aria-label="Descripcion producto" required value={productForm.description} onChange={(event) => updateProductForm("description", event.target.value)} /></label>
                <label className="fieldBlock"><span>Tipo</span><select aria-label="Tipo producto" value={productForm.kind} onChange={(event) => updateProductForm("kind", event.target.value)}><option value="Service">Servicio</option><option value="Product">Producto</option></select></label>
                <label className="fieldBlock"><span>Precio EUR</span><input aria-label="Precio producto EUR" inputMode="decimal" required value={productForm.unit_price_euros} onChange={(event) => updateProductForm("unit_price_euros", event.target.value)} /></label>
                <label className="fieldBlock"><span>IVA %</span><input aria-label="IVA producto" inputMode="decimal" required value={productForm.tax_rate_percent} onChange={(event) => updateProductForm("tax_rate_percent", event.target.value)} /></label>
                <label className="fieldBlock"><span>IRPF %</span><input aria-label="IRPF producto" inputMode="decimal" value={productForm.withholding_rate_percent} onChange={(event) => updateProductForm("withholding_rate_percent", event.target.value)} /></label>
                <label className="fieldBlock"><span>Dto %</span><input aria-label="Descuento producto" inputMode="decimal" value={productForm.discount_rate_percent} onChange={(event) => updateProductForm("discount_rate_percent", event.target.value)} /></label>
                <label className="checkLine">
                  <input type="checkbox" checked={productForm.active} onChange={(event) => updateProductForm("active", event.target.checked)} />
                  Activo
                </label>
                <button className="primary" disabled={!company}>Guardar producto</button>
              </form>
              <div className="productList">
                {products.length === 0 ? <p>Sin productos/servicios guardados.</p> : null}
                {products.map((item) => (
                  <div key={item.id} className="productRow">
                    <div>
                      <strong>{item.sku} - {item.name}</strong>
                      <p>{cents(item.unit_price_cents)} - IVA {item.tax_rate_basis_points / 100}% - {item.active ? "activo" : "inactivo"}</p>
                    </div>
                    <button type="button" className="linkButton" onClick={() => useProductInFirstLine(item)}>Usar en linea</button>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {view === "auditoria" ? (
            <>
              <section className="panel fiscalAuditScreen" aria-label="Auditoria fiscal local">
                <div className="editorTop">
                  <div>
                    <h2>Auditoria fiscal local</h2>
                    <p>{fiscalChain?.valid ? `Cadena fiscal OK (${fiscalChain.total_records})` : `Incidencias cadena ${fiscalChain?.issue_count ?? 0}`}</p>
                  </div>
                  <button type="button" className="linkButton" onClick={() => void verifyFiscalChain()}>
                    <RefreshCw size={16} aria-hidden="true" />
                    Verificar cadena
                  </button>
                </div>
                <div className="auditSummary" aria-label="Resumen auditoria fiscal">
                  <div>
                    <strong>Estado cadena</strong>
                    <span>{fiscalChain?.valid ? "OK" : "Revisar"}</span>
                  </div>
                  <div>
                    <strong>Registros fiscales verificados</strong>
                    <span>{fiscalChain?.total_records ?? 0}</span>
                  </div>
                  <div>
                    <strong>Incidencias cadena</strong>
                    <span>{fiscalChain?.issue_count ?? 0}</span>
                  </div>
                  <div>
                    <strong>Empresas con hash final</strong>
                    <span>{fiscalChain?.last_hash_by_company.length ?? 0}</span>
                  </div>
                </div>
                <div className="auditColumns">
                  <div>
                    <h3>Incidencias cadena</h3>
                    {fiscalChain && fiscalChain.issues.length > 0 ? (
                      <ul className="auditList">
                        {fiscalChain.issues.map((issue) => (
                          <li key={`${issue.record_id}-${issue.code}`}>
                            <strong>{issue.severity} / {issue.code}</strong>
                            <span>{short(issue.record_id)} - {issue.message}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>Sin incidencias cadena.</p>
                    )}
                  </div>
                  <div>
                    <h3>Ultimo hash por empresa</h3>
                    {fiscalChain && fiscalChain.last_hash_by_company.length > 0 ? (
                      <ul className="auditList">
                        {fiscalChain.last_hash_by_company.map((head) => (
                          <li key={head.company_id}>
                            <strong>{short(head.company_id)}</strong>
                            <span>{short(head.last_hash)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>Sin hash final todavia.</p>
                    )}
                  </div>
                </div>
                <form className="auditExportForm" onSubmit={exportFiscalAudit}>
                  <input aria-label="Ruta informe auditoria fiscal" value={auditExportPath} readOnly />
                  <button type="button" className="linkButton" onClick={() => void pickSavePath("Informe auditoria fiscal", auditExportPath, ["json"], setAuditExportPath)}>
                    <FolderOpen size={16} aria-hidden="true" />
                    Elegir auditoria
                  </button>
                  <button className="primary" disabled={audit.length === 0 && fiscalRecords.length === 0}>Exportar auditoria</button>
                </form>
                <p>{auditExportResult ? `${auditExportResult.status} - ${auditExportResult.target_path}` : "Informe JSON de trazabilidad local, no certificacion."}</p>
              </section>

              <section className="panel lists" aria-label="Registros locales">
                <DataList
                  title="Auditoria"
                  empty="Sin eventos"
                  rows={audit.map((item) => `${item.action} - ${item.actor} - ${short(item.hash)}`)}
                  footer={<Pager regionLabel="Pagina auditoria" prevLabel="Anterior auditoria" nextLabel="Siguiente auditoria" page={auditPage} hasNext={audit.length === PAGE_SIZE} onPrev={() => void changeAuditPage(auditPage - 1)} onNext={() => void changeAuditPage(auditPage + 1)} />}
                />
                <DataList
                  title="Fiscal"
                  empty="Sin registros"
                  rows={fiscalRecords.map((item) => `${item.record_type} - ${short(item.fiscal_hash)} - prev ${short(item.previous_fiscal_hash)} - ${item.status}`)}
                  footer={<Pager regionLabel="Pagina fiscal" prevLabel="Anterior fiscal" nextLabel="Siguiente fiscal" page={fiscalPage} hasNext={fiscalRecords.length === PAGE_SIZE} onPrev={() => void changeFiscalPage(fiscalPage - 1)} onNext={() => void changeFiscalPage(fiscalPage + 1)} />}
                />
              </section>
            </>
          ) : null}

          {view === "verifactu" ? (
            <section className="panel split">
              <div className="stack">
                <h2>XML VERI*FACTU</h2>
                <form className="backupForm pathForm" onSubmit={exportXml}>
                  <input aria-label="Ruta XML VERIFACTU" value={xmlPath} readOnly />
                  <button type="button" className="linkButton" onClick={() => void pickSavePath("XML VERIFACTU", xmlPath, ["xml"], setXmlPath)}>
                    <FolderOpen size={16} aria-hidden="true" />
                    Elegir XML
                  </button>
                  <button className="primary" disabled={!canExportXml}>Exportar XML</button>
                </form>
                <p>{xmlResult ? `${xmlResult.status} - XSD ${xmlResult.xsd_validated ? "OK" : "NO"} - ${xmlResult.target_path}` : "Borrador tecnico: XSD local, sin firma ni envio."}</p>
                <h2>XML anulacion</h2>
                <form className="backupForm pathForm" onSubmit={exportCancelXml}>
                  <input aria-label="Ruta XML anulacion" value={cancelXmlPath} readOnly />
                  <button type="button" className="linkButton" onClick={() => void pickSavePath("XML anulacion", cancelXmlPath, ["xml"], setCancelXmlPath)}>
                    <FolderOpen size={16} aria-hidden="true" />
                    Elegir anulacion
                  </button>
                  <button className="primary" disabled={!canExportXml}>Exportar anulacion</button>
                </form>
                <p>{cancelXmlResult ? `${cancelXmlResult.status} - XSD ${cancelXmlResult.xsd_validated ? "OK" : "NO"} - ${cancelXmlResult.target_path}` : "Borrador de anulacion: valida XSD y registra estado fiscal."}</p>
                <h2>Firma/envio</h2>
                <form className="backupForm" onSubmit={prepareSubmission}>
                  <input value={submission?.xml_sha256 ?? "XML SHA256 pendiente"} readOnly />
                  <button className="primary" disabled={!xmlResult && !cancelXmlResult}>Preparar</button>
                </form>
                <p>{submission ? `${submission.signature_status} - ${submission.transmission_status} - ${short(submission.xml_sha256)} - export ${short(submission.export_id)}` : "Prepara paquete local: XSD, SHA256 y estado pendiente de XAdES/envio."}</p>
                <h2>Preflight XAdES</h2>
                <form className="backupForm" onSubmit={preflightXadesSidecar}>
                  <input value={xadesSidecarUrl} onChange={(event) => setXadesSidecarUrl(event.target.value)} />
                  <input value={xadesCertRef} onChange={(event) => setXadesCertRef(event.target.value)} />
                  <button className="primary" disabled={!submission}>Preflight XAdES</button>
                </form>
                <p>{xadesPreflight ? `${xadesPreflight.status} - ${xadesPreflight.sidecar_endpoint} - ref ${xadesPreflight.certificate_ref_status} - llamada externa ${xadesPreflight.external_call_performed ? "SI" : "NO"} - ${xadesPreflight.blockers.join(", ") || "sin bloqueos"}` : "Comprueba sidecar local, hash XML, vault ref y flag; no llama al sidecar."}</p>
                <form className="backupForm pathForm" onSubmit={signWithXadesSidecar}>
                  <input aria-label="Ruta XML firmado" value={signedXmlPath} readOnly />
                  <button type="button" className="linkButton" onClick={() => void pickSavePath("XML firmado", signedXmlPath, ["xml"], setSignedXmlPath)}>
                    <FolderOpen size={16} aria-hidden="true" />
                    Elegir firmado
                  </button>
                  <button className="primary" disabled={!submission || !xadesPreflight?.ready}>Firmar XAdES</button>
                </form>
                <p>{xadesSignature ? `${xadesSignature.signature_status} - ${xadesSignature.signature_mode} - sidecar ${xadesSignature.sidecar_call_performed ? "SI" : "NO"} - AEAT ${xadesSignature.external_call_performed ? "SI" : "NO"} - ${short(xadesSignature.xml_sha256)}` : "Llama al sidecar local con HMAC y exige XAdES real; no llama a AEAT."}</p>
                <h2>Preflight AEAT</h2>
                <form className="backupForm" onSubmit={preflightAeatTransport}>
                  <input value={aeatEndpoint} onChange={(event) => setAeatEndpoint(event.target.value)} />
                  <button className="primary" disabled={!submission}>Preflight AEAT</button>
                </form>
                <p>{transportPreflight ? `${transportPreflight.status} - ${transportPreflight.endpoint_name} - llamada externa ${transportPreflight.external_call_performed ? "SI" : "NO"} - ${transportPreflight.blockers.join(", ") || "sin bloqueos"}` : "Comprueba endpoint WSDL, hash, XAdES y flag; no llama a AEAT."}</p>
                <h2>Preflight envio sidecar</h2>
                <form className="backupForm" onSubmit={preflightSubmitSidecar}>
                  <input value={submitSidecarUrl} onChange={(event) => setSubmitSidecarUrl(event.target.value)} />
                  <input value={aeatEndpointName} onChange={(event) => setAeatEndpointName(event.target.value)} />
                  <button className="primary" disabled={!submission || submission.signature_status !== "signed_xades"}>Preflight envio sidecar</button>
                </form>
                <p>{submitPreflight ? `${submitPreflight.status} - ${submitPreflight.sidecar_endpoint} - ${submitPreflight.endpoint_name} - sidecar ${submitPreflight.sidecar_call_performed ? "SI" : "NO"} - AEAT ${submitPreflight.external_call_performed ? "SI" : "NO"} - ${submitPreflight.blockers.join(", ") || "sin bloqueos"}` : "Llama al sidecar local con HMAC para readiness WSDL/vault/flags; sin llamada AEAT real ni CSV."}</p>
                <h2>Enviar via sidecar</h2>
                <form className="backupForm" onSubmit={invokeSubmitSidecar}>
                  <input value={invokeSidecarUrl} onChange={(event) => setInvokeSidecarUrl(event.target.value)} />
                  <button className="primary" disabled={!submission || !submitPreflight?.ready}>Enviar via sidecar</button>
                </form>
                <p>{submitInvocation ? `${submitInvocation.transmission_status} - ${submitInvocation.operation} - sidecar ${submitInvocation.sidecar_call_performed ? "SI" : "NO"} - AEAT ${submitInvocation.external_call_performed ? "SI" : "NO"} - CSV ${submitInvocation.csv ?? "sin CSV"}` : "Frontera final: solo sidecar local con HMAC puede invocar AEAT; gate usa sidecar falso, sin aceptacion real."}</p>
              </div>
              <div className="statusBox">
                <FileCode2 size={24} aria-hidden="true" />
                <strong>SQLite local</strong>
                <span>{fiscalChain?.valid ? `Cadena fiscal OK (${fiscalChain.total_records})` : "Runtime, PDF, backup y XML cableados."}</span>
              </div>
            </section>
          ) : null}

          {view === "sidecar" ? (
            <section className="panel sidecarChannels" aria-label="Canales ContaPro sidecar">
              <div className="editorTop">
                <div>
                  <h2>Canales ContaPro sidecar</h2>
                  <p>{sidecarCapabilities ? `${sidecarCapabilities.source_project} - MVP ${mvpSidecarChannels} - diferido ${deferredSidecarChannels}` : "Cargando evidencia importada."}</p>
                </div>
                <button type="button" className="linkButton" onClick={() => void loadDefaults()}>
                  <RefreshCw size={16} aria-hidden="true" />
                  Recargar sidecar
                </button>
              </div>
              <div className="auditSummary" aria-label="Resumen canales sidecar">
                {(sidecarCapabilities?.channels ?? []).map((channel) => (
                  <div key={channel.channel}>
                    <strong>{channel.channel.toUpperCase()}</strong>
                    <span>{channel.mvp_importable ? "MVP" : channel.status}</span>
                  </div>
                ))}
              </div>
              <p>Importado de ContaPro para MVP: {mvpSidecarChannels}. FACe y TicketBAI quedan diferidos. CumpleFactura no llama a AEAT/SII/FACe/forales durante la importacion.</p>
              <div className="sidecarForms">
                <form className="backupForm" onSubmit={preflightSiiSidecar}>
                  <h3>SII sidecar</h3>
                  <input aria-label="Libro SII" value={siiBook} onChange={(event) => setSiiBook(event.target.value)} />
                  <input aria-label="Endpoint SII" value={siiEndpointName} onChange={(event) => setSiiEndpointName(event.target.value)} />
                  <input aria-label="URL sidecar SII" value={siiSidecarUrl} onChange={(event) => setSiiSidecarUrl(event.target.value)} />
                  <button className="primary" disabled={!siiChannel?.mvp_importable}>Preflight SII sidecar</button>
                </form>
                <p>{siiPreflight ? `${siiPreflight.status} - ${siiPreflight.sidecar_endpoint} - sidecar ${siiPreflight.sidecar_call_performed ? "SI" : "NO"} - AEAT ${siiPreflight.external_call_performed ? "SI" : "NO"} - ${siiPreflight.blockers.join(", ") || "sin bloqueos"}` : `MVP ${siiChannel?.mvp_importable ? "importable" : "no listo"} - acceptance ${siiChannel?.acceptance_status ?? "missing"}. Preflight local; sin SOAP AEAT.`}</p>
                <form className="backupForm" onSubmit={preflightTicketBaiSidecar}>
                  <h3>TicketBAI sidecar</h3>
                  <select aria-label="Territorio TicketBAI" value={ticketbaiTerritorio} onChange={(event) => setTicketbaiTerritorio(event.target.value)}>
                    <option value="bizkaia">bizkaia</option>
                    <option value="gipuzkoa">gipuzkoa</option>
                    <option value="araba">araba</option>
                  </select>
                  <input aria-label="Endpoint TicketBAI" value={ticketbaiEndpoint} onChange={(event) => setTicketbaiEndpoint(event.target.value)} />
                  <input aria-label="URL sidecar TicketBAI" value={ticketbaiSidecarUrl} onChange={(event) => setTicketbaiSidecarUrl(event.target.value)} />
                  <button className="primary" disabled={!ticketbaiChannel?.mvp_importable}>Preflight TicketBAI sidecar</button>
                </form>
                <p>{ticketbaiPreflight ? `${ticketbaiPreflight.status} - ${ticketbaiPreflight.sidecar_endpoint} - sidecar ${ticketbaiPreflight.sidecar_call_performed ? "SI" : "NO"} - foral ${ticketbaiPreflight.external_call_performed ? "SI" : "NO"} - ${ticketbaiPreflight.blockers.join(", ") || "sin bloqueos"}` : `Diferido: ${ticketbaiChannel?.deferred_reason ?? "sin evidencia MVP aceptada"}; homologacion foral sigue bloqueada.`}</p>
              </div>
            </section>
          ) : null}

          {view === "emisor" ? (
            <>
              <section className="panel entityForms single">
                <form onSubmit={saveCompany}>
                  <div className="formTitle">
                    <h2>Empresa emisora</h2>
                    <button type="button" className="linkButton" onClick={newCompanyForm}>Nueva empresa</button>
                  </div>
                  <label className="fieldBlock">
                    <span>Empresa activa</span>
                    <select aria-label="Empresa activa" value={company?.id ?? ""} onChange={(event) => selectCompany(event.target.value)}>
                      <option value="">Nueva empresa</option>
                      {companies.map((item) => <option key={item.id} value={item.id}>{item.legal_name} - {item.tax_id}</option>)}
                    </select>
                  </label>
                  <div className="formGrid">
                    <label className="fieldBlock"><span>Nombre legal</span><input aria-label="Nombre legal empresa" required value={companyForm.legal_name} onChange={(event) => updateCompanyForm("legal_name", event.target.value)} /></label>
                    <label className="fieldBlock"><span>NIF/CIF</span><input aria-label="NIF empresa" required value={companyForm.tax_id} onChange={(event) => updateCompanyForm("tax_id", event.target.value)} /></label>
                    <label className="fieldBlock wide"><span>Direccion</span><input aria-label="Direccion empresa" required value={companyForm.address} onChange={(event) => updateCompanyForm("address", event.target.value)} /></label>
                    <label className="fieldBlock"><span>CP</span><input aria-label="CP empresa" required value={companyForm.postal_code} onChange={(event) => updateCompanyForm("postal_code", event.target.value)} /></label>
                    <label className="fieldBlock"><span>Municipio</span><input aria-label="Municipio empresa" required value={companyForm.municipality} onChange={(event) => updateCompanyForm("municipality", event.target.value)} /></label>
                    <label className="fieldBlock"><span>Provincia</span><input aria-label="Provincia empresa" required value={companyForm.province} onChange={(event) => updateCompanyForm("province", event.target.value)} /></label>
                    <label className="fieldBlock"><span>Pais</span><input aria-label="Pais empresa" required value={companyForm.country_code} onChange={(event) => updateCompanyForm("country_code", event.target.value.toUpperCase())} /></label>
                    <label className="fieldBlock"><span>Serie por defecto</span><input aria-label="Serie por defecto empresa" value={companyForm.default_series} onChange={(event) => updateCompanyForm("default_series", event.target.value.toUpperCase())} /></label>
                  </div>
                  <button className="primary">Guardar emisor</button>
                </form>
              </section>
              <section className="panel lists single" aria-label="Listado empresas emisoras">
                <DataList title="Empresas" empty="Sin empresas" rows={companies.map((item) => `${item.legal_name} - ${item.tax_id}`)} />
              </section>
            </>
          ) : null}

          {view === "series" ? (
            <section className="panel seriesPanel">
              <div>
                <h2>Series de facturacion</h2>
                <p>Configura continuar numeracion anterior o crear serie nueva. Ejemplos: VENDI202601, AL-001, C-001, I-001.</p>
              </div>
              <form className="seriesForm" onSubmit={configureSeries}>
                <input value={seriesLabel} onChange={(event) => setSeriesLabel(event.target.value)} placeholder="Nombre" />
                <input value={seriesCode} onChange={(event) => setSeriesCode(event.target.value)} placeholder="Serie" />
                <input type="number" value={seriesFiscalYear} onChange={(event) => setSeriesFiscalYear(Number(event.target.value))} />
                <label className="checkLine">
                  <input type="checkbox" checked={seriesIncludeYear} onChange={(event) => setSeriesIncludeYear(event.target.checked)} />
                  Incluir año
                </label>
                <input value={seriesSeparator} onChange={(event) => setSeriesSeparator(event.target.value)} placeholder="Separador" />
                <input type="number" value={seriesPadding} min={1} max={12} onChange={(event) => setSeriesPadding(Number(event.target.value))} />
                <input type="number" value={seriesNextNumber} min={1} onChange={(event) => setSeriesNextNumber(Number(event.target.value))} />
                <button className="primary" disabled={!company}>Guardar serie</button>
              </form>
              <div className="seriesQuick">
                <button type="button" onClick={() => { setSeriesLabel("Vendingsaiz Aragon"); setSeriesCode("VENDI"); setSeriesIncludeYear(true); setSeriesSeparator(""); setSeriesPadding(2); }}>
                  Usar VENDI2026XX
                </button>
                <button type="button" onClick={() => { setSeriesLabel("Alquiler"); setSeriesCode("AL"); setSeriesIncludeYear(false); setSeriesSeparator("-"); setSeriesPadding(3); }}>
                  Usar AL-XXX
                </button>
                <button type="button" onClick={() => { setSeriesLabel("Construccion"); setSeriesCode("C"); setSeriesIncludeYear(false); setSeriesSeparator("-"); setSeriesPadding(3); }}>
                  Usar C-XXX
                </button>
                <button type="button" onClick={() => { setSeriesLabel("Inmovilizado"); setSeriesCode("I"); setSeriesIncludeYear(false); setSeriesSeparator("-"); setSeriesPadding(3); }}>
                  Usar I-XXX
                </button>
              </div>
              <p>Activa: {selectedSeries ? `${selectedSeries.label} - ${selectedSeries.preview}` : `${activeSeriesPreview} sin configurar`}</p>
              <DataList title="Series" empty="Sin series configuradas" rows={seriesConfigs.map((item) => `${item.label} - ${item.preview} - siguiente ${item.next_number}`)} />
            </section>
          ) : null}

          {view === "qr" ? <QrSettingsView settings={appSettings} onSaved={(saved) => setAppSettings(saved)} run={run} /> : null}

          {view === "email" ? <EmailSettingsView run={run} /> : null}

          {view === "copias" ? (
            <section className="panel exportPanel">
              <div className="stack">
                <h2>Backup local</h2>
                <form className="backupForm pathForm" onSubmit={exportBackup}>
                  <input aria-label="Ruta backup SQLite" value={backupPath} readOnly />
                  <button type="button" className="linkButton" onClick={() => void pickSavePath("Backup SQLite", backupPath, ["sqlite3", "sqlite", "db"], setBackupPath)}>
                    <FolderOpen size={16} aria-hidden="true" />
                    Elegir backup
                  </button>
                  <button className="primary">Exportar SQLite</button>
                </form>
                <p>{backup ? `${backup.status} - ${backup.target_path}` : "Crea copia SQLite con VACUUM INTO."}</p>
                <h2>Restore backup</h2>
                <form className="backupForm pathForm" onSubmit={restoreBackup}>
                  <input aria-label="Ruta restore backup" value={restorePath} readOnly placeholder="Ruta .sqlite3/.db" />
                  <button type="button" className="linkButton" onClick={() => void pickRestoreFile()}>
                    <FolderOpen size={16} aria-hidden="true" />
                    Elegir restore
                  </button>
                  <button className="primary" disabled={!restorePath}>Validar restore</button>
                </form>
                <p>{restore ? `${restore.status} - destructivo ${restore.destructive_restore_performed ? "SI" : "NO"} - ${restore.source_path}` : "Preflight local: valida origen, no reemplaza la base activa."}</p>
              </div>
            </section>
          ) : null}
        </main>
      </div>
    </div>
  );
}

function chainRows(result: FiscalChainVerification) {
  if (result.valid) return [`OK - ${result.total_records} registros fiscales`];
  return result.issues.map((issue) => `${issue.severity} - ${issue.code} - ${short(issue.record_id)} - ${issue.message}`);
}

function DataList({ title, empty, rows, footer }: { title: string; empty: string; rows: string[]; footer?: ReactNode }) {
  return (
    <div className="dataList">
      <h2>{title}</h2>
      {rows.length === 0 ? <p>{empty}</p> : <ul>{rows.map((row) => <li key={row}>{row}</li>)}</ul>}
      {footer}
    </div>
  );
}

function Pager({
  regionLabel,
  prevLabel,
  nextLabel,
  page,
  hasNext,
  onPrev,
  onNext,
}: {
  regionLabel: string;
  prevLabel: string;
  nextLabel: string;
  page: number;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="pager" aria-label={regionLabel}>
      <button type="button" onClick={onPrev} disabled={page === 0}>{prevLabel}</button>
      <span>Pagina {page + 1}</span>
      <button type="button" onClick={onNext} disabled={!hasNext}>{nextLabel}</button>
    </div>
  );
}

function ReceivedInvoicesView() {
  return (
    <>
      <section className="panel receivedPanel" aria-label="Bandeja de recibidas">
        <div className="editorTop">
          <div>
            <h2>Bandeja de recibidas</h2>
            <p>Cuando una empresa conectada en la red te emita una factura, aparecera aqui sin teclearla.</p>
          </div>
          <span className="statusTag">Requiere red CumpleFactura</span>
        </div>
        <div className="dataTable" role="table" aria-label="Facturas recibidas">
          <div className="dataTableHead" role="row">
            <span role="columnheader">Fecha</span>
            <span role="columnheader">Emisor</span>
            <span role="columnheader">NIF</span>
            <span role="columnheader">Numero</span>
            <span role="columnheader">Base</span>
            <span role="columnheader">IVA</span>
            <span role="columnheader">Total</span>
            <span role="columnheader">Estado</span>
          </div>
          <p className="emptyState">Sin facturas recibidas todavia.</p>
        </div>
      </section>
      <section className="panel infoGrid" aria-label="Como funcionara">
        <div>
          <strong>1. Conecta</strong>
          <p>Busca a tu proveedor en Red de empresas o invitale con una cuenta gratuita solo para recibir.</p>
        </div>
        <div>
          <strong>2. Recibe</strong>
          <p>Su factura emitida llega firmada y con hash; se registra aqui como recibida.</p>
        </div>
        <div>
          <strong>3. Contabiliza</strong>
          <p>Exporta emitidas y recibidas en formato importable por ContaPro.</p>
        </div>
      </section>
    </>
  );
}

function CompanyNetworkView() {
  return (
    <>
      <section className="panel networkPanel" aria-label="Buscar empresas en la red">
        <div className="editorTop">
          <div>
            <h2>Buscar empresas</h2>
            <p>Directorio de empresas que usan CumpleFactura y aceptan intercambio de facturas.</p>
          </div>
          <span className="statusTag">Requiere red CumpleFactura</span>
        </div>
        <form className="networkSearch" onSubmit={(event) => event.preventDefault()}>
          <label className="fieldBlock">
            <span>Nombre o NIF</span>
            <input aria-label="Buscar empresa en la red" placeholder="Ej. B12345678 o nombre comercial" disabled />
          </label>
          <button className="primary" disabled>
            <Search size={16} aria-hidden="true" />
            Buscar
          </button>
        </form>
        <p className="emptyState">La busqueda se activara cuando el servicio de red este disponible. Tus datos solo se publican si das tu consentimiento.</p>
      </section>
      <section className="panel infoGrid" aria-label="Tipos de cuenta">
        <div>
          <strong>Cuenta completa</strong>
          <p>Emite y recibe facturas, con VERI*FACTU y exportacion a ContaPro.</p>
        </div>
        <div>
          <strong>Cuenta gratuita</strong>
          <p>Solo recibe facturas de empresas de la red y descarga sus PDF/XML.</p>
        </div>
        <div>
          <strong>B2B y B2C</strong>
          <p>Empresas, autonomos y particulares pueden recibir sus facturas en la misma bandeja.</p>
        </div>
      </section>
    </>
  );
}
