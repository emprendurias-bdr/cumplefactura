// Rutas por hash (src/lib/routes.ts). El caso del salto al contenido viene de fase-2.
import test from "node:test";
import assert from "node:assert/strict";
import { HOME, href, isNew, parseRoute } from "../../src/lib/routes.ts";

test("in-page skip link preserves the selected application route", () => {
  const clientes = parseRoute("#/clientes");
  assert.deepEqual(parseRoute("#contenido", clientes), clientes);
  assert.deepEqual(parseRoute(""), HOME);
  assert.equal(parseRoute("#/nada").section, "facturas");
});
test("invoice routes: list, new, detail and rectification", () => {
  assert.deepEqual(parseRoute("#/facturas/nueva"), { section: "facturas", tab: null, id: "nueva", action: null });
  assert.deepEqual(parseRoute("#/facturas/inv-1/rectificar"), { section: "facturas", tab: null, id: "inv-1", action: "rectificar" });
  assert.ok(isNew("nueva") && isNew("nuevo") && !isNew("inv-1") && !isNew(null));
});
test("documents and settings carry a tab with a default", () => {
  assert.deepEqual(parseRoute("#/documentos"), { section: "documentos", tab: "presupuestos", id: null, action: null });
  assert.deepEqual(parseRoute("#/documentos/albaranes/doc-9"), { section: "documentos", tab: "albaranes", id: "doc-9", action: null });
  assert.equal(parseRoute("#/ajustes/copias").tab, "copias");
  assert.equal(parseRoute("#/ajustes/inventado").tab, "empresa");
});
test("legacy routes redirect to the new sections", () => {
  assert.equal(parseRoute("#/presupuestos").tab, "presupuestos");
  assert.equal(parseRoute("#/fiscal").section, "verifactu");
  assert.equal(parseRoute("#/empresas").tab, "empresa");
  assert.equal(parseRoute("#/panel").section, "facturas");
});
test("href round-trips", () => {
  for (const hash of ["#/facturas", "#/facturas/a%2Fb", "#/documentos/proformas/nuevo", "#/ajustes/certificado", "#/recurrentes/r-1"]) {
    assert.equal(href(parseRoute(hash)), hash);
  }
});
