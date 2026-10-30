// External acceptance evidence checker (manifest / not_provided safe).
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = resolve(root, "tests/regulatory/evidence");
const fixturePath = resolve(root, "tests/regulatory/fixtures/external-acceptance-manifest.example.json");
const outputJson = resolve(evidenceDir, "latest-external-acceptance-evidence.json");
const outputMd = resolve(evidenceDir, "latest-external-acceptance-evidence.md");
const manifestEnv = "CUMPLEFACTURA_EXTERNAL_ACCEPTANCE_MANIFEST";
const manifestPath = process.env[manifestEnv]?.trim() ?? "";

const providers = new Set([
  "AEAT_VERIFACTU",
  "FACE",
  "SII",
  "TICKETBAI",
  "BATUZ",
  "NAVARRA_HTN",
]);
const environments = new Set(["test", "homologation", "production"]);
const resultStatuses = new Set(["accepted", "rejected", "pending", "failed"]);
const hashPattern = /^[a-f0-9]{64}$/i;
const errors = [];
const warnings = [];

mkdirSync(evidenceDir, { recursive: true });

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function fail(message) {
  errors.push(message);
}

function warn(message) {
  warnings.push(message);
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(`Cannot parse manifest JSON: ${error.message}`);
    return null;
  }
}

function resolveFrom(baseDir, value) {
  return isAbsolute(value) ? value : resolve(baseDir, value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function requireString(manifest, field) {
  if (!isNonEmptyString(manifest[field])) {
    fail(`Missing required string field: ${field}`);
    return "";
  }
  return manifest[field].trim();
}

function requireHash(manifest, field) {
  const value = requireString(manifest, field);
  if (value && !hashPattern.test(value)) {
    fail(`${field} must be a SHA256 hex digest.`);
  }
  return value.toLowerCase();
}

function collectStrings(value, path = "$", acc = []) {
  if (typeof value === "string") {
    acc.push({ path, value });
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => collectStrings(item, `${path}[${index}]`, acc));
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      collectStrings(item, `${path}.${key}`, acc);
    }
  }
  return acc;
}

function validateVisibleStrings(manifest) {
  const forbidden = [
    { pattern: /<\?xml|<soap:|<s:Envelope|<Registro(?:Alta|Anulacion)|<Signature|<ds:Signature/i, label: "raw XML/SOAP/signature content" },
    { pattern: /-----BEGIN (?:RSA |EC |OPENSSH |)?PRIVATE KEY-----/i, label: "private key material" },
    { pattern: /-----BEGIN CERTIFICATE-----/i, label: "certificate body" },
    { pattern: /\b(?:password|passwd|pwd|secret|token)\s*[:=]/i, label: "inline credential" },
    { pattern: /vault:\/\/certs\/(?!<redacted>|REDACTED)[A-Za-z0-9_.-]+/i, label: "unredacted vault certificate reference" },
  ];

  for (const item of collectStrings(manifest)) {
    for (const rule of forbidden) {
      if (rule.pattern.test(item.value)) {
        fail(`Manifest contains ${rule.label} at ${item.path}. Store only hashes/redacted references.`);
      }
    }
  }
}

function validateEvidenceFiles(manifest, baseDir) {
  if (!Array.isArray(manifest.evidence_files) || manifest.evidence_files.length === 0) {
    fail("evidence_files must contain at least one hashed artifact.");
    return [];
  }

  return manifest.evidence_files.map((file, index) => {
    const role = isNonEmptyString(file?.role) ? file.role.trim() : "";
    const declaredPath = isNonEmptyString(file?.path) ? file.path.trim() : "";
    const expectedHash = isNonEmptyString(file?.sha256) ? file.sha256.trim().toLowerCase() : "";
    if (!role) {
      fail(`evidence_files[${index}].role is required.`);
    }
    if (!declaredPath) {
      fail(`evidence_files[${index}].path is required.`);
    }
    if (!hashPattern.test(expectedHash)) {
      fail(`evidence_files[${index}].sha256 must be a SHA256 hex digest.`);
    }

    const absolutePath = declaredPath ? resolveFrom(baseDir, declaredPath) : "";
    if (!absolutePath || !existsSync(absolutePath)) {
      fail(`Evidence artifact missing: ${declaredPath || `<empty ${index}>`}`);
      return { role, path: declaredPath, exists: false, sha256_matches: false };
    }

    const stat = statSync(absolutePath);
    if (!stat.isFile()) {
      fail(`Evidence artifact is not a file: ${declaredPath}`);
      return { role, path: declaredPath, exists: true, is_file: false, sha256_matches: false };
    }

    const actualHash = sha256(absolutePath);
    if (expectedHash && actualHash !== expectedHash) {
      fail(`Evidence artifact hash mismatch: ${declaredPath}`);
    }

    return {
      role,
      path: declaredPath,
      bytes: stat.size,
      sha256: actualHash,
      sha256_matches: expectedHash === actualHash,
    };
  });
}

function validateNormativeSources(manifest) {
  if (!Array.isArray(manifest.source_normative_paths) || manifest.source_normative_paths.length === 0) {
    fail("source_normative_paths must include at least one local normative source path.");
    return [];
  }

  return manifest.source_normative_paths.map((path, index) => {
    if (!isNonEmptyString(path)) {
      fail(`source_normative_paths[${index}] must be a non-empty path.`);
      return { path, exists: false };
    }
    const exists = existsSync(path);
    if (!exists) {
      fail(`Normative source path missing: ${path}`);
      return { path, exists: false };
    }
    const stat = statSync(path);
    return {
      path,
      exists: true,
      bytes: stat.size,
      sha256: stat.isFile() ? sha256(path) : null,
    };
  });
}

function validateManifest(path) {
  const absoluteManifestPath = resolveFrom(root, path);
  if (!existsSync(absoluteManifestPath)) {
    fail(`Manifest path does not exist: ${path}`);
    return null;
  }

  const manifest = readJson(absoluteManifestPath);
  if (!manifest) {
    return null;
  }

  const baseDir = dirname(absoluteManifestPath);
  validateVisibleStrings(manifest);

  const schemaVersion = requireString(manifest, "schema_version");
  if (schemaVersion !== "1") {
    fail("schema_version must be \"1\".");
  }

  const claimId = requireString(manifest, "claim_id");
  const provider = requireString(manifest, "provider");
  if (provider && !providers.has(provider)) {
    fail(`Unsupported provider: ${provider}`);
  }

  const environment = requireString(manifest, "environment");
  if (environment && !environments.has(environment)) {
    fail(`Unsupported environment: ${environment}`);
  }

  const operation = requireString(manifest, "operation");
  const performedAt = requireString(manifest, "performed_at");
  if (performedAt && Number.isNaN(Date.parse(performedAt))) {
    fail("performed_at must be an ISO-8601 timestamp.");
  }

  const resultStatus = requireString(manifest, "result_status");
  if (resultStatus && !resultStatuses.has(resultStatus)) {
    fail(`Unsupported result_status: ${resultStatus}`);
  }

  const externalReferenceRedacted = requireString(manifest, "external_reference_redacted");
  if (externalReferenceRedacted && !/(redacted|masked|\*{3,}|\[)/i.test(externalReferenceRedacted)) {
    warn("external_reference_redacted does not visibly mark redaction.");
  }

  const externalReferenceSha256 = requireHash(manifest, "external_reference_sha256");
  const certificateFingerprintSha256 = requireHash(manifest, "certificate_fingerprint_sha256");
  const requestArtifactSha256 = requireHash(manifest, "request_artifact_sha256");
  const responseArtifactSha256 = requireHash(manifest, "response_artifact_sha256");
  const evidenceFiles = validateEvidenceFiles(manifest, baseDir);
  const normativeSources = validateNormativeSources(manifest);

  return {
    manifest,
    absoluteManifestPath,
    claim_id: claimId,
    provider,
    environment,
    operation,
    performed_at: performedAt,
    result_status: resultStatus,
    external_reference_redacted: externalReferenceRedacted,
    external_reference_sha256: externalReferenceSha256,
    certificate_fingerprint_sha256: certificateFingerprintSha256,
    request_artifact_sha256: requestArtifactSha256,
    response_artifact_sha256: responseArtifactSha256,
    evidence_files: evidenceFiles,
    source_normative_paths: normativeSources,
    manifest_sha256: sha256(absoluteManifestPath),
  };
}

function writeResult(result, exitCode = 0) {
  writeFileSync(outputJson, `${JSON.stringify(result, null, 2)}\n`);

  const md = [
    "# CumpleFactura external acceptance evidence",
    "",
    `- Generated: ${result.generated_at}`,
    `- Status: ${result.status}`,
    `- Validation: ${result.validation_status}`,
    `- Provider: ${result.provider ?? "n/a"}`,
    `- Environment: ${result.environment ?? "n/a"}`,
    `- Accepted: ${result.accepted}`,
    "",
    "## Errors",
    "",
    ...(result.errors.length === 0 ? ["- none"] : result.errors.map((error) => `- ${error}`)),
    "",
    "## Warnings",
    "",
    ...(result.warnings.length === 0 ? ["- none"] : result.warnings.map((warning) => `- ${warning}`)),
    "",
    "## Limits",
    "",
    ...result.limits.map((limit) => `- ${limit}`),
    "",
  ];
  writeFileSync(outputMd, md.join("\n"));

  console.log("CumpleFactura external acceptance evidence OK");
  console.log(`Status: ${result.status}`);
  console.log(`Validation: ${result.validation_status}`);
  console.log(outputJson);
  console.log(outputMd);

  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}

if (!manifestPath) {
  writeResult({
    app: "CumpleFactura",
    generated_at: new Date().toISOString(),
    status: "not_provided",
    validation_status: "passed",
    gate_run_id: process.env.CUMPLEFACTURA_GATE_RUN_ID ?? null,
    manifest_env: manifestEnv,
    manifest_path: null,
    fixture_template: fixturePath,
    provider: null,
    environment: null,
    accepted: false,
    external_call_performed_by_verifier: false,
    warnings: [
      "No external acceptance manifest supplied. This is expected before real homologation/acceptance.",
    ],
    errors: [],
    limits: [
      "This verifier validates evidence intake only; it performs no AEAT/FACe/SII/foral network call.",
      "No screenshot, raw XML, password, private key or unredacted vault reference is accepted in the manifest.",
      "An accepted manifest is evidence of an external result being recorded, not legal certification by this app.",
    ],
  });
  process.exit(0);
}

const validated = validateManifest(manifestPath);
const valid = errors.length === 0 && validated !== null;
const accepted = valid && validated.result_status === "accepted";
const status = valid
  ? (accepted ? "accepted" : `recorded_${validated.result_status}`)
  : "invalid_manifest";

writeResult({
  app: "CumpleFactura",
  generated_at: new Date().toISOString(),
  status,
  validation_status: valid ? "passed" : "failed",
  gate_run_id: process.env.CUMPLEFACTURA_GATE_RUN_ID ?? null,
  manifest_env: manifestEnv,
  manifest_path: manifestPath,
  manifest_sha256: validated?.manifest_sha256 ?? null,
  claim_id: validated?.claim_id ?? null,
  provider: validated?.provider ?? null,
  environment: validated?.environment ?? null,
  operation: validated?.operation ?? null,
  performed_at: validated?.performed_at ?? null,
  result_status: validated?.result_status ?? null,
  accepted,
  external_reference_redacted: validated?.external_reference_redacted ?? null,
  external_reference_sha256: validated?.external_reference_sha256 ?? null,
  certificate_fingerprint_sha256: validated?.certificate_fingerprint_sha256 ?? null,
  request_artifact_sha256: validated?.request_artifact_sha256 ?? null,
  response_artifact_sha256: validated?.response_artifact_sha256 ?? null,
  evidence_files: validated?.evidence_files ?? [],
  source_normative_paths: validated?.source_normative_paths ?? [],
  external_call_performed_by_verifier: false,
  warnings,
  errors,
  limits: [
    "This verifier validates a supplied external evidence manifest and hashes referenced artifacts.",
    "It does not call AEAT/FACe/SII/foral services and does not obtain CSV or homologation itself.",
    "Only redacted references and SHA256 hashes are emitted.",
  ],
}, valid ? 0 : 1);
