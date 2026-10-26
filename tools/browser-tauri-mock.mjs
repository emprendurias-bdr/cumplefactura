export function installTauriMock(page) {
  return page.addInitScript(() => {
    const state = {
      uiPreferences: {theme: "system", density: "comfortable"},
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
      if (cmd === "ui_preferences_get") return {...state.uiPreferences};
      if (cmd === "ui_preferences_update") {state.uiPreferences = {...args.input}; return {...state.uiPreferences};}
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
