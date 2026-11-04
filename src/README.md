# `src/` — Frontend React (interfaz BDR, `design.md` v1.3)

UI de CumpleFactura montada en el webview Tauri. Sin router, sin librería de estado ni de componentes.

| Ruta | Rol |
|---|---|
| `main.tsx` | Arranque de React e importación de estilos en orden |
| `App.tsx` | Elige pantalla por ruta (hash); primer arranque a pantalla completa |
| `useCumpleFactura.ts` | Núcleo: empresas, clientes, productos, series, facturas, ajustes y copias (`invoke`) |
| `useVerifactu.ts` | XML, comprobación previa, envío, envíos guardados y contraseña en memoria |
| `useDocuments.ts`, `useRecurring.ts` | Documentos comerciales (y sus series) y recurrentes (F4, R2) |
| `usePayments.ts` | Cobros y vencimiento de una factura o proforma (R2, D6) |
| `types.ts` | Tipos espejo de los contratos Tauri |
| `i18n/es.ts` | Todos los textos y la traducción de los códigos de error de Rust |
| `lib/` | Módulos puros con tests en `tests/ui/` (importes, fechas, rutas, pasos VERI*FACTU, periodos) |
| `ui/` | Componentes de `design.md` §7 con sus nombres exactos; `status.ts` es el único mapa estado → tono |
| `shell/` | Barra superior, barra lateral, paleta Ctrl K, chip de cadena y atajos |
| `sections/` | Una pantalla por ruta (≤ 300 líneas) |
| `styles/bdr/` | `tokens.css`, `bdr.css`, `motion.css` copiados tal cual de bdr-ui (commit 4aa365c) |
| `styles/app.css` | Estilos propios; solo `var(--…)` |
| `assets/fonts/` | Host Grotesk y Geist Mono (OFL) |

TypeScript es estricto y marca variables o parámetros sin uso (`tsconfig.json`).
