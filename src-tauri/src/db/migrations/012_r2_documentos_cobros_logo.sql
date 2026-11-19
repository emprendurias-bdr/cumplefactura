-- R2 (03-11): observaciones, recapitulativas, precio pendiente, cobros, vencimiento, series de
-- documentos comerciales y logo de empresa. Solo columnas y tablas nuevas (aditiva).
-- Nada de esto entra en la huella ni en el XML; `is_recapitulative` solo omite FechaOperacion.

-- D2: observaciones de la factura (salen en el PDF).
ALTER TABLE invoices ADD COLUMN notes TEXT NOT NULL DEFAULT '';
-- D5: factura de varios albaranes; se marca al convertir y pasa a la emitida.
ALTER TABLE invoices ADD COLUMN is_recapitulative INTEGER NOT NULL DEFAULT 0 CHECK (is_recapitulative IN (0, 1));
-- Motivo obligatorio de la anulación (design.md §7.7). No va en el XML ni en la huella.
ALTER TABLE invoices ADD COLUMN void_reason TEXT;
-- D6: vencimiento operativo (no fiscal).
ALTER TABLE invoices ADD COLUMN due_date TEXT;
-- D8: línea de albarán sin precio; bloquea la emisión mientras siga a 0 €.
ALTER TABLE invoice_lines ADD COLUMN price_pending INTEGER NOT NULL DEFAULT 0 CHECK (price_pending IN (0, 1));
-- D1: copia del logo en `<app data>/logos/<company_id>.<ext>`.
ALTER TABLE companies ADD COLUMN logo_path TEXT;
-- D7: relleno del número fijado al numerar; cambiar la configuración no reformatea lo ya numerado.
ALTER TABLE commercial_documents ADD COLUMN number_padding INTEGER;

-- D6: cobros de una factura o de una proforma (anticipo), nunca de las dos.
CREATE TABLE IF NOT EXISTS invoice_payments (
  id TEXT PRIMARY KEY,
  invoice_id TEXT REFERENCES invoices(id),
  commercial_document_id TEXT REFERENCES commercial_documents(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  paid_at TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('transferencia', 'tarjeta', 'efectivo', 'domiciliacion', 'bizum', 'otros')),
  reference TEXT,
  created_at TEXT NOT NULL,
  CHECK ((invoice_id IS NULL) <> (commercial_document_id IS NULL))
);
CREATE INDEX IF NOT EXISTS invoice_payments_invoice_idx ON invoice_payments(invoice_id);
CREATE INDEX IF NOT EXISTS invoice_payments_document_idx ON invoice_payments(commercial_document_id);

-- D7: código de serie por empresa y tipo de documento (por defecto P, PF, AL).
CREATE TABLE IF NOT EXISTS commercial_series_configs (
  company_id TEXT NOT NULL REFERENCES companies(id),
  kind TEXT NOT NULL CHECK (kind IN ('quote', 'proforma', 'delivery_note')),
  series_code TEXT NOT NULL,
  padding INTEGER NOT NULL DEFAULT 4 CHECK (padding BETWEEN 1 AND 10),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (company_id, kind)
);
