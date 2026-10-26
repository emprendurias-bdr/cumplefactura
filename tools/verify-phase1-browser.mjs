import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import assert from "node:assert/strict";
import { installTauriMock } from "./browser-tauri-mock.mjs";
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "--host",
    "127.0.0.1",
    "--port",
    "1422",
    "--strictPort",
  ],
  { stdio: "ignore" },
);
let browser;
try {
  for (let n = 0; ; n++) {
    try {
      if ((await fetch("http://127.0.0.1:1422")).ok) break;
    } catch {}
    if (n > 50) throw new Error("Server not ready");
    await new Promise((r) => setTimeout(r, 200));
  }
  browser = await chromium.launch({
    executablePath: existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined,
    headless: true,
  });
  const results = [];
  await fs.mkdir("docs/phase1/screenshots", { recursive: true });
  for (const width of [1024, 1440])
    for (const theme of ["light", "dark"]) {
      const context = await browser.newContext({
        viewport: { width, height: width === 1024 ? 700 : 900 },
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await installTauriMock(page);
      await page.goto("http://127.0.0.1:1422/#/ajustes", {
        waitUntil: "networkidle",
      });
      await page.getByLabel("Tema", { exact: true }).selectOption(theme);
      await page
        .getByLabel("Densidad", { exact: true })
        .selectOption("comfortable");
      for (const route of [
        "facturas",
        "presupuestos",
        "proformas",
        "albaranes",
        "recurrentes",
        "clientes",
        "productos",
        "verifactu",
        "ajustes",
      ]) {
        await page.goto("http://127.0.0.1:1422/#/" + route, {
          waitUntil: "networkidle",
        });
        await page.locator(".bdr-main").waitFor();
        const screenshot = `docs/phase1/screenshots/${route}-${width}-${theme}.png`;
        await page.screenshot({ path: screenshot, fullPage: true });
        const scan = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze();
        results.push({
          route,
          width,
          theme,
          screenshot,
          violations: scan.violations.map((v) => ({
            id: v.id,
            nodes: v.nodes.map((n) => ({
              target: n.target,
              summary: n.failureSummary,
            })),
          })),
          errors: [...errors],
        });
      }
      await context.close();
    }
  await fs.writeFile(
    "docs/phase1/browser-results.json",
    JSON.stringify(
      {
        results,
        scope:
          "mocked native runtime; not native Tauri, web account persistence, AEAT or regulatory validation",
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "36 screen/theme/viewport cases:",
    results.reduce((n, r) => n + r.violations.length, 0),
    "accessibility rule violations",
  );
  assert.equal(results.flatMap((r) => r.errors).length, 0, "Runtime errors");
  assert.equal(
    results.flatMap((r) => r.violations).length,
    0,
    "Accessibility violations; see browser-results.json",
  );
} finally {
  await browser?.close();
  server.kill();
}
