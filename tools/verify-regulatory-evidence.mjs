// Evidence matrix: regulatory evidence presence/shape for the gate.
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const matrixPath = resolve(root, "REGULATORY_EVIDENCE_MATRIX.md");

const matrix = readFileSync(matrixPath, "utf8");
const errors = [];

function fail(message) {
  errors.push(message);
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

function backtickTokens(value) {
  return [...value.matchAll(/`([^`]+)`/g)].map((match) => match[1].trim());
}

function looksLikeCheckablePath(token) {
  if (token.startsWith("/")) {
    return false;
  }
  if (/^[A-Za-z]:[\\/]/.test(token)) {
    return true;
  }
  if (token.startsWith(".") || token.includes("/") || token.includes("\\")) {
    return true;
  }
  return existsSync(resolve(root, token));
}

function pathExists(token) {
  if (/^[A-Za-z]:[\\/]/.test(token)) {
    return existsSync(token);
  }
  return existsSync(resolve(root, token));
}

function hasExecutableEvidence(value) {
  return /\b(cargo test|npm run|gate step|tests?|tools\/|services::|db::|domain::)\b/i.test(value);
}

const rows = parseMarkdownTable(matrix);

if (rows.length < 10) {
  fail(`Matrix has too few rows (${rows.length}); expected the active promise ledger.`);
}

let checkedPaths = 0;

rows.forEach((row, index) => {
  const rowNumber = index + 1;
  for (const [field, value] of Object.entries(row)) {
    if (!value || /^tbd$/i.test(value) || /\bpendiente\b/i.test(value)) {
      fail(`Row ${rowNumber} (${row.promise}) has weak ${field}: ${value || "<empty>"}`);
    }
  }

  if (!hasExecutableEvidence(row.evidence)) {
    fail(`Row ${rowNumber} (${row.promise}) lacks executable evidence reference.`);
  }

  if (row.limit.length < 12) {
    fail(`Row ${rowNumber} (${row.promise}) has an underspecified limit.`);
  }

  for (const token of [...backtickTokens(row.source), ...backtickTokens(row.evidence)]) {
    if (!looksLikeCheckablePath(token)) {
      continue;
    }
    checkedPaths += 1;
    if (!pathExists(token)) {
      fail(`Row ${rowNumber} (${row.promise}) references missing path: ${token}`);
    }
  }
});

const liveLimits = matrix.split("## Live Limits")[1] ?? "";
for (const requiredLimit of [
  "No AEAT network transmission",
  "sidecar",
  "not legal advice",
  "Desktop Tauri E2E default mode is preflight",
]) {
  if (!liveLimits.toLowerCase().includes(requiredLimit.toLowerCase())) {
    fail(`Live limits missing required disclosure: ${requiredLimit}`);
  }
}

if (errors.length > 0) {
  console.error("Regulatory evidence matrix FAILED");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("Regulatory evidence matrix OK");
console.log(`Rows: ${rows.length}`);
console.log(`Checked path references: ${checkedPaths}`);
