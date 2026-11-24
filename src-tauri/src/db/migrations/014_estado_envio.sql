-- S1: cada intento de envio guarda tambien el codigo HTTP, el SOAP Fault y todos
-- los errores de la AEAT (JSON: [{"codigo":..,"descripcion":..}]). Aditiva.
-- Numero 014 y no 013: la 013 la usa la rama cf/n1-numeracion (PR #11).
ALTER TABLE verifactu_submissions ADD COLUMN http_status INTEGER;
ALTER TABLE verifactu_submissions ADD COLUMN soap_fault TEXT;
ALTER TABLE verifactu_submissions ADD COLUMN errores_json TEXT NOT NULL DEFAULT '[]';

-- Respuesta de la AEAT a cada registro de anulacion. `fiscal_records` es inalterable
-- (append-only): el resultado va aparte y tambien es inalterable.
-- Sin fila: anulacion pendiente (la factura esta en 'VoidPending').
CREATE TABLE IF NOT EXISTS anulacion_outcomes (
  fiscal_record_id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('accepted', 'rejected')),
  submission_id TEXT NOT NULL,
  decided_at TEXT NOT NULL,
  FOREIGN KEY (fiscal_record_id) REFERENCES fiscal_records(id),
  FOREIGN KEY (invoice_id) REFERENCES invoices(id),
  FOREIGN KEY (submission_id) REFERENCES verifactu_submissions(id)
);

CREATE TRIGGER IF NOT EXISTS anulacion_outcomes_no_update
BEFORE UPDATE ON anulacion_outcomes
BEGIN
  SELECT RAISE(ABORT, 'anulacion_outcomes is append-only');
END;

CREATE TRIGGER IF NOT EXISTS anulacion_outcomes_no_delete
BEFORE DELETE ON anulacion_outcomes
BEGIN
  SELECT RAISE(ABORT, 'anulacion_outcomes is append-only');
END;
