/**
 * Callout (design.md §7.6): fondo del estado, icono + frase en negrita que dice qué pasa +
 * frase de qué hacer + botón si hay acción. `live` lo anuncia a lectores de pantalla
 * (resultados de una acción). Sin estado propio.
 */
import type { ReactNode } from "react";
import { TONE_ICON, type Tone } from "./status";

type Props = { tone: Tone; title: ReactNode; children?: ReactNode; actions?: ReactNode; live?: boolean };

export function Callout({ tone, title, children, actions, live }: Props) {
  const toneClass = tone === "neu" ? "cf-callout--neu" : `bdr-callout--${tone}`;
  return (
    <div className={`bdr-callout ${toneClass}`} role={live ? (tone === "err" ? "alert" : "status") : undefined}>
      <p className="cf-callout__text">
        <span aria-hidden="true" className="cf-callout__icon">
          {TONE_ICON[tone]}
        </span>
        <span>
          <strong>{title}</strong>
          {children ? <> {children}</> : null}
        </span>
      </p>
      {actions ? <div className="bdr-callout__actions">{actions}</div> : null}
    </div>
  );
}
