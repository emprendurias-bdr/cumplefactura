// Rescatado de ux/cumplefactura-fase-2: fecha civil de Rust, nunca la zona horaria del equipo.
import test from "node:test";
import assert from "node:assert/strict";
import { invoiceDate, isoDate, timeOf, todayIso } from "../../src/lib/invoiceDate.ts";

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
test("today is the civil date in Madrid, also between 00:00 and 02:00 local time", () => {
  assert.equal(todayIso(new Date("2026-11-19T23:31:00Z")), "2026-11-20"); // 00:31 en Madrid (UTC+1)
  assert.equal(todayIso(new Date("2026-07-19T22:30:00Z")), "2026-07-20"); // 00:30 en Madrid (UTC+2)
  assert.equal(todayIso(new Date("2026-11-19T22:59:00Z")), "2026-11-19");
});
