/**
 * Paleta de comandos (Ctrl K, design.md §5.1 y §9): busca pantallas, acciones y facturas cargadas.
 * <dialog> nativo; flechas mueven la selección, Enter navega, Esc cierra. Sin animación
 * (--mov-instant para la paleta, §4.11). Estado: texto buscado y fila activa.
 */
import { useEffect, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { t } from "../i18n/es";

export type Command = { id: string; label: string; hint?: string; hash: string };

const fold = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function CommandPalette({ open, commands, onClose }: { open: boolean; commands: Command[]; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setQuery("");
      setActive(0);
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const shown = commands.filter((item) => fold(`${item.label} ${item.hint ?? ""}`).includes(fold(query))).slice(0, 12);

  function choose(item: Command | undefined) {
    if (!item) return;
    location.hash = item.hash;
    onClose();
  }

  return (
    <dialog
      ref={ref}
      className="bdr-dialog cf-palette"
      aria-label={t("paleta.titulo")}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => event.target === ref.current && onClose()}
    >
      {open ? (
        <div className="cf-palette__body">
          <label className="bdr-search cf-palette__search">
            <Icon name="search" />
            <input
              autoFocus
              value={query}
              aria-label={t("paleta.titulo")}
              placeholder={t("paleta.placeholder")}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") setActive((value) => Math.min(value + 1, shown.length - 1));
                if (event.key === "ArrowUp") setActive((value) => Math.max(value - 1, 0));
                if (event.key === "Enter") choose(shown[active]);
                if (["ArrowDown", "ArrowUp", "Enter"].includes(event.key)) event.preventDefault();
              }}
            />
          </label>
          <ul className="cf-palette__list" role="listbox" aria-label={t("paleta.resultados")}>
            {shown.length === 0 ? <li className="bdr-muted cf-palette__empty">{t("paleta.vacia")}</li> : null}
            {shown.map((item, index) => (
              <li
                key={item.id}
                role="option"
                aria-selected={index === active}
                className={index === active ? "cf-palette__item is-active" : "cf-palette__item"}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(item)}
              >
                <span>{item.label}</span>
                {item.hint ? <span className="m bdr-muted">{item.hint}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </dialog>
  );
}
