/**
 * Ayudas para los errores de `invoke` (sin llamar a Rust: las llamadas viven en los hooks).
 * Rust devuelve `String` con un código estable al principio (`codigo` o `codigo:detalle`,
 * docs/CONTRATOS_NUEVOS §Reglas). Un comando que aún no existe (F3/F4 en curso) se reconoce para
 * mostrar el módulo como «todavía no disponible» en vez de un error.
 */
export function rawError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Tauri 2 responde «Command x not found» si el comando no está registrado. */
export function isMissingCommand(error: unknown): boolean {
  return /command\s+\S+\s+not\s+found|unknown command|not allowed by acl/i.test(rawError(error));
}

/** `codigo:detalle` → { code, detail }; texto libre → { code: "", detail: texto }. */
export function splitCode(raw: string): { code: string; detail: string } {
  const match = /^([a-z][a-z0-9_]*)(?::(.*))?$/s.exec(raw.trim());
  return match ? { code: match[1], detail: match[2] ?? "" } : { code: "", detail: raw };
}
