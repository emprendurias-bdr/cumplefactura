// External readiness: AEAT/sidecar readiness JSON (often blocked).
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { download as downloadEdgeDriver } from "edgedriver";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = resolve(root, "tests/regulatory/evidence");
const outputJson = resolve(evidenceDir, "latest-external-readiness.json");
const outputMd = resolve(evidenceDir, "latest-external-readiness.md");
const sidecarRoot = resolve(root, "..", "contapro", "services", "sidecar");
const externalAcceptancePath = resolve(evidenceDir, "latest-external-acceptance-evidence.json");
const contaproImportPath = resolve(evidenceDir, "latest-contapro-sidecar-import.json");
const tauriDesktopEvidencePath = resolve(evidenceDir, "latest-tauri-desktop-e2e.json");
let resolvedEdgeDriverPath = "";
try {
  resolvedEdgeDriverPath = await downloadEdgeDriver();
} catch {
  resolvedEdgeDriverPath = "";
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
  return candidates;
}

function commandExists(command) {
  const result = spawnSync("where.exe", [command], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const localPaths = localCommandCandidates(command).filter((path) => existsSync(path));
  const pathHits = result.status === 0
    ? result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    : [];
  const paths = [...new Set([...pathHits, ...localPaths])];
  return {
    ok: paths.length > 0,
    paths,
  };
}

function envSet(name) {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0;
}

function envEnabled(name) {
  return ["1", "true", "yes", "on"].includes((process.env[name] ?? "").trim().toLowerCase());
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function pathInfo(path) {
  if (!path || !existsSync(path)) {
    return { exists: false };
  }
  const stat = statSync(path);
  return { exists: true, is_file: stat.isFile(), is_dir: stat.isDirectory(), bytes: stat.size };
}

function blocker(id, detail) {
  return { id, detail };
}

function section(id, title, checks) {
  const blockers = checks.filter((check) => check.required && !check.ok).map((check) => blocker(check.id, check.detail));
  const warnings = checks.filter((check) => !check.required && !check.ok).map((check) => blocker(check.id, check.detail));
  return {
    id,
    title,
    status: blockers.length === 0 ? "ready" : "blocked",
    checks,
    blockers,
    warnings,
  };
}

const tauriDriver = commandExists("tauri-driver.exe");
const msedgeDriver = commandExists("msedgedriver.exe");
const chromeDriver = commandExists("chromedriver.exe");
const tauriExe = resolve(root, "src-tauri/target/release/cumplefactura.exe");

const sidecarGatePath = resolve(sidecarRoot, "tests/regulatory/evidence/latest-regulatory-gate.json");
const sidecarLedgerPath = resolve(sidecarRoot, "tests/regulatory/evidence/latest-evidence-ledger.json");
const sidecarGate = readJson(sidecarGatePath);
const sidecarLedger = readJson(sidecarLedgerPath);
const tauriDesktopEvidence = readJson(tauriDesktopEvidencePath);
const contaproImport = readJson(contaproImportPath);

const certRef = process.env.CUMPLEFACTURA_EXTERNAL_CERT_REF ?? "";
const certRefValid = /^vault:\/\/certs\/[A-Za-z0-9_.-]+$/.test(certRef);
const certId = certRefValid ? certRef.replace("vault://certs/", "") : "";
const vaultDir = process.env.SIDECAR_CERT_VAULT_DIR ?? "";
const vaultInfo = pathInfo(vaultDir);
const candidateCertPaths = certId && vaultInfo.exists
  ? [resolve(vaultDir, `${certId}.p12`), resolve(vaultDir, `${certId}.pfx`)]
  : [];
const certFileExists = candidateCertPaths.some((path) => existsSync(path));
const certPasswordEnv = certId ? `SIDECAR_CERT_PASSWORD_${certId.toUpperCase().replace(/[^A-Z0-9]/g, "_")}` : "";

const externalAcceptance = readJson(externalAcceptancePath);
const externalAcceptanceAccepted =
  externalAcceptance?.validation_status === "passed" &&
  externalAcceptance?.status === "accepted" &&
  externalAcceptance?.provider === "AEAT_VERIFACTU";
const legacyAcceptanceEvidencePath = process.env.CUMPLEFACTURA_AEAT_ACCEPTANCE_EVIDENCE_PATH ?? "";
const legacyAcceptanceEvidence = pathInfo(legacyAcceptanceEvidencePath);

const sections = [
  section("tauri_desktop_e2e", "Tauri desktop E2E", [
    {
      id: "tauri_release_exe_exists",
      ok: pathInfo(tauriExe).exists,
      required: true,
      detail: "Release executable must exist before desktop E2E can run.",
      evidence: tauriExe,
    },
    {
      id: "tauri_driver_available",
      ok: tauriDriver.ok,
      required: true,
      detail: "tauri-driver is required for real Tauri WebDriver E2E.",
      evidence: tauriDriver.paths,
    },
    {
      id: "webdriver_available",
      ok: msedgeDriver.ok,
      required: true,
      detail: "Microsoft Edge WebDriver is required for Windows Tauri/WebView2 desktop automation.",
      evidence: { msedgedriver: msedgeDriver.paths, chromedriver: chromeDriver.paths },
    },
    {
      id: "tauri_desktop_e2e_evidence_passed",
      ok: tauriDesktopEvidence?.status === "passed",
      required: true,
      detail: "Latest Tauri desktop E2E verifier evidence must be present and passed.",
      evidence: tauriDesktopEvidencePath,
    },
  ]),
  section("real_xades", "Certificate-backed XAdES", [
    {
      id: "sidecar_workspace_exists",
      ok: existsSync(sidecarRoot),
      required: true,
      detail: "ContaPro sidecar workspace must exist.",
      evidence: sidecarRoot,
    },
    {
      id: "sidecar_gate_passed",
      ok: sidecarGate?.gate_status === "passed",
      required: true,
      detail: "Sidecar regulatory gate must be green before using it for real signing.",
      evidence: sidecarGatePath,
    },
    {
      id: "sidecar_ledger_passed",
      ok: sidecarLedger?.status === "passed",
      required: true,
      detail: "Sidecar evidence ledger must be green before using it for real signing.",
      evidence: sidecarLedgerPath,
    },
    {
      id: "cumplefactura_real_xades_flag",
      ok: envEnabled("CUMPLEFACTURA_ENABLE_REAL_XADES_SIDECAR"),
      required: true,
      detail: "CUMPLEFACTURA_ENABLE_REAL_XADES_SIDECAR must be enabled explicitly.",
    },
    {
      id: "sidecar_real_xades_flag",
      ok: envEnabled("SIDECAR_ENABLE_REAL_XADES_ENDPOINTS"),
      required: true,
      detail: "SIDECAR_ENABLE_REAL_XADES_ENDPOINTS must be enabled explicitly.",
    },
    {
      id: "shared_secret_present",
      ok: envSet("CUMPLEFACTURA_SIDECAR_SHARED_SECRET") || envSet("SIDECAR_SHARED_SECRET"),
      required: true,
      detail: "Shared HMAC secret must be provided by environment, never by prompt or file.",
    },
    {
      id: "certificate_ref_valid",
      ok: certRefValid,
      required: true,
      detail: "CUMPLEFACTURA_EXTERNAL_CERT_REF must use vault://certs/<id>.",
      evidence: certRefValid ? "vault://certs/<redacted>" : "missing_or_invalid",
    },
    {
      id: "vault_dir_exists",
      ok: vaultInfo.exists && vaultInfo.is_dir,
      required: true,
      detail: "SIDECAR_CERT_VAULT_DIR must point to a mounted local vault directory.",
      evidence: vaultDir ? "<redacted path checked>" : "missing",
    },
    {
      id: "vault_certificate_file_exists",
      ok: certFileExists,
      required: true,
      detail: "Vault must contain <id>.p12 or <id>.pfx for the certificate ref.",
      evidence: certFileExists ? "<redacted vault cert path checked>" : "missing",
    },
    {
      id: "certificate_password_env_present",
      ok: (certPasswordEnv && envSet(certPasswordEnv)) || envSet("SIDECAR_CERT_PASSWORD"),
      required: true,
      detail: "Certificate password must be supplied by SIDECAR_CERT_PASSWORD_<ID> or SIDECAR_CERT_PASSWORD.",
      evidence: certPasswordEnv || "SIDECAR_CERT_PASSWORD",
    },
  ]),
  section("real_verifactu_submission", "Real VERI*FACTU submission", [
    {
      id: "cumplefactura_invoke_flag",
      ok: envEnabled("CUMPLEFACTURA_ENABLE_VERIFACTU_SUBMIT_SIDECAR_INVOKE"),
      required: true,
      detail: "CUMPLEFACTURA_ENABLE_VERIFACTU_SUBMIT_SIDECAR_INVOKE must be enabled explicitly.",
    },
    {
      id: "sidecar_transport_flag",
      ok: envEnabled("SIDECAR_ENABLE_REAL_VERIFACTU_TRANSPORT"),
      required: true,
      detail: "SIDECAR_ENABLE_REAL_VERIFACTU_TRANSPORT must be enabled explicitly.",
    },
    {
      id: "sidecar_soap_flag",
      ok: envEnabled("SIDECAR_ENABLE_REAL_VERIFACTU_SOAP_CALLS"),
      required: true,
      detail: "SIDECAR_ENABLE_REAL_VERIFACTU_SOAP_CALLS must be enabled explicitly.",
    },
    {
      id: "aeat_acceptance_evidence_validated",
      ok: externalAcceptanceAccepted,
      required: true,
      detail: "External AEAT VERI*FACTU acceptance/homologation must be recorded through the validated redacted manifest intake.",
      evidence: {
        latest_external_acceptance: externalAcceptancePath,
        latest_status: externalAcceptance?.status ?? "missing",
        legacy_path_present: legacyAcceptanceEvidence.exists && legacyAcceptanceEvidence.is_file,
      },
    },
  ]),
  section("imported_sidecar_channels", "Imported ContaPro sidecar channels", [
    {
      id: "contapro_import_passed",
      ok: contaproImport?.import_status === "passed",
      required: true,
      detail: "ContaPro sidecar readiness evidence must be imported locally.",
      evidence: contaproImportPath,
    },
    {
      id: "contapro_import_no_external_call",
      ok: contaproImport?.external_call_performed_by_importer === false,
      required: true,
      detail: "Import must not perform AEAT/SII/FACe/foral network calls.",
    },
    {
      id: "contapro_verifactu_imported",
      ok: contaproImport?.channels?.some((item) => item.id === "verifactu"),
      required: true,
      detail: "VERI*FACTU sidecar channel status must be present.",
    },
    {
      id: "contapro_sii_imported",
      ok: contaproImport?.channels?.some((item) => item.id === "sii"),
      required: true,
      detail: "SII sidecar channel status must be present.",
    },
    {
      id: "contapro_ticketbai_imported",
      ok: contaproImport?.channels?.some((item) => item.id === "ticketbai"),
      required: true,
      detail: "TicketBAI sidecar channel status must be present, even if blocked.",
    },
  ]),
];

const blockers = sections.flatMap((item) =>
  item.blockers.map((entry) => ({ section: item.id, ...entry })),
);
const warnings = sections.flatMap((item) =>
  item.warnings.map((entry) => ({ section: item.id, ...entry })),
);

const result = {
  app: "CumpleFactura",
  generated_at: new Date().toISOString(),
  status: blockers.length === 0 ? "ready" : "blocked",
  gate_run_id: process.env.CUMPLEFACTURA_GATE_RUN_ID ?? null,
  sections,
  blockers,
  warnings,
  secret_policy: [
    "No secret values are emitted.",
    "Vault paths and certificate refs are redacted in evidence.",
    "This audit performs no network call and no certificate parsing.",
    "ContaPro sidecar import reads redacted local evidence only.",
  ],
  limits: [
    "Blocked is an expected safe status until real cert/vault/flags/evidence exist.",
    "This audit proves readiness state only; it is not XAdES signing, AEAT transmission, CSV retrieval or homologation.",
    "External acceptance is considered ready only when the manifest verifier records accepted AEAT_VERIFACTU evidence.",
    "Imported SII/TicketBAI/FACe status is evidence visibility only; CumpleFactura still requires explicit flags/HMAC/vault before sidecar calls.",
  ],
};

writeFileSync(outputJson, `${JSON.stringify(result, null, 2)}\n`);

const md = [
  "# CumpleFactura external readiness",
  "",
  `- Generated: ${result.generated_at}`,
  `- Status: ${result.status}`,
  `- Blockers: ${blockers.length}`,
  `- Warnings: ${warnings.length}`,
  "",
  "## Sections",
  "",
  "| Section | Status | Blockers |",
  "|---|---:|---:|",
  ...sections.map((item) => `| ${item.title} | ${item.status} | ${item.blockers.length} |`),
  "",
  "## Blockers",
  "",
  ...(blockers.length === 0
    ? ["- none"]
    : blockers.map((item) => `- ${item.section}: ${item.id} - ${item.detail}`)),
  "",
  "## Limits",
  "",
  ...result.limits.map((limit) => `- ${limit}`),
  "",
];
writeFileSync(outputMd, md.join("\n"));

console.log("CumpleFactura external readiness OK");
console.log(`Status: ${result.status}`);
console.log(`Blockers: ${blockers.length}`);
console.log(outputJson);
console.log(outputMd);
