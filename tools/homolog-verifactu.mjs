// Homologación manual VERI*FACTU contra la AEAT de PRUEBAS. No forma parte del gate.
//
// Arranca el sidecar en release con --allow-aeat (nunca --allow-production), le pasa un
// XML exportado por la app y guarda una evidencia redactada: hash del XML, endpoint,
// estado, CSV y códigos de la AEAT. Nunca guarda el XML, la referencia del certificado
// ni la contraseña.
//
// Uso (Windows o Linux, con el sidecar compilado: cargo build -p cumplefactura-sidecar --release):
//   set CUMPLEFACTURA_CERT_PASSWORD_<ID>=...   (o CUMPLEFACTURA_CERT_PASSWORD)
//   node tools/homolog-verifactu.mjs --xml <registro.xml> --cert vault://certs/<id> --vault-dir <carpeta>
//        [--endpoint SistemaVerifactuPruebas|SistemaVerifactuSelloPruebas] [--enviar]
//
// Sin --enviar solo hace el preflight (no sale a internet). Con --enviar manda el registro.
// Importante: el NIF de ObligadoEmision del XML debe ser el del titular del certificado,
// o la AEAT lo rechazará. Para registrar la aceptación en el gate, crea después el
// manifiesto redactado que valida tools/verify-external-acceptance-evidence.mjs.
import { spawn } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { evidenceDir, pathInfo, root, sha256, writeEvidence } from "./lib.mjs";

const TEST_ENDPOINTS = new Set(["SistemaVerifactuPruebas", "SistemaVerifactuSelloPruebas"]);

function arg(name) {
  const index = process.argv.indexOf(name);
  return index > 0 ? process.argv[index + 1] : undefined;
}

const xmlPath = arg("--xml");
const certificateRef = arg("--cert");
const vaultDir = arg("--vault-dir");
const endpointName = arg("--endpoint") ?? "SistemaVerifactuPruebas";
const send = process.argv.includes("--enviar");

if (!xmlPath || !certificateRef || !vaultDir || process.argv.includes("--help")) {
  console.log(readFileSync(new URL(import.meta.url), "utf8").split("\n").slice(0, 17).join("\n"));
  process.exit(xmlPath || process.argv.includes("--help") ? 0 : 2);
}
if (!TEST_ENDPOINTS.has(endpointName)) {
  console.error(`Solo endpoints de pruebas: ${[...TEST_ENDPOINTS].join(", ")}`);
  process.exit(2);
}

const exe = process.platform === "win32" ? ".exe" : "";
const binary = resolve(root, `target/release/cumplefactura-sidecar${exe}`);
if (!pathInfo(binary).is_file) {
  console.error(`Falta ${binary}. Ejecuta: cargo build -p cumplefactura-sidecar --release`);
  process.exit(2);
}

const xml = readFileSync(xmlPath, "utf8");
const xmlSha256 = sha256(xml).toUpperCase();
const secret = randomBytes(32);
const child = spawn(binary, ["--allow-aeat", "--vault-dir", vaultDir], { stdio: ["pipe", "pipe", "inherit"] });
child.stdin.write(`${secret.toString("hex")}\n`);
const handshake = JSON.parse(await new Promise((done) => createInterface({ input: child.stdout }).once("line", done)));

async function post(path, body) {
  const text = JSON.stringify(body);
  const response = await fetch(`http://127.0.0.1:${handshake.port}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-signature": createHmac("sha256", secret).update(text).digest("hex") },
    body: text,
  });
  return { http: response.status, body: await response.json() };
}

let preflight;
let submission = null;
try {
  preflight = await post("/verifactu/submit-preflight", { endpoint_name: endpointName, certificate_ref: certificateRef });
  console.log(`Preflight: ${preflight.body.status} ${preflight.body.blockers?.join(", ") || ""}`);
  if (send && preflight.body.status === "ready") {
    submission = await post("/verifactu/invoke-submit", {
      xml,
      xml_sha256: xmlSha256,
      endpoint_name: endpointName,
      certificate_ref: certificateRef,
      timeout_seconds: 60,
    });
    console.log(`Envio: ${submission.body.status ?? submission.body.error} CSV ${submission.body.csv ?? "-"}`);
  } else if (send) {
    console.log("No se envia: el preflight no esta en ready.");
  }
} finally {
  child.stdin.end();
  child.kill();
}

const aeat = submission?.body ?? {};
const result = {
  app: "CumpleFactura",
  generated_at: new Date().toISOString(),
  status: submission ? (aeat.status ?? "blocked") : "preflight_only",
  endpoint_name: endpointName,
  xml_sha256: xmlSha256,
  certificate_ref: "vault://certs/<redacted>",
  preflight_status: preflight?.body?.status ?? "error",
  preflight_blockers: preflight?.body?.blockers ?? [],
  csv: aeat.csv ?? null,
  estado_envio: aeat.estado_envio ?? null,
  estado_registro: aeat.estado_registro ?? null,
  codigo_error: aeat.codigo_error ?? null,
  descripcion_error: aeat.descripcion_error ?? null,
  soap_fault: aeat.soap_fault ?? null,
  external_call_performed: Boolean(aeat.external_call_performed),
};
const md = [
  "# CumpleFactura homologacion VERI*FACTU (pruebas AEAT)",
  "",
  ...Object.entries(result).map(([key, value]) => `- ${key}: ${Array.isArray(value) ? value.join(", ") || "-" : value ?? "-"}`),
];
const { jsonPath } = writeEvidence("homolog-verifactu", result, md);
console.log(`Evidencia redactada: ${jsonPath}`);
console.log(`Carpeta de evidencia: ${evidenceDir}`);
