-- N3: calificación de la operación por línea (listas L9/L10) y recargo de equivalencia.
-- Las líneas existentes quedan en S1 sin recargo: sus importes y su XML no cambian.
ALTER TABLE invoice_lines ADD COLUMN vat_treatment TEXT NOT NULL DEFAULT 'S1';
ALTER TABLE invoice_lines ADD COLUMN surcharge_rate_basis_points INTEGER NOT NULL DEFAULT 0;
ALTER TABLE invoice_lines ADD COLUMN surcharge_cents INTEGER NOT NULL DEFAULT 0;
