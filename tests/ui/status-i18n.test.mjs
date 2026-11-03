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
  assert.equal(errorText("aeat_wait_time_pending:60"), "La AEAT pide esperar 60 s antes del siguiente envío.");
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
