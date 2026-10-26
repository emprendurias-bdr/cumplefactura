import test from "node:test";
import assert from "node:assert/strict";
import { formatCents } from "../../src/shared/moneyFormat.ts";
test("formats native integer cents with the shared Spanish grouping and decimals", () =>
  assert.equal(formatCents(123456), "1.234,56\u00a0€"));
test("does not round away a cent when formatting a large safe integer", () =>
  assert.equal(formatCents(9007199254740991), "90.071.992.547.409,91\u00a0€"));
test("marks unsafe or nonfinite amounts instead of displaying a rounded fiscal value", () => {
  for (const n of [Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, 1.5])
    assert.equal(formatCents(n), "Importe no representable");
});
test("keeps real zero distinct from a missing value", () => {
  assert.equal(formatCents(-1210), "−12,10\u00a0€");
  assert.equal(formatCents(0), "0,00\u00a0€");
  assert.equal(formatCents(null), "Importe no disponible");
});
