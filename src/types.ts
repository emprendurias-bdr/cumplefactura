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
export type InvoiceTotals = { taxable_base_cents: number; tax_cents: number; withholding_cents: number; total_cents: number };
/** Línea tal como la devuelve Rust (importes calculados en céntimos). */
export type InvoiceLine = {
  id?: string;
  description: string;
  quantity: number;
  unit_price_cents: number;
  discount_rate_basis_points?: number | null;
  tax_rate_basis_points: number;
  withholding_rate_basis_points?: number | null;
  taxable_base_cents?: number;
};
/** Factura completa (`invoice_draft_create`, `invoice_issue`, `commercial_document_to_invoice_draft`). */
export type Invoice = {
  id: string;
  company_id?: string;
  customer_id?: string;
  fiscal_year?: number;
  series: string;
  number?: number | null;
  kind?: string;
  status?: string;
  lines?: InvoiceLine[];
  totals: InvoiceTotals | { total_cents: number };
  created_at?: string;
  issued_at?: string | null;
};
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
  fiscal_year?: number;
  created_at?: string;
  issued_at?: string | null;
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
export type FiscalChainIssue = {
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
/** F3: `status` = validated-only · restored · rolled_back; `safety_backup_path` y `chain_ok` tras restaurar. */
export type BackupRestoreResult = {
  source_path: string;
  status: string;
  destructive_restore_performed: boolean;
  notes: string[];
  safety_backup_path?: string | null;
  chain_ok?: boolean | null;
};
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
  /** F3 (ADR-002): dónde se guarda la contraseña del certificado. Por defecto, solo en memoria. */
  certificate_password_mode?: CertificatePasswordMode;
  /** F3: entorno del QR tributario del PDF. */
  qr_environment?: "test" | "production";
  updated_at: string;
};
export type CertificatePasswordMode = "session" | "keychain" | "env";
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
  /** F3: caducidad leída del certificado; null si no se pudo leer. */
  certificate_expires_at?: string | null;
  certificate_expires_in_days?: number | null;
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

/** F3: fila de `verifactu_submissions` (`verifactu_submission_list`), también `transport_error`. */
export type VerifactuSubmissionSummary = {
  id: string;
  invoice_id: string;
  fiscal_export_id: string;
  endpoint_name: string;
  xml_sha256: string;
  status: VerifactuSubmission["status"];
  csv: string | null;
  estado_envio: string | null;
  estado_registro: string | null;
  codigo_error: string | null;
  descripcion_error: string | null;
  tiempo_espera_envio_seconds: number | null;
  submitted_at: string;
};

/** Puertos SOAP del WSDL VERI*FACTU (ids técnicos; los nombres visibles están en i18n). */
export const VERIFACTU_ENDPOINTS = [
  "SistemaVerifactuPruebas",
  "SistemaVerifactuSelloPruebas",
  "SistemaVerifactu",
  "SistemaVerifactuSello",
] as const;

/* --- F4: documentos comerciales (docs/ESPEC_DOCUMENTOS_Y_RECURRENTES.md §3–§4) --- */
export type CommercialKind = "quote" | "proforma" | "delivery_note";
export type CommercialStatus =
  | "draft" | "sent" | "accepted" | "rejected" | "expired" | "converted"
  | "paid" | "delivered" | "invoiced" | "void" | "superseded";
export type CommercialDocumentLine = InvoiceLineInput & { position: number; product_id?: string | null };
export type CommercialDocumentSummary = {
  id: string;
  company_id: string;
  customer_id: string;
  kind: CommercialKind;
  series_code: string;
  fiscal_year: number;
  number: number | null;
  display_number: string | null;
  status: CommercialStatus;
  issue_date: string;
  valid_until: string | null;
  delivery_date: string | null;
  show_prices: boolean;
  notes: string;
  taxable_base_cents: number;
  tax_cents: number;
  withholding_cents: number;
  total_cents: number;
  source_document_id: string | null;
  invoice_id: string | null;
  void_reason: string | null;
  created_at: string;
  updated_at: string;
};
export type CommercialDocument = CommercialDocumentSummary & { lines: CommercialDocumentLine[] };
/** Entrada de `commercial_document_save_draft`: sin número ni totales (los calcula Rust). */
export type CommercialDocumentInput = {
  id?: string;
  company_id: string;
  customer_id: string;
  kind: CommercialKind;
  series_code?: string;
  issue_date: string;
  valid_until: string | null;
  delivery_date: string | null;
  show_prices: boolean;
  notes: string;
  lines: CommercialDocumentLine[];
};

/* --- F4: facturas recurrentes (§3.5) --- */
export type Frequency = "monthly" | "quarterly" | "yearly";
export type RecurringInvoice = {
  id: string;
  company_id: string;
  customer_id: string;
  label: string;
  series_code: string;
  frequency: Frequency;
  day_of_period: number;
  start_date: string;
  end_date: string | null;
  next_run_date: string;
  template: { lines: InvoiceLineInput[]; notes: string };
  active: boolean;
  last_period_key: string | null;
  total_cents: number;
  created_at: string;
  updated_at: string;
};
/** Entrada de `recurring_save` / `recurring_preview`: sin `id` crea; con `id` actualiza. */
export type RecurringInput = {
  id?: string;
  company_id: string;
  customer_id: string;
  label: string;
  series_code: string;
  frequency: Frequency;
  day_of_period: number;
  start_date: string;
  end_date?: string | null;
  template: { lines: InvoiceLineInput[]; notes: string };
};
export type RecurringRun = { period_key: string; run_date: string; total_cents: number };
export type RecurringGenerateResult = { created: string[]; skipped: string[] };

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

export const PAGE_SIZE = 25;
