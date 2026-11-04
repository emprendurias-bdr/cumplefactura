// Capturas de las pantallas principales en los 4 modos de design.md (claro/oscuro × intenso/suave)
// a 1024×700 y 1440×900, con datos de ejemplo (mock de Tauri del smoke). Salida: docs/ux/f2/.
// R2: los datos llevan cobros (pagada, parcial, vencida), observaciones, logo, un borrador recurrente
// y un borrador de albaranes con una línea pendiente de precio.
// Uso: node tools/verify-modes-visual.mjs [carpeta]. CUMPLEFACTURA_CHROMIUM_PATH como en el smoke.
// Falla si una pantalla tiene errores de consola o si el modo no se aplica en <html>.
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { installTauriMock, withViteServer } from "./browser-tauri-mock.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, process.argv[2] ?? "docs/ux/f2");
const port = Number(process.env.CUMPLEFACTURA_VISUAL_PORT ?? "1422");
const MODES = [
  ["claro", "intenso"],
  ["claro", "suave"],
  ["oscuro", "intenso"],
  ["oscuro", "suave"],
];
const SIZES = [
  [1024, 700],
  [1440, 900],
];

/* --- Estado de ejemplo: una empresa con facturas en todos los estados fiscales --- */
const hex = (n) => Array.from({ length: 64 }, (_, i) => "0123456789ABCDEF"[(n * 7 + i * 13) % 16]).join("");
const company = { id: "co-1", legal_name: "Talleres Marín, S.L.", tax_id: "B46123456", address: "Calle Mayor 12", postal_code: "46001", municipality: "Valencia", province: "Valencia", country_code: "ES", default_series: "A", logo_path: "C:\\CumpleFactura\\Data\\logos\\co-1.png", created_at: "2026-01-02T09:00:00Z" };
const customers = [
  ["cu-1", "Logística Sur, S.L.", "B41000000", "Sevilla"],
  ["cu-2", "Bodegas del Júcar", "B16000000", "Cuenca"],
  ["cu-3", "Clínica Dental Ribera", "B46999999", "Alzira"],
].map(([id, display_name, tax_id, municipality]) => ({ id, display_name, tax_id, kind: "Business", address: "Polígono 4", postal_code: "41001", municipality, province: municipality, country_code: "ES" }));
const series = { id: "se-1", company_id: "co-1", label: "General", series_code: "A", fiscal_year: 2026, include_year: false, separator: "-", padding: 3, next_number: 6, is_default: true, active: true, resolved_series: "A", preview: "A-006", created_at: "2026-01-02T09:00:00Z" };
const line = (description, quantity, unit_price_cents, extra = {}) => ({ description, quantity, unit_price_cents, discount_rate_basis_points: null, tax_rate_basis_points: 2100, withholding_rate_basis_points: null, ...extra });
const textLine = (description) => line(description, 1, 0, { tax_rate_basis_points: 0 });
const inv = (n, customer_id, status, lines, day, kind = "Complete", extra = {}) => {
  const base = lines.reduce((sum, l) => sum + l.quantity * l.unit_price_cents, 0);
  const tax = lines.reduce((sum, l) => sum + Math.trunc((l.quantity * l.unit_price_cents * l.tax_rate_basis_points) / 10000), 0);
  return {
    id: `inv-${n}`, company_id: "co-1", customer_id, fiscal_year: 2026, series: "A", number: status === "Draft" ? null : n, kind, status,
    total_cents: base + tax, fiscal_hash: status === "Draft" ? null : hex(n), created_at: `2026-10-${day}T09:00:00Z`, issued_at: status === "Draft" ? null : `2026-10-${day}T10:15:00Z`,
    lines, notes: "", ...extra,
  };
};
const invoices = [
  inv(5, "cu-1", "Issued", [line("Transporte Valencia–Sevilla", 4, 65000), line("Estancia en almacén (mes)", 1, 100000)], "28", "Complete", { notes: "Pago por transferencia a 30 días. IBAN ES12 3456 7890 1234 5678 9012." }),
  inv(4, "cu-2", "Issued", [line("Revisión de flota", 1, 125000)], "25", "Complete", { due_date: "2026-11-25" }),
  inv(3, "cu-3", "Issued", [line("Material clínico", 4, 12000)], "22", "Complete", { due_date: "2026-10-30" }),
  inv(2, "cu-1", "Void", [line("Transporte urgente", 1, 98000)], "20", "Complete", { void_reason: "Duplicada por error." }),
  inv(1, "cu-2", "Issued", [line("Abono por devolución", 1, -30000)], "17", "Rectifying"),
  inv(9, "cu-3", "Draft", [line("Mantenimiento equipos", 1, 72000)], "29"),
  inv(10, "cu-3", "Draft", [line("Mantenimiento web", 1, 12000)], "30", "Complete", { recurring_label: "Cuota mantenimiento web", recurring_period_key: "2026-11", notes: "Incluye copias de seguridad diarias." }),
  inv(11, "cu-1", "Draft", [textLine("Albarán AL-2026-0012 · 05/11/2026"), line("Entrega palés", 10, 0, { price_pending: true }), textLine("Albarán AL-2026-0013 · 06/11/2026"), line("Entrega palés", 6, 3500)], "31", "Complete", { is_recapitulative: true, notes: "Albarán AL-2026-0012: Descarga en muelle 3." }),
];
const payments = [
  { id: "pa-1", invoice_id: "inv-5", commercial_document_id: null, amount_cents: 435600, paid_at: "2026-11-02", method: "transferencia", reference: "TRF 2026-1102", created_at: "2026-11-02T09:00:00Z" },
  { id: "pa-2", invoice_id: "inv-4", commercial_document_id: null, amount_cents: 50000, paid_at: "2026-10-30", method: "bizum", reference: null, created_at: "2026-10-30T09:00:00Z" },
  { id: "pa-3", invoice_id: null, commercial_document_id: "d-6", amount_cents: 30000, paid_at: "2026-11-03", method: "transferencia", reference: "Anticipo 50 %", created_at: "2026-11-03T09:00:00Z" },
];
const records = invoices.filter((i) => i.fiscal_hash).map((i, k) => ({ id: `fr-${i.number}`, company_id: "co-1", invoice_id: i.id, record_type: "Alta", generated_at: i.issued_at, fiscal_hash: i.fiscal_hash, previous_fiscal_hash: k ? hex(k) : null, xml_path: null, status: "issued" }));
const sub = (id, invoice_id, status, csv, at) => ({ id, invoice_id, fiscal_export_id: `exp-${id}`, endpoint_name: "SistemaVerifactuPruebas", xml_sha256: hex(40), status, csv, estado_envio: status === "transport_error" ? null : "Correcto", estado_registro: status === "accepted" ? "Correcto" : null, codigo_error: null, descripcion_error: status === "accepted_with_errors" ? "Revisa el campo Destinatario." : null, tiempo_espera_envio_seconds: 60, submitted_at: at });
const doc = (id, kind, status, number, customer_id, lines, extra = {}) => {
  const base = lines.reduce((s, l) => s + l.quantity * l.unit_price_cents, 0);
  const prefix = { quote: "P", proforma: "PF", delivery_note: "AL" }[kind];
  return { id, company_id: "co-1", customer_id, kind, series_code: prefix, fiscal_year: 2026, number, display_number: number ? `${prefix}-2026-${String(number).padStart(4, "0")}` : null, status, issue_date: "2026-11-03", valid_until: kind === "delivery_note" ? null : "2026-12-03", delivery_date: kind === "delivery_note" ? "2026-11-05" : null, show_prices: true, notes: "Pago a 30 días.", taxable_base_cents: base, tax_cents: Math.trunc(base * 0.21), withholding_cents: 0, total_cents: base + Math.trunc(base * 0.21), source_document_id: null, invoice_id: null, void_reason: null, created_at: "2026-11-03T09:00:00Z", updated_at: "2026-11-03T11:00:00Z", lines: lines.map((l, position) => ({ ...l, position, product_id: null })), ...extra };
};
const seed = {
  companies: [company],
  customers,
  products: [
    { id: "pr-1", company_id: "co-1", sku: "TRANS-VS", name: "Transporte Valencia–Sevilla", description: "Transporte Valencia–Sevilla", kind: "Service", unit_price_cents: 65000, tax_rate_basis_points: 2100, withholding_rate_basis_points: null, discount_rate_basis_points: null, active: true, updated_at: "2026-10-01T00:00:00Z" },
    { id: "pr-2", company_id: "co-1", sku: "ALM-MES", name: "Estancia en almacén (mes)", description: "Estancia en almacén", kind: "Service", unit_price_cents: 100000, tax_rate_basis_points: 2100, withholding_rate_basis_points: null, discount_rate_basis_points: null, active: false, updated_at: "2026-10-01T00:00:00Z" },
  ],
  invoices,
  seriesConfigs: [series],
  fiscalRecords: records,
  audit: invoices.filter((i) => i.issued_at).map((i) => ({ id: `au-${i.id}`, action: "invoice_issue", actor: "local-user", hash: i.fiscal_hash, occurred_at: i.issued_at })),
  submissions: [
    sub("s-2", "inv-5", "accepted", "A7Q2K9KD1X", "2026-10-28T11:05:00Z"),
    sub("s-3", "inv-4", "transport_error", null, "2026-10-26T08:00:00Z"),
    sub("s-1", "inv-1", "accepted_with_errors", "B81LM2PQ0Z", "2026-10-17T12:00:00Z"),
  ],
  documents: [
    doc("d-1", "quote", "sent", 14, "cu-1", [line("Transporte Valencia–Sevilla", 4, 65000), line("Estancia en almacén (mes)", 1, 100000)]),
    doc("d-2", "quote", "draft", null, "cu-2", [line("Revisión de flota", 1, 48000)]),
    doc("d-3", "delivery_note", "delivered", 12, "cu-1", [line("Entrega palés", 10, 3500)]),
    doc("d-4", "delivery_note", "delivered", 13, "cu-1", [line("Entrega palés", 6, 3500)]),
    doc("d-5", "delivery_note", "invoiced", 11, "cu-3", [line("Material clínico", 2, 12000)], { invoice_id: "inv-3" }),
    doc("d-6", "proforma", "sent", 3, "cu-2", [line("Reparación motor", 1, 50000)]),
  ],
  payments,
  commercialSeries: [{ company_id: "co-1", kind: "quote", series_code: "PRES", padding: 3, configured: true }],
  recurring: [
    { id: "re-1", company_id: "co-1", customer_id: "cu-3", label: "Cuota mantenimiento web", series_code: "A", frequency: "monthly", day_of_period: 1, start_date: "2026-01-01", end_date: null, next_run_date: "2026-12-01", template: { lines: [line("Mantenimiento web", 1, 12000)], notes: "" }, active: true, last_period_key: "2026-11", total_cents: 14520, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z" },
    { id: "re-2", company_id: "co-1", customer_id: "cu-2", label: "Alquiler nave", series_code: "A", frequency: "quarterly", day_of_period: 5, start_date: "2026-01-05", end_date: "2027-12-31", next_run_date: "2027-01-05", template: { lines: [line("Alquiler nave trimestre", 1, 300000)], notes: "" }, active: false, last_period_key: "2026-T4", total_cents: 363000, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-10-05T00:00:00Z" },
  ],
  nextId: 100,
  nextInvoiceNumber: 6,
  exportDir: "C:\\CumpleFactura\\Exportaciones",
  settings: { export_dir: "C:\\CumpleFactura\\Exportaciones", default_territory_flags: ["CommonTerritory", "VeriFactu"], onboarding_completed: true, verifactu_endpoint_name: "SistemaVerifactuPruebas", certificate_password_mode: "session", qr_environment: "test", updated_at: "2026-11-03T00:00:00Z" },
};

const SCREENS = [
  ["facturas", "#/facturas"],
  ["factura-ficha", "#/facturas/inv-5"],
  ["factura-cobros", "#/facturas/inv-4"],
  ["borrador-recurrente", "#/facturas/inv-10/editar"],
  ["borrador-albaranes", "#/facturas/inv-11/editar"],
  ["factura-editor", "#/facturas/nueva"],
  ["emitir-confirmacion", "#/facturas/nueva", null, async (page) => {
    await page.getByRole("button", { name: "Guardar borrador", exact: true }).click();
    await page.getByRole("button", { name: "Emitir factura", exact: true }).click();
    await page.getByRole("dialog").waitFor();
  }],
  ["rectificativa", "#/facturas/inv-4/rectificar"],
  ["verifactu", "#/verifactu"],
  ["presupuestos", "#/documentos/presupuestos"],
  ["presupuesto-ficha", "#/documentos/presupuestos/d-1"],
  ["proforma-cobros", "#/documentos/proformas/d-6"],
  ["albaranes", "#/documentos/albaranes", null, async (page) => {
    const boxes = page.getByRole("checkbox", { name: "Seleccionar fila" });
    await boxes.nth(0).check();
    await boxes.nth(1).check();
  }],
  ["recurrentes", "#/recurrentes"],
  ["recurrente-editor", "#/recurrentes/re-1"],
  ["clientes", "#/clientes/cu-1"],
  ["productos", "#/productos"],
  ["ajustes-empresa", "#/ajustes/empresa"],
  ["ajustes-series", "#/ajustes/series"],
  ["ajustes-certificado", "#/ajustes/certificado"],
  ["ajustes-copias", "#/ajustes/copias"],
  ["primer-arranque", "#/facturas", { ...seed, companies: [], customers: [], invoices: [], seriesConfigs: [], fiscalRecords: [], submissions: [], documents: [], recurring: [], settings: { ...seed.settings, onboarding_completed: false } }],
];

await mkdir(outDir, { recursive: true });
const shots = await withViteServer({ root, port, logPath: resolve(tmpdir(), "cumplefactura-modes-visual-vite.log") }, async (url) => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CUMPLEFACTURA_CHROMIUM_PATH || undefined });
  const written = [];
  const problems = [];
  for (const [apariencia, color] of MODES) {
    for (const [width, height] of SIZES) {
      const context = await browser.newContext({ viewport: { width, height }, locale: "es-ES", reducedMotion: "reduce" });
      await context.addInitScript(([a, c]) => {
        localStorage.setItem("bdr.apariencia", a);
        localStorage.setItem("bdr.color", c);
      }, [apariencia, color]);
      for (const [name, hash, screenSeed, act] of SCREENS) {
        const page = await context.newPage();
        page.on("console", (msg) => msg.type() === "error" && problems.push(`${name}: ${msg.text()}`));
        page.on("pageerror", (error) => problems.push(`${name}: ${error.message}`));
        await installTauriMock(page, screenSeed ?? seed);
        await page.goto(`${url}/${hash}`, { waitUntil: "networkidle" });
        await page.waitForTimeout(500);
        if (act) {
          await act(page);
          await page.waitForTimeout(400);
        }
        const mode = await page.evaluate(() => `${document.documentElement.dataset.apariencia}-${document.documentElement.dataset.color}`);
        if (mode !== `${apariencia}-${color}`) problems.push(`${name}: mode ${mode}`);
        const file = resolve(outDir, `${name}-${apariencia}-${color}-${width}.png`);
        await page.screenshot({ path: file, fullPage: true });
        written.push(file);
        await page.close();
      }
      await context.close();
    }
  }
  await browser.close();
  if (problems.length) throw new Error(`Visual check problems:\n${problems.join("\n")}`);
  return written;
});

console.log(`CumpleFactura modes visual OK: ${shots.length} capturas en ${outDir}`);
