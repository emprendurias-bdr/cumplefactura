/**
 * Estado y acciones de la app. Las secciones de `src/sections/` solo pintan lo
 * que devuelve este hook; aquí viven las llamadas a Rust (`invoke`).
 *
 * Patrón de cada acción: `action(etiqueta, llamada, alTerminar)` devuelve un
 * manejador de formulario que muestra "etiqueta..." en la barra de estado, llama a
 * Rust y deja "etiqueta: OK" o el error. Así no se repite try/catch en cada botón.
 */
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  companyToForm,
  customerToForm,
  editorTotals,
  emptyCompanyForm,
  emptyCustomerForm,
  emptyFilterForm,
  emptyProductForm,
  eurosToCents,
  exportPaths,
  filtersToInput,
  isInvoiceLineReady,
  lineToInput,
  listPagination,
  newInvoiceLine,
  percentToBasisPoints,
  productToForm,
  productToInvoiceLine,
  resolvedSeriesCode,
} from "./lib/format";
import type {
  AppDefaults,
  AppSettings,
  AuditSummary,
  BackupRestoreResult,
  BackupResult,
  Company,
  CompanyForm,
  Customer,
  CustomerForm,
  ExportResult,
  FiscalChainVerification,
  FiscalRecordSummary,
  Invoice,
  InvoiceFilterForm,
  InvoiceLineForm,
  InvoiceSeriesConfig,
  InvoiceSummary,
  IssuedInvoice,
  NextNumberPreview,
  PathKey,
  Product,
  ProductForm,
  RectificationAdvice,
  SeriesForm,
  SubmissionPackage,
  SubmitPreflight,
  VerifactuSubmission,
  VerifactuXmlResult,
} from "./types";

type Pages = { invoice: number; audit: number; fiscal: number };

const SERIES_PRESETS: Record<string, Pick<SeriesForm, "label" | "series_code" | "include_year" | "separator" | "padding">> = {
  VENDI: { label: "Vendingsaiz Aragon", series_code: "VENDI", include_year: true, separator: "", padding: 2 },
  AL: { label: "Alquiler", series_code: "AL", include_year: false, separator: "-", padding: 3 },
  C: { label: "Construccion", series_code: "C", include_year: false, separator: "-", padding: 3 },
  I: { label: "Inmovilizado", series_code: "I", include_year: false, separator: "-", padding: 3 },
};

/** Lanza un error con `message` si falta `value`; lo muestra `action` en la barra de estado. */
function need<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) throw new Error(message);
  return value;
}

export function useCumpleFactura() {
  const [status, setStatus] = useState("Listo");
  const [demoSeedEnabled, setDemoSeedEnabled] = useState(false);

  // Entidades activas y sus formularios
  const [company, setCompany] = useState<Company | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [companyForm, setCompanyForm] = useState<CompanyForm>(emptyCompanyForm());
  const [customerForm, setCustomerForm] = useState<CustomerForm>(emptyCustomerForm());
  const [productForm, setProductForm] = useState<ProductForm>(emptyProductForm());

  // Listados y verificación de cadena
  const [companies, setCompanies] = useState<Company[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([]);
  const [audit, setAudit] = useState<AuditSummary[]>([]);
  const [fiscalRecords, setFiscalRecords] = useState<FiscalRecordSummary[]>([]);
  const [fiscalChain, setFiscalChain] = useState<FiscalChainVerification | null>(null);
  const [filters, setFilters] = useState<InvoiceFilterForm>(emptyFilterForm());
  const [pages, setPages] = useState<Pages>({ invoice: 0, audit: 0, fiscal: 0 });

  // Series y editor de factura
  const [seriesConfigs, setSeriesConfigs] = useState<InvoiceSeriesConfig[]>([]);
  const [selectedSeries, setSelectedSeries] = useState<InvoiceSeriesConfig | null>(null);
  const [seriesForm, setSeriesForm] = useState<SeriesForm>({
    label: "General",
    series_code: "A",
    fiscal_year: new Date().getFullYear(),
    include_year: false,
    separator: "-",
    padding: 3,
    next_number: 1,
  });
  const [invoiceLines, setInvoiceLines] = useState<InvoiceLineForm[]>([newInvoiceLine()]);
  const [draft, setDraft] = useState<Invoice | null>(null);
  const [issued, setIssued] = useState<IssuedInvoice | null>(null);
  const [nextNumber, setNextNumber] = useState(1);
  const [numberPreview, setNumberPreview] = useState<NextNumberPreview | null>(null);
  const [rectificationScenario, setRectificationScenario] = useState("Other");
  const [rectificationReason, setRectificationReason] = useState("R4");
  const [rectificationMethod, setRectificationMethod] = useState("I");
  const [rectificationAdvice, setRectificationAdvice] = useState<RectificationAdvice | null>(null);

  // Ajustes y rutas de exportación
  const [appDefaults, setAppDefaults] = useState<AppDefaults | null>(null);
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const [exportDir, setExportDir] = useState("");
  const [defaultTerritoryFlags, setDefaultTerritoryFlags] = useState<string[]>(["CommonTerritory", "VeriFactu"]);
  const [endpointName, setEndpointName] = useState("SistemaVerifactuPruebas");
  const [paths, setPaths] = useState<Record<PathKey, string>>(exportPaths(""));

  // Resultados de exportaciones
  const [backup, setBackup] = useState<BackupResult | null>(null);
  const [restore, setRestore] = useState<BackupRestoreResult | null>(null);
  const [pdfResult, setPdfResult] = useState<string | null>(null);
  const [jsonResult, setJsonResult] = useState<ExportResult | null>(null);
  const [csvResult, setCsvResult] = useState<ExportResult | null>(null);
  const [auditExportResult, setAuditExportResult] = useState<ExportResult | null>(null);

  // VERI*FACTU: XML exportado, preflight y envío por el sidecar
  const [xmlResult, setXmlResult] = useState<VerifactuXmlResult | null>(null);
  const [cancelXmlResult, setCancelXmlResult] = useState<VerifactuXmlResult | null>(null);
  const [submission, setSubmission] = useState<SubmissionPackage | null>(null);
  const [certificateRef, setCertificateRef] = useState("vault://certs/empresa");
  const [submitPreflight, setSubmitPreflight] = useState<SubmitPreflight | null>(null);
  const [submitResult, setSubmitResult] = useState<VerifactuSubmission | null>(null);

  // Derivados
  const invoiceLinesReady = invoiceLines.length > 0 && invoiceLines.every(isInvoiceLineReady);
  const invoiceTotals = useMemo(() => editorTotals(invoiceLines), [invoiceLines]);
  const canDraft = Boolean(company && customer && invoiceLinesReady);
  const canIssue = Boolean(draft && invoiceLinesReady);
  const issuedInvoiceId = issued?.invoice.id ?? invoices.find((item) => item.status === "Issued")?.id;
  const rectifiableInvoice = invoices.find((item) => item.status === "Issued" && item.kind !== "Rectifying");
  const canExportXml = Boolean(issuedInvoiceId);
  const canRectify = Boolean(rectifiableInvoice);
  const fiscalYear = seriesForm.fiscal_year || new Date().getFullYear();
  const activeSeries = selectedSeries?.resolved_series ?? company?.default_series ?? "A";
  const activeSeriesPreview = selectedSeries?.preview ?? `${activeSeries}-${String(nextNumber).padStart(3, "0")}`;
  const onboardingSteps = [
    { label: "Empresa", ok: Boolean(company) },
    { label: "Fiscalidad", ok: defaultTerritoryFlags.length > 0 },
    { label: "Serie", ok: Boolean(selectedSeries) },
    { label: "Export", ok: Boolean(exportDir.trim()) },
  ];
  const onboardingReady = onboardingSteps.every((step) => step.ok);
  const flowState = issued
    ? "Factura emitida"
    : draft
      ? "Borrador persistido"
      : company && customer
        ? "Emisor y cliente creados"
        : company
          ? "Emisor creado"
          : "Inicio";

  useEffect(() => {
    void loadDefaults();
  }, []);

  useEffect(() => {
    if (company) {
      void loadSeries(company);
      void loadProducts(company.id);
    } else {
      setProducts([]);
    }
  }, [company]);

  /** Muestra progreso y resultado en la barra de estado; relanza el error. */
  async function run<T>(label: string, call: () => Promise<T>) {
    setStatus(`${label}...`);
    try {
      const result = await call();
      setStatus(`${label}: OK`);
      return result;
    } catch (error) {
      setStatus(`${label}: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /** Manejador de formulario: `run` + `onDone`. El error ya queda en la barra de estado. */
  function action<T>(label: string, call: () => Promise<T>, onDone?: (result: T) => void | Promise<void>) {
    return async (event?: FormEvent) => {
      event?.preventDefault();
      try {
        const result = await run(label, call);
        await onDone?.(result);
      } catch {
        // `run` ya mostró el error.
      }
    };
  }

  /* --- Formularios y diálogos nativos --- */

  const updateCompanyForm = (field: keyof CompanyForm, value: string) =>
    setCompanyForm((current) => ({ ...current, [field]: value }));
  const updateCustomerForm = (field: keyof CustomerForm, value: string) =>
    setCustomerForm((current) => ({ ...current, [field]: value }));
  const updateProductForm = <K extends keyof ProductForm>(field: K, value: ProductForm[K]) =>
    setProductForm((current) => ({ ...current, [field]: value }));
  const updateSeriesForm = <K extends keyof SeriesForm>(field: K, value: SeriesForm[K]) =>
    setSeriesForm((current) => ({ ...current, [field]: value }));
  const applySeriesPreset = (preset: keyof typeof SERIES_PRESETS) =>
    setSeriesForm((current) => ({ ...current, ...SERIES_PRESETS[preset] }));
  const updateFilter = (field: keyof InvoiceFilterForm, value: string) =>
    setFilters((current) => ({ ...current, [field]: value }));
  const setPath = (key: PathKey, value: string) => setPaths((current) => ({ ...current, [key]: value }));

  function applyExportDir(dir: string) {
    if (!dir.trim()) return;
    setPaths((current) => ({ ...exportPaths(dir), restore: current.restore }));
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
    applyExportDir(selected);
  }

  /** Diálogo nativo de guardado para la ruta `key`. */
  async function pickSavePath(title: string, key: PathKey, extensions: string[]) {
    const selected = await saveDialog({
      title,
      defaultPath: paths[key] || exportDir || appDefaults?.export_dir,
      filters: [{ name: title, extensions }],
      canCreateDirectories: true,
    });
    if (typeof selected === "string") setPath(key, selected);
  }

  async function pickRestoreFile() {
    const selected = await openDialog({
      title: "Elegir restore",
      defaultPath: paths.restore || exportDir || appDefaults?.export_dir,
      multiple: false,
      directory: false,
      filters: [{ name: "SQLite backup", extensions: ["sqlite", "sqlite3", "db"] }],
    });
    if (typeof selected === "string") setPath("restore", selected);
  }

  function toggleTerritoryFlag(flag: string, checked: boolean) {
    setDefaultTerritoryFlags((current) => {
      const next = checked ? [...new Set([...current, flag])] : current.filter((item) => item !== flag);
      return next.length > 0 ? next : current;
    });
  }

  function resetInvoiceFlow() {
    setDraft(null);
    setIssued(null);
  }

  function newCompanyForm() {
    setCompany(null);
    setCompanyForm(emptyCompanyForm());
    resetInvoiceFlow();
  }

  function newCustomerForm() {
    setCustomer(null);
    setCustomerForm(emptyCustomerForm());
    resetInvoiceFlow();
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
      default_series: resolvedSeriesCode(seriesForm.series_code, fiscalYear, seriesForm.include_year),
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
    const selected = companies.find((item) => item.id === companyId);
    if (!selected) return;
    setCompany(selected);
    setCompanyForm(companyToForm(selected));
    resetInvoiceFlow();
  }

  function selectCustomer(customerId: string) {
    const selected = customers.find((item) => item.id === customerId);
    if (!selected) return;
    setCustomer(selected);
    setCustomerForm(customerToForm(selected));
    resetInvoiceFlow();
  }

  function selectProduct(productId: string) {
    const selected = products.find((item) => item.id === productId);
    if (!selected) return;
    setProduct(selected);
    setProductForm(productToForm(selected));
  }

  /* --- Editor de factura --- */

  function editLines(change: (current: InvoiceLineForm[]) => InvoiceLineForm[]) {
    resetInvoiceFlow();
    setInvoiceLines(change);
  }

  const productToFirstLine = (item: Product) =>
    editLines((current) => [productToInvoiceLine(item, current[0]?.id ?? newInvoiceLine().id), ...current.slice(1)]);
  const updateInvoiceLine = (id: string, field: keyof InvoiceLineForm, value: string) =>
    editLines((current) => current.map((line) => (line.id === id ? { ...line, [field]: value } : line)));
  const addInvoiceLine = () => editLines((current) => [...current, newInvoiceLine()]);
  const removeInvoiceLine = (id: string) =>
    editLines((current) => (current.length === 1 ? current : current.filter((line) => line.id !== id)));

  async function selectInvoiceSeries(seriesId: string) {
    const series = seriesConfigs.find((item) => item.id === seriesId);
    if (!series || !company) return;
    resetInvoiceFlow();
    setSelectedSeries(series);
    updateSeriesForm("fiscal_year", series.fiscal_year);
    await previewNextNumber(company, series.resolved_series, series.fiscal_year);
  }

  /** Borrador `invoice_draft_create`/`invoice_issue` con las líneas del editor. */
  function draftInput() {
    const owner = need(company, "crea la empresa primero");
    const client = need(customer, "crea el cliente primero");
    if (!invoiceLinesReady) throw new Error("completa descripcion, cantidad, precio, descuento, IVA e IRPF");
    return {
      company_id: owner.id,
      customer_id: client.id,
      fiscal_year: fiscalYear,
      series: activeSeries,
      number: null,
      kind: "Complete",
      territory_flags: defaultTerritoryFlags,
      rectifies_invoice_id: null,
      rectification_reason_code: null,
      rectification_method: null,
      lines: invoiceLines.map(lineToInput),
    };
  }

  function issueWith(draftData: ReturnType<typeof draftInput> | Record<string, unknown>) {
    return invoke<IssuedInvoice>("invoice_issue", {
      input: {
        draft: draftData,
        number: nextNumber,
        issued_at: new Date().toISOString(),
        actor: "local-user",
        previous_audit_hash: null,
      },
    });
  }

  async function afterIssue(result: IssuedInvoice) {
    setIssued(result);
    setNextNumber((result.invoice.number ?? nextNumber) + 1);
    await refreshData();
  }

  /* --- Datos desde SQLite --- */

  async function refreshData(filterForm = filters, pageState = pages) {
    const [companyRows, customerRows, invoiceRows, auditRows, fiscalRows, chainResult] = await run("Refrescar", () =>
      Promise.all([
        invoke<Company[]>("company_list"),
        invoke<Customer[]>("customer_list"),
        invoke<InvoiceSummary[]>("invoice_list", {
          filters: filtersToInput(filterForm),
          pagination: listPagination(pageState.invoice),
        }),
        invoke<AuditSummary[]>("audit_list", { pagination: listPagination(pageState.audit) }),
        invoke<FiscalRecordSummary[]>("fiscal_record_list", { pagination: listPagination(pageState.fiscal) }),
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

  async function changePage(list: keyof Pages, page: number) {
    const next = { ...pages, [list]: Math.max(0, page) };
    setPages(next);
    await refreshData(filters, next);
  }

  async function searchInvoices(event: FormEvent) {
    event.preventDefault();
    await changePage("invoice", 0);
  }

  function clearInvoiceFilters() {
    const empty = emptyFilterForm();
    const next = { ...pages, invoice: 0 };
    setFilters(empty);
    setPages(next);
    void refreshData(empty, next);
  }

  async function loadProducts(companyId: string) {
    const rows = await invoke<Product[]>("product_list", { companyId });
    setProducts(rows);
    const preferred = rows.find((item) => item.id === product?.id) ?? rows[0] ?? null;
    setProduct(preferred);
    if (preferred) setProductForm(productToForm(preferred));
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
      setSeriesForm({
        label: preferred.label,
        series_code: preferred.series_code,
        fiscal_year: preferred.fiscal_year,
        include_year: preferred.include_year,
        separator: preferred.separator,
        padding: preferred.padding,
        next_number: preferred.next_number,
      });
      await previewNextNumber(targetCompany, preferred.resolved_series, preferred.fiscal_year);
    } else {
      await previewNextNumber(targetCompany, targetCompany.default_series, fiscalYear);
    }
  }

  /** Vista previa del siguiente número; Rust solo lo reserva al emitir. */
  async function previewNextNumber(targetCompany: Company, series = activeSeries, year = fiscalYear) {
    const preview = await invoke<NextNumberPreview>("invoice_next_number_preview", {
      companyId: targetCompany.id,
      fiscalYear: year,
      series,
    });
    setNumberPreview(preview);
    setNextNumber(preview.next_number);
  }

  async function loadDefaults() {
    try {
      const [defaults, settings] = await run("Cargar defaults", () =>
        Promise.all([invoke<AppDefaults>("app_defaults_get"), invoke<AppSettings>("app_settings_get")]),
      );
      setAppDefaults(defaults);
      setAppSettings(settings);
      setDefaultTerritoryFlags(settings.default_territory_flags);
      setEndpointName(settings.verifactu_endpoint_name);
      const dir = settings.export_dir || defaults.export_dir;
      setExportDir(dir);
      applyExportDir(dir);
    } catch {
      // `run` ya mostró el error.
    }
  }

  /* --- Acciones con Rust --- */

  const verifyFiscalChain = action(
    "Verificar cadena fiscal",
    () => invoke<FiscalChainVerification>("fiscal_chain_verify"),
    setFiscalChain,
  );

  const configureSeries = action(
    "Guardar serie",
    () =>
      invoke<InvoiceSeriesConfig>("company_series_configure", {
        input: {
          company_id: need(company, "crea la empresa primero").id,
          ...seriesForm,
          fiscal_year: fiscalYear,
          is_default: true,
        },
      }),
    async (config) => {
      const updatedCompany = { ...need(company, "empresa"), default_series: config.resolved_series };
      setCompany(updatedCompany);
      setSelectedSeries(config);
      await loadSeries(updatedCompany);
      await refreshData();
    },
  );

  const saveCompany = action(
    company ? "Editar emisor" : "Alta emisor",
    () => {
      const input = {
        ...companyForm,
        default_series:
          companyForm.default_series ||
          resolvedSeriesCode(seriesForm.series_code, fiscalYear, seriesForm.include_year),
      };
      return company
        ? invoke<Company>("company_update", { input: { id: company.id, ...input } })
        : invoke<Company>("company_create", { input });
    },
    async (saved) => {
      setCompany(saved);
      setCompanyForm(companyToForm(saved));
      await refreshData();
    },
  );

  const saveCustomer = action(
    customer ? "Editar cliente" : "Alta cliente",
    () => invoke<Customer>("customer_upsert", { input: { id: customer?.id ?? null, ...customerForm } }),
    async (saved) => {
      setCustomer(saved);
      setCustomerForm(customerToForm(saved));
      await refreshData();
    },
  );

  const saveProduct = action(
    product ? "Editar producto" : "Guardar producto",
    () => {
      const owner = need(company, "crea la empresa primero");
      const withholding = percentToBasisPoints(productForm.withholding_rate_percent);
      const discount = percentToBasisPoints(productForm.discount_rate_percent);
      return invoke<Product>("product_upsert", {
        input: {
          id: product?.id ?? null,
          company_id: owner.id,
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
      });
    },
    async (saved) => {
      setProduct(saved);
      setProductForm(productToForm(saved));
      await loadProducts(saved.company_id);
    },
  );

  const createDraft = action(
    "Crear borrador",
    () => invoke<Invoice>("invoice_draft_create", { input: draftInput() }),
    async (created) => {
      setDraft(created);
      await refreshData();
    },
  );

  const issueInvoice = action("Emitir factura", () => issueWith(draftInput()), afterIssue);

  const adviseRectification = action(
    "Asistente rectificativa",
    () =>
      invoke<RectificationAdvice>("rectification_advice", {
        input: {
          scenario: rectificationScenario,
          method_preference: null,
          replaces_full_invoice: rectificationMethod === "S",
        },
      }),
    (advice) => {
      setRectificationReason(advice.reason_code);
      setRectificationMethod(advice.method);
      setRectificationAdvice(advice);
    },
  );

  /** Rectificativa parcial enlazada a la primera factura emitida no rectificativa. */
  const issueRectifyingInvoice = action(
    "Emitir rectificativa",
    () => {
      const source = need(rectifiableInvoice, "no hay factura emitida rectificable");
      return issueWith({
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
      });
    },
    afterIssue,
  );

  /** Factura sobre la que actúan PDF y JSON: la emitida, la primera del listado o el borrador. */
  const exportInvoiceId = () => need(issued?.invoice.id ?? invoices[0]?.id ?? draft?.id, "no hay factura");

  const exportBackup = action("Backup", () => invoke<BackupResult>("backup_export", { targetPath: paths.backup }), setBackup);
  const restoreBackup = action(
    "Restore preflight",
    () => invoke<BackupRestoreResult>("backup_restore", { sourcePath: paths.restore }),
    setRestore,
  );
  const exportPdf = action(
    "PDF",
    () => invoke<string>("invoice_export_pdf", { invoiceId: exportInvoiceId(), targetPath: paths.pdf }),
    setPdfResult,
  );
  const exportJson = action(
    "Export JSON",
    () => invoke<ExportResult>("invoice_export_json", { invoiceId: exportInvoiceId(), targetPath: paths.json }),
    setJsonResult,
  );
  const exportCsv = action(
    "Export CSV",
    () => invoke<ExportResult>("invoice_export_csv", { filters: null, targetPath: paths.csv }),
    setCsvResult,
  );
  const exportFiscalAudit = action(
    "Export auditoria fiscal",
    () => invoke<ExportResult>("fiscal_audit_export", { filters: null, targetPath: paths.audit }),
    setAuditExportResult,
  );

  const saveOnboarding = action(
    "Guardar onboarding",
    () =>
      invoke<AppSettings>("app_settings_update", {
        input: {
          export_dir: exportDir,
          default_territory_flags: defaultTerritoryFlags,
          onboarding_completed: onboardingReady,
          verifactu_endpoint_name: endpointName,
        },
      }),
    (saved) => {
      setAppSettings(saved);
      if (saved.export_dir) applyExportDir(saved.export_dir);
    },
  );

  /** El último XML exportado pasa a ser el que se envía; reinicia preflight y envío. */
  function selectForSubmission(invoiceId: string, result: VerifactuXmlResult) {
    setSubmission({
      invoice_id: invoiceId,
      export_id: result.export_id,
      xml_path: result.target_path,
      xml_sha256: result.xml_sha256,
    });
    setSubmitPreflight(null);
    setSubmitResult(null);
  }

  const exportXml = action(
    "XML VERI*FACTU",
    () => {
      const invoiceId = need(issuedInvoiceId, "no hay factura emitida");
      return invoke<VerifactuXmlResult>("verifactu_xml_draft_export", { invoiceId, targetPath: paths.xml }).then(
        (result) => ({ invoiceId, result }),
      );
    },
    ({ invoiceId, result }) => {
      setXmlResult(result);
      selectForSubmission(invoiceId, result);
    },
  );

  const exportCancelXml = action(
    "XML anulacion",
    () => {
      const invoiceId = need(issuedInvoiceId, "no hay factura emitida");
      return invoke<VerifactuXmlResult>("verifactu_xml_anulacion_draft_export", {
        invoiceId,
        targetPath: paths.cancelXml,
      }).then((result) => ({ invoiceId, result }));
    },
    async ({ invoiceId, result }) => {
      setCancelXmlResult(result);
      selectForSubmission(invoiceId, result);
      setIssued(null);
      await refreshData();
    },
  );

  /** Entrada común de preflight y envío: el paquete exportado y la referencia del certificado. */
  const submitInput = () => ({
    input: { ...need(submission, "exporta el XML primero"), certificate_ref: certificateRef },
  });

  const preflightSubmit = action(
    "Preflight envio",
    () => invoke<SubmitPreflight>("verifactu_submit_preflight", submitInput()),
    setSubmitPreflight,
  );

  const submitToAeat = action(
    "Enviar a la AEAT",
    () => invoke<VerifactuSubmission>("verifactu_submit", submitInput()),
    setSubmitResult,
  );

  return {
    status,
    flowState,
    demoSeedEnabled,
    company,
    customer,
    product,
    companyForm,
    customerForm,
    productForm,
    companies,
    customers,
    products,
    invoices,
    audit,
    fiscalRecords,
    fiscalChain,
    filters,
    pages,
    seriesConfigs,
    selectedSeries,
    seriesForm,
    invoiceLines,
    invoiceTotals,
    draft,
    issued,
    numberPreview,
    rectificationScenario,
    setRectificationScenario,
    rectificationReason,
    setRectificationReason,
    rectificationMethod,
    setRectificationMethod,
    rectificationAdvice,
    rectifiableInvoice,
    appDefaults,
    appSettings,
    exportDir,
    defaultTerritoryFlags,
    endpointName,
    setEndpointName,
    paths,
    backup,
    restore,
    pdfResult,
    jsonResult,
    csvResult,
    auditExportResult,
    xmlResult,
    cancelXmlResult,
    submission,
    certificateRef,
    setCertificateRef,
    submitPreflight,
    submitResult,
    activeSeriesPreview,
    canDraft,
    canIssue,
    canRectify,
    canExportXml,
    onboardingReady,
    onboardingSteps,
    // acciones
    fillDemoData,
    saveOnboarding,
    pickExportDirectory,
    toggleTerritoryFlag,
    saveCompany,
    newCompanyForm,
    selectCompany,
    updateCompanyForm,
    saveCustomer,
    newCustomerForm,
    selectCustomer,
    updateCustomerForm,
    saveProduct,
    newProductForm,
    selectProduct,
    updateProductForm,
    productToFirstLine,
    configureSeries,
    updateSeriesForm,
    applySeriesPreset,
    selectInvoiceSeries,
    updateInvoiceLine,
    removeInvoiceLine,
    addInvoiceLine,
    createDraft,
    issueInvoice,
    issueRectifyingInvoice,
    adviseRectification,
    updateFilter,
    clearInvoiceFilters,
    searchInvoices,
    changePage,
    refreshData,
    verifyFiscalChain,
    exportFiscalAudit,
    pickSavePath,
    pickRestoreFile,
    exportBackup,
    restoreBackup,
    exportPdf,
    exportJson,
    exportCsv,
    exportXml,
    exportCancelXml,
    preflightSubmit,
    submitToAeat,
  };
}

/** Lo que reciben las secciones. Tipado: un error en una sección rompe la compilación. */
export type Model = ReturnType<typeof useCumpleFactura>;
