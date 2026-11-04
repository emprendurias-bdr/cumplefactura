// R2 (D3, D6, D8): origen recurrente, chip de cobro y bloqueo de líneas pendientes de precio,
// más los códigos de error nuevos del contrato R2 (docs/CONTRATOS_NUEVOS_2026-11-03.md).
import test from "node:test";
import assert from "node:assert/strict";
import { errorText, es } from "../../src/i18n/es.ts";
import { invoiceToLines, lineToInput, pendingPriceLines } from "../../src/lib/format.ts";
import { recurringOrigin } from "../../src/lib/periods.ts";
import { paymentStatus } from "../../src/ui/status.ts";

test("recurring origin label names template and period", () => {
  assert.equal(recurringOrigin("Cuota web", "2026-11"), "Recurrente · Cuota web · noviembre de 2026");
  assert.equal(recurringOrigin("Alquiler", "2026-T4"), "Recurrente · Alquiler · 4.º trimestre de 2026");
  assert.equal(recurringOrigin("Anual", "2026"), "Recurrente · Anual · 2026");
  assert.equal(recurringOrigin("Sin periodo", null), "Recurrente · Sin periodo");
  assert.equal(recurringOrigin(null, "2026-11"), null);
});

test("payment status maps to tones and hides drafts, void and negative rectifying invoices", () => {
  const issued = (payment_status, total_cents = 1000, status = "Issued") => paymentStatus({ status, total_cents, payment_status });
  assert.deepEqual(issued("unpaid"), { tone: "neu", label: "estado.pendiente" });
  assert.equal(issued("partial").tone, "info");
  assert.equal(issued("paid").tone, "ok");
  assert.equal(issued("overdue").tone, "err");
  assert.equal(issued("paid", 1000, "Rectified").tone, "ok");
  for (const s of ["unpaid", "partial", "paid", "overdue"]) assert.ok(issued(s).label in es, s);
  assert.equal(issued("paid", -36300), null);
  assert.equal(issued("unpaid", 1000, "Draft"), null);
  assert.equal(issued("unpaid", 1000, "Void"), null);
  assert.equal(issued(null), null);
});

test("price-pending lines block emission only while they stay at 0 €", () => {
  const lines = invoiceToLines({
    lines: [
      { description: "Albarán AL-2026-0001 · 05/11/2026", quantity: 1, unit_price_cents: 0, tax_rate_basis_points: 0 },
      { description: "Palés", quantity: 10, unit_price_cents: 0, tax_rate_basis_points: 2100, price_pending: true },
      { description: "Cajas", quantity: 2, unit_price_cents: 0, tax_rate_basis_points: 2100, price_pending: true },
    ],
  });
  assert.equal(pendingPriceLines(lines), 2);
  assert.equal(lineToInput(lines[1]).price_pending, true);
  assert.equal("price_pending" in lineToInput(lines[0]), false);
  lines[1].unit_price_euros = "35,50";
  assert.equal(pendingPriceLines(lines), 1);
  lines[2].unit_price_euros = "abc";
  assert.equal(pendingPriceLines(lines), 1);
});

test("R2 error codes are translated", () => {
  assert.equal(errorText("price_pending_lines:2"), "Hay 2 líneas del albarán sin precio. Pon el precio antes de emitir.");
  assert.match(errorText("payment_exceeds_total:12550"), /125,50/);
  assert.match(errorText("logo_format_not_supported:JPEG dañado. Usa un JPEG o un PNG sin transparencia (RGB o gris, 8 bits)"), /^La imagen no sirve como logo: JPEG dañado/);
  assert.match(errorText("company not found: co-9"), /No encontramos la empresa/);
  for (const code of [
    "payments_exceed_total", "invoice_not_issued", "payment_not_allowed", "payment_required", "logo_too_large:1MB",
    "logo_read_error:x", "logo_write_error:x", "validation_error:target", "validation_error:amount_cents",
    "validation_error:method", "validation_error:paid_at", "validation_error:due_date", "validation_error:padding",
    "validation_error:series_code", "validation_error:kind", "validation_error:company_id",
  ])
    assert.doesNotMatch(errorText(code), /Detalle técnico|_/, code);
});
