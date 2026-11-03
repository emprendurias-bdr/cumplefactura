-- Documentos comerciales sin valor fiscal: presupuestos, proformas y albaranes.
-- Numeración propia (commercial_sequences), separada de invoice_sequences.

CREATE TABLE IF NOT EXISTS commercial_documents (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('quote', 'proforma', 'delivery_note')),
  series_code TEXT NOT NULL,
  fiscal_year INTEGER NOT NULL,
  number INTEGER,
  status TEXT NOT NULL CHECK (status IN (
    'draft', 'sent', 'accepted', 'rejected', 'expired', 'converted',
    'void', 'superseded', 'paid', 'delivered', 'invoiced'
  )),
  issue_date TEXT NOT NULL,
  valid_until TEXT,
  delivery_date TEXT,
  show_prices INTEGER NOT NULL DEFAULT 1 CHECK (show_prices IN (0, 1)),
  notes TEXT NOT NULL DEFAULT '',
  taxable_base_cents INTEGER NOT NULL DEFAULT 0,
  tax_cents INTEGER NOT NULL DEFAULT 0,
  withholding_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  source_document_id TEXT,
  -- Borrar el borrador de factura libera el enlace: el albarán vuelve a estar disponible.
  invoice_id TEXT,
  void_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (company_id, kind, series_code, fiscal_year, number),
  CHECK (status <> 'void' OR trim(COALESCE(void_reason, '')) <> ''),
  FOREIGN KEY (company_id) REFERENCES companies(id),
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (source_document_id) REFERENCES commercial_documents(id),
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS commercial_documents_list_idx
ON commercial_documents(company_id, kind, status, issue_date);

CREATE INDEX IF NOT EXISTS commercial_documents_invoice_idx
ON commercial_documents(invoice_id);

CREATE TABLE IF NOT EXISTS commercial_document_lines (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price_cents INTEGER NOT NULL,
  discount_rate_basis_points INTEGER,
  tax_rate_basis_points INTEGER NOT NULL,
  withholding_rate_basis_points INTEGER,
  product_id TEXT,
  UNIQUE (document_id, position),
  FOREIGN KEY (document_id) REFERENCES commercial_documents(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS commercial_sequences (
  company_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  series_code TEXT NOT NULL,
  fiscal_year INTEGER NOT NULL,
  next_number INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (company_id, kind, series_code, fiscal_year),
  FOREIGN KEY (company_id) REFERENCES companies(id)
);
