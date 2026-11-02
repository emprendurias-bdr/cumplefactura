-- Respuestas de la AEAT a los envios VERI*FACTU hechos por el sidecar.
-- El CSV y los estados son la prueba legal del envio. Tabla aditiva: no toca datos existentes.
CREATE TABLE IF NOT EXISTS verifactu_submissions (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL,
  fiscal_export_id TEXT NOT NULL,
  endpoint_name TEXT NOT NULL,
  xml_sha256 TEXT NOT NULL,
  status TEXT NOT NULL,
  csv TEXT,
  estado_envio TEXT,
  estado_registro TEXT,
  codigo_error TEXT,
  descripcion_error TEXT,
  tiempo_espera_envio_seconds INTEGER,
  submitted_at TEXT NOT NULL,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id),
  FOREIGN KEY (fiscal_export_id) REFERENCES fiscal_exports(id)
);

-- Un mismo XML solo puede quedar aceptado una vez: evita registrar dos veces una factura.
CREATE UNIQUE INDEX IF NOT EXISTS verifactu_submissions_accepted_idx
  ON verifactu_submissions(xml_sha256)
  WHERE status IN ('accepted', 'accepted_with_errors');
