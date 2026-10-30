// Import ContaPro sidecar readiness into CumpleFactura evidence (no secrets/network).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sidecarRoot = resolve(root, "..", "contapro", "services", "sidecar");
const evidenceDir = resolve(root, "tests", "regulatory", "evidence");
const outputJson = resolve(evidenceDir, "latest-contapro-sidecar-import.json");
const outputMd = resolve(evidenceDir, "latest-contapro-sidecar-import.md");

const readinessPath = resolve(sidecarRoot, "tests", "regulatory", "evidence", "latest-external-readiness.json");
const gatePath = resolve(sidecarRoot, "tests", "regulatory", "evidence", "latest-regulatory-gate.json");
const ledgerPath = resolve(sidecarRoot, "tests", "regulatory", "evidence", "latest-evidence-ledger.json");
const matrixPath = resolve(sidecarRoot, "REGULATORY_EVIDENCE_MATRIX.md");
const acceptanceManifestPaths = {
  verifactu: resolve(sidecarRoot, "tests", "regulatory", "evidence", "verifactu", "acceptance-manifest.json"),
  sii: resolve(sidecarRoot, "tests", "regulatory", "evidence", "sii", "acceptance-manifest.json"),
};

function readJson(path) {
  if (!path) return null;
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

function section(readiness, id) {
  return readiness?.sections?.find((item) => item.id === id) ?? null;
}

function channel(readiness, id) {
  const item = section(readiness, id);
  const acceptance = readJson(acceptanceManifestPaths[id]);
  const acceptanceReady =
    acceptance?.status === "accepted" &&
    acceptance?.validation_status === "passed" &&
    Array.isArray(acceptance?.services) &&
    acceptance.services.includes(id);
  const status = item?.status ?? "missing";

  return {
    id,
    status,
    blockers: (item?.blockers ?? []).map((blocker) => blocker.id ?? blocker.detail).filter(Boolean),
    mvp_importable: status === "ready" && acceptanceReady,
    acceptance_status: acceptance?.status ?? "missing",
    acceptance_validation_status: acceptance?.validation_status ?? "missing",
    acceptance_manifest: acceptanceManifestPaths[id] ?? null,
  };
}

await mkdir(evidenceDir, { recursive: true });

const readiness = readJson(readinessPath);
const gate = readJson(gatePath);
const ledger = readJson(ledgerPath);
const channels = [
  channel(readiness, "verifactu"),
  channel(readiness, "sii"),
  channel(readiness, "face"),
  channel(readiness, "ticketbai"),
];
const mvpChannels = channels.filter((item) => item.mvp_importable).map((item) => item.id);
const deferredChannels = channels.filter((item) => !item.mvp_importable).map((item) => item.id);

const result = {
  app: "CumpleFactura",
  generated_at: new Date().toISOString(),
  source_project: "contapro-sidecar",
  import_status: readiness && gate && mvpChannels.length > 0 ? "passed" : "missing_source_evidence",
  external_call_performed_by_importer: false,
  certificate_parsing_performed_by_importer: false,
  source_refs: {
    sidecar_root: sidecarRoot,
    readiness: readinessPath,
    gate: gatePath,
    ledger: ledgerPath,
    matrix: matrixPath,
  },
  source_status: {
    readiness: readiness?.status ?? "missing",
    gate: gate?.gate_status ?? "missing",
    ledger: ledger?.status ?? "missing",
  },
  channels,
  mvp_channels: mvpChannels,
  deferred_channels: deferredChannels,
  imported_scope: [
    ...mvpChannels.map((id) => `${id.toUpperCase()} accepted sidecar readiness for MVP`),
  ],
  deferred_scope: [
    "FACe remains blocked by external SP/certificate registration evidence.",
    "TicketBAI remains blocked by foral signing policy, software registration and acceptance evidence.",
  ],
  limits: [
    "This import reads local redacted evidence only.",
    "It performs no AEAT, SII, FACe or foral network call.",
    "It imports no certificate, password, private key or raw fiscal payload.",
    "CumpleFactura remains local-first and fail-closed.",
  ],
};

writeFileSync(outputJson, `${JSON.stringify(result, null, 2)}\n`, "utf8");

const rows = result.channels
  .map((item) => `| ${item.id} | ${item.status} | ${item.mvp_importable ? "yes" : "no"} | ${item.acceptance_status}/${item.acceptance_validation_status} | ${item.blockers.join(", ") || "none"} |`)
  .join("\n");
const md = [
  "# CumpleFactura ContaPro sidecar import",
  "",
  `- Generated: ${result.generated_at}`,
  `- Status: ${result.import_status}`,
  `- Source readiness: ${result.source_status.readiness}`,
  `- Source gate: ${result.source_status.gate}`,
  "- External call: false",
  `- MVP importable: ${result.mvp_channels.join(", ") || "none"}`,
  `- Deferred: ${result.deferred_channels.join(", ") || "none"}`,
  "",
  "## Channels",
  "",
  "| Channel | Status | MVP importable | Acceptance | Blockers |",
  "|---|---|---:|---|---|",
  rows,
  "",
  "## Deferred",
  "",
  ...result.deferred_scope.map((item) => `- ${item}`),
  "",
  "## Limits",
  "",
  ...result.limits.map((limit) => `- ${limit}`),
  "",
].join("\n");
writeFileSync(outputMd, md, "utf8");

if (result.import_status !== "passed") {
  console.error("CumpleFactura ContaPro sidecar import FAILED");
  console.error(`Missing source evidence. readiness=${existsSync(readinessPath)} gate=${existsSync(gatePath)}`);
  process.exit(1);
}

console.log("CumpleFactura ContaPro sidecar import OK");
console.log(outputJson);
console.log(outputMd);
