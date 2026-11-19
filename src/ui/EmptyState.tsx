/**
 * EmptyState (design.md §7.10): una frase que explica qué va aquí + botón principal para crear
 * el primero. Sin ilustraciones. `title` en negrita opcional para los módulos que aún no existen
 * (Documentos, Recurrentes), que van sin botón para no ofrecer nada que no funcione.
 * Regla de la app: el botón del vacío es secondary, porque la acción principal (Menta) ya está en el hero.
 */
import type { ReactNode } from "react";

export function EmptyState({ title, text, action }: { title?: ReactNode; text: ReactNode; action?: ReactNode }) {
  return (
    <div className="bdr-empty" role="status">
      <p className="cf-empty__text">
        {title ? <strong>{title} </strong> : null}
        {text}
      </p>
      {action}
    </div>
  );
}
