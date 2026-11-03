/**
 * Rutas por hash, sin router (ADR-003: cero dependencias). Forma: `#/seccion[/pestaña][/id][/accion]`.
 * Documentos y Ajustes tienen pestaña (`#/documentos/albaranes/:id`, `#/ajustes/copias`); el resto
 * va directo al id (`#/facturas/:id/rectificar`). Un hash que no es ruta (salto al contenido)
 * conserva la ruta anterior. Las rutas antiguas redirigen a las nuevas.
 */
export const SECTIONS = ["facturas", "documentos", "recurrentes", "clientes", "productos", "verifactu", "ajustes"] as const;
export type Section = (typeof SECTIONS)[number];

export const DOC_TABS = ["presupuestos", "proformas", "albaranes"] as const;
export type DocTab = (typeof DOC_TABS)[number];
export const SETTINGS_TABS = ["empresa", "series", "fiscalidad", "certificado", "copias", "avanzado"] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

export type Route = { section: Section; tab: string | null; id: string | null; action: string | null };

const LEGACY: Record<string, string> = {
  panel: "facturas",
  fiscal: "verifactu",
  empresas: "ajustes/empresa",
  presupuestos: "documentos/presupuestos",
  proformas: "documentos/proformas",
  albaranes: "documentos/albaranes",
};

const DEFAULT_TAB: Partial<Record<Section, string>> = { documentos: "presupuestos", ajustes: "empresa" };

export const HOME: Route = { section: "facturas", tab: null, id: null, action: null };

export function parseRoute(hash: string, previous: Route = HOME): Route {
  if (!hash.startsWith("#/")) return hash ? previous : HOME;
  const raw = hash.slice(2).replace(/\/+$/, "");
  const [head, ...rest] = raw.split("/");
  const path = [...(LEGACY[head]?.split("/") ?? [head]), ...rest].map(decodeURIComponent);
  const section = SECTIONS.find((item) => item === path[0]);
  if (!section) return HOME;
  if (section === "documentos" || section === "ajustes") {
    const tabs: readonly string[] = section === "documentos" ? DOC_TABS : SETTINGS_TABS;
    const tab = path[1] && tabs.includes(path[1]) ? path[1] : (DEFAULT_TAB[section] ?? null);
    return { section, tab, id: path[2] ?? null, action: path[3] ?? null };
  }
  return { section, tab: null, id: path[1] ?? null, action: path[2] ?? null };
}

export function href(route: Partial<Route> & { section: Section }): string {
  const parts = [route.section, route.tab, route.id, route.action].filter((part): part is string => Boolean(part));
  return `#/${parts.map(encodeURIComponent).join("/")}`;
}

/** Ids reservados que abren un formulario nuevo en vez de una ficha. */
export function isNew(id: string | null): boolean {
  return id === "nueva" || id === "nuevo";
}
