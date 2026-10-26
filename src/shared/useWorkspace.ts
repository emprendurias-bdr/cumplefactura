import { open as openDialog,save as saveDialog } from "@tauri-apps/plugin-dialog";
import { FormEvent,useEffect,useMemo,useRef,useState } from "react";
import { companyToForm,customerToForm,editorTotals,emptyCompanyForm,emptyCustomerForm,emptyInvoiceFilters,emptyProductForm,eurosToCents,isInvoiceLineReady,joinPath,lineToInput,listPagination,newInvoiceLine,optionalNumber,optionalText,percentToBasisPoints,productToForm,productToInvoiceLine,resolvedSeriesCode,timestamp } from './forms';
import { invoke } from "./tauri";
import type { AeatTransportPreflight,AppDefaults,AppSettings,AuditSummary,BackupRestoreResult,BackupResult,Company,CompanyForm,Customer,CustomerForm,ExportResult,FiscalChainVerification,FiscalRecordSummary,ImportedSidecarCapabilities,Invoice,InvoiceLineForm,InvoiceSeriesConfig,InvoiceSummary,IssuedInvoice,NextNumberPreview,Product,ProductForm,RectificationAdvice,SiiSidecarPreflight,SubmissionPreparation,TicketBaiSidecarPreflight,VerifactuSubmitSidecarInvocation,VerifactuSubmitSidecarPreflight,VerifactuXmlResult,XadesSidecarPreflight,XadesSidecarSignature } from './types';

export function useWorkspace(){
  const [company, setCompany] = useState<Company | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [companyForm, setCompanyForm] = useState<CompanyForm>(emptyCompanyForm());
  const [customerForm, setCustomerForm] = useState<CustomerForm>(emptyCustomerForm());
  const [productForm, setProductForm] = useState<ProductForm>(emptyProductForm());
  const draftRequestInFlight = useRef(false);
  const draftRevision = useRef(0);
  const [draftSaving, setDraftSaving] = useState(false);
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
  const [storedSubmitPreflight, setSubmitPreflight] = useState<VerifactuSubmitSidecarPreflight | null>(null);
  const [checkedSubmitScope, setCheckedSubmitScope] = useState<string | null>(null);
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
  const submitScope = JSON.stringify([company?.id, xadesCertRef, xadesSidecarUrl, submitSidecarUrl, invokeSidecarUrl, aeatEndpoint, aeatEndpointName, submission?.invoice_id, submission?.export_id, submission?.xml_sha256, submission?.signature_status]);
  const submitPreflight = checkedSubmitScope === submitScope ? storedSubmitPreflight : null;
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
  const draftEditorKey = JSON.stringify([company?.id, customer?.id, fiscalYear, activeSeries, defaultTerritoryFlags, invoiceLines, draftRevision.current]);
  const currentDraftEditorKey = useRef(draftEditorKey);
  currentDraftEditorKey.current = draftEditorKey;
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
    if (!("__TAURI_INTERNALS__" in window)) return;
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
    markInvoiceEditorDirty();
    setCompany(selected);
    setCompanyForm(companyToForm(selected));
    void loadSeries(selected);
    void loadProducts(selected.id);
  }

  function selectCustomer(customerId: string) {
    const selected = customers.find((item) => item.id === customerId) ?? null;
    if (!selected) return;
    markInvoiceEditorDirty();
    setCustomer(selected);
    setCustomerForm(customerToForm(selected));
  }

  function selectProduct(productId: string) {
    const selected = products.find((item) => item.id === productId) ?? null;
    if (!selected) return;
    setProduct(selected);
    setProductForm(productToForm(selected));
  }

  function markInvoiceEditorDirty() {
    draftRevision.current += 1;
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
    if (draftRequestInFlight.current || !company || !customer) return;
    const lines = currentInvoiceLineInputs();
    if (!lines) return;
    draftRequestInFlight.current = true;
    setDraftSaving(true);
    const requestKey = draftEditorKey;
    try {
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
      if (created && requestKey !== currentDraftEditorKey.current) {
        setDraft(null);
        setStatus("Borrador guardado para una versión anterior. Revisa la lista; guarda de nuevo los datos actuales.");
        return;
      }
      if (created) {
        setDraft(created);
        await refreshData();
      }
    } finally {
      draftRequestInFlight.current = false;
      setDraftSaving(false);
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
    const requestScope = submitScope;
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
    if (result) {
      setSubmitPreflight(result);
      setCheckedSubmitScope(requestScope);
    }
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

  
return {company,setCompany,customer,setCustomer,product,setProduct,companyForm,setCompanyForm,customerForm,setCustomerForm,productForm,setProductForm,draftSaving,draft,setDraft,issued,setIssued,companies,setCompanies,customers,setCustomers,products,setProducts,invoices,setInvoices,invoiceSearch,setInvoiceSearch,invoiceCompanyFilter,setInvoiceCompanyFilter,invoiceCustomerFilter,setInvoiceCustomerFilter,invoiceYearFilter,setInvoiceYearFilter,invoiceSeriesFilter,setInvoiceSeriesFilter,invoiceStatusFilter,setInvoiceStatusFilter,invoiceKindFilter,setInvoiceKindFilter,invoicePage,setInvoicePage,auditPage,setAuditPage,fiscalPage,setFiscalPage,audit,setAudit,fiscalRecords,setFiscalRecords,fiscalChain,setFiscalChain,status,setStatus,demoSeedEnabled,setDemoSeedEnabled,nextNumber,setNextNumber,seriesConfigs,setSeriesConfigs,selectedSeries,setSelectedSeries,seriesLabel,setSeriesLabel,seriesCode,setSeriesCode,seriesFiscalYear,setSeriesFiscalYear,seriesIncludeYear,setSeriesIncludeYear,seriesSeparator,setSeriesSeparator,seriesPadding,setSeriesPadding,seriesNextNumber,setSeriesNextNumber,invoiceLines,setInvoiceLines,appDefaults,setAppDefaults,appSettings,setAppSettings,exportDir,setExportDir,defaultTerritoryFlags,setDefaultTerritoryFlags,numberPreview,setNumberPreview,rectificationScenario,setRectificationScenario,rectificationReason,setRectificationReason,rectificationMethod,setRectificationMethod,rectificationAdvice,setRectificationAdvice,backupPath,setBackupPath,pdfPath,setPdfPath,xmlPath,setXmlPath,cancelXmlPath,setCancelXmlPath,signedXmlPath,setSignedXmlPath,jsonPath,setJsonPath,csvPath,setCsvPath,auditExportPath,setAuditExportPath,restorePath,setRestorePath,aeatEndpoint,setAeatEndpoint,aeatEndpointName,setAeatEndpointName,xadesCertRef,setXadesCertRef,xadesSidecarUrl,setXadesSidecarUrl,submitSidecarUrl,setSubmitSidecarUrl,invokeSidecarUrl,setInvokeSidecarUrl,backup,setBackup,restore,setRestore,pdfResult,setPdfResult,jsonResult,setJsonResult,csvResult,setCsvResult,auditExportResult,setAuditExportResult,xmlResult,setXmlResult,cancelXmlResult,setCancelXmlResult,submission,setSubmission,xadesPreflight,setXadesPreflight,xadesSignature,setXadesSignature,transportPreflight,setTransportPreflight,submitPreflight,setSubmitPreflight,submitInvocation,setSubmitInvocation,sidecarCapabilities,setSidecarCapabilities,siiBook,setSiiBook,siiEndpointName,setSiiEndpointName,siiSidecarUrl,setSiiSidecarUrl,siiPreflight,setSiiPreflight,ticketbaiTerritorio,setTicketbaiTerritorio,ticketbaiEndpoint,setTicketbaiEndpoint,ticketbaiSidecarUrl,setTicketbaiSidecarUrl,ticketbaiPreflight,setTicketbaiPreflight,invoiceLinesReady,invoiceTotals,canDraft,canIssue,issuedInvoiceId,rectifiableInvoice,canExportXml,canRectify,fiscalYear,activeSeries,activeSeriesPreview,onboardingSteps,onboardingReady,siiChannel,ticketbaiChannel,mvpSidecarChannels,deferredSidecarChannels,flowState,run,updateCompanyForm,updateCustomerForm,updateProductForm,applyExportDirPaths,pickExportDirectory,pickSavePath,pickRestoreFile,toggleTerritoryFlag,invoiceFiltersInput,newCompanyForm,newCustomerForm,newProductForm,fillDemoData,selectCompany,selectCustomer,selectProduct,markInvoiceEditorDirty,useProductInFirstLine,updateInvoiceLine,addInvoiceLine,removeInvoiceLine,currentInvoiceLineInputs,selectInvoiceSeries,refreshData,searchInvoices,clearInvoiceFilters,changeInvoicePage,changeAuditPage,changeFiscalPage,verifyFiscalChain,loadProducts,loadSeries,configureSeries,saveCompany,saveCustomer,saveProduct,createDraft,issueInvoice,exportBackup,exportPdf,exportJson,exportCsv,exportFiscalAudit,restoreBackup,exportXml,loadDefaults,saveOnboarding,previewNextNumber,adviseRectification,issueRectifyingInvoice,exportCancelXml,prepareSubmission,preflightXadesSidecar,signWithXadesSidecar,preflightAeatTransport,preflightSubmitSidecar,preflightSiiSidecar,preflightTicketBaiSidecar,invokeSubmitSidecar};
}
export type Workspace=ReturnType<typeof useWorkspace>;
