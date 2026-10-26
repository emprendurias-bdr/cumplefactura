import type { ReactNode } from 'react';
import { short } from './forms';
import type { FiscalChainVerification } from './types';

export function DataList({ title, empty, rows, footer }: { title: string; empty: string; rows: string[]; footer?: ReactNode }) {
  return (
    <div className="dataList">
      <h2>{title}</h2>
      {rows.length === 0 ? <p>{empty}</p> : <ul>{rows.map((row) => <li key={row}>{row}</li>)}</ul>}
      {footer}
    </div>
  );
}
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
export function chainRows(result: FiscalChainVerification) {
  if (result.valid) return [`OK - ${result.total_records} registros fiscales`];
  return result.issues.map((issue) => `${issue.severity} - ${issue.code} - ${short(issue.record_id)} - ${issue.message}`);
}
