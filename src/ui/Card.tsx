/**
 * Card y StatCard (design.md §7.5). Card: --surface, radio --r-m, título h2 opcional y acciones
 * a la derecha del título. StatCard: cifra en --t-num-xl (mono), qué es, y un chip o acción.
 * Sin estado propio.
 */
import type { ReactNode } from "react";

type CardProps = { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; label?: string };

export function Card({ title, actions, children, className, label }: CardProps) {
  return (
    <section className={["bdr-card cf-card", className].filter(Boolean).join(" ")} aria-label={label}>
      {title || actions ? (
        <header className="cf-card__head">
          {title ? <h2 className="bdr-h2">{title}</h2> : <span />}
          {actions ? <div className="cf-row">{actions}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function StatCard({ value, text, extra }: { value: ReactNode; text: ReactNode; extra?: ReactNode }) {
  return (
    <section className="bdr-card cf-stat">
      <div className="bdr-stat__num">{value}</div>
      <div className="bdr-stat__txt">{text}</div>
      {extra}
    </section>
  );
}
