// Secret scan: fail gate if credentials/keys appear in tracked sources.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = resolve(root, "tests/regulatory/evidence");
const outputJson = resolve(evidenceDir, "latest-secret-scan.json");
const outputMd = resolve(evidenceDir, "latest-secret-scan.md");

const excludedDirs = new Set([
  ".git",
  "node_modules",
  "dist",
  "target",
  ".tauri",
  ".vite",
]);
const sensitiveExtensions = new Set([".p12", ".pfx", ".key", ".pem"]);
const secretFileNames = new Set([".env", ".env.local", ".env.production", ".env.development"]);
const contentRules = [
  { id: "private_key_block", pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |)?PRIVATE KEY-----/ },
  { id: "aws_access_key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { id: "openai_api_key", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { id: "slack_token", pattern: /\bxox[abprs]-[A-Za-z0-9-]{20,}\b/ },
  { id: "env_secret_assignment", pattern: /^\s*[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PRIVATE_KEY)[A-Z0-9_]*\s*=\s*["']?(?!\s*$|changeme|example|placeholder|redacted|<redacted>|dummy)[^\s"']{8,}/im },
];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function isBinary(buffer) {
  return buffer.includes(0);
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!excludedDirs.has(entry.name)) {
        walk(join(dir, entry.name), files);
      }
      continue;
    }
    if (entry.isFile()) {
      files.push(join(dir, entry.name));
    }
  }
  return files;
}

mkdirSync(evidenceDir, { recursive: true });

const findings = [];
const scanned = [];
const files = walk(root);

for (const file of files) {
  const rel = relative(root, file).replaceAll("\\", "/");
  const name = basename(file);
  const ext = extname(file).toLowerCase();
  const stat = statSync(file);

  if (sensitiveExtensions.has(ext) || secretFileNames.has(name)) {
    findings.push({
      rule: sensitiveExtensions.has(ext) ? "sensitive_file_extension" : "secret_env_file",
      path: rel,
      redacted: true,
    });
    continue;
  }

  if (stat.size > 2_000_000) {
    continue;
  }

  const buffer = readFileSync(file);
  if (isBinary(buffer)) {
    continue;
  }

  const text = buffer.toString("utf8");
  scanned.push({ path: rel, bytes: stat.size, sha256: sha256(text) });
  for (const rule of contentRules) {
    if (rule.pattern.test(text)) {
      findings.push({ rule: rule.id, path: rel, redacted: true });
    }
  }
}

const result = {
  app: "CumpleFactura",
  generated_at: new Date().toISOString(),
  status: findings.length === 0 ? "passed" : "failed",
  files_scanned: scanned.length,
  finding_count: findings.length,
  findings,
  limits: [
    "Scanner reports rule ids and paths only; matched values are never emitted.",
    "High-confidence local scan; it is not a substitute for a dedicated SAST/secrets platform.",
    "Vault refs such as vault://certs/<id> are allowed because they are references, not secret values.",
  ],
};

writeFileSync(outputJson, `${JSON.stringify(result, null, 2)}\n`, "utf8");

const md = [
  "# CumpleFactura secret scan",
  "",
  `- Generated: ${result.generated_at}`,
  `- Status: ${result.status}`,
  `- Files scanned: ${result.files_scanned}`,
  `- Findings: ${result.finding_count}`,
  "",
  "## Findings",
  "",
  ...(findings.length === 0
    ? ["- none"]
    : findings.map((finding) => `- ${finding.rule}: \`${finding.path}\` (value redacted)`)),
  "",
  "## Limits",
  "",
  ...result.limits.map((limit) => `- ${limit}`),
  "",
];
writeFileSync(outputMd, md.join("\n"), "utf8");

if (findings.length > 0) {
  console.error("CumpleFactura secret scan FAILED");
  for (const finding of findings) {
    console.error(`- ${finding.rule}: ${finding.path}`);
  }
  process.exit(1);
}

console.log("CumpleFactura secret scan OK");
console.log(outputJson);
console.log(outputMd);
