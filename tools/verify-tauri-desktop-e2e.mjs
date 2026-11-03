// Desktop E2E preflight (real WebDriver opt-in via CUMPLEFACTURA_TAURI_DESKTOP_E2E_REAL=1).
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { download as downloadEdgeDriver } from "edgedriver";
import { commandExists, evidenceDir, pathInfo, root, windowsDriverCandidates, writeEvidence } from "./lib.mjs";

const windows = process.platform === "win32";
// CUMPLEFACTURA_DESKTOP_APP permite probar otro build (por ejemplo target/debug).
const releaseExe = process.env.CUMPLEFACTURA_DESKTOP_APP?.trim() || resolve(root, `target/release/cumplefactura${windows ? ".exe" : ""}`);
const realMode = ["1", "true", "yes", "on"].includes(
  (process.env.CUMPLEFACTURA_TAURI_DESKTOP_E2E_REAL ?? "").trim().toLowerCase(),
);
const resolvedEdgeDriverPath = windows ? await downloadEdgeDriver().catch(() => "") : "";

/**
 * Recorrido real: sección de la barra lateral, botón y texto esperado en la barra de
 * estado. Cada pantalla solo existe mientras su sección está activa.
 */
const steps = [
  { section: "Empresas", button: "Nueva empresa" },
  { section: "Clientes", button: "Nuevo cliente" },
  { section: "Panel", button: "Rellenar demo" },
  // Cada paso exige su propio resultado: "Refrescar: OK" ya está en pantalla y no prueba nada.
  { section: "Empresas", button: "Guardar emisor", expect: ["Emisor creado"] },
  { section: "Clientes", button: "Guardar cliente", expect: ["Emisor y cliente creados"] },
  { section: "Facturas", button: "Crear borrador", expect: ["Borrador persistido"] },
  { section: "Facturas", button: "Emitir factura", expect: ["Factura emitida"] },
  { section: "Fiscal", button: "Exportar XML", expect: ["XML VERI*FACTU: OK"] },
  // Arranca el sidecar real junto al exe; sin certificado ni --allow-aeat responde "blocked".
  { section: "Fiscal", button: "Preflight envio", expect: ["Preflight envio: OK"] },
];

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

/** Pulsa el botón habilitado con ese texto exacto (incluye los de la barra lateral). Espera hasta 10 s. */
async function clickButton(port, sessionId, text) {
  const escaped = text.replace(/'/g, "\\'");
  const xpath = `//button[normalize-space(.)='${escaped}' and not(@disabled)]`;
  const start = Date.now();
  for (;;) {
    try {
      const elementId = await findElement(port, sessionId, "xpath", xpath);
      // Algunos drivers (WebKitWebDriver) no desplazan el botón a la vista antes de pulsar.
      await execute(port, sessionId, "arguments[0].scrollIntoView({ block: 'center' });", [
        { "element-6066-11e4-a52e-4f735466cecf": elementId },
      ]);
      await webdriver(port, sessionId, "POST", `/element/${elementId}/click`, {});
      return true;
    } catch (error) {
      if (Date.now() - start > 10_000) {
        const buttons = await execute(
          port,
          sessionId,
          "return [...document.querySelectorAll('button')].map((b) => `${b.innerText.trim()}${b.disabled ? ' [disabled]' : ''}`).join(' | ');",
        ).catch(() => "?");
        const status = await execute(port, sessionId, "return document.querySelector('header p')?.innerText ?? '';").catch(() => "?");
        throw new Error(`Button not clickable: ${text} (${error.message}). Status: ${status}. Buttons: ${buttons}`);
      }
      await wait(300);
    }
  }
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
    await wait(1500);
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
    for (const step of steps) {
      await clickButton(port, sessionId, step.section);
      await clickButton(port, sessionId, step.button);
      if (step.expect) {
        await waitFor(
          port,
          sessionId,
          step.expect.join(" or "),
          `return arguments[0].some((text) => document.body?.innerText.includes(text));`,
          30_000,
          [step.expect],
        );
      } else {
        await wait(500);
      }
      completedSteps.push(step.button);
    }

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
        verifactu_xml_exported: completedSteps.includes("Exportar XML"),
        sidecar_preflight_executed: completedSteps.includes("Preflight envio"),
      },
      completed_steps: completedSteps,
      screenshot_path: screenshotPath,
      limits: [
        "Real mode launches the release executable via tauri-driver and the platform WebDriver (msedgedriver on Windows, WebKitWebDriver on Linux).",
        "It executes local UI events that call real Rust/Tauri commands for company, customer, draft, issue, VERI*FACTU XML export and a sidecar preflight that launches the real sidecar process.",
        "It performs no AEAT call and uses no secrets.",
      ],
    };
  } finally {
    driver.kill();
  }
}

// Windows: WebView2 + msedgedriver. Linux: WebKitGTK + WebKitWebDriver.
const tauriDriver = windows
  ? commandExists("tauri-driver.exe", windowsDriverCandidates("tauri-driver.exe"))
  : commandExists("tauri-driver");
const edgeDriver = windows
  ? commandExists("msedgedriver.exe", windowsDriverCandidates("msedgedriver.exe", resolvedEdgeDriverPath))
  : commandExists("WebKitWebDriver");
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
  checks,
  evidence: {
    tauri_driver_paths: tauriDriver.paths,
    native_webdriver_paths: edgeDriver.paths,
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
];
const { jsonPath, mdPath } = writeEvidence("tauri-desktop-e2e", result, md);

if (result.status !== "passed") {
  console.error("CumpleFactura Tauri desktop E2E FAILED");
  console.error(jsonPath);
  process.exit(1);
}

console.log("CumpleFactura Tauri desktop E2E OK");
console.log(jsonPath);
console.log(mdPath);
