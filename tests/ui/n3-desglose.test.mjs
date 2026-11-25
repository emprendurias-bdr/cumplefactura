// N3: calificación por línea, recargo de equivalencia y redondeo igual que Rust (`build_lines`).
import test from "node:test";
import assert from "node:assert/strict";
import { errorText } from "../../src/i18n/es.ts";
import { editorTotals, invoiceToLines, lineToInput, newInvoiceLine, roundDiv } from "../../src/lib/format.ts";

const line = (euros, extra = {}) => ({ ...newInvoiceLine(), unit_price_euros: euros, ...extra });

test("roundDiv rounds half a cent away from zero like Rust", () => {
  assert.equal(roundDiv(250, 100), 3);
  assert.equal(roundDiv(249, 100), 2);
  assert.equal(roundDiv(-250, 100), -3);
  assert.equal(roundDiv(-249, 100), -2);
});

test("normal S1 line keeps the old payload: no new fields", () => {
  const input = lineToInput(line("100"));
  assert.equal(input.tax_rate_basis_points, 2100);
  assert.equal("vat_treatment" in input, false);
  assert.equal("surcharge_rate_basis_points" in input, false);
});

test("non-S1 lines send 0 % and their treatment; surcharge only with S1", () => {
  const exempt = lineToInput(line("100", { vat_treatment: "E1", surcharge_rate_percent: "5,2" }));
  assert.equal(exempt.vat_treatment, "E1");
  assert.equal(exempt.tax_rate_basis_points, 0);
  assert.equal("surcharge_rate_basis_points" in exempt, false);
  const re = lineToInput(line("100", { surcharge_rate_percent: "5,2" }));
  assert.equal(re.surcharge_rate_basis_points, 520);
});

test("editor totals round tax on the aggregated base of each group", () => {
  // 3 × 0,50 € al 21 %: 0,315 € → 0,32 € (por línea serían 0,33 €).
  const totals = editorTotals([line("0,50"), line("0,50"), line("0,50")]);
  assert.equal(totals.taxable_base_cents, 150);
  assert.equal(totals.tax_cents, 32);
  assert.equal(totals.total_cents, 182);
});

test("surcharge adds to the total and exempt lines add no tax", () => {
  const totals = editorTotals([line("100", { surcharge_rate_percent: "5,2" }), line("50", { vat_treatment: "E5" })]);
  assert.equal(totals.taxable_base_cents, 15_000);
  assert.equal(totals.tax_cents, 2_100);
  assert.equal(totals.surcharge_cents, 520);
  assert.equal(totals.total_cents, 17_620);
});

test("lines from Rust keep treatment and surcharge in the form", () => {
  const [form] = invoiceToLines({
    lines: [{ description: "X", quantity: 1, unit_price_cents: 100, tax_rate_basis_points: 0, vat_treatment: "S2", surcharge_rate_basis_points: null }],
  });
  assert.equal(form.vat_treatment, "S2");
  const [re] = invoiceToLines({ lines: [{ description: "Y", quantity: 1, unit_price_cents: 100, tax_rate_basis_points: 1000, surcharge_rate_basis_points: 140 }] });
  assert.equal(re.surcharge_rate_percent, "1,4");
});

test("N3 error codes read as clear Spanish", () => {
  assert.match(errorText("vat_rate_unknown:1600"), /no existe/);
  assert.match(errorText("simplified_not_allowed_for:S2"), /simplificada.*\(S2\)/);
  assert.match(errorText("vat_rate_table_missing:2024-06-01"), /01\/01\/2025/);
  assert.match(errorText("line_amount_too_large"), /demasiado grande/);
});
