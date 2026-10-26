import {installTauriMock} from './browser-tauri-mock.mjs';
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



async function clickByRole(page, name) {
  const locator = page.getByRole("button", { name, exact: true });
  await expect(locator).toHaveCount(1);
  await locator.click();
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
  await expectTextVisible(page, "Borrador tecnico: XSD local, sin firma ni envio.");
  await expectTextVisible(page, "Frontera final: solo sidecar local con HMAC puede invocar AEAT");
  await expectTextVisible(page, "Canales ContaPro sidecar");
  await expectTextVisible(page, "Importado de ContaPro");
  await clickByRole(page, "Preflight SII sidecar");
  await expectTextVisible(page, "/sii/submit-preflight");
  await expect(page.getByRole("button", { name: "Preflight TicketBAI sidecar", exact: true })).toBeDisabled();
  await expectTextVisible(page, "homologacion foral sigue bloqueada");
  const initialVisibleLimits = await page.locator("body").evaluate((body) => ({
    noSignatureOrSend: body.textContent?.includes("sin firma ni envio") ?? false,
    fakeSidecar: body.textContent?.includes("gate usa sidecar falso") ?? false,
    externalBlocked: body.textContent?.includes("external_blocked") ?? false,
    contaproImport: body.textContent?.includes("Importado de ContaPro") ?? false,
  }));

  await clickByRole(page, "Rellenar demo");
  await expectTextVisible(page, "Datos demo cargados");
  await clickByRole(page, "Elegir carpeta");
  await expect(page.getByLabel("Carpeta export")).toHaveValue("C:\\CumpleFactura\\Evidence");

  await clickByRole(page, "Guardar emisor");
  await expect(page.getByLabel("Nombre legal empresa")).toHaveValue("Demo CumpleFactura SL");

  await clickByRole(page, "Guardar producto");
  await expect(page.locator(".productRow").getByText("SVC-DEMO - Servicio mensual")).toBeVisible();
  await clickByRole(page, "Usar en linea");
  await expect(page.getByLabel("Precio EUR linea 1")).toHaveValue("250");
  await expect(page.getByLabel("Descuento linea 1")).toHaveValue("10");
  await expect(page.getByLabel("IRPF linea 1")).toHaveValue("15");

  await clickByRole(page, "Guardar serie");
  await expectTextVisible(page, "General - A-001");

  await clickByRole(page, "Guardar onboarding");
  await expectTextVisible(page, "Completado");

  await clickByRole(page, "Guardar cliente");
  await expect(page.getByLabel("Nombre cliente")).toHaveValue("Cliente Demo");

  await page.getByLabel("Descripcion linea 1").fill("Servicio editable con descuento");
  await expect(page.getByLabel("Serie de esta factura")).toHaveValue(/series-/);
  await expectTextVisible(page, "238,50");

  await clickByRole(page, "Crear borrador");
  await expectTextVisible(page, "Borrador persistido");
  await expectTextVisible(page, "238,50");

  await clickByRole(page, "Emitir factura");
  await expectTextVisible(page, "Factura emitida");
  await expectTextVisible(page, "Cadena fiscal OK");
  await expectTextVisible(page, "Auditoria fiscal local");
  await clickByRole(page, "Verificar cadena");
  await expectTextVisible(page, "Registros fiscales verificados");
  await expectTextVisible(page, "Ultimo hash por empresa");
  await clickByRole(page, "Elegir auditoria");
  await clickByRole(page, "Exportar auditoria");
  await expectTextVisible(page, "created -");

  await page.getByLabel("Buscar texto factura").fill("A");
  await page.getByLabel("Filtro estado factura").selectOption("Issued");
  await clickByRole(page, "Buscar facturas");
  await expectTextVisible(page, "1 resultado(s) con filtros actuales.");

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
