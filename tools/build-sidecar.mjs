// Compila cumplefactura-sidecar y lo deja en src-tauri/binaries/ con el sufijo de
// plataforma que exige Tauri para `bundle.externalBin` (cumplefactura-sidecar-<triple>[.exe]).
//
// Solo hace falta para generar el instalador (`npm run tauri:bundle`). Para compilar,
// testear o `tauri dev`, cargo ya deja el sidecar junto al ejecutable en target/.
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { root } from "./lib.mjs";

const debug = process.argv.includes("--debug");
const run = (command, args) => {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed`);
  return result.stdout;
};

const triple = run("rustc", ["-vV"]).match(/^host: (.+)$/m)?.[1];
if (!triple) throw new Error("cannot read host target triple from rustc -vV");
run("cargo", ["build", "-p", "cumplefactura-sidecar", ...(debug ? [] : ["--release"])]);

const exe = process.platform === "win32" ? ".exe" : "";
const source = resolve(root, "target", debug ? "debug" : "release", `cumplefactura-sidecar${exe}`);
const targetDir = resolve(root, "src-tauri", "binaries");
const target = resolve(targetDir, `cumplefactura-sidecar-${triple}${exe}`);
mkdirSync(targetDir, { recursive: true });
copyFileSync(source, target);
console.log(`Sidecar listo para empaquetar: ${target}`);
