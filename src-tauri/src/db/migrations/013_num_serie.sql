-- N1: NumSerieFactura guardado al emitir (vista previa, XML, huella, QR y PDF leen el mismo texto).
-- En una transacción: si algo falla, la base no queda a medias.
BEGIN;

ALTER TABLE invoices ADD COLUMN num_serie TEXT;

-- Las facturas ya emitidas conservan el número con el que se calculó su huella: `{serie}-{n}`.
UPDATE invoices
SET num_serie = series || '-' || number
WHERE number IS NOT NULL AND num_serie IS NULL;

-- Un solo contador: `invoice_sequences`. Se conserva el valor de la configuración si no había fila.
INSERT OR IGNORE INTO invoice_sequences (company_id, fiscal_year, series, next_number)
SELECT company_id,
       fiscal_year,
       CASE WHEN include_year = 1 THEN series_code || fiscal_year ELSE series_code END,
       next_number
FROM invoice_series_configs;

ALTER TABLE invoice_series_configs DROP COLUMN next_number;

COMMIT;
