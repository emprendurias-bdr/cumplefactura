// External readiness: ¿qué falta para enviar a la AEAT de verdad? Normalmente "blocked".
//
// No hace llamadas de red ni abre certificados: solo comprueba que existan el binario
// del sidecar, su smoke, el certificado en el vault, las variables de entorno y la
// evidencia de aceptación externa. Las rutas y referencias se redactan en la evidencia.
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { download as downloadEdgeDriver } from "edgedriver";
import { commandExists, evidenceDir, pathInfo, readJson, root, windowsDriverCandidates, writeEvidence } from "./lib.mjs";

const exeSuffix = process.platform === "win32" ? ".exe" : "";
const releaseExe = resolve(root, `target/release/cumplefactura${exeSuffix}`);
const releaseSidecar = resolve(root, `target/release/cumplefactura-sidecar${exeSuffix}`);
const evidence = (name) => resolve(evidenceDir, `latest-${name}.json`);
const resolvedEdgeDriverPath = await downloadEdgeDriver().catch(() => "");

const envEnabled = (name) => ["1", "true", "yes", "on"].includes((process.env[name] ?? "").trim().toLowerCase());
const envSet = (name) => Boolean((process.env[name] ?? "").trim());

function section(id, title, checks) {
  const toEntry = (check) => ({ id: check.id, detail: check.detail });
  const blockers = checks.filter((check) => check.required && !check.ok).map(toEntry);
  const warnings = checks.filter((check) => !check.required && !check.ok).map(toEntry);
  return { id, title, status: blockers.length === 0 ? "ready" : "blocked", checks, blockers, warnings };
}

const tauriDriver = commandExists("tauri-driver.exe", windowsDriverCandidates("tauri-driver.exe"));
const msedgeDriver = commandExists("msedgedriver.exe", windowsDriverCandidates("msedgedriver.exe", resolvedEdgeDriverPath));
const tauriDesktopEvidence = readJson(evidence("tauri-desktop-e2e"));
const sidecarSmoke = readJson(evidence("sidecar-smoke"));
const externalAcceptance = readJson(evidence("external-acceptance-evidence"));

// Certificado: misma regla que el sidecar (vault://certs/<id>, id [A-Za-z0-9_-]).
const certRef = process.env.CUMPLEFACTURA_EXTERNAL_CERT_REF ?? "";
const certId = /^vault:\/\/certs\/[A-Za-z0-9_-]+$/.test(certRef) ? certRef.slice("vault://certs/".length) : "";
const vaultDir = process.env.CUMPLEFACTURA_CERT_VAULT_DIR ?? "";
const vaultInfo = pathInfo(vaultDir);
const certFileExists =
  Boolean(certId && vaultInfo.is_dir) &&
  ["p12", "pfx"].some((extension) => existsSync(resolve(vaultDir, `${certId}.${extension}`)));
const certPasswordEnv = certId ? `CUMPLEFACTURA_CERT_PASSWORD_${certId.toUpperCase().replace(/[^A-Z0-9]/g, "_")}` : "";

const sections = [
  section("tauri_desktop_e2e", "Tauri desktop E2E", [
    {
      id: "tauri_release_exe_exists",
      ok: pathInfo(releaseExe).exists,
      required: true,
      detail: "Release executable must exist before desktop E2E can run.",
      evidence: releaseExe,
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
      evidence: msedgeDriver.paths,
    },
    {
      id: "tauri_desktop_e2e_evidence_passed",
      ok: tauriDesktopEvidence?.status === "passed",
      required: true,
      detail: "Latest Tauri desktop E2E verifier evidence must be present and passed.",
      evidence: evidence("tauri-desktop-e2e"),
    },
  ]),
  section("sidecar", "VERI*FACTU sidecar", [
    {
      id: "sidecar_release_binary_exists",
      ok: pathInfo(releaseSidecar).exists,
      required: true,
      detail: "cumplefactura-sidecar must be built next to the release executable (cargo build --workspace --release).",
      evidence: releaseSidecar,
    },
    {
      id: "sidecar_smoke_passed",
      ok: sidecarSmoke?.status === "passed",
      required: true,
      detail: "Latest sidecar smoke (handshake, HMAC, fail-closed, exit on stdin close) must have passed.",
      evidence: evidence("sidecar-smoke"),
    },
  ]),
  section("certificate", "Certificate in local vault", [
    {
      id: "certificate_ref_valid",
      ok: Boolean(certId),
      required: true,
      detail: "CUMPLEFACTURA_EXTERNAL_CERT_REF must use vault://certs/<id> with [A-Za-z0-9_-].",
      evidence: certId ? "vault://certs/<redacted>" : "missing_or_invalid",
    },
    {
      id: "vault_dir_exists",
      ok: Boolean(vaultInfo.is_dir),
      required: true,
      detail: "CUMPLEFACTURA_CERT_VAULT_DIR must point to the local vault directory (the app defaults to <app data>/certs).",
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
      ok: (certPasswordEnv && envSet(certPasswordEnv)) || envSet("CUMPLEFACTURA_CERT_PASSWORD"),
      required: true,
      detail: "Certificate password must be supplied by CUMPLEFACTURA_CERT_PASSWORD_<ID> or CUMPLEFACTURA_CERT_PASSWORD.",
      evidence: certPasswordEnv || "CUMPLEFACTURA_CERT_PASSWORD",
    },
  ]),
  section("real_verifactu_submission", "Real VERI*FACTU submission", [
    {
      id: "sidecar_allow_aeat_flag",
      ok: envEnabled("CUMPLEFACTURA_SIDECAR_ALLOW_AEAT"),
      required: true,
      detail: "CUMPLEFACTURA_SIDECAR_ALLOW_AEAT=1 makes the app start the sidecar with --allow-aeat.",
    },
    {
      id: "aeat_acceptance_evidence_validated",
      ok:
        externalAcceptance?.validation_status === "passed" &&
        externalAcceptance?.status === "accepted" &&
        externalAcceptance?.provider === "AEAT_VERIFACTU",
      required: true,
      detail: "External AEAT VERI*FACTU acceptance must be recorded through the validated redacted manifest intake.",
      evidence: { latest_external_acceptance: evidence("external-acceptance-evidence"), latest_status: externalAcceptance?.status ?? "missing" },
    },
  ]),
];

const blockers = sections.flatMap((item) => item.blockers.map((entry) => ({ section: item.id, ...entry })));
const warnings = sections.flatMap((item) => item.warnings.map((entry) => ({ section: item.id, ...entry })));

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
    "The sidecar HMAC secret is generated per session by the app and never stored, so it is not checked here.",
  ],
  limits: [
    "Blocked is an expected safe status until a real certificate, vault, flag and acceptance evidence exist.",
    "This audit proves readiness state only; it is not AEAT transmission, CSV retrieval or homologation.",
    "VERI*FACTU records are sent unsigned by design (RD 1007/2023 art. 16.3); AEAT authenticates the TLS client certificate.",
    "Production endpoints stay blocked: the app never starts the sidecar with --allow-production in v1.",
  ],
};

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
  ...(blockers.length === 0 ? ["- none"] : blockers.map((item) => `- ${item.section}: ${item.id} - ${item.detail}`)),
  "",
  "## Limits",
  "",
  ...result.limits.map((limit) => `- ${limit}`),
];
const { jsonPath, mdPath } = writeEvidence("external-readiness", result, md);

console.log("CumpleFactura external readiness OK");
console.log(`Status: ${result.status}`);
console.log(`Blockers: ${blockers.length}`);
console.log(jsonPath);
console.log(mdPath);
