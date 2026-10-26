import { compatibleDriver, executableDriverVersion, installedWebViewVersion, preferDownloadedDriver } from "./webview-driver.mjs";
import { waitForWebDriver } from "./webdriver-readiness.mjs";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { download as downloadEdgeDriver } from "edgedriver";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = resolve(root, "tests/regulatory/evidence");
const outputJson = resolve(evidenceDir, "latest-tauri-desktop-e2e.json");
const outputMd = resolve(evidenceDir, "latest-tauri-desktop-e2e.md");
const releaseExe = resolve(root, "src-tauri/target/release/cumplefactura.exe");
const realMode = ["1", "true", "yes", "on"].includes(
  (process.env.CUMPLEFACTURA_TAURI_DESKTOP_E2E_REAL ?? "").trim().toLowerCase(),
);
const webViewVersion=installedWebViewVersion();
let resolvedEdgeDriverPath = "";
let driverResolutionError = webViewVersion ? "" : "WebView2 runtime version could not be detected";
try {
  if(webViewVersion)resolvedEdgeDriverPath = await downloadEdgeDriver(webViewVersion,resolve(root,"node_modules/.cache/webview-driver",webViewVersion));
} catch (error) {
  driverResolutionError=error instanceof Error?error.message:String(error);
  resolvedEdgeDriverPath = "";
}

function pathInfo(path) {
  if (!path || !existsSync(path)) {
    return { exists: false };
  }
  const stat = statSync(path);
  return { exists: true, is_file: stat.isFile(), is_dir: stat.isDirectory(), bytes: stat.size };
}

function localCommandCandidates(command) {
  const home = process.env.USERPROFILE ?? process.env.HOME ?? "";
  const candidates = [];
  if (command === "tauri-driver.exe" && home) {
    candidates.push(resolve(home, ".cargo/bin/tauri-driver.exe"));
  }
  if (command === "chromedriver.exe") {
    candidates.push(resolve(root, "node_modules/.bin/chromedriver.cmd"));
    candidates.push(resolve(root, "node_modules/chromedriver/lib/chromedriver/chromedriver.exe"));
  }
  if (command === "msedgedriver.exe") {
    candidates.push(resolve(root, "node_modules/.bin/msedgedriver.cmd"));
    candidates.push(resolve(root, "node_modules/msedgedriver/bin/msedgedriver.exe"));
    if (resolvedEdgeDriverPath) candidates.push(resolvedEdgeDriverPath);
  }
  return candidates.filter((path) => existsSync(path));
}

function commandExists(command) {
  const result = spawnSync("where.exe", [command], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const wherePaths = result.status === 0
    ? result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    : [];
  const candidates=[...wherePaths,...localCommandCandidates(command)];
  const paths=command==="msedgedriver.exe"?preferDownloadedDriver(candidates,resolvedEdgeDriverPath).filter(path=>compatibleDriver(webViewVersion,executableDriverVersion(path))):[...new Set(candidates)];
  return { ok: paths.length > 0, paths };
}

async function wait(ms) {
  await new Promise((resolveWait) => setTimeout(resolveWait, ms));
}

async function webdriver(port, sessionId, method, endpoint, body) {
  const response = await fetch(`http://127.0.0.1:${port}/session/${sessionId}${endpoint}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`WebDriver ${method} ${endpoint} failed: ${JSON.stringify(payload)}`);
  }
  return payload.value;
}

async function execute(port, sessionId, script, args = []) {
  return webdriver(port, sessionId, "POST", "/execute/sync", { script, args });
}

async function findElement(port, sessionId, using, value) {
  const element = await webdriver(port, sessionId, "POST", "/element", { using, value });
  const id = element?.["element-6066-11e4-a52e-4f735466cecf"] ?? element?.ELEMENT;
  if (!id) {
    throw new Error(`Element not found: ${using}=${value}`);
  }
  return id;
}

async function waitFor(port, sessionId, label, script, timeoutMs = 20_000, args = []) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = await execute(port, sessionId, script, args);
    if (value) return value;
    await wait(300);
  }
  const bodyText = await execute(port, sessionId, "return document.body?.innerText ?? '';").catch(() => "");
  throw new Error(`Timed out waiting for ${label}. Body head: ${bodyText.slice(0, 1200)} Body tail: ${bodyText.slice(-1200)}`);
}

async function clickButton(port, sessionId, text) {
  await waitFor(port, sessionId, `enabled button ${text}`, "return [...document.querySelectorAll('button')].some(button => button.textContent.trim() === arguments[0] && !button.disabled && button.getClientRects().length);", 30000, [text]);
  const escaped = text.replace(/'/g, "\\'");
  const elementId = await findElement(port, sessionId, "xpath", `//button[normalize-space(.)='${escaped}' and not(@disabled)]`);
  await webdriver(port, sessionId, "POST", `/element/${elementId}/click`, {});
  return true;
}

async function realDesktopSmoke(tauriDriverPath, nativeDriverPath) {
  const port = Number(process.env.CUMPLEFACTURA_TAURI_DRIVER_PORT ?? "4444");
  const driver = spawn(tauriDriverPath, ["--port", String(port), "--native-driver", nativeDriverPath], {
    cwd: root,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const logs = [];
  driver.stdout.on("data", (chunk) => logs.push(chunk.toString()));
  driver.stderr.on("data", (chunk) => logs.push(chunk.toString()));

  try {
    await waitForWebDriver({url:`http://127.0.0.1:${port}`,driver,timeoutMs:30000});
    const sessionResponse = await fetch(`http://127.0.0.1:${port}/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        capabilities: {
          alwaysMatch: {
            "tauri:options": { application: releaseExe },
          },
        },
      }),
    });
    const sessionBody = await sessionResponse.json().catch(() => ({}));
    if (!sessionResponse.ok || !sessionBody.value?.sessionId) {
      throw new Error(`Could not create Tauri WebDriver session: ${JSON.stringify(sessionBody)}`);
    }
    const sessionId = sessionBody.value.sessionId;

    await wait(2500);
    await waitFor(
      port,
      sessionId,
      "CumpleFactura UI",
      `return document.body?.innerText.includes("CumpleFactura") || document.body?.innerText.includes("Facturacion local-first");`,
    );

    const completedSteps = [];
    async function navigate(route, text) {
      await execute(port, sessionId, "location.hash = '/' + arguments[0];", [route]);
      await waitFor(port, sessionId, `route ${route}`, "return document.body.innerText.includes(arguments[0]);", 20000, [text]);
    }
    async function localTools() {
      await execute(port, sessionId, `const summary = [...document.querySelectorAll('summary')].find(s => s.textContent.trim() === 'Herramientas locales y exportaciones'); if (!summary) throw new Error('Local tools missing'); if (!summary.parentElement.open) summary.click();`);
      await waitFor(port, sessionId, "local export tools", "return [...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Exportar XML' && b.getClientRects().length);");
    }
    async function action(button, expected) {
      await clickButton(port, sessionId, button);
      if (expected) await waitFor(port, sessionId, expected.join(" or "), "return arguments[0].some(text => document.body.innerText.includes(text));", 30000, [expected]);
      completedSteps.push(button);
    }
    await navigate("clientes", "Empresa emisora");
    await action("Nueva empresa");
    await action("Nuevo cliente");
    await navigate("ajustes", "Prepara tu primera factura");
    await localTools();
    await action("Rellenar demo", ["Datos demo cargados"]);
    await navigate("clientes", "Empresa emisora");
    await action("Guardar emisor", ["Refrescar: OK"]);
    await action("Guardar cliente", ["Refrescar: OK"]);
    await navigate("facturas/nueva", "Editor de factura");
    await action("Crear borrador", ["Borrador persistido"]);
    await waitFor(port, sessionId, "read-only native PDF", "return document.querySelector('iframe[title=\"PDF de la factura guardada\"]')?.src.startsWith('blob:');");
    completedSteps.push("Vista previa PDF nativa");
    await clickButton(port, sessionId, "Emitir factura");
    await waitFor(port, sessionId, "issue confirmation", "return Boolean(document.querySelector('dialog[open] input[type=checkbox]'));");
    const checkbox = await findElement(port, sessionId, "css selector", "dialog[open] input[type=checkbox]");
    await webdriver(port, sessionId, "POST", `/element/${checkbox}/click`, {});
    const confirmButton = await findElement(port, sessionId, "css selector", "dialog[open] .bdr-actions button:last-child:not([disabled])");
    await webdriver(port, sessionId, "POST", `/element/${confirmButton}/click`, {});
    await waitFor(port, sessionId, "native invoice issued", "return !document.querySelector('dialog[open]') && document.body.innerText.includes('Factura emitida');", 30000);
    completedSteps.push("Emitir factura");
    await navigate("ajustes", "Prepara tu primera factura");
    await localTools();
    await action("Exportar XML", ["XML VERI*FACTU: OK"]);
    await action("Preparar", ["Preparar firma/envio: OK"]);

    const screenshot = await webdriver(port, sessionId, "GET", "/screenshot");
    const screenshotPath = resolve(evidenceDir, "latest-tauri-desktop-e2e.png");
    writeFileSync(screenshotPath, Buffer.from(screenshot, "base64"));
    await fetch(`http://127.0.0.1:${port}/session/${sessionId}`, { method: "DELETE" }).catch(() => undefined);

    return {
      status: "passed",
      mode: "real",
      driver_log_tail: logs.join("").slice(-1200),
      checks: {
        release_exe_exists: true,
        webdriver_session_created: true,
        ui_text_detected: true,
        real_rust_commands_executed: true,
        native_pdf_preview_visible: completedSteps.includes("Vista previa PDF nativa"),
        irreversible_confirmation_understood: completedSteps.includes("Emitir factura"),
        verifactu_xml_exported: completedSteps.includes("Exportar XML"),
        submission_prepared: completedSteps.includes("Preparar"),
      },
      completed_steps: completedSteps,
      screenshot_path: screenshotPath,
      limits: [
        "Real mode launches the release executable via tauri-driver and Microsoft Edge WebDriver.",
        "It executes local UI events that call real Rust/Tauri commands for company, customer, draft, issue, VERI*FACTU XML export and local signature/submission preparation.",
        "It performs no AEAT call and uses no secrets.",
      ],
    };
  } catch (error) {
    const reason=error instanceof Error?error.message:String(error);
    const cause=error instanceof Error && error.cause instanceof Error?error.cause.message:"";
    throw new Error(`${reason}${cause?`; cause: ${cause}`:""}; driver exit=${driver.exitCode}, signal=${driver.signalCode}; driver log: ${logs.join("").slice(-4000)}`);
  } finally {
    driver.kill();
  }
}

mkdirSync(evidenceDir, { recursive: true });

const tauriDriver = commandExists("tauri-driver.exe");
const chromeDriver = commandExists("chromedriver.exe");
const edgeDriver = commandExists("msedgedriver.exe");
const checks = {
  release_exe_exists: pathInfo(releaseExe).exists,
  tauri_driver_available: tauriDriver.ok,
  webdriver_available: edgeDriver.ok,
};

let result = {
  app: "CumpleFactura",
  generated_at: new Date().toISOString(),
  status: Object.values(checks).every(Boolean) ? "passed" : "failed",
  mode: "preflight",
  release_exe: releaseExe,
  webview_runtime_version: webViewVersion,
  driver_resolution_error: driverResolutionError || null,
  downloaded_driver_version: resolvedEdgeDriverPath?executableDriverVersion(resolvedEdgeDriverPath):null,
  selected_driver_version: edgeDriver.paths[0]?executableDriverVersion(edgeDriver.paths[0]):null,
  checks,
  evidence: {
    tauri_driver_paths: tauriDriver.paths,
    chromedriver_paths: chromeDriver.paths,
    msedgedriver_paths: edgeDriver.paths,
  },
  limits: [
    "Preflight mode proves release binary and driver prerequisites only.",
    "Set CUMPLEFACTURA_TAURI_DESKTOP_E2E_REAL=1 to attempt a live Tauri WebDriver session.",
    "This verifier performs no AEAT call and uses no secrets.",
  ],
};

if (result.status === "passed" && realMode) {
  try {
    const real = await realDesktopSmoke(tauriDriver.paths[0], edgeDriver.paths[0]);
    result = { ...result, ...real, checks: { ...checks, ...real.checks } };
  } catch (error) {
    result = {
      ...result,
      status: "failed",
      mode: "real",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

writeFileSync(outputJson, `${JSON.stringify(result, null, 2)}\n`, "utf8");

const md = [
  "# CumpleFactura Tauri desktop E2E",
  "",
  `- Generated: ${result.generated_at}`,
  `- Status: ${result.status}`,
  `- Mode: ${result.mode}`,
  `- Release exe: \`${releaseExe}\``,
  "",
  "## Checks",
  "",
  ...Object.entries(result.checks).map(([key, value]) => `- ${key}: ${value}`),
  "",
  "## Limits",
  "",
  ...result.limits.map((limit) => `- ${limit}`),
  "",
];
writeFileSync(outputMd, md.join("\n"), "utf8");

if (result.status !== "passed") {
  console.error("CumpleFactura Tauri desktop E2E FAILED");
  console.error(outputJson);
  process.exit(1);
}

console.log("CumpleFactura Tauri desktop E2E OK");
console.log(outputJson);
console.log(outputMd);
