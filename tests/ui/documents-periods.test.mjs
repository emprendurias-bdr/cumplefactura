// Reglas de interfaz de documentos (src/lib/documents.ts), periodos de recurrentes (src/lib/periods.ts)
// e importes del editor (src/lib/format.ts).
import test from "node:test";
import assert from "node:assert/strict";
import { docActions, groupInvoiceReason } from "../../src/lib/documents.ts";
import { decimal, editorTotals, invoiceToLines } from "../../src/lib/format.ts";
import { isValidDay, periodKey, periodLabel } from "../../src/lib/periods.ts";

const albaran = (over = {}) => ({ customer_id: "c1", status: "delivered", delivery_date: "2026-11-05", issue_date: "2026-11-05", invoice_id: null, ...over });

test("albaranes invoice together only for one customer, one month, delivered and not invoiced", () => {
  assert.equal(groupInvoiceReason([albaran(), albaran({ delivery_date: "2026-11-28" })]), null);
  assert.equal(groupInvoiceReason([]), "none");
  assert.equal(groupInvoiceReason([albaran(), albaran({ customer_id: "c2" })]), "mixedCustomers");
  assert.equal(groupInvoiceReason([albaran(), albaran({ delivery_date: "2026-12-01" })]), "mixedMonths");
  assert.equal(groupInvoiceReason([albaran({ status: "draft" })]), "notDelivered");
  assert.equal(groupInvoiceReason([albaran({ invoice_id: "inv" })]), "alreadyInvoiced");
});
test("document actions follow the spec transitions", () => {
  assert.deepEqual(docActions("quote", "draft"), ["send", "delete"]);
  assert.deepEqual(docActions("delivery_note", "draft"), ["deliver", "delete"]);
  assert.deepEqual(docActions("quote", "sent"), ["accept", "reject", "void"]);
  assert.ok(docActions("quote", "accepted").includes("convert"));
  assert.ok(docActions("proforma", "paid").includes("derive"));
  assert.deepEqual(docActions("quote", "expired"), []);
  assert.deepEqual(docActions("delivery_note", "invoiced"), []);
});
test("period keys and labels", () => {
  assert.equal(periodKey("2026-11-03", "monthly"), "2026-11");
  assert.equal(periodKey("2026-11-03", "quarterly"), "2026-T4");
  assert.equal(periodKey("2026-02-03", "quarterly"), "2026-T1");
  assert.equal(periodKey("2026-11-03", "yearly"), "2026");
  assert.equal(periodLabel("2026-11"), "noviembre de 2026");
  assert.equal(periodLabel("2026-T4"), "4.º trimestre de 2026");
  assert.equal(periodLabel("2026"), "2026");
  assert.equal(periodLabel("2026-13"), "—");
  assert.equal(periodLabel(null), "—");
  assert.ok(isValidDay(28) && !isValidDay(29) && !isValidDay(0) && !isValidDay(1.5));
});
test("Spanish decimal input and lines from Rust", () => {
  assert.equal(decimal("1.234,56"), 1234.56);
  assert.equal(decimal("12.5"), 12.5);
  assert.ok(Number.isNaN(decimal("")));
  const lines = invoiceToLines({ lines: [{ description: "Cuota", quantity: 2, unit_price_cents: 12550, discount_rate_basis_points: null, tax_rate_basis_points: 2100, withholding_rate_basis_points: 1500 }] });
  assert.equal(lines[0].unit_price_euros, "125,5");
  assert.equal(lines[0].tax_rate_percent, "21");
  assert.equal(editorTotals(lines).total_cents, 25100 + 5271 - 3765);
  assert.equal(invoiceToLines({}).length, 1);
});
