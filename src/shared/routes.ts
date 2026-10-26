export function routeFromHash(hash: string, previous = "facturas"): string {
  return hash.startsWith("#/") ? hash.slice(2) || "facturas" : previous;
}
