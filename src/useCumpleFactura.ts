/**
 * Estado y acciones del núcleo de facturación: empresas, clientes, productos, series, facturas,
 * ajustes y copias. Las pantallas solo pintan lo que devuelve este hook; aquí (y en los otros
 * hooks de dominio: useVerifactu, useDocuments, useRecurring) viven las llamadas a Rust.
 *
 * Patrón: `action(mensajeOk, llamada, alTerminar)` devuelve un manejador que llama a Rust, avisa
 * con un toast (ok con `mensajeOk`, error traducido por `errorText`) y ejecuta `alTerminar`.
 * Así no se repite try/catch en cada botón. Nada se guarda en localStorage salvo apariencia.
 *
 * Editor (R2): un borrador se abre con `invoice_get` (también los de recurrentes y conversiones) y
 * se guarda con `invoice_draft_update`. Editar marca `dirty`: emitir exige el borrador guardado sin
 * cambios pendientes y sin líneas «pendiente de precio» a 0 € (D8). `detail` es la última ficha
 * leída con `invoice_get` (líneas, desglose, observaciones, cobros, origen recurrente).
 */
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { errorText, t } from "./i18n/es";
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
  invoiceToLines,
  isInvoiceLineReady,
  lineToInput,
  listPagination,
  newInvoiceLine,
  pendingPriceLines,
  percentToBasisPoints,
  productToForm,
  productToInvoiceLine,
  resolvedSeriesCode,
} from "./lib/format";
import { invoiceNumber, numberProposal } from "./lib/numberProposal";
import type {
  AppDefaults,
  AppSettings,
  AuditSummary,
  BackupRestoreResult,
  BackupResult,
  CertificatePasswordMode,
  Company,
  CompanyForm,
  Customer,
  CustomerForm,
  ExportResult,
  FiscalChainVerification,
  FiscalRecordSummary,
  Invoice,
  InvoiceDetail,
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
} from "./types";
import { toast } from "./ui/Toast";

type Pages = { invoice: number; audit: number; fiscal: number };

const SERIES_PRESETS: Record<string, Pick<SeriesForm, "label" | "series_code" | "include_year" | "separator" | "padding">> = {
  VENDI: { label: "Vendingsaiz Aragón", series_code: "VENDI", include_year: true, separator: "", padding: 2 },
  AL: { label: "Alquiler", series_code: "AL", include_year: false, separator: "-", padding: 3 },
  C: { label: "Construcción", series_code: "C", include_year: false, separator: "-", padding: 3 },
  I: { label: "Inmovilizado", series_code: "I", include_year: false, separator: "-", padding: 3 },
};

/** Lanza un error con `message` si falta `value`; el toast lo muestra. */
export function need<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) throw new Error(message);
  return value;
}

/** Llama, avisa con toast y relanza; compartido por los hooks de dominio. */
export async function run<T>(call: () => Promise<T>, done?: string | null): Promise<T> {
  try {
    const result = await call();
    if (done) toast(done, "ok");
    return result;
  } catch (error) {
    toast(errorText(error), "err");
    throw error;
  }
}

/** Manejador de formulario: `run` + `onDone`; el error ya quedó en el toast. */
export function action<A extends unknown[], T>(
  done: string | null,
  call: (...args: A) => Promise<T>,
  onDone?: (result: T) => void | Promise<void>,
) {
  // Como manejador de formulario recibe el evento (se ignora); si no, los argumentos de `call`.
  return async (...args: A | [FormEvent]) => {
    const first = args[0];
    const isEvent = Boolean(first && typeof first === "object" && "preventDefault" in first);
    if (isEvent) (first as FormEvent).preventDefault();
    try {
      const result = await run(() => call(...((isEvent ? [] : args) as A)), done);
      await onDone?.(result);
      return true;
    } catch {
      return false;
    }
  };
}

export function useCumpleFactura() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
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
  const [progressRecords, setProgressRecords] = useState<FiscalRecordSummary[]>([]);
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
  /** Hay cambios en el editor que aún no están en el borrador guardado. */
  const [dirty, setDirty] = useState(false);
  const [notes, setNotesState] = useState("");
  const [issued, setIssued] = useState<IssuedInvoice | null>(null);
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [nextNumber, setNextNumber] = useState(1);
  const [numberPreview, setNumberPreview] = useState<NextNumberPreview | null>(null);
  const [rectificationScenario, setRectificationScenario] = useState("Other");
  const [rectificationReplacesFull, setRectificationReplacesFull] = useState(false);
  const [rectificationReason, setRectificationReason] = useState("R4");
  const [rectificationMethod, setRectificationMethod] = useState("I");
  const [rectificationAdvice, setRectificationAdvice] = useState<RectificationAdvice | null>(null);

  // Ajustes y rutas de exportación
  const [appDefaults, setAppDefaults] = useState<AppDefaults | null>(null);
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const [exportDir, setExportDir] = useState("");
  const [defaultTerritoryFlags, setDefaultTerritoryFlags] = useState<string[]>(["CommonTerritory", "VeriFactu"]);
  const [endpointName, setEndpointName] = useState("SistemaVerifactuPruebas");
  const [passwordMode, setPasswordMode] = useState<CertificatePasswordMode>("session");
  const [qrEnvironment, setQrEnvironment] = useState<"test" | "production">("test");
  const [paths, setPaths] = useState<Record<PathKey, string>>(exportPaths(""));

  // Resultados de exportaciones y copias
  const [backup, setBackup] = useState<BackupResult | null>(null);
  const [restore, setRestore] = useState<BackupRestoreResult | null>(null);
  const [pdfResult, setPdfResult] = useState<string | null>(null);
  const [jsonResult, setJsonResult] = useState<ExportResult | null>(null);
  const [csvResult, setCsvResult] = useState<ExportResult | null>(null);
  const [auditExportResult, setAuditExportResult] = useState<ExportResult | null>(null);

  // Derivados
  const invoiceLinesReady = invoiceLines.length > 0 && invoiceLines.every(isInvoiceLineReady);
  const invoiceTotals = useMemo(() => editorTotals(invoiceLines), [invoiceLines]);
  const pricePending = pendingPriceLines(invoiceLines);
  const canDraft = Boolean(company && customer && invoiceLinesReady);
  const canIssue = Boolean(draft && !dirty && invoiceLinesReady && pricePending === 0);
  const fiscalYear = seriesForm.fiscal_year || new Date().getFullYear();
  const activeSeries = selectedSeries?.resolved_series ?? company?.default_series ?? "A";
  const proposedNumber = numberProposal(numberPreview, { companyId: company?.id, series: activeSeries, fiscalYear });
  const onboardingSteps = [
    { key: "empresa", ok: Boolean(company) },
    { key: "fiscalidad", ok: defaultTerritoryFlags.length > 0 },
    { key: "serie", ok: Boolean(selectedSeries) },
    { key: "certificado", ok: Boolean(exportDir.trim()) },
  ] as const;
  const onboardingReady = onboardingSteps.every((step) => step.ok);

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
  }, [company?.id]);

  /* --- Formularios y diálogos nativos --- */

  const updateCompanyForm = (field: keyof CompanyForm, value: string) => setCompanyForm((current) => ({ ...current, [field]: value }));
  const updateCustomerForm = (field: keyof CustomerForm, value: string) => setCustomerForm((current) => ({ ...current, [field]: value }));
  const updateProductForm = <K extends keyof ProductForm>(field: K, value: ProductForm[K]) =>
    setProductForm((current) => ({ ...current, [field]: value }));
  const updateSeriesForm = <K extends keyof SeriesForm>(field: K, value: SeriesForm[K]) =>
    setSeriesForm((current) => ({ ...current, [field]: value }));
  const applySeriesPreset = (preset: keyof typeof SERIES_PRESETS) => setSeriesForm((current) => ({ ...current, ...SERIES_PRESETS[preset] }));
  const updateFilter = (field: keyof InvoiceFilterForm, value: string) => setFilters((current) => ({ ...current, [field]: value }));
  const setPath = (key: PathKey, value: string) => setPaths((current) => ({ ...current, [key]: value }));

  function applyExportDir(dir: string) {
    if (!dir.trim()) return;
    setPaths((current) => ({ ...exportPaths(dir), restore: current.restore }));
  }

  async function pickExportDirectory() {
    const selected = await openDialog({ title: t("dialogo.carpeta"), directory: true, multiple: false, defaultPath: exportDir || appDefaults?.export_dir });
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
      title: t("dialogo.copia"),
      defaultPath: paths.restore || exportDir || appDefaults?.export_dir,
      multiple: false,
      directory: false,
      filters: [{ name: "SQLite", extensions: ["sqlite", "sqlite3", "db"] }],
    });
    if (typeof selected === "string") {
      setPath("restore", selected);
      setRestore(null);
    }
  }

  function toggleTerritoryFlag(flag: string, checked: boolean) {
    setDefaultTerritoryFlags((current) => {
      const next = checked ? [...new Set([...current, flag])] : current.filter((item) => item !== flag);
      return next.length > 0 ? next : current;
    });
  }

  /** Otra empresa: el borrador del editor deja de valer. */
  function resetInvoiceFlow() {
    setDraft(null);
    setIssued(null);
    setDirty(false);
  }

  /** Un cambio en el editor: hay que guardar el borrador otra vez antes de emitir. */
  function touch() {
    setIssued(null);
    setDirty(true);
  }

  /** Editor en blanco (al salir de un borrador abierto con «Editar»). */
  function newInvoice() {
    setDraft(null);
    setDirty(false);
    setNotesState("");
    setInvoiceLines([newInvoiceLine()]);
  }

  const setNotes = (value: string) => {
    touch();
    setNotesState(value);
  };

  function newCompanyForm() {
    setCompany(null);
    setCompanyForm(emptyCompanyForm());
    resetInvoiceFlow();
  }

  function newCustomerForm() {
    setCustomer(null);
    setCustomerForm(emptyCustomerForm());
  }

  function newProductForm() {
    setProduct(null);
    setProductForm(emptyProductForm());
  }

  /** Rellena los formularios con datos de ejemplo (no guarda nada hasta que pulses Guardar). Solo en desarrollo (D4). */
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
    touch();
  }

  function selectProduct(productId: string) {
    const selected = products.find((item) => item.id === productId);
    if (!selected) return;
    setProduct(selected);
    setProductForm(productToForm(selected));
  }

  /* --- Editor de factura --- */

  function editLines(change: (current: InvoiceLineForm[]) => InvoiceLineForm[]) {
    touch();
    setInvoiceLines(change);
  }

  const productToFirstLine = (item: Product) =>
    editLines((current) => [productToInvoiceLine(item, current[0]?.id ?? newInvoiceLine().id), ...current.slice(1)]);
  const updateInvoiceLine = (id: string, field: keyof InvoiceLineForm, value: string) =>
    editLines((current) => current.map((line) => (line.id === id ? { ...line, [field]: value } : line)));
  const addInvoiceLine = (line?: InvoiceLineForm) => editLines((current) => [...current, line ?? newInvoiceLine()]);
  const removeInvoiceLine = (id: string) => editLines((current) => (current.length === 1 ? current : current.filter((line) => line.id !== id)));

  /** Pone en el editor un borrador guardado (de esta pantalla, de un recurrente o de una conversión). */
  function openDraft(invoice: InvoiceDetail) {
    const client = customers.find((item) => item.id === invoice.customer_id);
    if (client) {
      setCustomer(client);
      setCustomerForm(customerToForm(client));
    }
    const series = seriesConfigs.find((item) => item.resolved_series === invoice.series);
    if (series) setSelectedSeries(series);
    setInvoiceLines(invoiceToLines(invoice));
    setNotesState(invoice.notes);
    setIssued(null);
    setDraft(invoice);
    setDirty(false);
  }

  /** Ficha completa de cualquier factura (`invoice_get`); `null` si no existe. */
  async function loadDetail(invoiceId: string) {
    setDetailLoading(true);
    try {
      const found = await invoke<InvoiceDetail>("invoice_get", { invoiceId });
      setDetail(found);
      return found;
    } catch (error) {
      setDetail(null);
      toast(errorText(error), "err");
      return null;
    } finally {
      setDetailLoading(false);
    }
  }

  /** «Editar borrador»: lee el borrador de Rust y lo abre en el editor (si sigue siendo borrador). */
  async function loadDraft(invoiceId: string) {
    const found = await loadDetail(invoiceId);
    if (found?.status === "Draft") openDraft(found);
  }

  async function selectInvoiceSeries(seriesId: string) {
    const series = seriesConfigs.find((item) => item.id === seriesId);
    if (!series || !company) return;
    touch();
    setSelectedSeries(series);
    updateSeriesForm("fiscal_year", series.fiscal_year);
    await previewNextNumber(company, series.resolved_series, series.fiscal_year);
  }

  /** Borrador `invoice_draft_create`/`invoice_issue` con las líneas del editor. */
  function draftInput() {
    const owner = need(company, t("error.sinEmpresa"));
    const client = need(customer, t("error.sinCliente"));
    if (!invoiceLinesReady) throw new Error(t("error.lineasIncompletas"));
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
      notes,
    };
  }

  /** `draftId`: el borrador que se emite (albaranes de una recapitulativa pasan a facturados con él). */
  function issueWith(draftData: ReturnType<typeof draftInput> | Record<string, unknown>, draftId: string | null = null) {
    return invoke<IssuedInvoice>("invoice_issue", {
      draftId,
      input: {
        draft: draftData,
        number: nextNumber,
        issued_at: new Date().toISOString(),
        actor: "local-user",
        previous_audit_hash: null,
      },
    });
  }

  /** Tras emitir, el editor queda limpio: el mismo borrador no se puede volver a emitir. */
  async function afterIssue(result: IssuedInvoice) {
    setIssued(result);
    setDraft(null);
    setDirty(false);
    setNotesState("");
    setInvoiceLines([newInvoiceLine()]);
    setNextNumber((result.invoice.number ?? nextNumber) + 1);
    await refreshData();
  }

  /* --- Datos desde SQLite --- */

  async function refreshData(filterForm = filters, pageState = pages) {
    setLoading(true);
    try {
      const [companyRows, customerRows, invoiceRows, auditRows, fiscalRows, allRecords, chainResult] = await Promise.all([
        invoke<Company[]>("company_list"),
        invoke<Customer[]>("customer_list"),
        invoke<InvoiceSummary[]>("invoice_list", { filters: filtersToInput(filterForm), pagination: listPagination(pageState.invoice) }),
        invoke<AuditSummary[]>("audit_list", { pagination: listPagination(pageState.audit) }),
        invoke<FiscalRecordSummary[]>("fiscal_record_list", { pagination: listPagination(pageState.fiscal) }),
        // Para colorear los pasos de cada fila hace falta ver más registros que los de la página.
        invoke<FiscalRecordSummary[]>("fiscal_record_list", { pagination: { limit: 500, offset: 0 } }),
        invoke<FiscalChainVerification>("fiscal_chain_verify"),
      ]);
      setCompanies(companyRows);
      setCustomers(customerRows);
      setInvoices(invoiceRows);
      setAudit(auditRows);
      setFiscalRecords(fiscalRows);
      setProgressRecords(allRecords);
      setFiscalChain(chainResult);
      setLoadError(null);
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
    } catch (error) {
      setLoadError(errorText(error));
    } finally {
      setLoading(false);
    }
  }

  async function changePage(list: keyof Pages, page: number) {
    const next = { ...pages, [list]: Math.max(0, page) };
    setPages(next);
    await refreshData(filters, next);
  }

  /** Busca con los filtros actuales (o los que se pasen, para la búsqueda al escribir). */
  async function searchInvoices(nextFilters: InvoiceFilterForm = filters) {
    const next = { ...pages, invoice: 0 };
    setPages(next);
    await refreshData(nextFilters, next);
  }

  function clearInvoiceFilters() {
    const empty = emptyFilterForm();
    setFilters(empty);
    void searchInvoices(empty);
  }

  async function loadProducts(companyId: string) {
    const rows = await invoke<Product[]>("product_list", { companyId });
    setProducts(rows);
    const preferred = rows.find((item) => item.id === product?.id) ?? rows[0] ?? null;
    setProduct(preferred);
    if (preferred) setProductForm(productToForm(preferred));
  }

  async function loadSeries(targetCompany: Company) {
    const rows = await invoke<InvoiceSeriesConfig[]>("company_series_list", { companyId: targetCompany.id, fiscalYear });
    setSeriesConfigs(rows);
    const preferred = rows.find((item) => item.id === selectedSeries?.id) ?? rows.find((item) => item.is_default) ?? rows[0] ?? null;
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
    const preview = await invoke<NextNumberPreview>("invoice_next_number_preview", { companyId: targetCompany.id, fiscalYear: year, series });
    setNumberPreview(preview);
    setNextNumber(preview.next_number);
  }

  async function loadDefaults() {
    try {
      const [defaults, settings] = await Promise.all([invoke<AppDefaults>("app_defaults_get"), invoke<AppSettings>("app_settings_get")]);
      setAppDefaults(defaults);
      setAppSettings(settings);
      setDefaultTerritoryFlags(settings.default_territory_flags);
      setEndpointName(settings.verifactu_endpoint_name);
      setPasswordMode(settings.certificate_password_mode ?? "session");
      setQrEnvironment(settings.qr_environment ?? "test");
      const dir = settings.export_dir || defaults.export_dir;
      setExportDir(dir);
      applyExportDir(dir);
      await refreshData();
    } catch (error) {
      setLoadError(errorText(error));
      setLoading(false);
    }
  }

  /* --- Acciones con Rust --- */

  const verifyFiscalChain = action(t("ok.cadena"), () => invoke<FiscalChainVerification>("fiscal_chain_verify"), setFiscalChain);

  const configureSeries = action(
    t("ok.serie"),
    () =>
      invoke<InvoiceSeriesConfig>("company_series_configure", {
        input: { company_id: need(company, t("error.sinEmpresa")).id, ...seriesForm, fiscal_year: fiscalYear, is_default: true },
      }),
    async (config) => {
      const updatedCompany = { ...need(company, t("error.sinEmpresa")), default_series: config.resolved_series };
      setCompany(updatedCompany);
      setSelectedSeries(config);
      await loadSeries(updatedCompany);
      await refreshData();
    },
  );

  const saveCompany = action(
    company ? t("ok.empresaEditada") : t("ok.empresaCreada"),
    () => {
      const input = {
        ...companyForm,
        default_series: companyForm.default_series || resolvedSeriesCode(seriesForm.series_code, fiscalYear, seriesForm.include_year),
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
    customer ? t("ok.clienteEditado") : t("ok.clienteCreado"),
    () => invoke<Customer>("customer_upsert", { input: { id: customer?.id ?? null, ...customerForm } }),
    async (saved) => {
      setCustomer(saved);
      setCustomerForm(customerToForm(saved));
      await refreshData();
    },
  );

  const saveProduct = action(
    t("ok.producto"),
    () => {
      const owner = need(company, t("error.sinEmpresa"));
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

  /** Primer guardado crea el borrador; los siguientes lo reescriben (mismo id, cobros y vínculos). */
  const saveDraft = action(
    t("ok.borrador"),
    () =>
      draft
        ? invoke<Invoice>("invoice_draft_update", { id: draft.id, input: draftInput() })
        : invoke<Invoice>("invoice_draft_create", { input: draftInput() }),
    async (saved) => {
      setDraft(saved);
      setDirty(false);
      await refreshData();
    },
  );

  /** D1: logo del PDF. Rust copia la imagen (JPEG o PNG sin transparencia, ≤ 1 MB) y guarda la ruta. */
  async function pickLogo() {
    const owner = company;
    if (!owner) return;
    const selected = await openDialog({ title: t("dialogo.logo"), multiple: false, directory: false, filters: [{ name: "Imagen", extensions: ["jpg", "jpeg", "png"] }] });
    if (typeof selected !== "string") return;
    await setLogo(owner.id, selected);
  }
  const setLogo = action(t("ok.logo"), (companyId: string, sourcePath: string) => invoke<string>("company_logo_set", { companyId, sourcePath }), () => refreshData());
  const clearLogo = action(t("ok.logoQuitado"), (companyId: string) => invoke<null>("company_logo_clear", { companyId }), () => refreshData());

  const issueInvoice = action(null, () => issueWith(draftInput(), draft?.id ?? null), afterIssue);

  const adviseRectification = action(
    null,
    () =>
      invoke<RectificationAdvice>("rectification_advice", {
        input: { scenario: rectificationScenario, method_preference: null, replaces_full_invoice: rectificationReplacesFull },
      }),
    (advice) => {
      setRectificationReason(advice.reason_code);
      setRectificationMethod(advice.method);
      setRectificationAdvice(advice);
    },
  );

  /** Rectificativa parcial enlazada a `sourceId` (abono fijo heredado de la versión anterior). */
  const issueRectifyingInvoice = action(
    null,
    (sourceId: string) => {
      const source = need(invoices.find((item) => item.id === sourceId), t("error.sinFacturaRectificable"));
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
            description: `Rectificación parcial ${invoiceNumber(source) ?? source.series}`,
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

  const exportBackup = action(t("ok.copia"), () => invoke<BackupResult>("backup_export", { targetPath: paths.backup }), setBackup);
  /** F3: `confirm = false` solo valida; `true` restaura con copia previa y vuelta atrás si falla. */
  const restoreBackup = action(
    null,
    (confirm: boolean) => invoke<BackupRestoreResult>("backup_restore", { sourcePath: paths.restore, confirm }),
    async (result) => {
      setRestore(result);
      if (result.status === "restored") await refreshData();
    },
  );
  const exportPdf = action(
    t("ok.pdf"),
    (invoiceId: string) => invoke<string>("invoice_export_pdf", { invoiceId, targetPath: paths.pdf }),
    setPdfResult,
  );
  const exportJson = action(
    t("ok.json"),
    (invoiceId: string) => invoke<ExportResult>("invoice_export_json", { invoiceId, targetPath: paths.json }),
    setJsonResult,
  );
  const exportCsv = action(t("ok.csv"), () => invoke<ExportResult>("invoice_export_csv", { filters: null, targetPath: paths.csv }), setCsvResult);
  const exportFiscalAudit = action(
    t("ok.auditoria"),
    () => invoke<ExportResult>("fiscal_audit_export", { filters: null, targetPath: paths.audit }),
    setAuditExportResult,
  );

  /** Ajustes y primer arranque comparten el mismo guardado (`app_settings_update`). */
  const saveSettings = action(
    t("ok.ajustes"),
    (complete?: boolean) =>
      invoke<AppSettings>("app_settings_update", {
        input: {
          export_dir: exportDir,
          default_territory_flags: defaultTerritoryFlags,
          onboarding_completed: complete === true ? onboardingReady : (appSettings?.onboarding_completed ?? false) || onboardingReady,
          verifactu_endpoint_name: endpointName,
          certificate_password_mode: passwordMode,
          qr_environment: qrEnvironment,
        },
      }),
    (saved) => {
      setAppSettings(saved);
      if (saved.export_dir) applyExportDir(saved.export_dir);
    },
  );

  return {
    loading,
    loadError,
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
    progressRecords,
    fiscalChain,
    setFiscalChain,
    filters,
    pages,
    seriesConfigs,
    selectedSeries,
    seriesForm,
    invoiceLines,
    invoiceTotals,
    pricePending,
    notes,
    setNotes,
    dirty,
    detail,
    detailLoading,
    draft,
    issued,
    numberPreview,
    proposedNumber,
    activeSeries,
    fiscalYear,
    rectificationScenario,
    setRectificationScenario,
    rectificationReplacesFull,
    setRectificationReplacesFull,
    rectificationReason,
    setRectificationReason,
    rectificationMethod,
    setRectificationMethod,
    rectificationAdvice,
    appDefaults,
    appSettings,
    exportDir,
    defaultTerritoryFlags,
    endpointName,
    setEndpointName,
    passwordMode,
    setPasswordMode,
    qrEnvironment,
    setQrEnvironment,
    paths,
    backup,
    restore,
    pdfResult,
    jsonResult,
    csvResult,
    auditExportResult,
    canDraft,
    canIssue,
    onboardingReady,
    onboardingSteps,
    // acciones
    fillDemoData,
    saveSettings,
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
    newInvoice,
    loadDraft,
    loadDetail,
    saveDraft,
    pickLogo,
    clearLogo,
    issueInvoice,
    issueRectifyingInvoice,
    adviseRectification,
    updateFilter,
    setFilters,
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
  };
}

/** Lo que reciben las pantallas. Tipado: un error en una pantalla rompe la compilación. */
export type Model = ReturnType<typeof useCumpleFactura>;
