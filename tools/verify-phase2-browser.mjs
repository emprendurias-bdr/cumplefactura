import { chromium, expect } from "@playwright/test";
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
    "1423",
    "--strictPort",
  ],
  { stdio: "ignore" },
);
let browser;
try {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch("http://127.0.0.1:1423")).ok) break;
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
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  const seed = {
    draftDelayMs: 800,
    preparedSignatureStatus: "signed_xades",
    preflightDelayMs: 800,
    failIssueAfterCommitOnce: true,
    failOnIssueNumber: 2,
    companies: [
      {
        id: "company-test",
        legal_name: "Empresa de prueba, S.L.",
        tax_id: "B00000000",
        address: "Dirección de prueba",
        postal_code: "28001",
        municipality: "Madrid",
        province: "Madrid",
        country_code: "ES",
        default_series: "A",
      },
    ],
    customers: [
      {
        id: "customer-test",
        display_name: "Cliente de prueba",
        tax_id: "B11111111",
        kind: "Business",
        address: "Dirección de prueba",
        postal_code: "28002",
        municipality: "Madrid",
        province: "Madrid",
        country_code: "ES",
      },
    ],
    seriesConfigs: [
      {
        id: "series-test",
        company_id: "company-test",
        label: "General",
        series_code: "A",
        fiscal_year: 2026,
        include_year: false,
        separator: "-",
        padding: 3,
        next_number: 1,
        is_default: true,
        active: true,
        resolved_series: "A",
        preview: "A-001",
      },
    ],
  };
  seed.companies.push({
    ...seed.companies[0],
    id: "company-other",
    legal_name: "Otra empresa de prueba, S.L.",
    default_series: "B",
  });
  await installTauriMock(page, seed);
  const failures = [];
  page.on("pageerror", (error) => failures.push(error.message));
  await page.goto("http://127.0.0.1:1423", { waitUntil: "networkidle" });
  await expect(
    page.getByRole("heading", { name: "Tus facturas" }),
  ).toBeVisible();
  await page.keyboard.press("Control+k");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Clientes", exact: true })
    .focus();
  await page.keyboard.press("n");
  await expect(
    page.getByRole("heading", { name: "Tus facturas" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Nueva factura", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: /Factura para/ }),
  ).toBeVisible();
  await expect(page.getByText(/Se numerará.*al emitir/)).toBeVisible();
  await page.getByLabel("Descripcion linea 1").fill("Servicio de prueba");
  await page.getByLabel("Precio EUR linea 1").fill("90071992547410");
  await expect(
    page.getByRole("button", { name: "Crear borrador", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Precio EUR linea 1").fill("100");
  await page.getByLabel("IVA linea 1").fill("21");
  await page
    .getByRole("button", { name: "Crear borrador", exact: true })
    .evaluate((button) => {
      button.click();
      button.click();
    });
  await expect(
    page.getByRole("button", { name: "Crear borrador", exact: true }),
  ).toBeDisabled();
  await expect(page.getByLabel("Descripcion linea 1")).toBeDisabled();

  await expect(
    page
      .getByRole("status")
      .filter({ hasText: /Borrador|Crear borrador/ })
      .first(),
  ).toBeVisible();
  await expect(page.getByTitle("PDF de la factura guardada")).toBeVisible();
  const savedRows = await page.evaluate(() =>
    window.__TAURI_INTERNALS__.invoke("invoice_list", {
      filters: {},
      pagination: { limit: 20, offset: 0 },
    }),
  );
  expect(savedRows.filter((row) => row.status === "Draft")).toHaveLength(1);

  await page
    .getByLabel("Descripcion linea 1")
    .fill("Servicio de prueba actualizado");
  await expect(page.getByTitle("PDF de la factura guardada")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Emitir factura", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Crear borrador", exact: true })
    .click();
  await expect(page.getByTitle("PDF de la factura guardada")).toBeVisible();
  await page
    .getByRole("button", { name: "Emitir factura", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: /Emitir factura/ }),
  ).toBeDisabled();
  await dialog.getByRole("checkbox", { name: "Lo entiendo" }).check();
  await dialog
    .getByRole("button", { name: /Emitir factura/ })
    .evaluate((button) => {
      button.click();
      button.click();
    });
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("alert").filter({ hasText: /Revisa la lista/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("alert").filter({ hasText: /Revisa la lista/ }),
  ).toBeFocused();
  await expect(
    page.getByRole("button", { name: "Emitir factura", exact: true }),
  ).toBeDisabled();
  await page.getByRole("link", { name: "Facturas", exact: true }).click();
  await page.getByRole("button", { name: "Refrescar", exact: true }).click();
  await expect(
    page.getByRole("table").getByText("A-1", { exact: true }),
  ).toHaveCount(1);
  await expect(
    page.locator(".invoice-table tbody tr").filter({
      has: page.locator(".bdr-chip").filter({ hasText: /^Emitida$/ }),
    }),
  ).toHaveCount(1);
  await expect(
    page.getByText("Registro de alta · envío sin confirmar", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Verifactu", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Estado fiscal" }),
  ).toBeVisible();
  await expect(
    page.getByText("Aceptada por la AEAT", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Facturas", exact: true }).click();
  await page
    .getByRole("button", { name: "Nueva factura", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Rectificativa (abono)", exact: true })
    .click();
  await page.getByRole("button", { name: "Sugerir", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Propuesta de rectificativa" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Revisar rectificativa", exact: true })
    .click();
  await expect(page.getByText(/Base fija.*10,00/)).toBeVisible();
  await page
    .getByRole("button", { name: "Emitir rectificativa", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Confirmar rectificativa", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancelar", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Emitir rectificativa", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("checkbox", { name: "Lo entiendo" })
    .check();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirmar rectificativa", exact: true })
    .evaluate((button) => {
      button.click();
      button.click();
    });
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("alert").filter({ hasText: /confirmación del abono/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("alert").filter({ hasText: /confirmación del abono/ }),
  ).toBeFocused();
  await expect(
    page.getByRole("button", { name: "Sugerir", exact: true }),
  ).toBeDisabled();

  await page.getByRole("link", { name: "Ajustes", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Prepara tu primera factura" }),
  ).toBeVisible();
  for (const name of ["Fiscalidad", "Primera serie", "Certificado y carpeta"]) {
    await page
      .getByRole("button", { name: "Siguiente paso", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: new RegExp("Paso .*" + name) }),
    ).toBeVisible();
  }
  await expect(
    page.getByText(
      "No comprobado. Guardar la configuración básica no acredita que puedas enviar a la AEAT.",
      { exact: true },
    ),
  ).toBeVisible();
  const localTools = page.getByText("Herramientas locales y exportaciones", {
    exact: true,
  });
  await localTools.click();
  await page.getByRole("button", { name: "Exportar XML", exact: true }).click();
  await expect(page.getByText(/draft_xml_exported/).first()).toBeVisible();
  await page.getByRole("button", { name: "Preparar", exact: true }).click();
  await expect(
    page.getByText(/signed_xades - prepared_for_signature/),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Preflight envio sidecar", exact: true })
    .click();
  await expect(
    page.getByText(/fixture-certificate-checked-transport-blocked/),
  ).toBeVisible();
  await page.getByRole("link", { name: "Verifactu", exact: true }).click();
  await expect(
    page.getByText("90 días restantes", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Ajustes", exact: true }).click();
  await page
    .getByRole("button", { name: "Paso 4: Certificado y carpeta", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Paso 4: Certificado y carpeta",
      exact: true,
    }),
  ).toContainText("Comprobado");
  await localTools.click();
  await page
    .getByLabel("Referencia del certificado", { exact: true })
    .fill("vault://certs/missing-unchecked");
  await expect(
    page.getByRole("button", {
      name: "Paso 4: Certificado y carpeta",
      exact: true,
    }),
  ).toContainText("Pendiente");
  await page.getByRole("link", { name: "Verifactu", exact: true }).click();
  await expect(
    page.getByText("90 días restantes", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Ajustes", exact: true }).click();
  await localTools.click();
  await page
    .getByRole("button", { name: "Preflight envio sidecar", exact: true })
    .click();
  await page
    .getByLabel("Referencia del certificado", { exact: true })
    .fill("vault://certs/changed-during-check");
  await page.waitForTimeout(1100);
  await page.getByRole("link", { name: "Verifactu", exact: true }).click();
  await expect(
    page.getByText("90 días restantes", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Facturas", exact: true }).click();
  await page
    .getByRole("button", { name: "Nueva factura", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Crear borrador", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Empresa", exact: true })
    .selectOption("Otra empresa de prueba, S.L.");
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: /Borrador guardado para una versión anterior/ })
      .first(),
  ).toBeVisible();
  await expect(page.getByTitle("PDF de la factura guardada")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Emitir factura", exact: true }),
  ).toBeDisabled();
  if (failures.length) throw new Error(JSON.stringify(failures));
  await fs.mkdir("docs/phase2", { recursive: true });
  await fs.writeFile(
    "docs/phase2/flow-result.json",
    JSON.stringify(
      {
        status: "passed",
        checks: [
          "table",
          "editor",
          "draft",
          "confirmation-understood",
          "single-issue-after-double-click-and-lost-ack",
          "abono-lost-ack-disables-retry",
          "stale-pdf-invalidated-after-edit",
          "unsafe-cents-blocked",
          "four-setup-steps",
          "single-draft-after-double-click",
          "company-change-discards-late-draft",
          "certificate-change-invalidates-check",
          "late-certificate-response-cannot-restore-check",
          "fiscal-progress",
          "no-false-acceptance",
        ],
        native: false,
      },
      null,
      2,
    ),
  );
  console.log(
    "Phase 2 primary workflow passed (mock Tauri; no AEAT transmission).",
  );
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.kill();
}
