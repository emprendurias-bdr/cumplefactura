/** DataList y Pager: listas simples con paginación. */
import type { ReactNode } from "react";

/** Lista simple reutilizable (título + filas + pager opcional). */
export function DataList({ title, empty, rows, footer }: { title: string; empty: string; rows: string[]; footer?: ReactNode }) {
  return (
    <div className="dataList">
      <h2>{title}</h2>
      {rows.length === 0 ? <p>{empty}</p> : <ul>{rows.map((row) => <li key={row}>{row}</li>)}</ul>}
      {footer}
    </div>
  );
}

/** Controles prev/next alineados con ListPagination (hasNext ≈ página llena). */
export function Pager({
  regionLabel,
  prevLabel,
  nextLabel,
  page,
  hasNext,
  onPrev,
  onNext,
}: {
  regionLabel: string;
  prevLabel: string;
  nextLabel: string;
  page: number;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="pager" aria-label={regionLabel}>
      <button type="button" onClick={onPrev} disabled={page === 0}>{prevLabel}</button>
      <span>Pagina {page + 1}</span>
      <button type="button" onClick={onNext} disabled={!hasNext}>{nextLabel}</button>
    </div>
  );
}
