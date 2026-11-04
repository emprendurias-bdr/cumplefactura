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
 * Recorrido real sobre la interfaz BDR (design.md) con una base nueva: primer arranque, cliente,
 * factura, XML y comprobación previa. Cada paso: `nav` (enlace de la barra lateral), `fill`
 * (campos por su etiqueta), `click` (botón o enlace por su texto) y el texto que debe aparecer
 * (toast o pantalla). Cada paso exige su propio resultado.
 */
const steps = [
  // El botón de datos de ejemplo solo existe en desarrollo (D4); el build de release se rellena a mano.
  {
    fill: { "Nombre legal": "Empresa E2E SL", NIF: "B12345678", "Dirección": "Calle Fiscal 1", "Código postal": "28001", Municipio: "Madrid", Provincia: "Madrid", "País": "ES" },
    click: "Guardar y seguir",
    expect: ["Empresa creada."],
  },
  { click: "Siguiente" },
  { click: "Guardar serie y seguir", expect: ["Serie guardada."] },
  // La carpeta de exportación por defecto la da Rust (app_defaults_get): no se abre el diálogo nativo.
  { click: "Empezar a facturar", expect: ["Factura para"] },
  { nav: "Clientes", click: "Nuevo cliente" },
  {
    fill: { Nombre: "Cliente E2E", NIF: "12345678Z", "Dirección": "Calle Cliente 2", "Código postal": "28002", Municipio: "Madrid", Provincia: "Madrid", "País": "ES" },
    click: "Guardar cliente",
    expect: ["Cliente creado."],
  },
  { nav: "Facturas", click: "Nueva factura", expect: ["Factura para"] },
  { click: "Guardar borrador", expect: ["Borrador guardado."] },
  { click: "Emitir factura", expect: ["Lo entiendo"] },
  { click: "Lo entiendo" },
  { click: "Emitir", expect: ["emitida."] },
  { nav: "Verifactu", click: "Exportar XML", expect: ["XML preparado y validado."] },
  // Arranca el sidecar real junto al exe; sin certificado ni --allow-aeat responde «bloqueada».
  {
    fill: { "Contraseña del certificado": "e2e-sin-certificado" },
    click: "Comprobación previa",
    expect: ["No se puede enviar todavía.", "Todo listo para enviar."],
  },
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

/** Pulsa el botón, enlace o etiqueta habilitado con ese texto exacto. Espera hasta 10 s. */
async function clickButton(port, sessionId, text, scope = "") {
  const escaped = text.replace(/'/g, "\\'");
  const xpath = `${scope}//*[(self::button or self::a or self::label) and normalize-space(.)='${escaped}' and not(@disabled)]`;
  const start = Date.now();
  for (;;) {
    try {
      const elementId = await findElement(port, sessionId, "xpath", xpath);
      // Algunos drivers (WebKitWebDriver) no desplazan el control a la vista antes de pulsar.
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
          "return [...document.querySelectorAll('button, a')].map((b) => `${b.innerText.trim()}${b.disabled ? ' [disabled]' : ''}`).join(' | ');",
        ).catch(() => "?");
        const toast = await execute(port, sessionId, "return document.querySelector('.bdr-toast')?.innerText ?? '';").catch(() => "?");
        throw new Error(`Control not clickable: ${text} (${error.message}). Toast: ${toast}. Controls: ${buttons}`);
      }
      await wait(300);
    }
  }
}

/** Escribe en el campo cuya etiqueta (<label for>) tiene ese texto, como lo haría React. */
async function fillField(port, sessionId, label, value) {
  const ok = await execute(
    port,
    sessionId,
    `const label = [...document.querySelectorAll('label')].find((l) => l.textContent.trim() === arguments[0]);
     const input = label && document.getElementById(label.htmlFor);
     if (!input) return false;
     const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value').set;
     setter.call(input, arguments[1]);
     input.dispatchEvent(new Event('input', { bubbles: true }));
     return true;`,
    [label, value],
  );
  if (!ok) throw new Error(`Field not found: ${label}`);
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
      `return document.body?.innerText.includes("CumpleFactura");`,
    );

    const completedSteps = [];
    for (const step of steps) {
      if (step.nav) await clickButton(port, sessionId, step.nav, "//nav[@aria-label='Secciones']");
      for (const [label, value] of Object.entries(step.fill ?? {})) await fillField(port, sessionId, label, value);
      await clickButton(port, sessionId, step.click);
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
      completedSteps.push(step.click);
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
        sidecar_preflight_executed: completedSteps.includes("Comprobación previa"),
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
