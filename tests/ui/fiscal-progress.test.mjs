import test from "node:test";
import assert from "node:assert/strict";
import { fiscalProgress } from "../../src/features/verifactu/progress.ts";
const hash = "A".repeat(64);
const invoice = {
  id: "invoice-1",
  company_id: "company-1",
  customer_id: "customer-1",
  series: "A",
  number: 7,
  kind: "Complete",
  status: "Issued",
  total_cents: 12100,
  fiscal_hash: hash,
};
const record = {
  id: "record-1",
  invoice_id: invoice.id,
  record_type: "Alta",
  generated_at: "2026-10-26T10:00:00Z",
  fiscal_hash: hash,
  status: "issued",
};
const submission = {
  invoice_id: invoice.id,
  export_id: "export-1",
  xml_sha256: "B".repeat(64),
};
const reply = {
  source_export_id: "export-1",
  invoice_id: invoice.id,
  xml_sha256: "B".repeat(64),
  status: "submitted",
  external_call_performed: true,
  sidecar_call_performed: true,
  estado_registro: "Correcto",
  csv: "TEST-CSV",
  transmission_status: "submitted",
};
test("a draft confirms none of the four fiscal steps", () => {
  const p = fiscalProgress(
    { ...invoice, status: "Draft", number: null, fiscal_hash: null },
    [],
  );
  assert.equal(p.steps.length, 4);
  assert.deepEqual(
    p.steps.map((x) => x.confirmed),
    [false, false, false, false],
  );
});
test("an issued invoice with its actual alta confirms only the first two steps", () => {
  const p = fiscalProgress(invoice, [record]);
  assert.deepEqual(
    p.steps.map((x) => x.confirmed),
    [true, true, false, false],
  );
  assert.equal(p.csv, null);
});
test("foreign or mismatched records cannot confirm the alta", () => {
  for (const r of [
    { ...record, invoice_id: "other" },
    { ...record, fiscal_hash: "C".repeat(64) },
    { ...record, record_type: "Anulacion" },
  ])
    assert.equal(fiscalProgress(invoice, [r]).steps[1].confirmed, false);
});
test("preflight-like replies and foreign invoice replies never confirm sending or acceptance", () => {
  for (const r of [
    { ...reply, external_call_performed: false },
    { ...reply, invoice_id: "other" },
    { ...reply, sidecar_call_performed: false },
  ]) {
    const p = fiscalProgress(invoice, [record], r, submission);
    assert.deepEqual(
      p.steps.slice(2).map((x) => x.confirmed),
      [false, false],
    );
    assert.equal(p.csv, null);
  }
});
test("even an actual external call is not acceptance when no AEAT response exists", () => {
  const p = fiscalProgress(
    invoice,
    [record],
    { ...reply, csv: null, estado_registro: null },
    submission,
  );
  assert.equal(p.steps[3].confirmed, false);
  assert.equal(p.csv, null);
});
test("a confirmed matching response carries its CSV and text", () => {
  const p = fiscalProgress(invoice, [record], reply, submission);
  assert.deepEqual(
    p.steps.map((x) => x.confirmed),
    [true, true, true, true],
  );
  assert.equal(p.responseLabel, "Aceptada por la AEAT");
  assert.equal(p.csv, "TEST-CSV");
});
test("a rejection is shown with text and never labelled accepted", () => {
  const p = fiscalProgress(
    invoice,
    [record],
    { ...reply, estado_registro: "Incorrecto", csv: null },
    submission,
  );
  assert.equal(p.responseLabel, "Rechazada por la AEAT");
  assert.equal(p.steps[3].confirmed, true);
  assert.equal(p.csv, null);
});

test("a stale export or XML digest cannot promote fiscal steps", () => {
  for (const r of [
    { ...reply, source_export_id: "old-export" },
    { ...reply, xml_sha256: "D".repeat(64) },
  ])
    assert.deepEqual(
      fiscalProgress(invoice, [record], r, submission)
        .steps.slice(2)
        .map((x) => x.confirmed),
      [false, false],
    );
  assert.equal(
    fiscalProgress(invoice, [record], reply).steps[2].confirmed,
    false,
  );
});
test("a response cannot be reassigned to an annulled or rectified business state without record-specific evidence", () => {
  for (const status of ["Void", "Rectified"]) {
    const p = fiscalProgress(
      { ...invoice, status },
      [record],
      reply,
      submission,
    );
    assert.equal(p.steps[2].confirmed, false);
    assert.equal(p.steps[3].confirmed, false);
    assert.equal(p.csv, null);
  }
});
