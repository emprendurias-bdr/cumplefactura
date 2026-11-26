// Datos de la declaración responsable en Ajustes › Acerca de (src/legal/declaracionParse.ts). L2b.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extractBody, field, otraVersion, sinPuntoFinal } from "../../src/legal/declaracionParse.ts";

test("final dot: removed after a version or a sentence, kept in initials", () => {
  assert.equal(sinPuntoFinal("1.0.0."), "1.0.0");
  assert.equal(sinPuntoFinal("VENDINGSAIZARAGON, S.L."), "VENDINGSAIZARAGON, S.L.");
  assert.equal(sinPuntoFinal("Un texto normal."), "Un texto normal");
});

test("a PENDIENTE value is a missing value (the view shows acerca.sinDato)", () => {
  const body = "h) **Productor:** PENDIENTE.\n\ni) **NIF del productor:** PENDIENTE (falta H2).\n\nc) **Versión:** 1.0.0.";
  assert.equal(field(body, "h"), null);
  assert.equal(field(body, "i"), null);
  assert.equal(field(body, "c"), "1.0.0");
  assert.equal(field(body, "z"), null);
});

test("the declaration document carries the manufacturer data from FABRICANTE.md", () => {
  const doc = readFileSync(new URL("../../docs/legal/DECLARACION_RESPONSABLE_SIF.md", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const body = extractBody(doc);
  assert.equal(field(body, "a"), "CumpleFactura");
  assert.equal(field(body, "b"), "CF");
  assert.equal(field(body, "h"), "VENDINGSAIZARAGON, S.L.");
  assert.equal(field(body, "i"), "B98945173");
  assert.equal(field(body, "j"), "Calle Naranjo 38, 46117 Bétera, Valencia, España");
});

test("version warning only when installed and declared versions differ", () => {
  assert.equal(otraVersion("0.1.0", "1.0.0"), true);
  assert.equal(otraVersion("1.0.0", "1.0.0"), false);
  assert.equal(otraVersion(null, "1.0.0"), false);
  assert.equal(otraVersion("0.1.0", null), false);
});
