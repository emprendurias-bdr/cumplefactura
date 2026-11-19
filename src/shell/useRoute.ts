/**
 * Ruta actual leída del hash (`lib/routes.ts`) y `go()` para navegar. Sin transiciones de página
 * (design.md §4.11: ninguna en apps de trabajo); al cambiar de ruta el foco vuelve al contenido.
 */
import { useEffect, useState } from "react";
import { parseRoute, type Route } from "../lib/routes";

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(location.hash));
  useEffect(() => {
    const onHash = () => setRoute((previous) => parseRoute(location.hash, previous));
    addEventListener("hashchange", onHash);
    return () => removeEventListener("hashchange", onHash);
  }, []);
  return route;
}

export function go(hash: string) {
  if (location.hash !== hash) location.hash = hash;
}
