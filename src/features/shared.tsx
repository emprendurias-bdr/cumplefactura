import { Plus, Trash2 } from "lucide-react";

/** Ejecuta un comando mostrando el estado en la barra; el error ya queda visible y no se relanza. */
export type Runner = <T>(label: string, action: () => Promise<T>) => Promise<T>;

export async function attempt<T>(run: Runner, label: string, action: () => Promise<T>): Promise<T | undefined> {
  try {
    return await run(label, action);
  } catch {
    return undefined;
  }
}

export type CustomerOption = { id: string; display_name: string; tax_id: string; email?: string | null };
export type SeriesOption = { id: string; label: string; resolved_series: string; preview: string };

export type DraftLine = {
  description: string;
  quantity: number;
  unit_price_cents: number;
  discount_rate_basis_points: number | null;
  tax_rate_basis_points: number;
  withholding_rate_basis_points: number | null;
};

export type DraftInput = {
  company_id: string;
  customer_id: string;
  fiscal_year: number;
  series: string;
  number: null;
  kind: "Complete";
  territory_flags: string[];
  lines: DraftLine[];
  rectifies_invoice_id: null;
  rectification_reason_code: null;
  rectification_method: null;
};

export type LineForm = { description: string; quantity: string; price: string; tax: string; withholding: string };

export function emptyLine(): LineForm {
  return { description: "", quantity: "1", price: "", tax: "21", withholding: "" };
}

function toNumber(value: string): number {
  return Number(value.replace(",", ".").trim());
}

export function lineFormsToDraft(lines: LineForm[]): DraftLine[] | null {
  const out: DraftLine[] = [];
  for (const line of lines) {
    const quantity = toNumber(line.quantity);
    const price = toNumber(line.price);
    const tax = toNumber(line.tax);
    const withholding = line.withholding.trim() ? toNumber(line.withholding) : 0;
    if (!line.description.trim() || !Number.isInteger(quantity) || quantity <= 0 || !Number.isFinite(price) || price < 0 || !Number.isFinite(tax)) {
      return null;
    }
    out.push({
      description: line.description.trim(),
      quantity,
      unit_price_cents: Math.round(price * 100),
      discount_rate_basis_points: null,
      tax_rate_basis_points: Math.round(tax * 100),
      withholding_rate_basis_points: withholding ? Math.round(withholding * 100) : null,
    });
  }
  return out.length > 0 ? out : null;
}

export function draftToLineForms(lines: DraftLine[]): LineForm[] {
  return lines.map((line) => ({
    description: line.description,
    quantity: String(line.quantity),
    price: String(line.unit_price_cents / 100),
    tax: String(line.tax_rate_basis_points / 100),
    withholding: line.withholding_rate_basis_points ? String(line.withholding_rate_basis_points / 100) : "",
  }));
}

export function euros(cents: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);
}

export function shortDate(value?: string | null) {
  if (!value) return "-";
  const iso = value.slice(0, 10);
  const [y, m, d] = iso.split("-");
  return d && m && y ? `${d}/${m}/${y}` : value;
}

export function todayIso() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

/** Editor compacto de lineas (descripcion, cantidad, precio, IVA, IRPF). */
export function LinesEditor({ lines, onChange, idPrefix }: { lines: LineForm[]; onChange: (lines: LineForm[]) => void; idPrefix: string }) {
  function update(index: number, field: keyof LineForm, value: string) {
    onChange(lines.map((line, i) => (i === index ? { ...line, [field]: value } : line)));
  }
  return (
    <div className="lineTable compactLines" aria-label={`Lineas ${idPrefix}`}>
      <div className="lineHeader">
        <span>Descripcion</span>
        <span>Cant.</span>
        <span>Precio EUR</span>
        <span>IVA %</span>
        <span>IRPF %</span>
        <span />
      </div>
      {lines.map((line, index) => (
        <div className="lineRow" key={index}>
          <input aria-label={`${idPrefix} descripcion linea ${index + 1}`} value={line.description} onChange={(e) => update(index, "description", e.target.value)} />
          <input aria-label={`${idPrefix} cantidad linea ${index + 1}`} inputMode="numeric" value={line.quantity} onChange={(e) => update(index, "quantity", e.target.value)} />
          <input aria-label={`${idPrefix} precio linea ${index + 1}`} inputMode="decimal" value={line.price} onChange={(e) => update(index, "price", e.target.value)} />
          <input aria-label={`${idPrefix} IVA linea ${index + 1}`} inputMode="decimal" value={line.tax} onChange={(e) => update(index, "tax", e.target.value)} />
          <input aria-label={`${idPrefix} IRPF linea ${index + 1}`} inputMode="decimal" value={line.withholding} onChange={(e) => update(index, "withholding", e.target.value)} />
          <button
            type="button"
            className="iconButton"
            aria-label={`Quitar ${idPrefix} linea ${index + 1}`}
            onClick={() => onChange(lines.filter((_, i) => i !== index))}
            disabled={lines.length === 1}
          >
            <Trash2 size={16} aria-hidden="true" />
          </button>
        </div>
      ))}
      <div className="lineFooter">
        <button type="button" className="linkButton" onClick={() => onChange([...lines, emptyLine()])}>
          <Plus size={16} aria-hidden="true" />
          Añadir linea
        </button>
      </div>
    </div>
  );
}

export function StatusBadge({ tone, children }: { tone: "ok" | "warn" | "danger" | "muted" | "accent"; children: string }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
