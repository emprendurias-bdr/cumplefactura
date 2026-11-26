/**
 * Declaración responsable del SIF (RRSIF art. 13; Orden HAC/1177/2024 art. 15.3).
 * Única fuente: `docs/legal/DECLARACION_RESPONSABLE_SIF.md`, incluido en el bundle al compilar
 * (Vite `?raw`). De ese documento se toma el texto entre las dos reglas `---` de la sección 2
 * y los datos de las letras a), c), h) e i) (lógica en `declaracionParse.ts`). Si el formato
 * cambia, se muestra el documento entero y la vista lo marca como no definitivo.
 */
import raw from "../../docs/legal/DECLARACION_RESPONSABLE_SIF.md?raw";
import { extractBody, field } from "./declaracionParse";

export { plain } from "./declaracionParse";

const doc = raw.replace(/\r\n/g, "\n");
const body = extractBody(doc);

export const declaracion = {
  /** Texto a mostrar: la declaración, o el documento completo si no se pudo extraer. */
  text: body ?? doc.trim(),
  nombre: field(body, "a"),
  /** Versión a la que corresponde la declaración; la instalada sale de `getVersion()`. */
  version: field(body, "c"),
  productor: field(body, "h"),
  nif: field(body, "i"),
  /** No definitivo: borrador, datos PENDIENTE o formato no reconocido. */
  provisional: body === null || /BORRADOR/.test(doc.split("\n")[0]) || /PENDIENTE/.test(body),
};
