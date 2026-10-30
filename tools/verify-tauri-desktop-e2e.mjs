// Desktop E2E preflight (real WebDriver opt-in via env flag).
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
let resolvedEdgeDriverPath = "";
try {
  resolvedEdgeDriverPath = await downloadEdgeDriver();
} catch {
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
  const paths = [...new Set([...wherePaths, ...localCommandCandidates(command)])];
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
    for (const button of ["Nueva empresa", "Nuevo cliente", "Rellenar demo", "Guardar emisor", "Guardar cliente", "Crear borrador", "Emitir factura", "Exportar XML", "Preparar"]) {
      const clicked = await clickButton(port, sessionId, button);
      if (!clicked) {
        throw new Error(`Could not click enabled button: ${button}`);
      }
      if (["Nueva empresa", "Nuevo cliente", "Rellenar demo"].includes(button)) {
        await wait(500);
      } else {
        const expected =
          button === "Exportar XML" ? ["XML VERI*FACTU: OK"] :
          button === "Preparar" ? ["Preparar firma/envio: OK"] :
          button === "Guardar emisor" ? ["Emisor creado", "Refrescar: OK"] :
          button === "Guardar cliente" ? ["Cliente creado", "Refrescar: OK"] :
          button === "Crear borrador" ? ["Borrador persistido", "Refrescar: OK"] :
          button === "Emitir factura" ? ["Factura emitida", "Refrescar: OK"] :
          [`${button}: OK`];
        await waitFor(port, sessionId, expected.join(" or "), `return arguments[0].some((text) => document.body?.innerText.includes(text));`, 30_000, [expected]);
        completedSteps.push(button);
      }
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
