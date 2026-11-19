// Los 5 pasos VERI*FACTU (src/lib/progress.ts): ningún paso se marca sin evidencia.
// Inspirado en tests/ui/fiscal-progress.test.mjs de fase-2 (que tenía 4 pasos).
import test from "node:test";
import assert from "node:assert/strict";
import { fiscalProgress } from "../../src/lib/progress.ts";

const hash = "A".repeat(64);
const invoice = { id: "inv-1", status: "Issued", number: 7, fiscal_hash: hash };
const record = { invoice_id: "inv-1", record_type: "Alta", fiscal_hash: hash };
const exported = { invoice_id: "inv-1" };
const states = (p) => p.steps.map((s) => s.state);
const sub = (status, csv = "CSV-1", submitted_at = "2026-11-03T10:00:00Z") => ({ invoice_id: "inv-1", status, csv, submitted_at });

test("there are exactly five steps and no «Firmando»", () => {
  assert.deepEqual(fiscalProgress(invoice, []).steps.map((s) => s.key), ["emitida", "registro", "xml", "enviada", "aceptada"]);
});
test("a draft confirms nothing; the first step is only the current one", () => {
  const p = fiscalProgress({ ...invoice, status: "Draft", number: null, fiscal_hash: null }, [record], [exported], [sub("accepted")]);
  assert.deepEqual(states(p), ["current", "future", "future", "future", "future"]);
  assert.equal(p.summary, "sinEmitir");
  assert.equal(p.csv, null);
});
test("an issued invoice with its alta confirms two steps", () => {
  assert.deepEqual(states(fiscalProgress(invoice, [record])), ["done", "done", "current", "future", "future"]);
});
test("foreign or mismatched records cannot confirm the alta", () => {
  for (const r of [{ ...record, invoice_id: "other" }, { ...record, fiscal_hash: "C".repeat(64) }, { ...record, record_type: "Anulacion" }])
    assert.equal(fiscalProgress(invoice, [r]).steps[1].state, "current");
});
test("XML step needs an export or a submission row of this invoice, and the alta", () => {
  assert.equal(fiscalProgress(invoice, [record], [exported]).summary, "xml");
  assert.equal(fiscalProgress(invoice, [record], [{ invoice_id: "other" }]).steps[2].state, "current");
  assert.equal(fiscalProgress(invoice, [], [exported]).steps[2].state, "future");
});
test("a transport error is not «enviada»: it stays pending and asks for a manual retry", () => {
  const p = fiscalProgress(invoice, [record], [exported], [sub("transport_error", null)]);
  assert.deepEqual(states(p), ["done", "done", "done", "current", "future"]);
  assert.equal(p.summary, "sinConfirmar");
});
test("AEAT answers colour the last step with ok, warn or err", () => {
  assert.deepEqual(states(fiscalProgress(invoice, [record], [], [sub("accepted")])), ["done", "done", "done", "done", "done"]);
  const withErrors = fiscalProgress(invoice, [record], [], [sub("accepted_with_errors")]);
  assert.equal(withErrors.steps[4].state, "warn");
  assert.equal(withErrors.csv, "CSV-1");
  const rejected = fiscalProgress(invoice, [record], [], [sub("rejected", null)]);
  assert.equal(rejected.steps[4].state, "error");
  assert.equal(rejected.csv, null);
});
test("an acceptance without CSV is not an acceptance", () => {
  const p = fiscalProgress(invoice, [record], [], [sub("accepted", "  ")]);
  assert.equal(p.steps[4].state, "current");
  assert.notEqual(p.summary, "aceptada");
});
test("an earlier acceptance wins over a later transport error; foreign rows never count", () => {
  const rows = [sub("transport_error", null, "2026-11-03T12:00:00Z"), sub("accepted", "CSV-OK", "2026-11-03T09:00:00Z")];
  assert.equal(fiscalProgress(invoice, [record], [], rows).summary, "aceptada");
  assert.equal(fiscalProgress(invoice, [record], [], [{ ...sub("accepted"), invoice_id: "other" }]).steps[3].state, "future");
});
