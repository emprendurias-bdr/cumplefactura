/** Tipos espejo de contratos Tauri / formularios UI. */
export type Company = {
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
export type InvoiceSeriesConfig = {
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
export type Customer = {
  id: string;
  display_name: string;
  tax_id: string;
  kind: string;
  address: string;
  postal_code: string;
  municipality: string;
  province: string;
  country_code: string;
  updated_at?: string;
};
export type Product = {
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
export type Invoice = { id: string; series: string; number?: number | null; totals: { total_cents: number } };
export type IssuedInvoice = { invoice: Invoice; fiscal_hash: string; audit_hash: string };
export type InvoiceSummary = {
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
export type AuditSummary = { id: string; action: string; actor: string; hash: string; occurred_at: string };
export type FiscalRecordSummary = {
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
export type FiscalChainVerification = {
  valid: boolean;
  total_records: number;
  issue_count: number;
  last_hash_by_company: FiscalCompanyChainHead[];
  issues: FiscalChainIssue[];
};
export type RectificationAdvice = {
  reason_code: string;
  method: string;
  confidence: string;
  source_refs: string[];
  notes: string[];
  warnings: string[];
};
export type BackupResult = { target_path: string; status: string; notes: string[] };
export type BackupRestoreResult = { source_path: string; status: string; destructive_restore_performed: boolean; notes: string[] };
export type ExportResult = { target_path: string; status: string; notes: string[] };
export type AppDefaults = {
  app_data_dir: string;
  export_dir: string;
  generated_at: string;
  notes: string[];
};
export type AppSettings = {
  export_dir?: string | null;
  default_territory_flags: string[];
  onboarding_completed: boolean;
  verifactu_endpoint_name: string;
  updated_at: string;
};
export type NextNumberPreview = {
  company_id: string;
  fiscal_year: number;
  series: string;
  next_number: number;
  source: string;
};
export type InvoiceLineForm = {
  id: string;
  description: string;
  quantity: string;
  unit_price_euros: string;
  discount_rate_percent: string;
  tax_rate_percent: string;
  withholding_rate_percent: string;
};
export type InvoiceLineInput = {
  description: string;
  quantity: number;
  unit_price_cents: number;
  discount_rate_basis_points: number | null;
  tax_rate_basis_points: number;
  withholding_rate_basis_points: number | null;
};
export type CompanyForm = Omit<Company, "id" | "created_at">;
export type CustomerForm = Omit<Customer, "id" | "updated_at">;
export type ProductForm = {
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
/** XML exportado y validado; `export_id` + `xml_sha256` habilitan el envío. */
export type VerifactuXmlResult = {
  target_path: string;
  status: string;
  xsd_validated: boolean;
  export_id: string;
  xml_sha256: string;
  xml_bytes: number;
  notes: string[];
};
/** Lo que se envía: el último XML exportado (alta o anulación). */
export type SubmissionPackage = { invoice_id: string; export_id: string; xml_path: string; xml_sha256: string };
/** Respuesta del sidecar a `verifactu_submit_preflight`. Nunca llama a la AEAT. */
export type SubmitPreflight = {
  status: "ready" | "blocked";
  blockers: string[];
  warnings: string[];
  endpoint_name: string;
  endpoint_allowed: boolean;
  certificate_loaded: boolean;
  certificate_source: string | null;
  aeat_calls_enabled: boolean;
  production_enabled: boolean;
  external_call_performed: boolean;
};
/** Respuesta AEAT interpretada por el sidecar y guardada como evidencia. */
export type VerifactuSubmission = {
  invoice_id: string;
  export_id: string;
  submission_id: string | null;
  xml_sha256: string;
  endpoint_name: string;
  operation: string;
  status: "accepted" | "accepted_with_errors" | "rejected" | "transport_error";
  http_status: number | null;
  csv: string | null;
  estado_envio: string | null;
  estado_registro: string | null;
  codigo_error: string | null;
  descripcion_error: string | null;
  tiempo_espera_envio_seconds: number | null;
  soap_fault: string | null;
  external_call_performed: boolean;
};

/** Puertos SOAP del WSDL VERI*FACTU. Producción queda bloqueada por el sidecar en v1. */
export const VERIFACTU_ENDPOINTS = [
  { id: "SistemaVerifactuPruebas", label: "Pruebas AEAT" },
  { id: "SistemaVerifactuSelloPruebas", label: "Pruebas AEAT (certificado de sello)" },
  { id: "SistemaVerifactu", label: "Produccion AEAT" },
  { id: "SistemaVerifactuSello", label: "Produccion AEAT (certificado de sello)" },
] as const;

/** Rutas de exportación que la UI mantiene; todas cuelgan de la carpeta export. */
export type PathKey = "backup" | "restore" | "pdf" | "xml" | "cancelXml" | "json" | "csv" | "audit";

/** Filtros del listado de facturas tal y como los edita la UI. */
export type InvoiceFilterForm = {
  search: string;
  company_id: string;
  customer_id: string;
  fiscal_year: string;
  series: string;
  status: string;
  kind: string;
};

/** Formulario de configuración de serie. */
export type SeriesForm = {
  label: string;
  series_code: string;
  fiscal_year: number;
  include_year: boolean;
  separator: string;
  padding: number;
  next_number: number;
};

export type AppSection = "panel" | "empresas" | "clientes" | "facturas" | "fiscal" | "ajustes";

export const NAV_ITEMS: { id: AppSection; label: string }[] = [
  { id: "panel", label: "Panel" },
  { id: "empresas", label: "Empresas" },
  { id: "clientes", label: "Clientes" },
  { id: "facturas", label: "Facturas" },
  { id: "fiscal", label: "Fiscal" },
  { id: "ajustes", label: "Ajustes" },
];

export const PAGE_SIZE = 5;
