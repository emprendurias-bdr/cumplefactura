-- Cobros y vencimientos, facturas recurrentes, presupuestos y registro de emails.
-- Ninguna de estas tablas altera registros fiscales: solo gestion operativa.

ALTER TABLE invoices ADD COLUMN due_date TEXT;
ALTER TABLE customers ADD COLUMN email TEXT;

CREATE TABLE IF NOT EXISTS invoice_payments (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  paid_at TEXT NOT NULL,
  method TEXT NOT NULL,
  reference TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice ON invoice_payments(invoice_id);

CREATE TABLE IF NOT EXISTS recurring_invoices (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  label TEXT NOT NULL,
  frequency TEXT NOT NULL CHECK (frequency IN ('monthly', 'quarterly', 'yearly')),
  next_run_date TEXT NOT NULL,
  end_date TEXT,
  draft_json TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  last_invoice_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS quotes (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  fiscal_year INTEGER NOT NULL,
  number INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'invoiced')),
  valid_until TEXT,
  notes TEXT NOT NULL DEFAULT '',
  draft_json TEXT NOT NULL,
  taxable_base_cents INTEGER NOT NULL,
  tax_cents INTEGER NOT NULL,
  withholding_cents INTEGER NOT NULL,
  total_cents INTEGER NOT NULL,
  invoice_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (company_id, fiscal_year, number)
);

CREATE TABLE IF NOT EXISTS email_log (
  id TEXT PRIMARY KEY,
  invoice_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('invoice', 'reminder', 'test')),
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
  error TEXT,
  sent_at TEXT NOT NULL
);
