/**
 * DocPreview (design.md §7.9): panel gris cálido con la hoja SIEMPRE blanca, en cualquier modo.
 * Es un render HTML del documento (no un PDF). La hoja lleva `data-apariencia="claro"` para que
 * los tokens de su interior sean los de claro aunque la app esté en oscuro.
 * QR: `pending` = hueco «se genera al emitir» (borrador), `pdf` = «va en el PDF» (emitida),
 * `none` = documentos sin valor fiscal (sin QR ni huella, ESPEC §2.4).
 */
import type { ReactNode } from "react";
import { t } from "../i18n/es";
import { formatCents } from "../lib/moneyFormat";

export type PreviewLine = { description: string; quantity: number; amount_cents: number | null };
type Party = { name: string; tax_id?: string; extra?: string };

type Props = {
  caption: string;
  title: string;
  number: string | null;
  date: string;
  issuer: Party | null;
  customer: Party | null;
  lines: PreviewLine[];
  totals: { label: string; cents: number }[];
  total: number | null;
  legend?: ReactNode;
  qr: "pending" | "pdf" | "none";
  note?: ReactNode;
};

export function DocPreview({ caption, title, number, date, issuer, customer, lines, totals, total, legend, qr, note }: Props) {
  return (
    <aside className="bdr-preview cf-preview" aria-label={caption}>
      <div className="bdr-label">{caption}</div>
      <div className="bdr-sheet cf-sheet" data-apariencia="claro" data-color="suave">
        <header className="cf-sheet__head">
          <div>
            <strong className="cf-sheet__issuer">{issuer?.name ?? t("preview.sinEmisor")}</strong>
            <div className="m cf-sheet__muted">
              {issuer?.tax_id ? `NIF ${issuer.tax_id} · ` : ""}
              {date} · {number ?? t("preview.sinNumero")}
            </div>
          </div>
          <span className="bdr-label cf-sheet__title">{title}</span>
        </header>
        {legend ? <div className="cf-sheet__legend">{legend}</div> : null}
        <div>
          <strong>{customer?.name ?? t("preview.sinCliente")}</strong>
          {customer?.tax_id ? <div className="m cf-sheet__muted">NIF {customer.tax_id}</div> : null}
        </div>
        <table className="cf-sheet__lines">
          <tbody>
            {lines.map((line, index) => (
              <tr key={`${line.description}-${index}`}>
                <td>
                  {line.description} <span className="m">×{line.quantity}</span>
                </td>
                <td className="m cf-num">{line.amount_cents == null ? "" : formatCents(line.amount_cents)}</td>
              </tr>
            ))}
            {totals.map((row) => (
              <tr key={row.label} className="cf-sheet__sub">
                <td>{row.label}</td>
                <td className="m cf-num">{formatCents(row.cents)}</td>
              </tr>
            ))}
            {total != null ? (
              <tr className="cf-sheet__total">
                <td>{t("totales.total")}</td>
                <td className="m cf-num">{formatCents(total)}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
        {note ? <div className="cf-sheet__muted">{note}</div> : null}
        {qr !== "none" ? (
          <div className="cf-sheet__qr">
            <span className="cf-sheet__qrbox m">QR</span>
            <span className="m cf-sheet__muted">
              VERI*FACTU
              <br />
              {qr === "pending" ? t("preview.qrAlEmitir") : t("preview.qrEnPdf")}
            </span>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
