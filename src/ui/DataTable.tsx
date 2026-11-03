/**
 * DataTable (design.md §7.4) en HTML + CSS, sin librería (ADR-003).
 * Lógica: columnas declarativas (`cell` pinta, `num` alinea a la derecha en mono); clic o Enter en
 * la fila → `onOpen`; menú «⋯» por fila con <details> nativo; `selection` añade casillas y la barra
 * flotante «N seleccionados» con las acciones que pase la pantalla (albaranes → Facturar juntos).
 * Estado: ninguno propio salvo el <details> abierto; la selección la guarda la pantalla.
 * Estructura: barra de selección · <table class="bdr-table"> (cabecera --surface-2, filas --row-h) · pie.
 */
import type { MouseEvent, ReactNode } from "react";
import { Icon } from "../components/Icon";
import { t } from "../i18n/es";

export type Column<T> = { key: string; header: ReactNode; cell: (row: T) => ReactNode; num?: boolean; className?: string };
export type RowAction = { label: string; onSelect: () => void; danger?: boolean; disabled?: boolean };

type Props<T> = {
  label: string;
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  onOpen?: (row: T) => void;
  rowActions?: (row: T) => RowAction[];
  rowError?: (row: T) => boolean;
  selection?: { selected: string[]; onChange: (ids: string[]) => void; actions: ReactNode };
  footer?: ReactNode;
};

const stop = (event: MouseEvent) => event.stopPropagation();

export function DataTable<T>({ label, rows, columns, rowKey, onOpen, rowActions, rowError, selection, footer }: Props<T>) {
  const selected = new Set(selection?.selected ?? []);
  const toggle = (id: string, on: boolean) =>
    selection?.onChange(on ? [...selected, id] : [...selected].filter((item) => item !== id));
  const allIds = rows.map(rowKey);
  const span = columns.length + (selection ? 1 : 0) + (rowActions ? 1 : 0);

  return (
    <div className="cf-table">
      {selection && selected.size > 0 ? (
        <div className="cf-selectbar" role="region" aria-label={t("tabla.seleccion")}>
          <strong>{t("tabla.seleccionados", { n: selected.size })}</strong>
          {selection.actions}
          <button type="button" className="bdr-btn bdr-btn--ghost bdr-btn--sm" onClick={() => selection.onChange([])}>
            {t("tabla.quitarSeleccion")}
          </button>
        </div>
      ) : null}
      <div className="bdr-table-wrap">
        <table className="bdr-table" aria-label={label}>
          <thead>
            <tr>
              {selection ? (
                <th className="cf-col-check">
                  <input
                    type="checkbox"
                    aria-label={t("tabla.seleccionarTodo")}
                    checked={rows.length > 0 && allIds.every((id) => selected.has(id))}
                    onChange={(event) => selection.onChange(event.target.checked ? allIds : [])}
                  />
                </th>
              ) : null}
              {columns.map((column) => (
                <th key={column.key} className={column.num ? "num" : undefined} scope="col">
                  {column.header}
                </th>
              ))}
              {rowActions ? <th className="cf-col-menu" aria-label={t("tabla.acciones")} /> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const id = rowKey(row);
              return (
                <tr
                  key={id}
                  className={rowError?.(row) ? "is-err" : undefined}
                  tabIndex={onOpen ? 0 : undefined}
                  onClick={onOpen ? () => onOpen(row) : undefined}
                  onKeyDown={onOpen ? (event) => event.key === "Enter" && event.target === event.currentTarget && onOpen(row) : undefined}
                  aria-selected={selection ? selected.has(id) : undefined}
                >
                  {selection ? (
                    <td className="cf-col-check" onClick={stop}>
                      <input
                        type="checkbox"
                        aria-label={t("tabla.seleccionarFila")}
                        checked={selected.has(id)}
                        onChange={(event) => toggle(id, event.target.checked)}
                      />
                    </td>
                  ) : null}
                  {columns.map((column) => (
                    <td key={column.key} className={[column.num ? "num" : "", column.className ?? ""].join(" ").trim() || undefined}>
                      {column.cell(row)}
                    </td>
                  ))}
                  {rowActions ? (
                    <td className="cf-col-menu" onClick={stop}>
                      <RowMenu actions={rowActions(row)} />
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
          {footer ? (
            <tfoot>
              <tr>
                <td colSpan={span}>{footer}</td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  );
}

/** Menú «⋯» nativo: <details> se cierra al elegir; Esc lo cierra también. */
function RowMenu({ actions }: { actions: RowAction[] }) {
  if (actions.length === 0) return null;
  return (
    <details className="cf-menu" onKeyDown={(event) => event.key === "Escape" && event.currentTarget.removeAttribute("open")}>
      <summary className="bdr-icon-btn" aria-label={t("tabla.acciones")}>
        <Icon name="ellipsis" />
      </summary>
      <div className="cf-menu__list" role="menu">
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            role="menuitem"
            className={action.danger ? "cf-menu__item is-danger" : "cf-menu__item"}
            disabled={action.disabled}
            onClick={(event) => {
              event.currentTarget.closest("details")?.removeAttribute("open");
              action.onSelect();
            }}
          >
            {action.label}
          </button>
        ))}
      </div>
    </details>
  );
}
