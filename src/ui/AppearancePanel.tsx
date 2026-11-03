/**
 * AppearancePanel (design.md §5.3): tuerca ⚙ con un panel de 280 px. Apariencia
 * (Claro · Oscuro · Automático) y Color (Intenso · Suave), controles segmentados con cambio
 * inmediato y sin botón Guardar. Sin Cuenta BDR en escritorio: «Se guarda en este equipo.»
 * Teclado: Tab entre grupos, flechas dentro del grupo, Esc cierra y devuelve el foco a la tuerca.
 * Estado: abierto/cerrado y la preferencia leída de `lib/appearance.ts`.
 */
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { t } from "../i18n/es";
import { readPreferences, savePreference } from "../lib/appearance";

type Group = { key: "apariencia" | "color"; label: string; options: { value: string; label: string }[] };

const GROUPS: Group[] = [
  {
    key: "apariencia",
    label: t("apariencia.titulo"),
    options: [
      { value: "claro", label: t("apariencia.claro") },
      { value: "oscuro", label: t("apariencia.oscuro") },
      { value: "auto", label: t("apariencia.auto") },
    ],
  },
  {
    key: "color",
    label: t("apariencia.color"),
    options: [
      { value: "intenso", label: t("apariencia.intenso") },
      { value: "suave", label: t("apariencia.suave") },
    ],
  },
];

/** Flechas izquierda/derecha mueven el foco y eligen dentro del grupo segmentado. */
function onArrows(event: KeyboardEvent<HTMLDivElement>) {
  if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
  const buttons = [...event.currentTarget.querySelectorAll("button")];
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
  const next = buttons[(index + (event.key === "ArrowRight" ? 1 : buttons.length - 1)) % buttons.length];
  next?.focus();
  next?.click();
  event.preventDefault();
}

export function AppearancePanel() {
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState(readPreferences);
  const root = useRef<HTMLDivElement>(null);
  const gear = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => !root.current?.contains(event.target as Node) && setOpen(false);
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, [open]);

  function choose(key: Group["key"], value: string) {
    savePreference(key, value);
    setPrefs(readPreferences());
  }

  return (
    <div
      className="bdr-pop"
      ref={root}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          setOpen(false);
          gear.current?.focus();
        }
      }}
    >
      <button
        ref={gear}
        type="button"
        className="bdr-icon-btn"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="cf-appearance"
        aria-label={t("apariencia.abrir")}
        title={t("apariencia.abrir")}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="settings" />
      </button>
      <div id="cf-appearance" className={open ? "bdr-panel is-open" : "bdr-panel"} role="dialog" aria-label={t("apariencia.abrir")}>
        {GROUPS.map((group) => (
          <div key={group.key} className="cf-stack-xs">
            <div className="bdr-label" id={`cf-seg-${group.key}`}>
              {group.label}
            </div>
            <div className="bdr-seg" role="group" aria-labelledby={`cf-seg-${group.key}`} onKeyDown={onArrows}>
              {group.options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={prefs[group.key] === option.value}
                  onClick={() => choose(group.key, option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        ))}
        <div className="bdr-help cf-panel__foot">{t("apariencia.guardado")}</div>
      </div>
    </div>
  );
}
