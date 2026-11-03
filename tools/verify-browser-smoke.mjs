// Browser smoke: Playwright against mocked Tauri invoke (local MVP flows) on the BDR UI (design.md).
// Recorrido: primer arranque → cliente → producto → editor → emitir con confirmación → filtros →
// XML → contraseña en memoria → comprobación previa → envío (CSV ficticio) → copias → presupuesto
// → recurrente → modo oscuro. Mantiene el formato de evidencia (latest-browser-smoke.json/png).
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";
import { installTauriMock, withViteServer } from "./browser-tauri-mock.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = resolve(root, "tests", "regulatory", "evidence");
const port = Number(process.env.CUMPLEFACTURA_BROWSER_SMOKE_PORT ?? "1421");
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const screenshotPath = resolve(evidenceDir, `browser-smoke-${timestamp}.png`);
const latestJsonPath = resolve(evidenceDir, "latest-browser-smoke.json");
const latestScreenshotPath = resolve(evidenceDir, "latest-browser-smoke.png");
const serverLogPath = resolve(evidenceDir, `browser-smoke-vite-${timestamp}.log`);

async function clickByRole(page, name, role = "button") {
  const locator = page.getByRole(role, { name, exact: true });
  // Un enlace de creación puede estar en el hero y en el vacío; los botones deben ser únicos.
  if (role === "link") return locator.first().click();
  await expect(locator).toHaveCount(1);
  await locator.click();
}

async function goToSection(page, name) {
  await page.getByRole("navigation", { name: "Secciones" }).getByRole("link", { name, exact: true }).click();
}

async function expectTextVisible(page, text) {
  await expect(page.getByText(text).first()).toBeVisible();
}

/** Abre «Herramientas técnicas»: los límites del sidecar solo viven ahí. */
async function openTechnical(page) {
  const details = page.locator("details.cf-tech").first();
  if (!(await details.evaluate((element) => element.open))) await details.locator("summary").click();
}

const bodyHas = (page, texts) =>
  page.locator("body").evaluate((body, list) => Object.fromEntries(Object.entries(list).map(([key, text]) => [key, body.textContent?.includes(text) ?? false])), texts);

await mkdir(evidenceDir, { recursive: true });

const result = await withViteServer({ root, port, logPath: serverLogPath }, async (url) => {
  // CUMPLEFACTURA_CHROMIUM_PATH: Chromium del sistema cuando no coincide con la version de Playwright.
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CUMPLEFACTURA_CHROMIUM_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 }, locale: "es-ES" });
  const consoleEntries = [];
  page.on("console", (msg) => {
    if (["error", "warning"].includes(msg.type())) consoleEntries.push({ type: msg.type(), text: msg.text() });
  });
  page.on("pageerror", (error) => consoleEntries.push({ type: "pageerror", text: error.message }));

  await installTauriMock(page);
  let initialVisibleLimits;
  let finalVisibleLimits;
  let passwordPersisted;
  try {
    await page.goto(url, { waitUntil: "networkidle" });

    await expect(page).toHaveTitle(/CumpleFactura/);
    await expect(page.locator("html")).toHaveAttribute("data-producto", "violeta");

    // Primer arranque: empresa → fiscalidad → serie → certificado y carpeta.
    await expectTextVisible(page, "Prepara CumpleFactura");
    await clickByRole(page, "Rellenar con datos de ejemplo");
    await expectTextVisible(page, "Datos de ejemplo cargados");
    await expect(page.getByLabel("Nombre legal")).toHaveValue("Demo CumpleFactura SL");
    await clickByRole(page, "Guardar y seguir");
    await expectTextVisible(page, "Empresa creada.");
    await clickByRole(page, "Siguiente");
    await clickByRole(page, "Guardar serie y seguir");
    await expectTextVisible(page, "Serie guardada.");
    await expectTextVisible(page, "Solo durante esta sesión");
    await expect(page.getByRole("radio", { name: /Recordar en este equipo/ })).toBeDisabled();
    await expectTextVisible(page, "Pendiente de aprobar");
    await clickByRole(page, "Elegir carpeta");
    await expectTextVisible(page, "Evidence");
    await clickByRole(page, "Empezar a facturar");
    await expectTextVisible(page, "Factura para");

    // Shell: 7 secciones, chip de cadena, paleta Ctrl K.
    await expect(page.getByRole("navigation", { name: "Secciones" }).getByRole("link")).toHaveCount(7);
    await expectTextVisible(page, "Sin registros");
    await page.keyboard.press("Control+k");
    await expect(page.getByRole("dialog", { name: "Buscar en CumpleFactura" })).toBeVisible();
    await page.keyboard.press("Escape");

    await goToSection(page, "Documentos");
    await expectTextVisible(page, "Aún no hay presupuestos. Crea el primero.");

    // Verifactu antes de emitir: botones deshabilitados y límites honestos.
    await goToSection(page, "Verifactu");
    await expectTextVisible(page, "Esta versión no envía sola.");
    await expect(page.getByRole("button", { name: "Comprobación previa", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Enviar a la AEAT", exact: true })).toBeDisabled();
    await openTechnical(page);
    initialVisibleLimits = await bodyHas(page, {
      noSend: "Esta versión no envía sola",
      gateNoAeat: "el gate no llama a AEAT",
      externalBlocked: "sin llamada AEAT real ni CSV",
    });

    // Cliente y producto.
    await goToSection(page, "Clientes");
    await clickByRole(page, "Nuevo cliente", "link");
    await page.getByLabel("Nombre", { exact: true }).fill("Cliente Demo");
    await page.getByLabel("NIF", { exact: true }).fill("12345678Z");
    await page.getByLabel("Dirección", { exact: true }).fill("Calle Cliente 2");
    await page.getByLabel("Código postal", { exact: true }).fill("28002");
    await page.getByLabel("Municipio", { exact: true }).fill("Madrid");
    await page.getByLabel("Provincia", { exact: true }).fill("Madrid");
    await page.getByLabel("País", { exact: true }).fill("ES");
    await clickByRole(page, "Guardar cliente");
    await expectTextVisible(page, "Cliente creado.");
    await expect(page.getByRole("table", { name: "Clientes" }).getByText("Cliente Demo")).toBeVisible();

    await goToSection(page, "Productos");
    await clickByRole(page, "Nuevo producto", "link");
    await page.getByLabel("Código", { exact: true }).fill("svc-demo");
    await page.getByLabel("Nombre", { exact: true }).fill("Servicio mensual");
    await page.getByLabel("Descripción en la línea").fill("Servicio mensual de mantenimiento");
    await page.getByLabel(/^Precio/).fill("250");
    await page.getByLabel("IRPF %").fill("15");
    await page.getByLabel("Descuento %").fill("10");
    await clickByRole(page, "Guardar producto");
    const productRow = page.getByRole("table", { name: "Productos" }).getByRole("row").filter({ hasText: "SVC-DEMO" });
    await expect(productRow).toBeVisible();
    await productRow.locator("summary").click();
    await clickByRole(page, "Usar en factura", "menuitem");

    // Editor: líneas con descuento e IRPF, borrador y confirmación de emisión.
    await expect(page.getByLabel("Precio línea 1")).toHaveValue("250");
    await expect(page.getByLabel("Descuento línea 1")).toHaveValue("10");
    await expect(page.getByLabel("IRPF línea 1")).toHaveValue("15");
    await page.getByLabel("Descripción línea 1").fill("Servicio editable con descuento");
    await expectTextVisible(page, "238,50");
    await expect(page.getByRole("button", { name: "Emitir factura", exact: true })).toBeDisabled();
    await clickByRole(page, "Guardar borrador");
    await expectTextVisible(page, "Borrador guardado.");
    await clickByRole(page, "Emitir factura");
    const confirm = page.getByRole("dialog", { name: /¿Emitir la factura A-1\?/ });
    await expect(confirm).toBeVisible();
    await expect(confirm.getByText("No se envía a la AEAT al emitir", { exact: false })).toBeVisible();
    await expect(confirm.getByRole("button", { name: "Emitir", exact: true })).toBeDisabled();
    await confirm.getByLabel("Lo entiendo").check();
    await confirm.getByRole("button", { name: "Emitir", exact: true }).click();
    await expectTextVisible(page, "Factura A-1 emitida.");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("A-1");
    await expectTextVisible(page, "Registro de alta guardado · XML sin exportar");

    // Lista con búsqueda al escribir y filtro de estado.
    await goToSection(page, "Facturas");
    await page.getByPlaceholder("Número, cliente, NIF o huella").fill("A");
    await page.getByLabel("Estado", { exact: true }).selectOption("Issued");
    await expectTextVisible(page, "1 en esta página");

    // Verifactu: XML → contraseña en memoria → comprobación previa → envío (CSV ficticio del mock).
    await goToSection(page, "Verifactu");
    await clickByRole(page, "Exportar XML");
    await expectTextVisible(page, "XML preparado y validado.");
    await expect(page.getByRole("button", { name: "Comprobación previa", exact: true })).toBeDisabled();
    await page.getByLabel("Contraseña del certificado").fill("mock-pass-123");
    await openTechnical(page);
    finalVisibleLimits = await bodyHas(page, { noAeatCsv: "sin llamada AEAT real ni CSV", gateNoAeat: "el gate no llama a AEAT" });
    await clickByRole(page, "Comprobación previa");
    await expectTextVisible(page, "Todo listo para enviar.");
    await clickByRole(page, "Enviar a la AEAT");
    await expectTextVisible(page, "Aceptada por la AEAT · A-1.");
    await expect(page.getByRole("table", { name: "Envíos a la AEAT" }).getByText("MOCK-CSV")).toBeVisible();
    passwordPersisted = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }).includes("mock-pass-123"));
    if (passwordPersisted) throw new Error("La contraseña del certificado no puede guardarse en el almacenamiento del navegador.");

    // Copias: validar y restaurar con confirmación.
    await goToSection(page, "Ajustes");
    await clickByRole(page, "Copias", "link");
    await clickByRole(page, "Crear copia de seguridad");
    await expectTextVisible(page, "Copia creada.");
    await clickByRole(page, "Elegir copia…");
    await clickByRole(page, "Validar copia");
    await expectTextVisible(page, "La copia es válida.");
    await clickByRole(page, "Restaurar");
    const restoreDialog = page.getByRole("dialog", { name: /¿Restaurar la copia/ });
    await restoreDialog.getByLabel("Lo entiendo").check();
    await restoreDialog.getByRole("button", { name: "Restaurar", exact: true }).click();
    await expectTextVisible(page, "Copia restaurada.");

    // Documentos: presupuesto → enviado → aceptado → borrador de factura.
    await goToSection(page, "Documentos");
    await clickByRole(page, "Nuevo presupuesto", "link");
    await page.getByLabel("Cliente", { exact: true }).selectOption({ label: "Cliente Demo" });
    await clickByRole(page, "Guardar borrador");
    await expectTextVisible(page, "Borrador guardado.");
    await clickByRole(page, "Enviar");
    await expectTextVisible(page, "P-2026-0001");
    await clickByRole(page, "Marcar como aceptado");
    await clickByRole(page, "Convertir en factura");
    await expectTextVisible(page, "Borrador de factura creado. Revísalo y emítelo.");
    await expectTextVisible(page, "Factura para");

    // Recurrentes: plantilla con próximas fechas antes de guardar.
    await goToSection(page, "Recurrentes");
    await clickByRole(page, "Nueva plantilla", "link");
    await page.getByLabel("Nombre de la plantilla").fill("Cuota mantenimiento web");
    await page.getByLabel("Cliente", { exact: true }).selectOption({ label: "Cliente Demo" });
    await expect(page.locator(".bdr-log li").first()).toBeVisible();
    await clickByRole(page, "Guardar plantilla");
    await expect(page.getByRole("table", { name: "Recurrentes" }).getByText("Cuota mantenimiento web")).toBeVisible();

    // Apariencia: el panel ⚙ cambia el modo al momento.
    await clickByRole(page, "Apariencia y color");
    await page.locator("#cf-appearance").getByRole("button", { name: "Oscuro", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-apariencia", "oscuro");
    await page.keyboard.press("Escape");
    await goToSection(page, "Verifactu");

  } catch (error) {
    // Captura del fallo para depurar (no se versiona: tests/regulatory/evidence se limpia).
    await page.screenshot({ path: resolve(evidenceDir, "browser-smoke-failure.png"), fullPage: true }).catch(() => undefined);
    throw error;
  }
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await page.screenshot({ path: latestScreenshotPath, fullPage: true });

  if (!initialVisibleLimits.noSend || !initialVisibleLimits.gateNoAeat || !initialVisibleLimits.externalBlocked) {
    throw new Error(`Initial visible limits missing: ${JSON.stringify(initialVisibleLimits)}`);
  }
  if (!finalVisibleLimits.noAeatCsv || !finalVisibleLimits.gateNoAeat) {
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
    flow:
      "first run (company/series/folder) -> customer -> product to line with discount/IRPF -> draft -> confirm issue -> filters -> export VERI*FACTU XML -> session password -> sidecar preflight -> submit (mocked AEAT CSV) -> backup validate/restore -> quote to invoice draft -> recurring template -> dark mode",
    checks: {
      page_identity: true,
      not_blank: true,
      framework_overlay_absent: true,
      console_health: true,
      interaction_proof: true,
      certificate_password_not_persisted: !passwordPersisted,
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
      "It does not prove Rust command execution, the sidecar process, mTLS AEAT transport or external acceptance.",
    ],
  };
});

await writeFile(latestJsonPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log("CumpleFactura browser smoke OK");
console.log(`Evidence: ${latestJsonPath}`);
console.log(`Screenshot: ${latestScreenshotPath}`);
