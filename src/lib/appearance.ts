/**
 * Apariencia y color de design.md §4.1, sin Cuenta BDR en escritorio: se guarda en este equipo
 * (`localStorage` bdr.apariencia / bdr.color, las mismas claves que lee el script anti-parpadeo
 * de index.html). «Automático» se resuelve con `prefers-color-scheme` y se escucha en caliente.
 * La densidad (§10: media-alta) es un ajuste propio de la app y va en `data-density`.
 */
export type Apariencia = "claro" | "oscuro" | "auto";
export type Color = "intenso" | "suave";
export type Densidad = "comoda" | "compacta";

const KEYS = { apariencia: "bdr.apariencia", color: "bdr.color", densidad: "cf.densidad" } as const;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Sin almacenamiento local se usa el valor por defecto en el próximo arranque.
  }
}

/** Preferencias guardadas; por defecto Automático + Suave + Cómoda (design.md §4.1 [PROPUESTA]). */
export function readPreferences(): { apariencia: Apariencia; color: Color; densidad: Densidad } {
  const a = read(KEYS.apariencia);
  return {
    apariencia: a === "claro" || a === "oscuro" ? a : "auto",
    color: read(KEYS.color) === "intenso" ? "intenso" : "suave",
    densidad: read(KEYS.densidad) === "compacta" ? "compacta" : "comoda",
  };
}

const dark = () => typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;

/** Pone los atributos en <html>. Devuelve la apariencia ya resuelta. */
export function applyPreferences(p: { apariencia: Apariencia; color: Color; densidad: Densidad }) {
  const d = document.documentElement;
  const resolved = p.apariencia === "auto" ? (dark() ? "oscuro" : "claro") : p.apariencia;
  d.dataset.apariencia = resolved;
  d.dataset.color = p.color;
  d.dataset.density = p.densidad;
  return resolved;
}

export function savePreference(key: keyof typeof KEYS, value: string) {
  write(KEYS[key], value);
  applyPreferences(readPreferences());
}

/** Con «Automático», sigue al sistema mientras la app está abierta. */
export function watchSystemAppearance() {
  if (typeof matchMedia !== "function") return () => undefined;
  const media = matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => {
    if (readPreferences().apariencia === "auto") applyPreferences(readPreferences());
  };
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
