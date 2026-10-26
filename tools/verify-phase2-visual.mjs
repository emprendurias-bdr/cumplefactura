import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { installTauriMock } from "./browser-tauri-mock.mjs";
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "--host",
    "127.0.0.1",
    "--port",
    "1424",
    "--strictPort",
  ],
  { stdio: "ignore" },
);
const results = [];
let browser;
const hash = "A".repeat(64);
const company = {
  id: "company-test",
  legal_name: "Empresa de prueba, S.L.",
  tax_id: "B00000000",
  address: "Dirección de prueba",
  postal_code: "28001",
  municipality: "Madrid",
  province: "Madrid",
  country_code: "ES",
  default_series: "A",
};
const customer = {
  id: "customer-test",
  display_name: "Cliente de prueba",
  tax_id: "B11111111",
  kind: "Business",
  address: "Dirección de prueba",
  postal_code: "28002",
  municipality: "Madrid",
  province: "Madrid",
  country_code: "ES",
};
const seed = {
  companies: [company],
  customers: [customer],
  invoices: [
    {
      id: "issued-test",
      company_id: company.id,
      customer_id: customer.id,
      series: "A",
      number: 128,
      kind: "Complete",
      status: "Issued",
      total_cents: 12100,
      taxable_base_cents: 10000,
      issued_at: "2026-10-26T10:00:00Z",
      fiscal_hash: hash,
    },
  ],
  fiscalRecords: [
    {
      id: "record-test",
      company_id: company.id,
      invoice_id: "issued-test",
      record_type: "Alta",
      generated_at: "2026-10-26T10:00:00Z",
      fiscal_hash: hash,
      previous_fiscal_hash: null,
      status: "issued",
    },
  ],
  seriesConfigs: [
    {
      id: "series-test",
      company_id: company.id,
      label: "General",
      series_code: "A",
      fiscal_year: 2026,
      include_year: false,
      separator: "-",
      padding: 3,
      next_number: 129,
      is_default: true,
      active: true,
      resolved_series: "A",
      preview: "A-129",
    },
  ],
  nextInvoiceNumber: 129,
};
async function route(page, id) {
  await page.evaluate((id) => {
    location.hash = "/" + id;
  }, id);
  await page.waitForTimeout(100);
}
async function capture(page, name, width, theme, errors) {
  await page.evaluate(() => document.fonts.ready);
  const shot = `docs/phase2/screenshots/${name}-${width}-${theme}.png`;
  await page.screenshot({ path: shot, fullPage: true });
  const a11y = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  results.push({
    name,
    width,
    theme,
    screenshot: shot,
    violations: a11y.violations.map(({ id, impact, nodes }) => ({
      id,
      impact,
      nodes: nodes.map((n) => ({
        target: n.target,
        summary: n.failureSummary,
      })),
    })),
    incomplete: a11y.incomplete.map(({ id, nodes }) => ({
      id,
      nodes: nodes.map((n) => ({
        target: n.target,
        summary: n.failureSummary,
      })),
    })),
    errors: [...errors],
  });
}
try {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch("http://127.0.0.1:1424")).ok) break;
    } catch {}
    if (i === 59) throw new Error("Vite failed to start");
    await new Promise((r) => setTimeout(r, 200));
  }
  browser = await chromium.launch({
    headless: true,
    executablePath: existsSync("/usr/bin/chromium")
      ? "/usr/bin/chromium"
      : undefined,
  });
  await fs.mkdir("docs/phase2/screenshots", { recursive: true });
  for (const width of [1024, 1440])
    for (const theme of ["light", "dark"]) {
      const context = await browser.newContext({
        viewport: { width, height: width === 1024 ? 700 : 900 },
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await installTauriMock(page, seed);
      await page.goto("http://127.0.0.1:1424/#/ajustes", {
        waitUntil: "networkidle",
      });
      await page.getByLabel("Tema", { exact: true }).selectOption(theme);
      for (const density of ["comfortable", "compact"]) {
        await page
          .getByLabel("Densidad", { exact: true })
          .selectOption(density);
        await route(page, "facturas");
        await expect(page.locator(".invoice-table tbody tr")).toHaveCount(1);
        const height = await page
          .locator(".invoice-table tbody tr")
          .first()
          .evaluate((el) => el.getBoundingClientRect().height);
        if (Math.abs(height - (density === "compact" ? 40 : 48)) > 1)
          throw new Error(`Row height ${height}, expected ${density}`);
        await capture(page, `facturas-${density}`, width, theme, errors);
        await route(page, "ajustes");
      }
      await page
        .getByLabel("Densidad", { exact: true })
        .selectOption("comfortable");
      await route(page, "facturas");
      await page
        .getByRole("button", { name: "Nueva factura", exact: true })
        .first()
        .click();
      await page.getByLabel("Descripcion linea 1").fill("Servicio de prueba");
      await page.getByLabel("Precio EUR linea 1").fill("100");
      const lineViewport = await page
        .locator(".editor-fields .lineTable")
        .boundingBox();
      for (const label of ["IRPF linea 1", "Quitar linea 1"]) {
        const control = await page
          .getByLabel(label, { exact: true })
          .boundingBox();
        if (
          !control ||
          !lineViewport ||
          control.x + control.width > lineViewport.x + lineViewport.width + 1
        )
          throw new Error(
            `Editor control ${label} extends beyond the line viewport at ${width}px`,
          );
      }
      await capture(page, "editor-provisional", width, theme, errors);
      await page
        .getByRole("button", { name: "Crear borrador", exact: true })
        .click();
      await expect(page.getByTitle("PDF de la factura guardada")).toBeVisible();
      await capture(page, "editor-pdf", width, theme, errors);
      await page
        .getByRole("button", { name: "Emitir factura", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await capture(page, "confirmar-emision", width, theme, errors);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).not.toBeVisible();
      await page
        .getByRole("button", { name: "Rectificativa (abono)", exact: true })
        .click();
      await page.getByRole("button", { name: "Sugerir", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "Propuesta de rectificativa" }),
      ).toBeVisible();
      await capture(page, "rectificativa-propuesta", width, theme, errors);
      await page
        .getByRole("button", { name: "Revisar rectificativa", exact: true })
        .click();
      await capture(page, "rectificativa-revision", width, theme, errors);
      await page
        .getByRole("button", { name: "Emitir rectificativa", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await capture(page, "confirmar-rectificativa", width, theme, errors);
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Cancelar", exact: true })
        .click();
      for (const id of [
        "verifactu",
        "clientes",
        "productos",
        "presupuestos",
        "proformas",
        "albaranes",
        "recurrentes",
      ]) {
        await route(page, id);
        await capture(page, id, width, theme, errors);
      }
      await route(page, "ajustes");
      for (let step = 0; step < 4; step++) {
        if (step)
          await page
            .getByRole("button", { name: "Siguiente paso", exact: true })
            .click();
        await capture(page, `configuracion-${step + 1}`, width, theme, errors);
      }
      await context.close();
    }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await fs.mkdir("docs/phase2", { recursive: true });
  const violations = results.reduce((sum, r) => sum + r.violations.length, 0);
  await fs.writeFile(
    "docs/phase2/browser-results.json",
    JSON.stringify(
      {
        status:
          process.exitCode ||
          violations ||
          results.some((r) => r.errors.length) ||
          results.length !== 76
            ? "failed"
            : "passed",
        expectedCases: 76,
        generatedAt: new Date().toISOString(),
        results,
        violations,
        limits: [
          "Synthetic Tauri fixtures; no AEAT transmission or certificates.",
          "PDF browser viewer internals are not application DOM; incomplete axe checks remain recorded.",
        ],
      },
      null,
      2,
    ),
  );
  console.log(
    `${results.length} visual cases; ${violations} detected accessibility rule violations.`,
  );
  if (
    violations ||
    results.some((r) => r.errors.length) ||
    results.length !== 76
  )
    process.exitCode = 1;
  await browser?.close();
  server.kill();
}
