// Rescatado de ux/cumplefactura-fase-2: fecha civil de Rust, nunca la zona horaria del equipo.
import test from "node:test";
import assert from "node:assert/strict";
import { invoiceDate, isoDate, timeOf } from "../../src/lib/invoiceDate.ts";

test("uses the native civil issue date without reinterpreting it in the host timezone", () => {
  assert.equal(invoiceDate("2026-10-26T23:30:00-03:00"), "26/10/2026");
  assert.equal(invoiceDate("2026-03-29T00:30:00Z"), "29/03/2026");
});
test("never invents a date for a draft or malformed native value", () => {
  for (const value of [null, undefined, "2026-02-30T10:00:00Z", "not-a-date"]) assert.equal(invoiceDate(value), "—");
});
test("ISO civil dates of documents and recurring templates", () => {
  assert.equal(isoDate("2026-11-03"), "03/11/2026");
  assert.equal(isoDate("2026-02-29"), "—");
  assert.equal(isoDate(null), "—");
  assert.equal(timeOf("2026-11-03T09:05:00Z"), "09:05");
});
