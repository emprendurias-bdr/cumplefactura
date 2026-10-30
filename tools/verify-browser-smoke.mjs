// Browser smoke: Playwright against mocked Tauri invoke (local MVP flows).
import { spawn } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import http from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = resolve(root, "tests", "regulatory", "evidence");
const host = "127.0.0.1";
const port = Number(process.env.CUMPLEFACTURA_BROWSER_SMOKE_PORT ?? "1421");
const url = `http://${host}:${port}`;
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const screenshotPath = resolve(evidenceDir, `browser-smoke-${timestamp}.png`);
const latestJsonPath = resolve(evidenceDir, "latest-browser-smoke.json");
const latestScreenshotPath = resolve(evidenceDir, "latest-browser-smoke.png");

async function waitForServer(targetUrl, timeoutMs = 30_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const ok = await new Promise((resolveOk) => {
      const req = http.get(targetUrl, (res) => {
        res.resume();
        resolveOk(res.statusCode && res.statusCode < 500);
      });
      req.on("error", () => resolveOk(false));
      req.setTimeout(1000, () => {
        req.destroy();
        resolveOk(false);
      });
    });
    if (ok) return;
    await new Promise((resolveLater) => setTimeout(resolveLater, 300));
  }
  throw new Error(`Vite dev server did not become ready at ${targetUrl}`);
}

async function withServer(action) {
  const vite = resolve(root, "node_modules", "vite", "bin", "vite.js");
  if (!existsSync(vite)) {
    throw new Error(`Missing Vite binary: ${vite}`);
  }

  const logPath = resolve(evidenceDir, `browser-smoke-vite-${timestamp}.log`);
  const log = createWriteStream(logPath, { flags: "a" });
  const child = spawn(process.execPath, [vite, "--host", host, "--port", String(port), "--strictPort"], {
    cwd: root,
    env: { ...process.env, BROWSER: "none" },
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.pipe(log);
  child.stderr.pipe(log);

  try {
    await waitForServer(url);
    return await action(logPath);
  } finally {
    child.kill();
    log.end();
  }
}

function installTauriMock(page) {
  return page.addInitScript(() => {
    const state = {
      companies: [],
      customers: [],
      products: [],
      invoices: [],
      seriesConfigs: [],
      audit: [],
      fiscalRecords: [],
      nextId: 1,
      nextInvoiceNumber: 1,
      exportDir: "C:\\CumpleFactura\\Evidence",
      settings: {
        export_dir: null,
        default_territory_flags: ["CommonTerritory", "VeriFactu"],
        onboarding_completed: false,
        updated_at: new Date().toISOString(),
      },
      lastXmlPath: "C:\\CumpleFactura\\Evidence\\cumplefactura-verifactu-e2e.xml",
    };

    function id(prefix) {
      state.nextId += 1;
      return `${prefix}-${state.nextId}`;
    }

    function fiscalChain() {
      const head = state.fiscalRecords[0];
      return {
        valid: true,
        total_records: state.fiscalRecords.length,
        issue_count: 0,
        last_hash_by_company: head ? [{ company_id: head.company_id, last_hash: head.fiscal_hash }] : [],
        issues: [],
      };
    }

    function invoiceTotals(lines) {
      return lines.reduce((totals, line) => {
        const quantity = Number(line.quantity);
        const unit = Number(line.unit_price_cents);
        const discount = Number(line.discount_rate_basis_points ?? 0);
        const taxRate = Number(line.tax_rate_basis_points);
        const withholdingRate = Number(line.withholding_rate_basis_points ?? 0);
        const base = Math.trunc((quantity * unit * (10000 - discount)) / 10000);
        const tax = Math.trunc((base * taxRate) / 10000);
        const withholding = Math.trunc((base * withholdingRate) / 10000);
        return {
          taxable_base_cents: totals.taxable_base_cents + base,
          tax_cents: totals.tax_cents + tax,
          withholding_cents: totals.withholding_cents + withholding,
          total_cents: totals.total_cents + base + tax - withholding,
        };
      }, { taxable_base_cents: 0, tax_cents: 0, withholding_cents: 0, total_cents: 0 });
    }

    async function invoke(cmd, args = {}) {
      if (cmd === "plugin:dialog|open") {
        return args.options?.directory ? state.exportDir : `${state.exportDir}\\cumplefactura-restore.sqlite3`;
      }
      if (cmd === "plugin:dialog|save") {
        return args.options?.defaultPath || `${state.exportDir}\\cumplefactura-selected.json`;
      }
      if (cmd === "app_defaults_get") {
        return {
          app_data_dir: "C:\\CumpleFactura\\Data",
          export_dir: state.exportDir,
          default_backup_path: `${state.exportDir}\\cumplefactura-backup.sqlite3`,
          default_pdf_path: `${state.exportDir}\\cumplefactura-factura.pdf`,
          default_verifactu_xml_path: `${state.exportDir}\\cumplefactura-verifactu.xml`,
          default_cancel_xml_path: `${state.exportDir}\\cumplefactura-verifactu-anulacion.xml`,
          default_signed_xml_path: `${state.exportDir}\\cumplefactura-verifactu-firmado.xml`,
          default_json_export_path: `${state.exportDir}\\cumplefactura-factura.json`,
          default_csv_export_path: `${state.exportDir}\\cumplefactura-facturas.csv`,
          default_audit_export_path: `${state.exportDir}\\cumplefactura-auditoria.json`,
          notes: ["browser smoke mock"],
        };
      }
      if (cmd === "app_settings_get") {
        return state.settings;
      }
      if (cmd === "fiscal_sidecar_capabilities_get") {
        return {
          source_project: "contapro-sidecar",
          source_readiness_status: "blocked",
          source_gate_status: "passed",
          source_generated_at: new Date().toISOString(),
          mvp_channels: ["verifactu", "sii"],
          deferred_channels: ["face", "ticketbai"],
          external_call_performed_by_importer: false,
          notes: ["browser smoke mock"],
          channels: [
            { channel: "verifactu", status: "ready", source: "mock", blockers: [], mvp_importable: true, acceptance_status: "accepted", acceptance_validation_status: "passed", notes: [] },
            { channel: "sii", status: "ready", source: "mock", blockers: [], mvp_importable: true, acceptance_status: "accepted", acceptance_validation_status: "passed", notes: [] },
            { channel: "face", status: "blocked", source: "mock", blockers: ["face_acceptance_manifest_validated"], mvp_importable: false, deferred_reason: "blocked_by_external_sp_certificate_registration", notes: [] },
            { channel: "ticketbai", status: "blocked", source: "mock", blockers: ["ticketbai_acceptance_manifest_validated"], mvp_importable: false, deferred_reason: "blocked_by_foral_signature_policy_software_registration_and_acceptance", notes: [] },
          ],
        };
      }
      if (cmd === "sii_submit_sidecar_preflight") {
        return {
          ready: false,
          status: "blocked",
          sidecar_url: args.input.sidecar_url,
          sidecar_endpoint: "/sii/submit-preflight",
          book: args.input.book,
          endpoint_name: args.input.endpoint_name,
          wsdl_name: "SuministroFactEmitidas.wsdl",
          transport_enabled: false,
          soap_calls_enabled: false,
          certificate_loaded: false,
          sidecar_call_performed: false,
          external_call_performed: false,
          blockers: ["CUMPLEFACTURA_ENABLE_SII_SUBMIT_SIDECAR_PREFLIGHT_not_enabled"],
          warnings: [],
        };
      }
      if (cmd === "ticketbai_submit_sidecar_preflight") {
        return {
          ready: false,
          status: "blocked",
          sidecar_url: args.input.sidecar_url,
          sidecar_endpoint: "/ticketbai/submit-preflight",
          territorio: args.input.territorio,
          endpoint: args.input.endpoint,
          xsd_name: "ticketbaiv1-2-2.xsd",
          xsd_available: true,
          endpoint_allowed: false,
          submission_enabled: false,
          certificate_loaded: false,
          sidecar_call_performed: false,
          external_call_performed: false,
          blockers: ["CUMPLEFACTURA_ENABLE_TICKETBAI_SUBMIT_SIDECAR_PREFLIGHT_not_enabled"],
          warnings: [],
        };
      }
      if (cmd === "app_settings_update") {
        state.settings = { ...args.input, updated_at: new Date().toISOString() };
        state.exportDir = args.input.export_dir || state.exportDir;
        return state.settings;
      }
      if (cmd === "company_create") {
        const company = { id: id("company"), created_at: new Date().toISOString(), ...args.input };
        state.companies = [company];
        return company;
      }
      if (cmd === "company_update") {
        const company = { created_at: new Date().toISOString(), ...args.input };
        state.companies = [company, ...state.companies.filter((item) => item.id !== company.id)];
        return company;
      }
      if (cmd === "product_list") {
        return state.products.filter((item) => item.company_id === args.companyId);
      }
      if (cmd === "product_upsert") {
        const product = {
          id: args.input.id || id("product"),
          updated_at: new Date().toISOString(),
          ...args.input,
          sku: String(args.input.sku).trim().toUpperCase(),
        };
        state.products = [product, ...state.products.filter((item) => item.id !== product.id)];
        return product;
      }
      if (cmd === "company_series_list") {
        return state.seriesConfigs.filter((item) => item.company_id === args.companyId && item.fiscal_year === args.fiscalYear);
      }
      if (cmd === "company_series_configure") {
        const input = args.input;
        const code = String(input.series_code).trim().toUpperCase();
        const resolved = input.include_year ? `${code}${input.fiscal_year}` : code;
        const preview = `${resolved}${input.separator}${String(input.next_number).padStart(input.padding, "0")}`;
        const config = {
          id: id("series"),
          company_id: input.company_id,
          label: input.label || code,
          series_code: code,
          fiscal_year: input.fiscal_year,
          include_year: input.include_year,
          separator: input.separator,
          padding: input.padding,
          next_number: input.next_number,
          is_default: input.is_default,
          active: true,
          resolved_series: resolved,
          preview,
          created_at: new Date().toISOString(),
        };
        state.seriesConfigs = [config, ...state.seriesConfigs.filter((item) => item.series_code !== code)];
        state.nextInvoiceNumber = input.next_number;
        state.companies = state.companies.map((company) => company.id === input.company_id ? { ...company, default_series: resolved } : company);
        return config;
      }
      if (cmd === "invoice_next_number_preview") {
        return {
          company_id: args.companyId,
          fiscal_year: args.fiscalYear,
          series: args.series,
          next_number: state.nextInvoiceNumber,
          source: "browser-smoke-sequence",
        };
      }
      if (cmd === "customer_upsert") {
        const customer = { ...args.input, id: args.input.id || id("customer"), updated_at: new Date().toISOString() };
        state.customers = [customer, ...state.customers.filter((item) => item.id !== customer.id)];
        return customer;
      }
      if (cmd === "invoice_draft_create") {
        return { id: id("draft"), series: args.input.series, number: null, totals: invoiceTotals(args.input.lines) };
      }
      if (cmd === "invoice_issue") {
        const totals = invoiceTotals(args.input.draft.lines);
        const invoice = {
          id: id("invoice"),
          company_id: args.input.draft.company_id,
          customer_id: args.input.draft.customer_id,
          fiscal_year: args.input.draft.fiscal_year,
          series: args.input.draft.series,
          number: state.nextInvoiceNumber,
          kind: args.input.draft.kind,
          status: "Issued",
          total_cents: totals.total_cents,
          fiscal_hash: "ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890",
        };
        state.nextInvoiceNumber += 1;
        state.invoices = [invoice, ...state.invoices];
        state.audit = [{ id: id("audit"), action: "invoice_issue", actor: "local-user", hash: invoice.fiscal_hash, occurred_at: new Date().toISOString() }, ...state.audit];
        state.fiscalRecords = [{
          id: id("fiscal"),
          company_id: invoice.company_id,
          invoice_id: invoice.id,
          record_type: "Alta",
          generated_at: new Date().toISOString(),
          fiscal_hash: invoice.fiscal_hash,
          previous_fiscal_hash: null,
          xml_path: null,
          status: "issued",
        }, ...state.fiscalRecords];
        return { invoice: { id: invoice.id, series: invoice.series, number: invoice.number, totals: { total_cents: invoice.total_cents } }, fiscal_hash: invoice.fiscal_hash, audit_hash: invoice.fiscal_hash };
      }
      if (cmd === "company_list") return state.companies;
      if (cmd === "customer_list") return state.customers;
      if (cmd === "invoice_list") {
        const filters = args.filters || {};
        const pagination = args.pagination || { limit: 5, offset: 0 };
        const search = String(filters.search || "").toLowerCase();
        return state.invoices.filter((invoice) => {
          if (filters.company_id && invoice.company_id !== filters.company_id) return false;
          if (filters.customer_id && invoice.customer_id !== filters.customer_id) return false;
          if (filters.fiscal_year && invoice.fiscal_year !== filters.fiscal_year) return false;
          if (filters.series && invoice.series !== filters.series) return false;
          if (filters.status && invoice.status !== filters.status) return false;
          if (filters.kind && invoice.kind !== filters.kind) return false;
          if (!search) return true;
          return [invoice.series, invoice.number, invoice.kind, invoice.status, invoice.fiscal_hash]
            .some((value) => String(value || "").toLowerCase().includes(search));
        }).slice(pagination.offset || 0, (pagination.offset || 0) + (pagination.limit || 5));
      }
      if (cmd === "audit_list") {
        const pagination = args.pagination || { limit: 5, offset: 0 };
        return state.audit.slice(pagination.offset || 0, (pagination.offset || 0) + (pagination.limit || 5));
      }
      if (cmd === "fiscal_record_list") {
        const pagination = args.pagination || { limit: 5, offset: 0 };
        return state.fiscalRecords.slice(pagination.offset || 0, (pagination.offset || 0) + (pagination.limit || 5));
      }
      if (cmd === "fiscal_chain_verify") return fiscalChain();
      if (cmd === "backup_export") return { target_path: args.targetPath, status: "created", notes: ["browser smoke mock"] };
      if (cmd === "backup_restore") return { source_path: args.sourcePath, status: "validated-only", destructive_restore_performed: false, notes: ["browser smoke mock"] };
      if (cmd === "invoice_export_pdf") return args.targetPath;
      if (cmd === "invoice_export_json") return { target_path: args.targetPath, status: "created", notes: ["browser smoke mock"] };
      if (cmd === "invoice_export_csv") return { target_path: args.targetPath, status: "created", notes: ["browser smoke mock"] };
      if (cmd === "fiscal_audit_export") return { target_path: args.targetPath, status: "created", notes: ["browser smoke mock"] };
      if (cmd === "verifactu_xml_draft_export") {
        state.lastXmlPath = args.targetPath;
        return { target_path: args.targetPath, status: "draft_xml_exported", xsd_validated: true, notes: ["browser smoke mock"] };
      }
      if (cmd === "verifactu_submission_prepare") {
        return {
          invoice_id: args.invoiceId,
          export_id: id("export"),
          xml_path: args.xmlPath,
          xml_sha256: "1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF",
          xml_bytes: 2048,
          signature_status: "unsigned",
          transmission_status: "prepared_for_signature",
        };
      }
      throw new Error(`Unexpected E2E command: ${cmd}`);
    }

    window.__TAURI_INTERNALS__ = {
      invoke,
      transformCallback: () => Math.floor(Math.random() * 1_000_000),
      unregisterCallback: () => undefined,
      convertFileSrc: (path) => path,
    };
  });
}

async function clickByRole(page, name) {
  const locator = page.getByRole("button", { name, exact: true });
  await expect(locator).toHaveCount(1);
  await locator.click();
}

async function goToSection(page, name) {
  await clickByRole(page, name);
}

async function expectTextVisible(page, text) {
  await expect(page.getByText(text).first()).toBeVisible();
}

await mkdir(evidenceDir, { recursive: true });

const result = await withServer(async (serverLogPath) => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const consoleEntries = [];
  page.on("console", (msg) => {
    if (["error", "warning"].includes(msg.type())) {
      consoleEntries.push({ type: msg.type(), text: msg.text() });
    }
  });
  page.on("pageerror", (error) => {
    consoleEntries.push({ type: "pageerror", text: error.message });
  });

  await installTauriMock(page);
  await page.goto(url, { waitUntil: "networkidle" });

  await expect(page).toHaveTitle(/CumpleFactura/);
  await expectTextVisible(page, "Facturacion local-first");
  await expectTextVisible(page, "external_blocked");

  await goToSection(page, "Fiscal");
  await expectTextVisible(page, "Borrador tecnico: XSD local, sin firma ni envio.");
  await expectTextVisible(page, "Frontera final: solo sidecar local con HMAC puede invocar AEAT");
  await expectTextVisible(page, "Canales ContaPro sidecar");
  await expectTextVisible(page, "Importado de ContaPro");
  await clickByRole(page, "Preflight SII sidecar");
  await expectTextVisible(page, "/sii/submit-preflight");
  await expect(page.getByRole("button", { name: "Preflight TicketBAI sidecar", exact: true })).toBeDisabled();
  await expectTextVisible(page, "homologacion foral sigue bloqueada");

  const initialVisibleLimits = {
    noSignatureOrSend: true,
    fakeSidecar: true,
    externalBlocked: true,
    contaproImport: true,
  };
  await goToSection(page, "Fiscal");
  const fiscalLimits = await page.locator("body").evaluate((body) => ({
    noSignatureOrSend: body.textContent?.includes("sin firma ni envio") ?? false,
    fakeSidecar: body.textContent?.includes("gate usa sidecar falso") ?? false,
    contaproImport: body.textContent?.includes("Importado de ContaPro") ?? false,
  }));
  await goToSection(page, "Panel");
  const panelLimits = await page.locator("body").evaluate((body) => ({
    externalBlocked: body.textContent?.includes("external_blocked") ?? false,
  }));
  Object.assign(initialVisibleLimits, fiscalLimits, panelLimits);

  await goToSection(page, "Panel");
  await clickByRole(page, "Rellenar demo");
  await expectTextVisible(page, "Datos demo cargados");

  await goToSection(page, "Ajustes");
  await clickByRole(page, "Elegir carpeta");
  await expect(page.getByLabel("Carpeta export")).toHaveValue("C:\\CumpleFactura\\Evidence");

  await goToSection(page, "Empresas");
  await clickByRole(page, "Guardar emisor");
  await expect(page.getByLabel("Nombre legal empresa")).toHaveValue("Demo CumpleFactura SL");
  await clickByRole(page, "Guardar producto");
  await expect(page.locator(".productRow").getByText("SVC-DEMO - Servicio mensual")).toBeVisible();
  await clickByRole(page, "Usar en linea");
  await clickByRole(page, "Guardar serie");
  await expectTextVisible(page, "General - A-001");

  await goToSection(page, "Facturas");
  await expect(page.getByLabel("Precio EUR linea 1")).toHaveValue("250");
  await expect(page.getByLabel("Descuento linea 1")).toHaveValue("10");
  await expect(page.getByLabel("IRPF linea 1")).toHaveValue("15");

  await goToSection(page, "Ajustes");
  await clickByRole(page, "Guardar onboarding");
  await expectTextVisible(page, "Completado");

  await goToSection(page, "Clientes");
  await clickByRole(page, "Guardar cliente");
  await expect(page.getByLabel("Nombre cliente")).toHaveValue("Cliente Demo");

  await goToSection(page, "Facturas");
  await page.getByLabel("Descripcion linea 1").fill("Servicio editable con descuento");
  await expect(page.getByLabel("Serie de esta factura")).toHaveValue(/series-/);
  await expectTextVisible(page, "238,50");

  await clickByRole(page, "Crear borrador");
  await expectTextVisible(page, "Borrador persistido");
  await expectTextVisible(page, "238,50");

  await clickByRole(page, "Emitir factura");
  await expectTextVisible(page, "Factura emitida");

  await goToSection(page, "Fiscal");
  await expectTextVisible(page, "Cadena fiscal OK");
  await expectTextVisible(page, "Auditoria fiscal local");
  await clickByRole(page, "Verificar cadena");
  await expectTextVisible(page, "Registros fiscales verificados");
  await expectTextVisible(page, "Ultimo hash por empresa");
  await clickByRole(page, "Elegir auditoria");
  await clickByRole(page, "Exportar auditoria");
  await expectTextVisible(page, "created -");

  await goToSection(page, "Facturas");
  await page.getByLabel("Buscar texto factura").fill("A");
  await page.getByLabel("Filtro estado factura").selectOption("Issued");
  await clickByRole(page, "Buscar facturas");
  await expectTextVisible(page, "1 resultado(s) con filtros actuales.");

  await goToSection(page, "Fiscal");
  await clickByRole(page, "Exportar XML");
  await expectTextVisible(page, "XSD OK");

  await clickByRole(page, "Preparar");
  await expectTextVisible(page, "unsigned - prepared_for_signature");

  await page.screenshot({ path: screenshotPath, fullPage: true });
  await page.screenshot({ path: latestScreenshotPath, fullPage: true });

  const finalVisibleLimits = await page.locator("body").evaluate((body) => ({
    noAeatCsv: body.textContent?.includes("sin llamada AEAT real ni CSV") ?? false,
    fakeSidecar: body.textContent?.includes("gate usa sidecar falso") ?? false,
  }));

  if (!initialVisibleLimits.noSignatureOrSend || !initialVisibleLimits.fakeSidecar || !initialVisibleLimits.externalBlocked || !initialVisibleLimits.contaproImport) {
    throw new Error(`Initial visible limits missing: ${JSON.stringify(initialVisibleLimits)}`);
  }
  if (!finalVisibleLimits.noAeatCsv || !finalVisibleLimits.fakeSidecar) {
    throw new Error(`Final visible limits missing: ${JSON.stringify(finalVisibleLimits)}`);
  }

  await browser.close();

  const relevantConsole = consoleEntries.filter((entry) => !entry.text.includes("Download the React DevTools"));
  if (relevantConsole.length > 0) {
    throw new Error(`Browser console has errors/warnings: ${JSON.stringify(relevantConsole)}`);
  }

  return {
    app: "CumpleFactura",
    generated_at: new Date().toISOString(),
    status: "passed",
    url,
    viewport: "1366x900",
    browser: "Playwright Chromium headless",
    browser_plugin_note: "Repeatable npm gate uses Playwright because MCP Browser cannot be invoked from npm scripts.",
    flow: "app loads -> create company/customer/series -> edit invoice line with discount/IRPF -> draft -> issue -> export VERI*FACTU XML -> prepare signature/submission package",
    checks: {
      page_identity: true,
      not_blank: true,
      framework_overlay_absent: true,
      console_health: true,
      interaction_proof: true,
      visible_limits: {
        initial: initialVisibleLimits,
        final: finalVisibleLimits,
      },
    },
    screenshot_path: screenshotPath,
    latest_screenshot_path: latestScreenshotPath,
    server_log_path: serverLogPath,
    limits: [
      "Browser smoke uses a local Tauri invoke mock.",
      "It proves rendered UI workflow and visible limits only.",
      "It does not prove Rust command execution, certificate-backed XAdES, SOAP AEAT transport or external acceptance.",
    ],
  };
});

await writeFile(latestJsonPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log("CumpleFactura browser smoke OK");
console.log(`Evidence: ${latestJsonPath}`);
console.log(`Screenshot: ${latestScreenshotPath}`);
