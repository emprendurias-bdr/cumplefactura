# `src/` — Frontend React

UI de CumpleFactura montada en el webview Tauri.

| Ruta | Rol |
|---|---|
| `main.tsx` | Arranque de React |
| `App.tsx` | Carcasa: barra lateral, cabecera y sección activa |
| `useCumpleFactura.ts` | Estado y llamadas a Rust (`invoke`); exporta el tipo `Model` que reciben las secciones |
| `types.ts` | Tipos espejo de los contratos Tauri |
| `lib/format.ts` | Importes, formularios, filtros y rutas de exportación |
| `components/` | `Icon` (SVG propios), `forms` (`TextField`, `PathForm`), `lists` (`DataList`, `Pager`) |
| `sections/` | Una pantalla por entrada del menú |
| `styles.css` | Tokens y layout |

TypeScript es estricto y marca variables o parámetros sin uso (`tsconfig.json`).
