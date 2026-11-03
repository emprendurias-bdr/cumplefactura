-- Facturas recurrentes: plantillas y periodos ya generados (ESPEC_DOCUMENTOS_Y_RECURRENTES §3.5-3.6).
-- Solo preparan borradores: no tocan numeración, registros fiscales ni huellas. Tablas aditivas.
CREATE TABLE IF NOT EXISTS recurring_invoices (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  label TEXT NOT NULL,
  series_code TEXT NOT NULL,
  frequency TEXT NOT NULL CHECK (frequency IN ('monthly', 'quarterly', 'yearly')),
  -- 1-28 para que el día exista en todos los meses (sin recortes a fin de mes).
  day_of_period INTEGER NOT NULL CHECK (day_of_period BETWEEN 1 AND 28),
  start_date TEXT NOT NULL,
  end_date TEXT,
  next_run_date TEXT NOT NULL,
  template_json TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  -- Borrado lógico: la plantilla desaparece de la lista pero conserva sus periodos y borradores.
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Clave de idempotencia: un solo borrador por plantilla y periodo, aunque se genere dos veces.
-- invoice_id sin FK: si alguien borra el borrador, el periodo sigue contando como generado.
CREATE TABLE IF NOT EXISTS recurring_runs (
  recurring_id TEXT NOT NULL REFERENCES recurring_invoices(id),
  period_key TEXT NOT NULL,
  run_date TEXT NOT NULL,
  invoice_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (recurring_id, period_key)
);

CREATE INDEX IF NOT EXISTS recurring_runs_invoice_idx ON recurring_runs(invoice_id);
