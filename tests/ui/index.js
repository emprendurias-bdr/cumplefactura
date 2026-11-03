// `node --test tests/ui/` en Node 22 resuelve la carpeta como módulo (este index.js):
// carga todos los *.test.mjs de la carpeta. Node 23+ ya busca los tests solo.
import { readdirSync } from "node:fs";

for (const file of readdirSync(new URL(".", import.meta.url)).filter((name) => name.endsWith(".test.mjs")).sort()) {
  await import(new URL(file, import.meta.url).href);
}
