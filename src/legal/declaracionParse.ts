/**
 * Lectura del texto de la declaración responsable (docs/legal/DECLARACION_RESPONSABLE_SIF.md).
 * Sin `?raw` ni React para poder probarlo con `node --test` (tests/ui/declaracion.test.mjs).
 */

/** Texto entre la primera pareja de líneas `---` que siguen a «## 2.»; null si no se encuentra. */
export function extractBody(source: string): string | null {
  const start = source.indexOf("\n## 2.");
  if (start < 0) return null;
  const parts = source.slice(start).split(/\n---\n/);
  return parts.length >= 3 ? parts[1].trim() : null;
}

/** Quita negritas, cursivas, código y escapes de Markdown. */
export function plain(text: string): string {
  return text.replace(/\*\*|`/g, "").replace(/(^|[^\\])\*/g, "$1").replace(/\\\*/g, "*");
}

/** Quita el punto final de frase o de versión («1.0.0.»), pero no el de iniciales («S.L.»). */
export function sinPuntoFinal(text: string): string {
  return text.replace(/(?<!\b[A-Z])\.$/, "");
}

/**
 * Valor de la letra `x)` de la declaración, sin marcas de Markdown ni la aclaración entre
 * paréntesis. null si la letra no está o su valor sigue «PENDIENTE» (la vista pone «Sin dato»).
 */
export function field(body: string | null, letter: string): string | null {
  const match = (body ?? "").match(new RegExp(`^${letter}\\) \\*\\*[^*]+?:?\\*\\*:? (.+)$`, "m"));
  if (!match) return null;
  const value = plain(match[1]);
  if (/^PENDIENTE\b/.test(value)) return null;
  // Quita la aclaración «valor (nota). Resto…».
  const short = value.match(/^(.*?) \([^)]*\)(?:[.;].*)?$/)?.[1] ?? value;
  return sinPuntoFinal(short);
}

/** La versión instalada (binario) no es la que dice la declaración. Sin alguno de los dos datos, no se avisa. */
export function otraVersion(instalada: string | null, declarada: string | null): boolean {
  return Boolean(instalada && declarada && instalada !== declarada);
}
