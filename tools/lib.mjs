// Utilidades compartidas por las herramientas del gate regulatorio (tools/*.mjs).
//
// Antes cada script repetía su copia de estas funciones. Aquí solo hay utilidades
// sin estado: rutas del repo, hashes, lectura de JSON, la tabla de la matriz de
// evidencias, búsqueda de ejecutables y escritura de evidencia JSON + Markdown.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Raíz del repositorio. */
export const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
/** Carpeta donde el gate deja la evidencia `latest-*.json/md`. */
export const evidenceDir = resolve(root, "tests/regulatory/evidence");

/** SHA-256 hexadecimal de un texto o buffer. */
export function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

/** SHA-256 hexadecimal del contenido de un fichero. */
export function sha256File(path) {
  return sha256(readFileSync(path));
}

/** JSON del fichero, o `null` si no existe o no se puede leer. `onError` recibe el motivo. */
export function readJson(path, onError = () => {}) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    onError(error.message);
    return null;
  }
}

/** Existencia, tipo y tamaño de una ruta. */
export function pathInfo(path) {
  if (!path || !existsSync(path)) return { exists: false };
  const stat = statSync(path);
  return { exists: true, is_file: stat.isFile(), is_dir: stat.isDirectory(), bytes: stat.size };
}

/** Lista de errores con su función `fail`. */
export function errorCollector() {
  const errors = [];
  return { errors, fail: (message) => errors.push(message) };
}

/**
 * Filas `| Promise | Source | Evidence | Limit |` de la sección `## Matrix` de
 * REGULATORY_EVIDENCE_MATRIX.md.
 */
export function parseMatrixRows(markdown) {
  const rows = [];
  let insideMatrix = false;
  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "## Matrix") {
      insideMatrix = true;
      continue;
    }
    if (insideMatrix && line.startsWith("## ")) break;
    if (!insideMatrix || !line.startsWith("|") || /^\|\s*-+/.test(line)) continue;
    const cells = line
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim());
    if (cells.length === 4 && cells[0] !== "Promise") {
      rows.push({ promise: cells[0], source: cells[1], evidence: cells[2], limit: cells[3] });
    }
  }
  return rows;
}

/**
 * ¿Está disponible `command`? Busca en el PATH (`where.exe` en Windows, `which` en
 * el resto) y en `extraCandidates`. Devuelve `{ ok, paths }`.
 */
export function commandExists(command, extraCandidates = []) {
  const finder = process.platform === "win32" ? "where.exe" : "which";
  const result = spawnSync(finder, [command], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const found = result.status === 0 ? result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean) : [];
  const paths = [...new Set([...found, ...extraCandidates.filter((path) => path && existsSync(path))])];
  return { ok: paths.length > 0, paths };
}

/** Ubicaciones locales habituales de `tauri-driver` y `msedgedriver` en Windows. */
export function windowsDriverCandidates(command, edgeDriverPath = null) {
  const home = process.env.USERPROFILE ?? process.env.HOME ?? "";
  if (command === "tauri-driver.exe") return home ? [resolve(home, ".cargo/bin/tauri-driver.exe")] : [];
  if (command === "msedgedriver.exe") {
    return [
      resolve(root, "node_modules/.bin/msedgedriver.cmd"),
      resolve(root, "node_modules/msedgedriver/bin/msedgedriver.exe"),
      edgeDriverPath,
    ].filter(Boolean);
  }
  return [];
}

/**
 * Escribe `latest-<name>.json` y `latest-<name>.md` en la carpeta de evidencia.
 * Devuelve las dos rutas.
 */
export function writeEvidence(name, json, markdownLines) {
  mkdirSync(evidenceDir, { recursive: true });
  const jsonPath = resolve(evidenceDir, `latest-${name}.json`);
  const mdPath = resolve(evidenceDir, `latest-${name}.md`);
  writeFileSync(jsonPath, `${JSON.stringify(json, null, 2)}\n`, "utf8");
  writeFileSync(mdPath, `${markdownLines.join("\n")}\n`, "utf8");
  return { jsonPath, mdPath };
}
