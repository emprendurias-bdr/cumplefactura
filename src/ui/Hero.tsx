/**
 * Hero (design.md §6): uno por pantalla. Bloque con --p-hero (color o degradado del producto,
 * texto --p-hero-fg, radio --r-l) o `plain`: solo título sobre --bg en listados sencillos.
 * Contenido: etiqueta de contexto (--t-label) · título h1 · línea de apoyo · a la derecha,
 * acciones secundarias y UNA principal (Menta). `Accent` marca una palabra en Sol (máx. una).
 */
import type { ReactNode } from "react";

type Props = { label?: ReactNode; title: ReactNode; support?: ReactNode; secondary?: ReactNode; primary?: ReactNode; plain?: boolean; chip?: ReactNode };

export function Hero({ label, title, support, secondary, primary, plain, chip }: Props) {
  return (
    <header className={plain ? "cf-hero-plain" : "bdr-hero"}>
      <div className="bdr-hero__body">
        {label ? <div className="bdr-label">{label}</div> : null}
        <div className="cf-row">
          <h1 className="bdr-h1">{title}</h1>
          {chip}
        </div>
        {support ? <div className="cf-hero__support">{support}</div> : null}
      </div>
      {secondary || primary ? (
        <div className="cf-row">
          {secondary}
          {primary}
        </div>
      ) : null}
    </header>
  );
}

/** Palabra clave del titular en Sol (design.md §4.2: una por pantalla). */
export function Accent({ children }: { children: ReactNode }) {
  return <mark className="cf-acento">{children}</mark>;
}
