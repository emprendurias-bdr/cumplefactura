// Evidence ledger: validate latest-evidence-ledger against gate artifacts.
import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = resolve(root, "tests/regulatory/evidence");
const matrixPath = resolve(root, "REGULATORY_EVIDENCE_MATRIX.md");
const outputJson = resolve(evidenceDir, "latest-evidence-ledger.json");
const outputMd = resolve(evidenceDir, "latest-evidence-ledger.md");
const errors = [];

function fail(message) {
  errors.push(message);
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function artifact(path, role) {
  if (!existsSync(path)) {
    fail(`Missing ${role}: ${path}`);
    return { role, path, missing: true };
  }
  const stat = statSync(path);
  return {
    role,
    path,
    bytes: stat.size,
    sha256: sha256(path),
  };
}

function parseMarkdownTable(markdown) {
  const rows = [];
  let insideMatrix = false;

  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "## Matrix") {
      insideMatrix = true;
      continue;
    }
    if (insideMatrix && line.startsWith("## ")) {
      break;
    }
    if (!insideMatrix || !line.startsWith("|")) {
      continue;
    }
    if (/^\|\s*-+/.test(line)) {
      continue;
    }

    const cells = line
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim());

    if (cells.length === 4 && cells[0] !== "Promise") {
      rows.push({
        promise: cells[0],
        source: cells[1],
        evidence: cells[2],
        limit: cells[3],
      });
    }
  }

  return rows;
}

function readJson(path, role) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(`Cannot parse ${role}: ${path} (${error.message})`);
    return null;
  }
}

function collectGateLogs() {
  const runId = process.env.CUMPLEFACTURA_GATE_RUN_ID;
  if (runId) {
    return readdirSync(evidenceDir)
      .filter((name) => name.startsWith(`${runId}-`) && name.endsWith(".log"))
      .map((name) => resolve(evidenceDir, name))
      .filter((path) => existsSync(path));
  }

  const gatePath = resolve(evidenceDir, "latest-regulatory-gate.json");
  const gate = existsSync(gatePath) ? readJson(gatePath, "latest regulatory gate") : null;
  return (gate?.steps ?? [])
    .map((step) => step.log_path)
    .filter((path) => typeof path === "string" && existsSync(path));
}

const matrix = readFileSync(matrixPath, "utf8");
const rows = parseMarkdownTable(matrix);

if (rows.length < 20) {
  fail(`Matrix has too few rows (${rows.length}); expected at least 20 active promises.`);
}

for (const [index, row] of rows.entries()) {
  const rowNumber = index + 1;
  for (const [field, value] of Object.entries(row)) {
    if (!value || /^tbd$/i.test(value) || /\bpendiente\b/i.test(value)) {
      fail(`Row ${rowNumber} (${row.promise}) has weak ${field}: ${value || "<empty>"}`);
    }
  }
  if (!/\b(cargo test|npm run|gate step|tests?|tools\/|services::|db::|domain::|evidence)\b/i.test(row.evidence)) {
    fail(`Row ${rowNumber} (${row.promise}) lacks executable evidence.`);
  }
  if (row.limit.length < 12) {
    fail(`Row ${rowNumber} (${row.promise}) has an underspecified limit.`);
  }
}

const normativeSources = [
  {
    id: "cumplefactura_technical_matrix",
    path: "C:\\03 LEGISLACION\\AEAT\\MATRIZ_TECNICA_CUMPLEFACTURA_2026-05-27.md",
  },
  {
    id: "verifactu_hash_detail_pdf",
    path: "C:\\03 LEGISLACION\\AEAT\\FACTURACION Y SIF\\05 DOCUMENTACION TECNICA AEAT\\01 VERIFACTU\\Detalle especificaciones huella hash registros facturacion - AEAT.pdf",
  },
  {
    id: "verifactu_signature_pdf",
    path: "C:\\03 LEGISLACION\\AEAT\\FACTURACION Y SIF\\05 DOCUMENTACION TECNICA AEAT\\01 VERIFACTU\\Especificaciones firma electronica registros facturacion - AEAT.pdf",
  },
  {
    id: "verifactu_wsdl",
    path: "C:\\03 LEGISLACION\\AEAT\\FACTURACION Y SIF\\05 DOCUMENTACION TECNICA AEAT\\01 VERIFACTU\\SistemaFacturacion VERI-FACTU.wsdl",
  },
  {
    id: "verifactu_suministro_lr_xsd",
    path: "C:\\03 LEGISLACION\\AEAT\\FACTURACION Y SIF\\05 DOCUMENTACION TECNICA AEAT\\01 VERIFACTU\\SuministroLR VERI-FACTU.xsd",
  },
  {
    id: "verifactu_suministro_informacion_xsd",
    path: "C:\\03 LEGISLACION\\AEAT\\FACTURACION Y SIF\\05 DOCUMENTACION TECNICA AEAT\\01 VERIFACTU\\SuministroInformacion VERI-FACTU.xsd",
  },
];

const repoArtifacts = [
  ["matrix", matrixPath],
  ["module_contract", resolve(root, "MODULE_CONTRACT.md")],
  ["test_plan", resolve(root, "REGULATORY_TEST_PLAN.md")],
  ["package_scripts", resolve(root, "package.json")],
  ["regulatory_gate", resolve(root, "tools/run-regulatory-gate.ps1")],
  ["matrix_verifier", resolve(root, "tools/verify-regulatory-evidence.mjs")],
  ["core_e2e_verifier", resolve(root, "tools/verify-core-e2e.ps1")],
  ["browser_smoke_verifier", resolve(root, "tools/verify-browser-smoke.mjs")],
  ["secret_scan_verifier", resolve(root, "tools/verify-secret-scan.mjs")],
  ["tauri_desktop_e2e_verifier", resolve(root, "tools/verify-tauri-desktop-e2e.mjs")],
  ["ledger_verifier", resolve(root, "tools/verify-evidence-ledger.mjs")],
  ["contapro_sidecar_importer", resolve(root, "tools/import-contapro-sidecar-evidence.mjs")],
  ["external_acceptance_verifier", resolve(root, "tools/verify-external-acceptance-evidence.mjs")],
  ["external_readiness_verifier", resolve(root, "tools/verify-external-readiness.mjs")],
  ["core_e2e_test", resolve(root, "src-tauri/src/core_e2e.rs")],
  ["verifactu_fixture", resolve(root, "tests/regulatory/fixtures/verifactu-registro-alta-basic.xml")],
  ["external_acceptance_manifest_fixture", resolve(root, "tests/regulatory/fixtures/external-acceptance-manifest.example.json")],
  ["next_mvp_plan", resolve(root, "docs/plans/2026-06-02-cumplefactura-next-mvp.md")],
];

const evidenceArtifacts = [
  ["latest_core_e2e_json", resolve(evidenceDir, "latest-core-e2e.json")],
  ["latest_core_e2e_xml", resolve(evidenceDir, "latest-core-e2e-verifactu.xml")],
  ["latest_core_e2e_pdf", resolve(evidenceDir, "latest-core-e2e-invoice.pdf")],
  ["latest_core_e2e_invoice_json", resolve(evidenceDir, "latest-core-e2e-invoice.json")],
  ["latest_core_e2e_invoices_csv", resolve(evidenceDir, "latest-core-e2e-invoices.csv")],
  ["latest_core_e2e_audit_json", resolve(evidenceDir, "latest-core-e2e-audit.json")],
  ["latest_browser_smoke_json", resolve(evidenceDir, "latest-browser-smoke.json")],
  ["latest_browser_smoke_png", resolve(evidenceDir, "latest-browser-smoke.png")],
  ["latest_secret_scan_json", resolve(evidenceDir, "latest-secret-scan.json")],
  ["latest_secret_scan_md", resolve(evidenceDir, "latest-secret-scan.md")],
  ["latest_tauri_desktop_e2e_json", resolve(evidenceDir, "latest-tauri-desktop-e2e.json")],
  ["latest_tauri_desktop_e2e_md", resolve(evidenceDir, "latest-tauri-desktop-e2e.md")],
  ["latest_external_acceptance_json", resolve(evidenceDir, "latest-external-acceptance-evidence.json")],
  ["latest_external_acceptance_md", resolve(evidenceDir, "latest-external-acceptance-evidence.md")],
  ["latest_contapro_sidecar_import_json", resolve(evidenceDir, "latest-contapro-sidecar-import.json")],
  ["latest_contapro_sidecar_import_md", resolve(evidenceDir, "latest-contapro-sidecar-import.md")],
  ["latest_external_readiness_json", resolve(evidenceDir, "latest-external-readiness.json")],
  ["latest_external_readiness_md", resolve(evidenceDir, "latest-external-readiness.md")],
];

if (!process.env.CUMPLEFACTURA_GATE_RUN_ID) {
  evidenceArtifacts.push(
    ["latest_regulatory_gate_json", resolve(evidenceDir, "latest-regulatory-gate.json")],
    ["latest_regulatory_gate_md", resolve(evidenceDir, "latest-regulatory-gate.md")],
  );
}

const gateLogs = collectGateLogs();
if (gateLogs.length < 8) {
  fail(`Too few gate logs found (${gateLogs.length}); expected current or latest full gate logs.`);
}

const coreE2e = readJson(resolve(evidenceDir, "latest-core-e2e.json"), "core E2E evidence");
if (coreE2e?.status !== "passed") {
  fail("Core E2E evidence is not passed.");
}
for (const [key, expected] of [
  ["sqlite_real", true],
  ["xml_xsd_validated", true],
  ["pdf_created", true],
  ["json_export_created", true],
  ["csv_export_created", true],
  ["audit_export_created", true],
  ["fiscal_chain_valid", true],
  ["signature_status", "pending_xades"],
  ["transmission_status", "not_submitted"],
]) {
  if (coreE2e?.checks?.[key] !== expected) {
    fail(`Core E2E check ${key} expected ${expected}, got ${coreE2e?.checks?.[key]}`);
  }
}

const browserSmoke = readJson(resolve(evidenceDir, "latest-browser-smoke.json"), "browser smoke evidence");
if (browserSmoke?.status !== "passed") {
  fail("Browser smoke evidence is not passed.");
}
if (browserSmoke?.checks?.visible_limits?.final?.noAeatCsv !== true) {
  fail("Browser smoke final visible no-AEAT/CSV limit is missing.");
}

const secretScan = readJson(resolve(evidenceDir, "latest-secret-scan.json"), "secret scan evidence");
if (secretScan?.status !== "passed") {
  fail("Secret scan evidence is not passed.");
}
if (secretScan?.finding_count !== 0) {
  fail("Secret scan evidence must have zero findings.");
}

const tauriDesktop = readJson(resolve(evidenceDir, "latest-tauri-desktop-e2e.json"), "Tauri desktop E2E evidence");
if (tauriDesktop?.status !== "passed") {
  fail("Tauri desktop E2E evidence is not passed.");
}
if (!["preflight", "real"].includes(tauriDesktop?.mode)) {
  fail("Tauri desktop E2E evidence must record preflight or real mode.");
}
if (tauriDesktop?.mode === "real") {
  for (const requiredCheck of ["webdriver_session_created", "real_rust_commands_executed", "verifactu_xml_exported", "submission_prepared"]) {
    if (tauriDesktop?.checks?.[requiredCheck] !== true) {
      fail(`Tauri desktop real E2E check ${requiredCheck} must be true.`);
    }
  }
}

const externalReadiness = readJson(resolve(evidenceDir, "latest-external-readiness.json"), "external readiness evidence");
if (!["ready", "blocked"].includes(externalReadiness?.status)) {
  fail("External readiness evidence must be ready or blocked.");
}
if (externalReadiness?.status === "blocked" && !Array.isArray(externalReadiness?.blockers)) {
  fail("External readiness blocked status must include blockers.");
}

const externalAcceptance = readJson(resolve(evidenceDir, "latest-external-acceptance-evidence.json"), "external acceptance evidence");
if (!["not_provided", "accepted", "recorded_rejected", "recorded_pending", "recorded_failed"].includes(externalAcceptance?.status)) {
  fail("External acceptance evidence status is not recognized.");
}
if (externalAcceptance?.validation_status !== "passed") {
  fail("External acceptance evidence validation must pass unless the manifest verifier itself failed.");
}
if (externalAcceptance?.external_call_performed_by_verifier !== false) {
  fail("External acceptance verifier must not perform external calls.");
}

const contaproImport = readJson(resolve(evidenceDir, "latest-contapro-sidecar-import.json"), "ContaPro sidecar import evidence");
if (contaproImport?.import_status !== "passed") {
  fail("ContaPro sidecar import evidence is not passed.");
}
if (contaproImport?.external_call_performed_by_importer !== false) {
  fail("ContaPro sidecar import must not perform external calls.");
}
for (const requiredChannel of ["verifactu", "sii", "face", "ticketbai"]) {
  if (!contaproImport?.channels?.some((item) => item.id === requiredChannel)) {
    fail(`ContaPro sidecar import missing channel: ${requiredChannel}`);
  }
}

const ledger = {
  app: "CumpleFactura",
  generated_at: new Date().toISOString(),
  status: errors.length === 0 ? "passed" : "failed",
  gate_run_id: process.env.CUMPLEFACTURA_GATE_RUN_ID ?? null,
  rows: rows.length,
  rules: [
    "Every matrix row must keep promise, local source, executable evidence and live limit.",
    "Critical local normative sources are hashed from C:\\03 LEGISLACION.",
    "Current or latest gate logs are hashed.",
    "Generated XML/PDF/JSON/PNG evidence artifacts are hashed.",
    "External acceptance manifests are represented by redacted hashes only and are hashed when present.",
    "Secret scan evidence reports only rule ids and paths, never matched values.",
    "Desktop Tauri E2E evidence records preflight or real mode explicitly; real mode must prove WebDriver session, Rust command flow, XML export and submission preparation.",
    "During a running gate, latest-regulatory-gate.* is written after the ledger; the current run is represented by per-step logs.",
    "Ledger proves local traceability, not external AEAT acceptance or legal sufficiency.",
  ],
  claims: rows.map((row, index) => ({
    index: index + 1,
    promise: row.promise,
    source: row.source,
    evidence: row.evidence,
    limit: row.limit,
  })),
  artifacts: {
    normative_sources: normativeSources.map((item) => ({
      id: item.id,
      ...artifact(item.path, `normative source ${item.id}`),
    })),
    repo: repoArtifacts.map(([id, path]) => ({
      id,
      ...artifact(path, `repo artifact ${id}`),
    })),
    evidence: evidenceArtifacts.map(([id, path]) => ({
      id,
      ...artifact(path, `evidence artifact ${id}`),
    })),
    gate_logs: gateLogs.map((path) => ({
      id: basename(path, ".log"),
      ...artifact(path, `gate log ${basename(path)}`),
    })),
  },
  limits: [
    "No artifact hash is a legal certification.",
    "No AEAT network transmission, CSV retrieval or external acceptance is performed by this ledger.",
    "External acceptance intake stores and hashes a redacted manifest only; without a supplied manifest it records not_provided.",
    "Certificate-backed XAdES remains pending unless sidecar runs with a real authorized certificate.",
    "Desktop Tauri standalone default is preflight; regulatory gate enables real WebDriver mode.",
  ],
};

ledger.status = errors.length === 0 ? "passed" : "failed";
writeFileSync(outputJson, `${JSON.stringify(ledger, null, 2)}\n`);

const md = [
  "# CumpleFactura evidence ledger",
  "",
  `- Generated: ${ledger.generated_at}`,
  `- Status: ${ledger.status}`,
  `- Matrix rows: ${ledger.rows}`,
  `- Gate run id: ${ledger.gate_run_id ?? "latest"}`,
  "",
  "## Artifact Counts",
  "",
  `- Normative sources: ${ledger.artifacts.normative_sources.length}`,
  `- Repo artifacts: ${ledger.artifacts.repo.length}`,
  `- Evidence artifacts: ${ledger.artifacts.evidence.length}`,
  `- Gate logs: ${ledger.artifacts.gate_logs.length}`,
  "",
  "## Limits",
  "",
  ...ledger.limits.map((limit) => `- ${limit}`),
  "",
  "## SHA256",
  "",
  "| Role | Id | Bytes | SHA256 |",
  "|---|---|---:|---|",
];

for (const group of Object.values(ledger.artifacts)) {
  for (const item of group) {
    md.push(`| ${item.role} | \`${item.id}\` | ${item.bytes ?? 0} | \`${item.sha256 ?? "missing"}\` |`);
  }
}

writeFileSync(outputMd, `${md.join("\n")}\n`);

if (errors.length > 0) {
  console.error("Evidence ledger FAILED");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("Evidence ledger OK");
console.log(`Rows: ${rows.length}`);
console.log(`Gate logs: ${gateLogs.length}`);
console.log(outputJson);
console.log(outputMd);
