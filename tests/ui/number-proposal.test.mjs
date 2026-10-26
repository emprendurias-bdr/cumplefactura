import test from "node:test";
import assert from "node:assert/strict";
import { numberProposal } from "../../src/shared/numberProposal.ts";
const preview = {
  company_id: "company-test",
  fiscal_year: 2026,
  series: "A",
  next_number: 129,
  source: "invoice_sequences",
};
const scope = { companyId: "company-test", series: "A", fiscalYear: 2026 };
test("shows the native preview in the same format used by XML: series-number", () =>
  assert.equal(numberProposal(preview, scope), "A-129"));
test("does not reuse a preview from a previous company, series or fiscal year", () => {
  for (const s of [
    { ...scope, companyId: "other" },
    { ...scope, series: "R" },
    { ...scope, fiscalYear: 2027 },
  ])
    assert.equal(numberProposal(preview, s), null);
});
test("does not invent a sequence number before a safe native preview exists", () => {
  assert.equal(numberProposal(null, scope), null);
  for (const next_number of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])
    assert.equal(numberProposal({ ...preview, next_number }, scope), null);
});
