// status.ts es el único mapa estado → tono, y cada texto existe en i18n/es.ts.
import test from "node:test";
import assert from "node:assert/strict";
import { blockerText, envLabel, errorText, es, t } from "../../src/i18n/es.ts";
import {
  activeStatus,
  chainStatus,
  documentStatus,
  expiryStatus,
  invoiceKind,
  invoiceStatus,
  preflightStatus,
  recordType,
  recurringStatus,
  submissionStatus,
} from "../../src/ui/status.ts";

test("invoice and submission states map to the design.md tones", () => {
  assert.deepEqual(invoiceStatus("Draft"), { tone: "warn", label: "estado.borrador" });
  assert.equal(invoiceStatus("Issued").tone, "ok");
  assert.equal(invoiceStatus("Void").tone, "neu");
  assert.equal(invoiceKind("Rectifying")?.tone, "warn");
  assert.equal(invoiceKind("Complete"), null);
  assert.equal(t(submissionStatus("transport_error").label), "Sin confirmar");
  assert.equal(submissionStatus("rejected").tone, "err");
  assert.equal(submissionStatus(null).label, "estado.noEnviada");
});
test("every state label exists in Spanish, and unknown states are neutral", () => {
  const all = [
    ...["Draft", "Issued", "Rectified", "Void", "x"].map(invoiceStatus),
    ...["accepted", "accepted_with_errors", "rejected", "transport_error", "x"].map(submissionStatus),
    ...["draft", "sent", "accepted", "rejected", "expired", "converted", "paid", "delivered", "invoiced", "void", "superseded"].map(documentStatus),
    recordType("Alta"), recordType("Anulacion"), chainStatus(true), chainStatus(false), chainStatus(null),
    preflightStatus("ready"), preflightStatus("blocked"), activeStatus(true), activeStatus(false, true), recurringStatus(false),
    expiryStatus(null), expiryStatus(-1), expiryStatus(10), expiryStatus(200),
  ];
  for (const status of all) assert.ok(status.label in es, status.label);
  assert.equal(documentStatus("nuevo-estado").tone, "neu");
});
test("certificate expiry: warn at 30 days or less, err when expired", () => {
  assert.equal(expiryStatus(30).tone, "warn");
  assert.equal(expiryStatus(31).tone, "ok");
  assert.equal(expiryStatus(-1).tone, "err");
});
test("backend error codes are translated, with their detail", () => {
  // S1: el detalle es la hora UTC; se enseña como hora local.
  const at = "2026-11-20T10:00:05Z";
  const local = new Date(at).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  assert.equal(errorText(`aeat_wait_time_pending:${at}`), `La AEAT pide esperar antes del siguiente envío. Podrás enviar a partir de las ${local}.`);
  assert.equal(invoiceStatus("VoidPending").tone, "warn");
  assert.equal(t(invoiceStatus("VoidPending").label), "Anulación pendiente");
  // S1b (decisión 12.1): estado visible de anulación rechazada, tono error.
  assert.equal(invoiceStatus("VoidRejected").tone, "err");
  assert.equal(t(invoiceStatus("VoidRejected").label), "Anulación rechazada");
  assert.equal(errorText("sin_registro_previo_not_proposed"), "Solo se reenvía sin registro previo cuando la AEAT dice que el alta no consta.");
  assert.equal(errorText(new Error("validation_error:day_of_period")), "Revisa el día del periodo (1 a 28).");
  assert.match(errorText("transition_not_allowed:draft→paid"), /draft→paid/);
  assert.match(errorText("restore_rollback_failed:disk full"), /No se pudo restaurar/);
  assert.match(blockerText("certificate_password_required"), /contraseña/);
  for (const code of ["not_draft", "empty_lines", "mixed_customers", "mixed_months", "already_invoiced", "not_delivered", "reason_required", "io_error:x", "not_found", "xml_already_accepted_by_aeat", "backup_not_sqlite", "backup_newer_than_app"])
    assert.doesNotMatch(errorText(code), /Detalle técnico/, code);
});
test("an unknown technical message is never shown alone", () => {
  assert.match(errorText("pagination limit must be between 1 and 500"), /^.+$/);
  assert.match(errorText("weird_internal_code"), /No hemos podido completar la acción\. Detalle técnico: weird_internal_code/);
});
test("SOAP endpoints have readable names", () => {
  assert.equal(envLabel("SistemaVerifactuPruebas"), "Pruebas AEAT");
  assert.equal(envLabel("Otro"), "Otro");
});
