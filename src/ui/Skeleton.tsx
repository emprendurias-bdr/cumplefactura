/**
 * Skeleton (design.md §7.10): esqueleto con la forma del contenido, solo si la espera pasa de
 * 300 ms y, una vez visible, al menos 400 ms para no parpadear. El pulso está en motion.css.
 * `useDelayedLoading` es la lógica; `Skeleton` pinta N filas de una tabla.
 */
import { useEffect, useRef, useState } from "react";
import { t } from "../i18n/es";

export function useDelayedLoading(loading: boolean, delay = 300, minimum = 400) {
  const [visible, setVisible] = useState(false);
  const shownAt = useRef(0);

  useEffect(() => {
    if (loading) {
      const timer = setTimeout(() => {
        shownAt.current = Date.now();
        setVisible(true);
      }, delay);
      return () => clearTimeout(timer);
    }
    if (!visible) return;
    const rest = Math.max(0, minimum - (Date.now() - shownAt.current));
    const timer = setTimeout(() => setVisible(false), rest);
    return () => clearTimeout(timer);
  }, [loading, visible, delay, minimum]);

  return visible;
}

export function Skeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="bdr-card cf-skeleton" role="status" aria-label={t("comun.cargando")}>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="bdr-skel" style={{ width: `${92 - (index % 3) * 14}%` }} />
      ))}
    </div>
  );
}
