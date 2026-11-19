// Rescatado de ux/cumplefactura-fase-2 (sin @bdr/ui): importes es-ES desde céntimos enteros.
import test from "node:test";
import assert from "node:assert/strict";
import { formatCents, formatPercent } from "../../src/lib/moneyFormat.ts";

test("formats native integer cents with the shared Spanish grouping and decimals", () => assert.equal(formatCents(123456), "1.234,56 €"));
test("does not round away a cent when formatting a large safe integer", () =>
  assert.equal(formatCents(9007199254740991), "90.071.992.547.409,91 €"));
test("marks unsafe or nonfinite amounts instead of displaying a rounded fiscal value", () => {
  for (const n of [Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, 1.5]) assert.equal(formatCents(n), "Importe no representable");
});
test("keeps real zero distinct from a missing value", () => {
  assert.equal(formatCents(-1210), "−12,10 €");
  assert.equal(formatCents(0), "0,00 €");
  assert.equal(formatCents(null), "Importe no disponible");
});
test("percent from basis points with Spanish decimals", () => {
  assert.equal(formatPercent(2100), "21 %");
  assert.equal(formatPercent(1050), "10,5 %");
  assert.equal(formatPercent(null), "—");
});
