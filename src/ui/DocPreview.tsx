/**
 * DocPreview (design.md §7.9): panel gris cálido con la hoja SIEMPRE blanca, en cualquier modo.
 * Es un render HTML del documento (no un PDF) con la misma maqueta que el PDF de Rust (D1,
 * docs/ux/pdf/): logo arriba a la izquierda, QR arriba a la derecha en las emitidas, título y número,
 * emisor y cliente, vencimiento, tabla (Descripción · Cant. · Precio · Dto. · IVA · IRPF · Importe),
 * totales a la derecha y «Observaciones». La hoja lleva `data-apariencia="claro"`.
 * QR: `pending` = hueco «se genera al emitir» (borrador), `pdf` = «va en el PDF» (emitida),
 * `none` = documentos sin valor fiscal. `prices = false`: albarán sin precios (solo Descripción y Cant.).
 * Logo: el webview no puede leer la carpeta de datos (CSP sin protocolo de archivos), así que el
 * hueco enseña el nombre del archivo; la imagen de verdad sale en el PDF.
 */
import type { ReactNode } from "react";
import { t } from "../i18n/es";
import { formatCents, formatPercent } from "../lib/moneyFormat";

export type PreviewLine = {
  description: string;
  quantity: number;
  unit_price_cents: number | null;
  discount_rate_basis_points?: number | null;
  tax_rate_basis_points?: number | null;
  withholding_rate_basis_points?: number | null;
  amount_cents: number | null;
};
type Party = { name: string; tax_id?: string; address?: string };
type Place = { legal_name?: string; display_name?: string; tax_id: string; address: string; postal_code: string; municipality: string };

/** Empresa o cliente → bloque de la hoja (nombre, NIF, «Calle, CP Municipio»). */
export function partyOf(item: Place | null | undefined): Party | null {
  if (!item) return null;
  const place = [item.postal_code, item.municipality].filter(Boolean).join(" ");
  return { name: item.legal_name ?? item.display_name ?? "", tax_id: item.tax_id, address: [item.address, place].filter(Boolean).join(", ") };
}

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
  notes?: string;
  dueDate?: string | null;
  logo?: string | null;
  prices?: boolean;
};

const pct = (bp?: number | null) => (bp ? formatPercent(bp) : "");
const PRICE_HEADS = ["lineas.precio", "preview.dto", "totales.iva", "preview.irpf", "lineas.importe"] as const;

export function DocPreview({ caption, title, number, date, issuer, customer, lines, totals, total, legend, qr, note, notes, dueDate, logo, prices = true }: Props) {
  const logoName = logo ? logo.split(/[\\/]/).pop() : null;
  return (
    <aside className="bdr-preview cf-preview" aria-label={caption}>
      <div className="bdr-label">{caption}</div>
      <div className="bdr-sheet cf-sheet" data-apariencia="claro" data-color="suave">
        <header className="cf-sheet__head">
          <div className="cf-sheet__brand">
            {logoName ? <span className="cf-sheet__logo m" title={logoName}>{t("preview.logo")}<br />{logoName}</span> : null}
            <strong className="cf-sheet__issuer">{issuer?.name ?? t("preview.sinEmisor")}</strong>
          </div>
          {qr !== "none" ? (
            <div className="cf-sheet__qr">
              <span className="cf-sheet__qrbox m">QR</span>
              <span className="cf-sheet__muted cf-sheet__tiny">{qr === "pending" ? t("preview.qrAlEmitir") : t("preview.qrEnPdf")}</span>
            </div>
          ) : null}
        </header>
        <div>
          <div className="cf-sheet__title">{title}</div>
          <div className="cf-sheet__muted">
            {t("preview.numero", { n: number ?? t("preview.sinNumero") })} · {t("preview.fecha", { fecha: date })}
          </div>
          {legend ? <div className="cf-sheet__legend">{legend}</div> : null}
        </div>
        <div className="cf-sheet__parties">
          <PartyBlock label={t("preview.emisor")} party={issuer} empty={t("preview.sinEmisor")} />
          <PartyBlock label={t("preview.cliente")} party={customer} empty={t("preview.sinCliente")} />
        </div>
        {dueDate ? <div>{t("preview.vencimiento", { fecha: dueDate })}</div> : null}
        <table className="cf-sheet__lines">
          <thead>
            <tr>
              <th>{t("lineas.descripcion")}</th>
              <th className="cf-num">{t("lineas.cantidad")}</th>
              {prices ? PRICE_HEADS.map((key) => <th key={key} className="cf-num">{t(key)}</th>) : null}
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={`${line.description}-${index}`}>
                <td>{line.description}</td>
                <td className="m cf-num">{line.quantity}</td>
                {prices ? (
                  <>
                    <td className="m cf-num">{line.unit_price_cents == null ? "" : formatCents(line.unit_price_cents)}</td>
                    <td className="m cf-num">{pct(line.discount_rate_basis_points)}</td>
                    <td className="m cf-num">{pct(line.tax_rate_basis_points)}</td>
                    <td className="m cf-num">{pct(line.withholding_rate_basis_points)}</td>
                    <td className="m cf-num">{line.amount_cents == null ? "" : formatCents(line.amount_cents)}</td>
                  </>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
        {prices && total != null ? (
          <table className="cf-sheet__totals">
            <tbody>
              {totals.map((row) => (
                <tr key={row.label}>
                  <td>{row.label}</td>
                  <td className="m cf-num">{formatCents(row.cents)}</td>
                </tr>
              ))}
              <tr className="cf-sheet__total">
                <td>{t("totales.total")}</td>
                <td className="m cf-num">{formatCents(total)}</td>
              </tr>
            </tbody>
          </table>
        ) : null}
        {notes?.trim() ? (
          <div className="cf-sheet__notes">
            <strong>{t("preview.observaciones")}</strong>
            <div>{notes}</div>
          </div>
        ) : null}
        {note ? <div className="cf-sheet__muted cf-sheet__foot">{note}</div> : null}
      </div>
    </aside>
  );
}

function PartyBlock({ label, party, empty }: { label: string; party: Party | null; empty: string }) {
  return (
    <div>
      <div className="cf-sheet__label">{label}</div>
      <strong>{party?.name || empty}</strong>
      {party?.tax_id ? <div>NIF {party.tax_id}</div> : null}
      {party?.address ? <div>{party.address}</div> : null}
    </div>
  );
}
