# `src/` — Frontend React

UI de CumpleFactura montada en el webview Tauri.

## Archivos

| Ruta | Rol |
|---|---|
| `main.tsx` | Bootstrap React |
| `App.tsx` | Estado, handlers IPC, shell/nav |
| `types.ts` | DTOs espejo Tauri |
| `lib/format.ts` | Helpers de form/importes |
| `components/` | DataList / Pager |
| `sections/` | Paneles por nav |
| `styles.css` | Tokens y layout |

## Nav

`panel` | `empresas` | `clientes` | `facturas` | `fiscal` | `ajustes` — cada una renderiza su sección real.
