// Sidecar smoke: arranca el binario cumplefactura-sidecar como lo hace la app y comprueba
// el handshake, la autenticación HMAC, que falla cerrado sin --allow-aeat y que termina
// al cerrarse stdin. Nunca pasa --allow-aeat: no puede llamar a la AEAT.
//
// Binario: target/release/cumplefactura-sidecar[.exe] (o CUMPLEFACTURA_SIDECAR_PATH).
import { spawn } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { pathInfo, root, sha256, writeEvidence } from "./lib.mjs";

const exeSuffix = process.platform === "win32" ? ".exe" : "";
const binary =
  process.env.CUMPLEFACTURA_SIDECAR_PATH?.trim() || resolve(root, `target/release/cumplefactura-sidecar${exeSuffix}`);
const registro =
  '<sfLR:RegFactuSistemaFacturacion xmlns:sfLR="https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR.xsd"/>';

const checks = {};

async function main() {
  if (!pathInfo(binary).is_file) throw new Error(`sidecar binary not found: ${binary}`);
  const vaultDir = mkdtempSync(join(tmpdir(), "cf-sidecar-smoke-"));
  const secret = randomBytes(32);
  const child = spawn(binary, ["--vault-dir", vaultDir], { stdio: ["pipe", "pipe", "ignore"] });
  const exited = new Promise((done) => child.on("exit", (code) => done(code)));
  try {
    child.stdin.write(`${secret.toString("hex")}\n`);
    const line = await Promise.race([
      new Promise((done) => createInterface({ input: child.stdout }).once("line", done)),
      new Promise((_, fail) => setTimeout(() => fail(new Error("handshake timeout")), 10_000)),
    ]);
    const handshake = JSON.parse(line);
    checks.handshake_port_reported = Number.isInteger(handshake.port) && handshake.port > 0;
    checks.handshake_pid_matches = handshake.pid === child.pid;
    const base = `http://127.0.0.1:${handshake.port}`;

    const post = async (path, body, key = secret) => {
      const text = JSON.stringify(body);
      const signature = createHmac("sha256", key).update(text).digest("hex");
      const response = await fetch(base + path, {
        method: "POST",
        headers: { "content-type": "application/json", "x-signature": signature },
        body: text,
      });
      return { status: response.status, json: await response.json() };
    };

    const health = await (await fetch(`${base}/healthz`)).json();
    checks.healthz_ok = health.status === "ok";
    checks.aeat_calls_disabled_by_default = health.aeat_calls_enabled === false;
    checks.production_disabled_by_default = health.production_enabled === false;

    const preflightBody = { endpoint_name: "SistemaVerifactuPruebas", certificate_ref: "vault://certs/smoke" };
    checks.wrong_hmac_rejected = (await post("/verifactu/submit-preflight", preflightBody, randomBytes(32))).status === 401;

    const preflight = await post("/verifactu/submit-preflight", preflightBody);
    checks.preflight_blocked_without_certificate =
      preflight.status === 200 &&
      preflight.json.status === "blocked" &&
      preflight.json.blockers.includes("certificate_not_found") &&
      preflight.json.blockers.includes("aeat_calls_disabled") &&
      preflight.json.external_call_performed === false;

    const submit = (endpoint_name) =>
      post("/verifactu/invoke-submit", {
        xml: registro,
        xml_sha256: sha256(registro),
        endpoint_name,
        certificate_ref: "vault://certs/smoke",
        timeout_seconds: 10,
      });
    const blocked = await submit("SistemaVerifactuPruebas");
    checks.submit_fail_closed = blocked.status === 409 && blocked.json.error === "aeat_calls_disabled";
    const production = await submit("SistemaVerifactu");
    checks.production_blocked = production.status === 409 && production.json.error === "production_endpoint_disabled";
    checks.no_external_call = [blocked, production].every((reply) => reply.json.external_call_performed === false);

    child.stdin.end();
    const code = await Promise.race([exited, new Promise((done) => setTimeout(() => done("timeout"), 5_000))]);
    checks.exits_when_stdin_closes = code !== "timeout";
  } finally {
    child.kill();
    rmSync(vaultDir, { recursive: true, force: true });
  }
}

let error = null;
try {
  await main();
} catch (caught) {
  error = caught instanceof Error ? caught.message : String(caught);
}

const passed = !error && Object.keys(checks).length >= 10 && Object.values(checks).every(Boolean);
const result = {
  app: "CumpleFactura",
  generated_at: new Date().toISOString(),
  status: passed ? "passed" : "failed",
  binary,
  external_call_performed: false,
  checks,
  error,
  limits: [
    "The sidecar runs without --allow-aeat, so it cannot reach AEAT.",
    "It proves process lifecycle, HMAC boundary and fail-closed policy; real mTLS submission is verified manually with tools/homolog-verifactu.mjs.",
  ],
};
const md = [
  "# CumpleFactura sidecar smoke",
  "",
  `- Generated: ${result.generated_at}`,
  `- Status: ${result.status}`,
  `- Binary: \`${binary}\``,
  ...(error ? [`- Error: ${error}`] : []),
  "",
  "## Checks",
  "",
  ...Object.entries(checks).map(([key, value]) => `- ${key}: ${value}`),
  "",
  "## Limits",
  "",
  ...result.limits.map((limit) => `- ${limit}`),
];
const { jsonPath, mdPath } = writeEvidence("sidecar-smoke", result, md);

if (!passed) {
  console.error("CumpleFactura sidecar smoke FAILED");
  console.error(jsonPath);
  process.exit(1);
}
console.log("CumpleFactura sidecar smoke OK");
console.log(jsonPath);
console.log(mdPath);
