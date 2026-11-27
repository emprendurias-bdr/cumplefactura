-- N4: datos de emisor y destinatario congelados en la factura al emitir (RD 1619/2012 art. 6.1
-- c-e): editar la empresa o el cliente ya no cambia una factura emitida al volver a exportarla.
-- NULL en borradores (se leen en vivo). Las emitidas antes de N4 se rellenan aquí con los datos
-- actuales de empresa y cliente: es lo más fiel que queda, la base no guardaba los de entonces.
ALTER TABLE invoices ADD COLUMN issuer_legal_name TEXT;
ALTER TABLE invoices ADD COLUMN issuer_tax_id TEXT;
ALTER TABLE invoices ADD COLUMN issuer_address TEXT;
ALTER TABLE invoices ADD COLUMN issuer_postal_code TEXT;
ALTER TABLE invoices ADD COLUMN issuer_municipality TEXT;
ALTER TABLE invoices ADD COLUMN issuer_province TEXT;
ALTER TABLE invoices ADD COLUMN recipient_name TEXT;
ALTER TABLE invoices ADD COLUMN recipient_tax_id TEXT;
ALTER TABLE invoices ADD COLUMN recipient_address TEXT;
ALTER TABLE invoices ADD COLUMN recipient_postal_code TEXT;
ALTER TABLE invoices ADD COLUMN recipient_municipality TEXT;
ALTER TABLE invoices ADD COLUMN recipient_province TEXT;
ALTER TABLE invoices ADD COLUMN recipient_country_code TEXT;
ALTER TABLE invoices ADD COLUMN recipient_id_type TEXT;

-- Misma sentencia que `invoices::SNAPSHOT_PARTIES_SQL`, para todas las no borrador.
UPDATE invoices SET
  (issuer_legal_name, issuer_tax_id, issuer_address, issuer_postal_code, issuer_municipality, issuer_province) =
    (SELECT c.legal_name, c.tax_id, c.address, c.postal_code, c.municipality, c.province
     FROM companies c WHERE c.id = invoices.company_id),
  (recipient_name, recipient_tax_id, recipient_address, recipient_postal_code, recipient_municipality,
   recipient_province, recipient_country_code, recipient_id_type) =
    (SELECT cu.display_name, cu.tax_id, cu.address, cu.postal_code, cu.municipality, cu.province,
            cu.country_code, cu.id_type
     FROM customers cu WHERE cu.id = invoices.customer_id)
WHERE status <> 'Draft';
