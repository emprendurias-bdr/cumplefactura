// Mock de `window.__TAURI_INTERNALS__.invoke` para Playwright (smoke y capturas de modos).
// Reproduce los contratos de Rust en memoria, incluidos F3 (envíos, contraseña, restaurar) y F4
// (documentos comerciales y recurrentes) y R2 (ficha `invoice_get`, `invoice_draft_update`, cobros,
// vencimiento, series de documentos, logo, observaciones y líneas pendientes de precio).
// `seed` da el estado inicial (capturas con datos). Las facturas se guardan completas (con líneas);
// `invoice_list` devuelve el resumen con los campos R2 calculados como en Rust.
// Nunca llama a la AEAT: las respuestas de envío son ficticias y lo dicen sus notas.
import { spawn } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import http from "node:http";
import { resolve } from "node:path";

export function installTauriMock(page, seed = null) {
  return page.addInitScript((initial) => {
    const now = () => new Date().toISOString();
    const state = Object.assign(
      {
        companies: [],
        customers: [],
        products: [],
        invoices: [],
        seriesConfigs: [],
        audit: [],
        fiscalRecords: [],
        submissions: [],
        documents: [],
        recurring: [],
        payments: [],
        commercialSeries: [],
        nextId: 1,
        nextInvoiceNumber: 1,
        exportDir: "C:\\CumpleFactura\\Evidence",
        settings: {
          export_dir: null,
          default_territory_flags: ["CommonTerritory", "VeriFactu"],
          onboarding_completed: false,
          verifactu_endpoint_name: "SistemaVerifactuPruebas",
          certificate_password_mode: "session",
          qr_environment: "test",
          updated_at: now(),
        },
        calls: [],
      },
      initial ?? {},
    );
    window.__CF_MOCK__ = state;

    function id(prefix) {
      state.nextId += 1;
      return `${prefix}-${state.nextId}`;
    }
    const paged = (rows, pagination) => {
      const p = pagination || { limit: 25, offset: 0 };
      return rows.slice(p.offset || 0, (p.offset || 0) + (p.limit || 25));
    };

    function totals(lines) {
      return lines.reduce(
        (acc, line) => {
          const base = Math.trunc((Number(line.quantity) * Number(line.unit_price_cents) * (10000 - Number(line.discount_rate_basis_points ?? 0))) / 10000);
          const tax = Math.trunc((base * Number(line.tax_rate_basis_points)) / 10000);
          const withholding = Math.trunc((base * Number(line.withholding_rate_basis_points ?? 0)) / 10000);
          return {
            taxable_base_cents: acc.taxable_base_cents + base,
            tax_cents: acc.tax_cents + tax,
            withholding_cents: acc.withholding_cents + withholding,
            total_cents: acc.total_cents + base + tax - withholding,
          };
        },
        { taxable_base_cents: 0, tax_cents: 0, withholding_cents: 0, total_cents: 0 },
      );
    }
    const withBase = (lines) =>
      lines.map((line, index) => ({ id: `line-${index}`, ...line, price_pending: Boolean(line.price_pending) && !(line.unit_price_cents > 0), taxable_base_cents: totals([line]).taxable_base_cents }));
    const today = () => new Date().toISOString().slice(0, 10);

    /* --- R2: cobros, ficha y resumen de factura --- */
    const paidOf = (target) =>
      state.payments
        .filter((p) => (target.invoice_id ? p.invoice_id === target.invoice_id : p.commercial_document_id === target.commercial_document_id))
        .reduce((sum, p) => sum + p.amount_cents, 0);
    function ops(inv) {
      const paid = paidOf({ invoice_id: inv.id });
      const due = inv.due_date ?? null;
      const payment_status = inv.total_cents - paid <= 0 ? "paid" : due && due < today() ? "overdue" : paid > 0 ? "partial" : "unpaid";
      return { due_date: due, paid_cents: paid, payment_status, recurring_label: inv.recurring_label ?? null, recurring_period_key: inv.recurring_period_key ?? null };
    }
    function summary(inv) {
      const { lines: _l, totals: _t, notes: _n, is_recapitulative: _r, void_reason: _v, ...rest } = inv;
      return { ...rest, ...ops(inv) };
    }
    function detail(inv) {
      const lines = withBase(inv.lines ?? []);
      return { ...inv, lines, totals: inv.totals ?? totals(lines), notes: inv.notes ?? "", is_recapitulative: Boolean(inv.is_recapitulative), void_reason: inv.void_reason ?? null, ...ops(inv) };
    }
    const findInvoice = (invoiceId) => {
      const inv = state.invoices.find((item) => item.id === invoiceId);
      if (!inv) throw "not_found";
      return inv;
    };
    const pendingCount = (lines) => lines.filter((l) => l.price_pending && !(l.unit_price_cents > 0)).length;
    /** Una línea sin `price_pending` hereda la marca de su posición; con precio, desaparece (como Rust). */
    const mergePending = (previous, lines) =>
      lines.map((line, i) => ({ ...line, price_pending: Boolean(line.price_pending ?? previous?.[i]?.price_pending) && !(line.unit_price_cents > 0) }));
    function seriesOf(companyId, kind) {
      const saved = state.commercialSeries.find((c) => c.company_id === companyId && c.kind === kind);
      return saved ?? { company_id: companyId, kind, series_code: { quote: "P", proforma: "PF", delivery_note: "AL" }[kind], padding: 4, configured: false };
    }
    const hex = (n) => Array.from({ length: 64 }, (_, i) => "0123456789ABCDEF"[(n * 7 + i * 13) % 16]).join("");

    function chain() {
      const head = state.fiscalRecords[0];
      return {
        valid: true,
        total_records: state.fiscalRecords.length,
        issue_count: 0,
        last_hash_by_company: head ? [{ company_id: head.company_id, last_hash: head.fiscal_hash }] : [],
        issues: [],
      };
    }

    function issue(input, draftId) {
      const draft = input.draft;
      const stored = draftId ? state.invoices.find((item) => item.id === draftId) : null;
      const pending = Math.max(pendingCount(draft.lines), stored ? pendingCount(stored.lines ?? []) : 0);
      if (pending > 0) throw `price_pending_lines:${pending}`;
      const t = totals(draft.lines);
      const invoice = {
        id: id("invoice"),
        company_id: draft.company_id,
        customer_id: draft.customer_id,
        fiscal_year: draft.fiscal_year,
        series: draft.series,
        number: state.nextInvoiceNumber,
        kind: draft.kind,
        status: "Issued",
        rectifies_invoice_id: draft.rectifies_invoice_id,
        total_cents: t.total_cents,
        fiscal_hash: hex(state.nextId),
        created_at: now(),
        issued_at: input.issued_at,
        lines: withBase(draft.lines),
        totals: t,
        notes: draft.notes ?? "",
        is_recapitulative: stored?.is_recapitulative ?? false,
        recurring_label: stored?.recurring_label ?? null,
        recurring_period_key: stored?.recurring_period_key ?? null,
        due_date: stored?.due_date ?? null,
      };
      if (draftId) {
        state.payments = state.payments.map((p) => (p.invoice_id === draftId ? { ...p, invoice_id: invoice.id } : p));
        state.invoices = state.invoices.filter((item) => item.id !== draftId);
      }
      state.nextInvoiceNumber += 1;
      state.invoices = [invoice, ...state.invoices];
      state.audit = [{ id: id("audit"), action: "invoice_issue", actor: "local-user", hash: invoice.fiscal_hash, occurred_at: now() }, ...state.audit];
      state.fiscalRecords = [
        { id: id("fiscal"), company_id: invoice.company_id, invoice_id: invoice.id, record_type: "Alta", generated_at: now(), fiscal_hash: invoice.fiscal_hash, previous_fiscal_hash: null, xml_path: null, status: "issued" },
        ...state.fiscalRecords,
      ];
      return {
        invoice: { ...invoice, territory_flags: draft.territory_flags },
        fiscal_hash: invoice.fiscal_hash,
        audit_hash: invoice.fiscal_hash,
      };
    }

    function docSummary(doc) {
      const { lines, ...rest } = doc;
      return rest;
    }
    function saveDoc(input) {
      const t = totals(input.lines);
      const existing = state.documents.find((d) => d.id === input.id);
      const series = input.series_code || seriesOf(input.company_id, input.kind).series_code;
      const doc = {
        ...(existing || { id: id("doc"), number: null, display_number: null, status: "draft", source_document_id: null, invoice_id: null, void_reason: null, created_at: now() }),
        ...input,
        id: existing?.id ?? input.id ?? id("doc"),
        series_code: series,
        fiscal_year: Number(input.issue_date.slice(0, 4)),
        show_prices: input.show_prices ?? true,
        notes: input.notes ?? "",
        ...t,
        updated_at: now(),
      };
      state.documents = [doc, ...state.documents.filter((d) => d.id !== doc.id)];
      return doc;
    }

    const handlers = {
      "plugin:dialog|open": (args) =>
        args.options?.directory
          ? state.exportDir
          : args.options?.filters?.[0]?.extensions?.includes("png")
            ? `${state.exportDir}\\logo-talleres.png`
            : `${state.exportDir}\\cumplefactura-restore.sqlite3`,
      "plugin:dialog|save": (args) => args.options?.defaultPath || `${state.exportDir}\\cumplefactura-selected.json`,
      app_defaults_get: () => ({ app_data_dir: "C:\\CumpleFactura\\Data", export_dir: state.exportDir, generated_at: now(), notes: ["browser smoke mock"] }),
      app_settings_get: () => state.settings,
      app_settings_update: (args) => {
        state.settings = { ...state.settings, ...args.input, updated_at: now() };
        state.exportDir = args.input.export_dir || state.exportDir;
        return state.settings;
      },
      company_create: (args) => {
        const company = { id: id("company"), created_at: now(), ...args.input };
        state.companies = [company, ...state.companies];
        return company;
      },
      company_update: (args) => {
        const company = { created_at: now(), ...args.input };
        state.companies = [company, ...state.companies.filter((item) => item.id !== company.id)];
        return company;
      },
      company_list: () => state.companies,
      company_logo_set: (args) => {
        const company = state.companies.find((c) => c.id === args.companyId);
        if (!company) throw `company not found: ${args.companyId}`;
        if (!/\.(png|jpe?g)$/i.test(args.sourcePath)) throw "logo_format_not_supported:formato desconocido. Usa un JPEG o un PNG sin transparencia (RGB o gris, 8 bits)";
        company.logo_path = `C:\\CumpleFactura\\Data\\logos\\${company.id}${args.sourcePath.slice(args.sourcePath.lastIndexOf("."))}`;
        return company.logo_path;
      },
      company_logo_clear: (args) => {
        const company = state.companies.find((c) => c.id === args.companyId);
        if (!company) throw `company not found: ${args.companyId}`;
        company.logo_path = null;
        return null;
      },
      product_list: (args) => state.products.filter((item) => item.company_id === args.companyId),
      product_upsert: (args) => {
        const product = { updated_at: now(), ...args.input, id: args.input.id || id("product"), sku: String(args.input.sku).trim().toUpperCase() };
        state.products = [product, ...state.products.filter((item) => item.id !== product.id)];
        return product;
      },
      company_series_list: (args) => state.seriesConfigs.filter((item) => item.company_id === args.companyId && item.fiscal_year === args.fiscalYear),
      company_series_configure: (args) => {
        const input = args.input;
        const code = String(input.series_code).trim().toUpperCase();
        const resolved = input.include_year ? `${code}${input.fiscal_year}` : code;
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
          preview: `${resolved}${input.separator}${String(input.next_number).padStart(input.padding, "0")}`,
          created_at: now(),
        };
        state.seriesConfigs = [config, ...state.seriesConfigs.filter((item) => item.series_code !== code)];
        state.nextInvoiceNumber = input.next_number;
        state.companies = state.companies.map((c) => (c.id === input.company_id ? { ...c, default_series: resolved } : c));
        return config;
      },
      invoice_next_number_preview: (args) => ({ company_id: args.companyId, fiscal_year: args.fiscalYear, series: args.series, next_number: state.nextInvoiceNumber, source: "browser-smoke-sequence" }),
      customer_upsert: (args) => {
        const customer = { ...args.input, id: args.input.id || id("customer"), updated_at: now() };
        state.customers = [customer, ...state.customers.filter((item) => item.id !== customer.id)];
        return customer;
      },
      customer_list: () => state.customers,
      invoice_draft_create: (args) => {
        const t = totals(args.input.lines);
        const draft = { id: id("draft"), ...args.input, notes: args.input.notes ?? "", number: null, status: "Draft", lines: withBase(args.input.lines), totals: t, created_at: now(), issued_at: null };
        state.invoices = [{ ...draft, total_cents: t.total_cents, fiscal_hash: null }, ...state.invoices];
        return draft;
      },
      invoice_draft_update: (args) => {
        const inv = findInvoice(args.id);
        if (inv.status !== "Draft") throw "not_draft";
        if (args.input.company_id !== inv.company_id) throw "validation_error:company_id";
        const lines = withBase(mergePending(inv.lines, args.input.lines));
        const t = totals(lines);
        if (paidOf({ invoice_id: inv.id }) > t.total_cents) throw "payments_exceed_total";
        Object.assign(inv, { ...args.input, id: inv.id, notes: args.input.notes ?? "", lines, totals: t, total_cents: t.total_cents });
        const { due_date: _d, paid_cents: _p, payment_status: _s, recurring_label: _l, recurring_period_key: _k, ...invoice } = detail(inv);
        return invoice;
      },
      invoice_get: (args) => detail(findInvoice(args.invoiceId)),
      payment_register: (args) => {
        const input = args.input;
        if (Boolean(input.invoice_id) === Boolean(input.commercial_document_id)) throw "validation_error:target";
        if (!(input.amount_cents > 0)) throw "validation_error:amount_cents";
        if (!["transferencia", "tarjeta", "efectivo", "domiciliacion", "bizum", "otros"].includes(input.method)) throw "validation_error:method";
        if (!/^\d{4}-\d{2}-\d{2}$/.test(input.paid_at || "")) throw "validation_error:paid_at";
        let total;
        if (input.invoice_id) {
          const inv = findInvoice(input.invoice_id);
          if (!["Issued", "Rectified"].includes(inv.status)) throw "invoice_not_issued";
          total = inv.total_cents;
        } else {
          const doc = state.documents.find((d) => d.id === input.commercial_document_id);
          if (!doc) throw "not_found";
          if (doc.kind !== "proforma" || !["sent", "paid"].includes(doc.status)) throw "payment_not_allowed";
          total = doc.total_cents;
        }
        const paid = paidOf(input);
        if (paid + input.amount_cents > total) throw `payment_exceeds_total:${Math.max(total - paid, 0)}`;
        const row = { id: id("payment"), invoice_id: input.invoice_id ?? null, commercial_document_id: input.commercial_document_id ?? null, amount_cents: input.amount_cents, paid_at: input.paid_at, method: input.method, reference: input.reference ?? null, created_at: now() };
        state.payments = [...state.payments, row];
        return row;
      },
      payment_list: (args) => {
        if (Boolean(args.invoiceId) === Boolean(args.commercialDocumentId)) throw "validation_error:target";
        return state.payments
          .filter((p) => (args.invoiceId ? p.invoice_id === args.invoiceId : p.commercial_document_id === args.commercialDocumentId))
          .sort((a, b) => a.paid_at.localeCompare(b.paid_at));
      },
      payment_delete: (args) => {
        const row = state.payments.find((p) => p.id === args.id);
        if (!row) throw "not_found";
        const doc = row.commercial_document_id && state.documents.find((d) => d.id === row.commercial_document_id);
        if (doc && doc.status === "paid" && state.payments.filter((p) => p.commercial_document_id === doc.id).length === 1) throw "payment_required";
        state.payments = state.payments.filter((p) => p.id !== args.id);
        return null;
      },
      invoice_due_date_set: (args) => {
        if (args.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(args.dueDate)) throw "validation_error:due_date";
        findInvoice(args.invoiceId).due_date = args.dueDate || null;
        return null;
      },
      commercial_series_list: (args) => {
        if (!state.companies.some((c) => c.id === args.companyId)) throw `company not found: ${args.companyId}`;
        const year = new Date().getFullYear();
        return ["quote", "proforma", "delivery_note"].map((kind) => {
          const config = seriesOf(args.companyId, kind);
          const next = state.documents.filter((d) => d.kind === kind && d.number && d.fiscal_year === year).length + 1;
          return { ...config, preview: `${config.series_code}-${year}-${String(next).padStart(config.padding, "0")}` };
        });
      },
      commercial_series_configure: (args) => {
        const input = args.input;
        if (!["quote", "proforma", "delivery_note"].includes(input.kind)) throw "validation_error:kind";
        const code = String(input.series_code || "").trim().toUpperCase();
        if (!/^[A-Z0-9]{1,10}$/.test(code)) throw "validation_error:series_code";
        const padding = input.padding ?? 4;
        if (!(padding >= 1 && padding <= 10)) throw "validation_error:padding";
        const config = { company_id: input.company_id, kind: input.kind, series_code: code, padding, configured: true };
        state.commercialSeries = [config, ...state.commercialSeries.filter((c) => !(c.company_id === input.company_id && c.kind === input.kind))];
        return { ...config, preview: `${code}-${new Date().getFullYear()}-${"1".padStart(padding, "0")}` };
      },
      invoice_issue: (args) => issue(args.input, args.draftId),
      invoice_list: (args) => {
        const f = args.filters || {};
        const search = String(f.search || "").toLowerCase();
        return paged(
          state.invoices.map(summary).filter((inv) => {
            if (f.company_id && inv.company_id !== f.company_id) return false;
            if (f.customer_id && inv.customer_id !== f.customer_id) return false;
            if (f.fiscal_year && inv.fiscal_year !== f.fiscal_year) return false;
            if (f.series && inv.series !== f.series) return false;
            if (f.status && inv.status !== f.status) return false;
            if (f.kind && inv.kind !== f.kind) return false;
            return !search || [inv.series, inv.number, inv.kind, inv.status, inv.fiscal_hash].some((v) => String(v || "").toLowerCase().includes(search));
          }),
          args.pagination,
        );
      },
      audit_list: (args) => paged(state.audit, args.pagination),
      fiscal_record_list: (args) => paged(state.fiscalRecords, args.pagination),
      fiscal_chain_verify: () => chain(),
      backup_export: (args) => ({ target_path: args.targetPath, status: "created", notes: ["browser smoke mock"] }),
      backup_restore: (args) =>
        args.confirm
          ? { source_path: args.sourcePath, status: "restored", destructive_restore_performed: true, notes: ["browser smoke mock"], safety_backup_path: `${state.exportDir}\\antes-de-restaurar.sqlite3`, chain_ok: true }
          : { source_path: args.sourcePath, status: "validated-only", destructive_restore_performed: false, notes: ["browser smoke mock"], safety_backup_path: null, chain_ok: null },
      invoice_export_pdf: (args) => args.targetPath,
      invoice_export_json: (args) => ({ target_path: args.targetPath, status: "created", notes: ["browser smoke mock"] }),
      invoice_export_csv: (args) => ({ target_path: args.targetPath, status: "created", notes: ["browser smoke mock"] }),
      fiscal_audit_export: (args) => ({ target_path: args.targetPath, status: "created", notes: ["browser smoke mock"] }),
      rectification_advice: () => ({ reason_code: "R4", method: "I", confidence: "medium", source_refs: [], notes: [], warnings: [] }),
      verifactu_xml_draft_export: (args) => ({
        target_path: args.targetPath,
        status: "draft-created-xsd-valid",
        xsd_validated: true,
        export_id: id("export"),
        xml_sha256: hex(99),
        xml_bytes: 2048,
        notes: ["browser smoke mock"],
      }),
      verifactu_xml_anulacion_draft_export: (args) => {
        if (!String(args.reason || "").trim()) throw "reason_required";
        state.invoices = state.invoices.map((inv) => (inv.id === args.invoiceId ? { ...inv, status: "Void" } : inv));
        return { target_path: args.targetPath, status: "draft-created-xsd-valid", xsd_validated: true, export_id: id("export"), xml_sha256: hex(98), xml_bytes: 1024, notes: ["browser smoke mock"] };
      },
      verifactu_submit_preflight: (args) => {
        const needsPassword = state.settings.certificate_password_mode !== "env" && !args.input.certificate_password;
        return {
          status: needsPassword ? "blocked" : "ready",
          blockers: needsPassword ? ["certificate_password_required"] : [],
          warnings: [],
          endpoint_name: state.settings.verifactu_endpoint_name,
          endpoint_allowed: true,
          certificate_loaded: !needsPassword,
          certificate_source: "pkcs12_vault",
          aeat_calls_enabled: true,
          production_enabled: false,
          external_call_performed: false,
          certificate_expires_at: "2028-03-01T00:00:00Z",
          certificate_expires_in_days: 484,
        };
      },
      verifactu_submit: (args) => {
        const row = {
          id: id("submission"),
          invoice_id: args.input.invoice_id,
          fiscal_export_id: args.input.export_id,
          endpoint_name: state.settings.verifactu_endpoint_name,
          xml_sha256: args.input.xml_sha256,
          status: "accepted",
          csv: "MOCK-CSV",
          estado_envio: "Correcto",
          estado_registro: "Correcto",
          codigo_error: null,
          descripcion_error: null,
          tiempo_espera_envio_seconds: 1,
          submitted_at: new Date(Date.now() - 5000).toISOString(),
        };
        state.submissions = [row, ...state.submissions];
        return { ...row, submission_id: row.id, export_id: row.fiscal_export_id, operation: "RegFactuSistemaFacturacion", http_status: 200, soap_fault: null, external_call_performed: true };
      },
      verifactu_submission_list: (args) => state.submissions.filter((row) => !args.invoiceId || row.invoice_id === args.invoiceId),
      commercial_document_list: (args) => {
        const f = args.filters || {};
        const items = state.documents.filter((d) => d.company_id === f.company_id && d.kind === f.kind && (!f.status || d.status === f.status));
        return { items: paged(items, args.pagination).map(docSummary), total: items.length };
      },
      commercial_document_get: (args) => {
        const doc = state.documents.find((d) => d.id === args.id);
        if (!doc) throw "not_found";
        return doc;
      },
      commercial_document_save_draft: (args) => saveDoc(args.input),
      commercial_document_delete_draft: (args) => {
        state.documents = state.documents.filter((d) => d.id !== args.id);
        return {};
      },
      commercial_document_send: (args) => {
        const doc = state.documents.find((d) => d.id === args.id);
        if (!doc || doc.status !== "draft") throw "not_draft";
        const number = state.documents.filter((d) => d.kind === doc.kind && d.number).length + 1;
        const padding = seriesOf(doc.company_id, doc.kind).padding;
        Object.assign(doc, { number, display_number: `${doc.series_code}-${doc.fiscal_year}-${String(number).padStart(padding, "0")}`, status: doc.kind === "delivery_note" ? "delivered" : "sent", updated_at: now() });
        return doc;
      },
      commercial_document_set_status: (args) => {
        const doc = state.documents.find((d) => d.id === args.id);
        if (args.status === "void" && !args.reason) throw "reason_required";
        if (args.status === "paid" && paidOf({ commercial_document_id: doc.id }) === 0) throw "payment_required";
        Object.assign(doc, { status: args.status, void_reason: args.reason ?? doc.void_reason, updated_at: now() });
        return doc;
      },
      commercial_document_derive: (args) => {
        const source = state.documents.find((d) => d.id === args.id);
        const { company_id, customer_id, issue_date, valid_until, delivery_date, show_prices, notes, lines } = source;
        const copy = saveDoc({ company_id, customer_id, issue_date, valid_until, delivery_date, show_prices, notes, lines, kind: args.targetKind });
        copy.source_document_id = source.id;
        return copy;
      },
      commercial_document_to_invoice_draft: (args) => {
        const docs = state.documents.filter((d) => args.ids.includes(d.id));
        if (new Set(docs.map((d) => d.customer_id)).size > 1) throw "mixed_customers";
        // D8: albarán sin precios → líneas «pendiente de precio» a 0 €; D2: observaciones copiadas.
        const notes = docs.map((d) => (d.kind === "delivery_note" ? (d.notes ? `Albarán ${d.display_number}: ${d.notes}` : "") : d.notes)).filter(Boolean).join("\n");
        const lines = docs.flatMap((d) => {
          const own = d.lines.map(({ position: _p, product_id: _i, ...line }) => (d.kind === "delivery_note" && !d.show_prices ? { ...line, unit_price_cents: 0, price_pending: true } : line));
          return d.kind === "delivery_note" ? [{ description: `Albarán ${d.display_number} · ${d.delivery_date}`, quantity: 1, unit_price_cents: 0, discount_rate_basis_points: null, tax_rate_basis_points: 0, withholding_rate_basis_points: null }, ...own] : own;
        });
        const t = totals(lines);
        const draft = { id: id("draft"), company_id: docs[0].company_id, customer_id: docs[0].customer_id, fiscal_year: 2026, series: "A", number: null, kind: "Complete", status: "Draft", lines: withBase(lines), totals: t, notes, is_recapitulative: docs.length > 1, created_at: now(), issued_at: null };
        state.payments = state.payments.map((p) => (docs.some((d) => d.id === p.commercial_document_id) ? { ...p, commercial_document_id: null, invoice_id: draft.id } : p));
        state.invoices = [{ ...draft, total_cents: t.total_cents, fiscal_hash: null }, ...state.invoices];
        docs.forEach((d) => Object.assign(d, { invoice_id: draft.id, status: d.kind === "delivery_note" ? d.status : "converted" }));
        return draft;
      },
      commercial_document_pdf: (args) => ({ target_path: args.targetPath, sha256: hex(5) }),
      recurring_list: (args) => state.recurring.filter((r) => !args.companyId || r.company_id === args.companyId),
      recurring_save: (args) => {
        const existing = state.recurring.find((r) => r.id === args.input.id);
        const row = {
          ...(existing || { id: id("recurring"), active: true, last_period_key: null, created_at: now() }),
          ...args.input,
          id: existing?.id ?? args.input.id ?? id("recurring"),
          end_date: args.input.end_date ?? null,
          next_run_date: args.input.start_date,
          total_cents: totals(args.input.template.lines).total_cents,
          updated_at: now(),
        };
        state.recurring = [row, ...state.recurring.filter((r) => r.id !== row.id)];
        return row;
      },
      recurring_set_active: (args) => {
        const row = state.recurring.find((r) => r.id === args.id);
        row.active = args.active;
        return row;
      },
      recurring_delete: (args) => {
        state.recurring = state.recurring.filter((r) => r.id !== args.id);
        return null;
      },
      recurring_preview: (args) => {
        const source = args.input || state.recurring.find((r) => r.id === args.id);
        const total = totals(source.template.lines).total_cents;
        const [y, m] = source.start_date.split("-").map(Number);
        const step = { monthly: 1, quarterly: 3, yearly: 12 }[source.frequency];
        return Array.from({ length: args.count }, (_, i) => {
          const month = m - 1 + i * step;
          const year = y + Math.floor(month / 12);
          const mm = String((month % 12) + 1).padStart(2, "0");
          const key = source.frequency === "yearly" ? String(year) : source.frequency === "quarterly" ? `${year}-T${Math.ceil(Number(mm) / 3)}` : `${year}-${mm}`;
          return { period_key: key, run_date: `${year}-${mm}-${String(source.day_of_period).padStart(2, "0")}`, total_cents: total };
        });
      },
      // Un borrador por plantilla activa y periodo vencido, con su origen (D3) y sus observaciones (D2).
      recurring_generate_due: (args) => {
        const day = args.today || today();
        const created = [];
        const skipped = [];
        for (const r of state.recurring.filter((item) => item.active && item.next_run_date <= day)) {
          const [y, m] = r.next_run_date.split("-").map(Number);
          const key = r.frequency === "yearly" ? String(y) : r.frequency === "quarterly" ? `${y}-T${Math.ceil(m / 3)}` : `${y}-${String(m).padStart(2, "0")}`;
          if (r.last_period_key === key) {
            skipped.push(key);
            continue;
          }
          const lines = withBase(r.template.lines);
          const t = totals(lines);
          const draft = { id: id("draft"), company_id: r.company_id, customer_id: r.customer_id, fiscal_year: y, series: r.series_code, number: null, kind: "Complete", status: "Draft", territory_flags: ["CommonTerritory", "VeriFactu"], lines, totals: t, total_cents: t.total_cents, fiscal_hash: null, notes: r.template.notes ?? "", recurring_label: r.label, recurring_period_key: key, created_at: now(), issued_at: null };
          state.invoices = [draft, ...state.invoices];
          r.last_period_key = key;
          const step = { monthly: 1, quarterly: 3, yearly: 12 }[r.frequency];
          const month = m - 1 + step;
          r.next_run_date = `${y + Math.floor(month / 12)}-${String((month % 12) + 1).padStart(2, "0")}-${String(r.day_of_period).padStart(2, "0")}`;
          created.push(draft.id);
        }
        return { created, skipped };
      },
    };

    async function invoke(cmd, args = {}) {
      state.calls.push(cmd);
      args = JSON.parse(JSON.stringify(args ?? {})); // como Tauri: viaja en JSON (sin undefined)
      const handler = handlers[cmd];
      if (!handler) throw new Error(`Unexpected E2E command: ${cmd}`);
      return handler(args);
    }

    window.__TAURI_INTERNALS__ = {
      invoke,
      transformCallback: () => Math.floor(Math.random() * 1_000_000),
      unregisterCallback: () => undefined,
      convertFileSrc: (path) => path,
    };
  }, seed);
}

/** Arranca `vite` en `port` mientras dura `action(url)`; el registro del servidor va a `logPath`. */
export async function withViteServer({ root, port, logPath }, action) {
  const vite = resolve(root, "node_modules", "vite", "bin", "vite.js");
  if (!existsSync(vite)) throw new Error(`Missing Vite binary: ${vite}`);
  const url = `http://127.0.0.1:${port}`;
  const log = createWriteStream(logPath, { flags: "a" });
  const child = spawn(process.execPath, [vite, "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: root,
    env: { ...process.env, BROWSER: "none" },
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  const ready = () =>
    new Promise((ok) => {
      const req = http.get(url, (res) => {
        res.resume();
        ok(Boolean(res.statusCode && res.statusCode < 500));
      });
      req.on("error", () => ok(false));
      req.setTimeout(1000, () => {
        req.destroy();
        ok(false);
      });
    });
  try {
    const started = Date.now();
    while (!(await ready())) {
      if (Date.now() - started > 30_000) throw new Error(`Vite dev server did not become ready at ${url}`);
      await new Promise((later) => setTimeout(later, 300));
    }
    return await action(url);
  } finally {
    child.kill();
    log.end();
  }
}
