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
      payments: [],
      dueDates: {},
      recurring: [],
      quotes: [],
      emailSettings: null,
      passwordSaved: false,
      emailLog: [],
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
        state.settings = {
          ...args.input,
          qr_environment: args.input.qr_environment ?? state.settings.qr_environment ?? "test",
          updated_at: new Date().toISOString(),
        };
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
      // ── Gestion: cobros, recurrentes, presupuestos, email ──
      const paidFor = (invoiceId) => state.payments.filter((p) => p.invoice_id === invoiceId).reduce((sum, p) => sum + p.amount_cents, 0);
      if (cmd === "receivables_list") {
        return state.invoices
          .filter((invoice) => invoice.status === "Issued")
          .map((invoice) => {
            const customer = state.customers.find((c) => c.id === invoice.customer_id);
            const paid = paidFor(invoice.id);
            const outstanding = Math.max(invoice.total_cents - paid, 0);
            return {
              invoice_id: invoice.id,
              company_id: invoice.company_id,
              customer_id: invoice.customer_id,
              customer_name: customer?.display_name ?? "",
              customer_tax_id: customer?.tax_id ?? "",
              series: invoice.series,
              number: invoice.number,
              issued_at: "2026-10-19T10:00:00Z",
              due_date: state.dueDates[invoice.id] ?? null,
              total_cents: invoice.total_cents,
              paid_cents: paid,
              outstanding_cents: outstanding,
              status: outstanding === 0 ? "paid" : paid > 0 ? "partial" : "pending",
              days_overdue: 0,
            };
          });
      }
      if (cmd === "invoice_due_date_set") {
        state.dueDates[args.invoiceId] = args.dueDate;
        return null;
      }
      if (cmd === "payment_list") return state.payments.filter((p) => p.invoice_id === args.invoiceId);
      if (cmd === "payment_register") {
        const payment = { id: id("payment"), created_at: new Date().toISOString(), ...args.input };
        state.payments.push(payment);
        return payment;
      }
      if (cmd === "payment_delete") {
        state.payments = state.payments.filter((p) => p.id !== args.paymentId);
        return null;
      }
      if (cmd === "recurring_list") return state.recurring;
      if (cmd === "recurring_upsert") {
        const item = {
          id: args.input.id || id("recurring"),
          company_id: args.input.draft.company_id,
          customer_id: args.input.draft.customer_id,
          label: args.input.label,
          frequency: args.input.frequency,
          next_run_date: args.input.next_run_date,
          end_date: args.input.end_date,
          active: true,
          last_invoice_id: null,
          total_cents: invoiceTotals(args.input.draft.lines).total_cents,
          draft: args.input.draft,
        };
        state.recurring = [item, ...state.recurring.filter((r) => r.id !== item.id)];
        return item;
      }
      if (cmd === "recurring_set_active") {
        state.recurring = state.recurring.map((r) => (r.id === args.id ? { ...r, active: args.active } : r));
        return null;
      }
      if (cmd === "recurring_generate_due") {
        const today = new Date().toISOString().slice(0, 10);
        const runs = [];
        state.recurring = state.recurring.map((r) => {
          if (!r.active || r.next_run_date > today) return r;
          runs.push({ recurring_id: r.id, label: r.label, run_date: r.next_run_date, invoice: { id: id("draft") } });
          const next = new Date(`${r.next_run_date}T00:00:00Z`);
          next.setUTCMonth(next.getUTCMonth() + 1);
          return { ...r, next_run_date: next.toISOString().slice(0, 10) };
        });
        return runs;
      }
      if (cmd === "quote_list") return state.quotes;
      if (cmd === "quote_upsert") {
        const number = state.quotes.length + 1;
        const quote = {
          id: args.input.id || id("quote"),
          code: `P2026-${String(number).padStart(4, "0")}`,
          customer_id: args.input.draft.customer_id,
          status: "draft",
          valid_until: args.input.valid_until,
          notes: args.input.notes,
          total_cents: invoiceTotals(args.input.draft.lines).total_cents,
          invoice_id: null,
          created_at: new Date().toISOString(),
          draft: args.input.draft,
        };
        state.quotes = [quote, ...state.quotes.filter((q) => q.id !== quote.id)];
        return quote;
      }
      if (cmd === "quote_set_status") {
        state.quotes = state.quotes.map((q) => (q.id === args.id ? { ...q, status: args.status } : q));
        return state.quotes.find((q) => q.id === args.id);
      }
      if (cmd === "quote_convert") {
        const invoiceId = id("draft");
        state.quotes = state.quotes.map((q) => (q.id === args.id ? { ...q, status: "invoiced", invoice_id: invoiceId } : q));
        return { id: invoiceId };
      }
      const emailView = () => ({
        settings: state.emailSettings ?? { smtp_host: "", smtp_port: 587, smtp_security: "starttls", smtp_username: "", from_email: "", from_name: "" },
        configured: Boolean(state.emailSettings),
        password_saved: state.passwordSaved,
      });
      if (cmd === "email_settings_get") return emailView();
      if (cmd === "email_settings_update") {
        state.emailSettings = args.settings;
        return emailView();
      }
      if (cmd === "email_password_set") {
        state.passwordSaved = true;
        return null;
      }
      if (cmd === "email_log_list") return state.emailLog.filter((e) => !args.invoiceId || e.invoice_id === args.invoiceId);
      if (cmd === "email_send_test" || cmd === "email_send_invoice" || cmd === "email_send_reminder") {
        const entry = {
          id: id("email"),
          invoice_id: args.invoiceId ?? null,
          kind: cmd === "email_send_test" ? "test" : cmd === "email_send_invoice" ? "invoice" : "reminder",
          recipient: args.to,
          subject: "browser smoke",
          status: "sent",
          error: null,
          sent_at: new Date().toISOString(),
        };
        state.emailLog = [entry, ...state.emailLog];
        return entry;
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

async function expectTextVisible(page, text) {
  await expect(page.getByText(text).first()).toBeVisible();
}

let shotIndex = 0;

async function goTo(page, area, view) {
  await clickByRole(page, area);
  if (view) await clickByRole(page, view);
  // Opcional: captura por vista para revision visual (no forma parte de la evidencia).
  const shotsDir = process.env.CUMPLEFACTURA_SMOKE_SHOTS_DIR;
  if (shotsDir) {
    shotIndex += 1;
    const name = `${String(shotIndex).padStart(2, "0")}-${area}-${view ?? "panel"}`.replace(/[^A-Za-z0-9_-]+/g, "_");
    await page.screenshot({ path: resolve(shotsDir, `${name}.png`), fullPage: true });
  }
}

async function bodyHas(page, text) {
  return page.locator("body").evaluate((body, needle) => body.textContent?.includes(needle) ?? false, text);
}

await mkdir(evidenceDir, { recursive: true });

const result = await withServer(async (serverLogPath) => {
  const browser = await chromium.launch({
    headless: true,
    // Permite reutilizar un Chromium ya instalado cuando la version de Playwright no trae el suyo.
    executablePath: process.env.CUMPLEFACTURA_CHROMIUM_PATH || undefined,
  });
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
  const externalBlocked = await bodyHas(page, "external_blocked");

  // Limites visibles: VERI*FACTU (sin firma/envio real) y canales sidecar importados de ContaPro.
  await goTo(page, "Fiscal", "VERI*FACTU");
  await expectTextVisible(page, "Borrador tecnico: XSD local, sin firma ni envio.");
  await expectTextVisible(page, "Frontera final: solo sidecar local con HMAC puede invocar AEAT");
  const noSignatureOrSend = await bodyHas(page, "sin firma ni envio");
  const fakeSidecar = await bodyHas(page, "gate usa sidecar falso");
  await goTo(page, "Fiscal", "Canales sidecar");
  await expectTextVisible(page, "Canales ContaPro sidecar");
  await expectTextVisible(page, "Importado de ContaPro");
  await clickByRole(page, "Preflight SII sidecar");
  await expectTextVisible(page, "/sii/submit-preflight");
  await expect(page.getByRole("button", { name: "Preflight TicketBAI sidecar", exact: true })).toBeDisabled();
  await expectTextVisible(page, "homologacion foral sigue bloqueada");
  const initialVisibleLimits = {
    noSignatureOrSend,
    fakeSidecar,
    externalBlocked,
    contaproImport: await bodyHas(page, "Importado de ContaPro"),
  };

  // Onboarding desde el Panel.
  await goTo(page, "Inicio");
  await clickByRole(page, "Rellenar demo");
  await expectTextVisible(page, "Datos demo cargados");
  await clickByRole(page, "Elegir carpeta");
  await expect(page.getByLabel("Carpeta export")).toHaveValue("C:\\CumpleFactura\\Evidence");

  await goTo(page, "Ajustes", "Empresa emisora");
  await clickByRole(page, "Guardar emisor");
  await expect(page.getByLabel("Nombre legal empresa")).toHaveValue("Demo CumpleFactura SL");

  await goTo(page, "Contactos", "Catalogo");
  await clickByRole(page, "Guardar producto");
  await expect(page.locator(".productRow").getByText("SVC-DEMO - Servicio mensual")).toBeVisible();
  await clickByRole(page, "Usar en linea");
  await goTo(page, "Facturas", "Nueva factura");
  await expect(page.getByLabel("Precio EUR linea 1")).toHaveValue("250");
  await expect(page.getByLabel("Descuento linea 1")).toHaveValue("10");
  await expect(page.getByLabel("IRPF linea 1")).toHaveValue("15");

  await goTo(page, "Ajustes", "Series");
  await clickByRole(page, "Guardar serie");
  await expectTextVisible(page, "General - A-001");

  await goTo(page, "Inicio");
  await clickByRole(page, "Guardar onboarding");
  await expectTextVisible(page, "Completado");

  await goTo(page, "Contactos", "Clientes");
  await clickByRole(page, "Guardar cliente");
  await expect(page.getByLabel("Nombre cliente")).toHaveValue("Cliente Demo");

  // Borrador y emision.
  await goTo(page, "Facturas", "Nueva factura");
  await page.getByLabel("Descripcion linea 1").fill("Servicio editable con descuento");
  await expect(page.getByLabel("Serie de esta factura")).toHaveValue(/series-/);
  await expectTextVisible(page, "238,50");

  await clickByRole(page, "Crear borrador");
  await expectTextVisible(page, "Borrador persistido");
  await expectTextVisible(page, "238,50");

  await clickByRole(page, "Emitir factura");
  await expectTextVisible(page, "Factura emitida");
  await expectTextVisible(page, "Cadena fiscal OK");

  await goTo(page, "Fiscal", "Auditoria");
  await expectTextVisible(page, "Auditoria fiscal local");
  await clickByRole(page, "Verificar cadena");
  await expectTextVisible(page, "Registros fiscales verificados");
  await expectTextVisible(page, "Ultimo hash por empresa");
  await clickByRole(page, "Elegir auditoria");
  await clickByRole(page, "Exportar auditoria");
  await expectTextVisible(page, "created -");

  await goTo(page, "Facturas", "Emitidas");
  await page.getByLabel("Buscar texto factura").fill("A");
  await page.getByLabel("Filtro estado factura").selectOption("Issued");
  await clickByRole(page, "Buscar facturas");
  await expectTextVisible(page, "1 resultado(s) con filtros actuales.");

  // Cobros y vencimientos + email desde la factura emitida.
  await goTo(page, "Facturas", "Cobros");
  await expectTextVisible(page, "Facturas por cobrar");
  await page.locator(".receivablesPanel .rowLink").first().click();
  await page.getByLabel("Fecha de vencimiento").fill("2026-11-30");
  await clickByRole(page, "Guardar vencimiento");
  await expectTextVisible(page, "30/11/2026");
  await page.getByLabel("Importe cobro").fill("100");
  await clickByRole(page, "Registrar cobro");
  await expectTextVisible(page, "Parcial");
  await page.getByLabel("Email destinatario").fill("cliente@example.org");
  await clickByRole(page, "Enviar factura");
  await expectTextVisible(page, "Factura · enviado");
  await clickByRole(page, "Enviar recordatorio");
  await expectTextVisible(page, "Recordatorio · enviado");

  // Facturas recurrentes: plantilla y generacion de borrador.
  await goTo(page, "Facturas", "Recurrentes");
  await page.getByLabel("Nombre recurrente").fill("Cuota mensual mantenimiento");
  await page.getByLabel("Cliente recurrente").selectOption({ index: 1 });
  await page.getByLabel("Recurrente descripcion linea 1").fill("Mantenimiento mensual");
  await page.getByLabel("Recurrente precio linea 1").fill("150");
  await clickByRole(page, "Guardar plantilla");
  await expectTextVisible(page, "Cuota mensual mantenimiento");
  await clickByRole(page, "Generar borradores pendientes");
  await expectTextVisible(page, "1 borrador(es) creado(s)");

  // Presupuestos: alta, aceptacion y conversion en factura.
  await goTo(page, "Facturas", "Presupuestos");
  await page.getByLabel("Cliente presupuesto").selectOption({ index: 1 });
  await page.getByLabel("Presupuesto descripcion linea 1").fill("Instalacion inicial");
  await page.getByLabel("Presupuesto precio linea 1").fill("900");
  await clickByRole(page, "Guardar presupuesto");
  await expectTextVisible(page, "Presupuesto P2026-0001 guardado.");
  await clickByRole(page, "Aceptar");
  await expectTextVisible(page, "Aceptado");
  await clickByRole(page, "Convertir en factura");
  await expectTextVisible(page, "P2026-0001 convertido en borrador de factura");

  // Ajustes: QR tributario y servidor de correo.
  await goTo(page, "Ajustes", "QR tributario");
  await expectTextVisible(page, "QR tributario VERI*FACTU");
  await page.getByLabel("Entorno QR").selectOption("production");
  await clickByRole(page, "Guardar");
  await goTo(page, "Ajustes", "Email");
  await page.getByLabel("Servidor SMTP").fill("smtp.example.com");
  await page.getByLabel("Usuario SMTP").fill("facturas@example.com");
  await page.getByLabel("Email remitente").fill("facturas@example.com");
  await clickByRole(page, "Guardar servidor");
  await expectTextVisible(page, "Configurado");
  await page.getByLabel("Contraseña SMTP").fill("secreto-de-prueba");
  await clickByRole(page, "Guardar contraseña");
  await expectTextVisible(page, "Guardada");

  // Vistas de red (pendientes de servicio): deben mostrarse sin errores.
  await goTo(page, "Facturas", "Recibidas");
  await expectTextVisible(page, "Bandeja de recibidas");
  await goTo(page, "Contactos", "Red de empresas");
  await expectTextVisible(page, "Buscar empresas");

  await goTo(page, "Fiscal", "VERI*FACTU");
  await clickByRole(page, "Exportar XML");
  await expectTextVisible(page, "XSD OK");

  await clickByRole(page, "Preparar");
  await expectTextVisible(page, "unsigned - prepared_for_signature");

  await page.screenshot({ path: screenshotPath, fullPage: true });
  await page.screenshot({ path: latestScreenshotPath, fullPage: true });

  const finalVisibleLimits = {
    noAeatCsv: await bodyHas(page, "sin llamada AEAT real ni CSV"),
    fakeSidecar: await bodyHas(page, "gate usa sidecar falso"),
  };

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
    flow: "app loads -> navigate areas/views -> create company/customer/series -> edit invoice line with discount/IRPF -> draft -> issue -> audit -> search issued -> due date + partial payment + email invoice/reminder -> recurring template + draft generation -> quote accept + convert -> QR/email settings -> export VERI*FACTU XML -> prepare signature/submission package",
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
