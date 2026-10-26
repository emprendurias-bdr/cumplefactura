import test from "node:test";
import assert from "node:assert/strict";
import { invoiceDate } from "../../src/shared/invoiceDate.ts";
test("uses the native civil issue date without reinterpreting it in the host timezone", () => {
  assert.equal(invoiceDate("2026-10-26T23:30:00-03:00"), "26/10/2026");
  assert.equal(invoiceDate("2026-03-29T00:30:00Z"), "29/03/2026");
});
test("never invents a date for a draft or malformed native value", () => {
  for (const value of [null, undefined, "2026-02-30T10:00:00Z", "not-a-date"])
    assert.equal(invoiceDate(value), "—");
});
