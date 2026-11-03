# CumpleFactura — análisis del repo (foco UX/UI)

Fecha: 2026-10-30. Base para el plan de rediseño que ejecutará Opus 5.5. Sin commit; documento de trabajo.

## 1. Stack

| Capa | Qué hay |
|---|---|
| Escritorio | Tauri 2 (Rust), plugin `dialog` para ficheros nativos. CSP explícita. Build validado solo en Windows (WebView2). |
| Frontend | React 19 + TypeScript 5.8 + Vite 7. Sin router, sin gestor de estado, sin librería de componentes. Iconos `lucide-react`. CSS plano en `src/styles.css`. |
| Backend local | Rust: `commands/` (37 comandos Tauri) → `domain/` (factura, totales, rectificativa, tax, settings) → `db/` (SQLite, 8 migraciones, triggers append-only) → `services/` (audit hash-chain, PDF básico, XML VERI*FACTU + XSD, cadena fiscal, sidecars HMAC loopback, transporte AEAT preflight). |
| Calidad | Gate regulatorio PowerShell (`validate:regulatory`), contrato UI (`verify-ui-contract.mjs`: invocaciones TS vs comandos Rust), smoke navegador con mock Tauri, E2E desktop con tauri-driver, secret scan, matriz de evidencias con ledger SHA-256. Evidencias versionadas en `tests/regulatory/evidence/` (ruido en diffs). |
| Docs | `PRODUCT_BRIEF`, `MODULE_CONTRACT`, `REGULATORY_*`, `docs/UX_UI.md` (rediseño BDR v2), `docs/IMPLEMENTACION_UX_UI.md` (5 fases), 6 maquetas HTML/PNG, inventario funcional y competitivo (2026-10-21), `cumplefactura.md` (research de mercado mayo 2026). |

Limitación de este entorno: el registro npm devuelve 403 a través del proxy, así que no pude instalar dependencias ni compilar ninguna rama aquí. Todo lo visual sale de capturas versionadas en las ramas.

## 2. Mapa de ramas

| Rama | Base | Autor | Qué contiene | Veredicto |
|---|---|---|---|---|
| `main` | — | Ricardo + Claude | `App.tsx` monolítico (2.294 líneas, 1 fichero, 37 invocaciones), estilo verde `#1d5f4a` + Inter, solo claro. Una sola página larga con 20 paneles apilados y una nav lateral que solo hace scroll. Docs del rediseño ya mergeadas (PR #4). | Código funcional pero UI de laboratorio. Es la base oficial. |
| `ux/cumplefactura-fase-1` | main `a2d429c` | Codex / Ricardo | Fase 1 de `IMPLEMENTACION_UX_UI.md`: `App.tsx` partido en `features/{invoices,customers,products,verifactu,settings,onboarding}` + `shared/useWorkspace.ts` (1.055 líneas, conserva las 39 invocaciones). `SuiteShell` con `@bdr/ui` (AppShell, CommandPalette, ConfirmDialog, tokens, Host Grotesk + Geist Mono). Tema claro/oscuro + densidad persistidos en SQLite (`ui_preferences_get/update`). Nav de 9 áreas por hash. CI Windows con ventana real. | **Más avanzada. Base recomendada.** |
| `ux/cumplefactura-fase-2` | fase-1 | Codex / Ricardo | Pantallas de maquetas 1–5: tabla de facturas con filtros y columna Verifactu de 4 pasos, editor partido con vista provisional y PDF real (`invoice_pdf_preview`), `ConfirmDialog` «Lo entiendo», asistente de rectificativa, pantalla Verifactu, primer arranque de 4 pasos. 76 capturas axe claro/oscuro 1024/1440. Dos carreras detectadas y corregidas. Marcada «no fusionar» hasta pasar gate Windows. | **Base recomendada** (fase-2 incluye fase-1). Pendiente: PR, CI Windows, publicar `@bdr/ui` (hoy tarball vendorizado). |
| `claude/cf-funcionalidades-estrella` | commit inicial `16d15ec` | Claude | Backend grande y valioso: migración 009 (`invoice_payments`, `recurring_invoices`, `quotes`, `email_log`, `invoices.due_date`, `customers.email`), `db/business.rs` (1.211 líneas), `services/qr.rs` (QR tributario), `services/email.rs` (SMTP lettre + keyring), PDF profesional con QR, 20 comandos nuevos. UI con tokens RSA (Sora, azul fiscal) y nav de 2 niveles; diverge de la marca BDR. 83 tests Rust. | **Rescatar el backend** (Rust + migración + comandos). Descartar su UI. Diverge de main en 5 commits de docs; el rebase del Rust es viable. |
| `bilel/cosas-hechas-no-se-si-funciona` | commit inicial `16d15ec` | Bilel | Ver §3. | Rescatar 3 piezas pequeñas; descartar el resto. |
| `claude/ui-estilo-contapro`, `claude/ci`, `claude/blissful-faraday-e2wet5` | inicial | Claude | Subconjuntos de estrella (shell RSA, workflow CI, responsive 390/768/1366). | Absorbidas por estrella / fase-1. Archivar. |
| `docs/ux-ui-rediseno` | — | Claude | Ya mergeada en main. | Borrar. |

Conclusión: hay **cuatro UIs distintas** vivas (main verde, fase-2 BDR, estrella RSA, Bilel verde partido). Hay que elegir una y cerrar las demás antes de tocar diseño. Recomendación: **fase-2 como tronco de UI + backend de estrella rebasado encima**.

## 3. Rama de Bilel (2 commits WIP, 2026-10-28)

Qué hace:

- Parte `App.tsx` (2.294 → 1.234 líneas) en `src/sections/{Panel,Empresas,Clientes,Facturas,Fiscal,Ajustes}Section.tsx` + `types.ts` + `lib/format.ts` + `components/lists.tsx`. El estado e `invoke` siguen en `App.tsx`.
- Las secciones llevan `// @ts-nocheck` y reciben `p: Record<string, any>`: es un corte mecánico que **pierde todo el tipado**. No reutilizable como arquitectura.
- Mantiene el estilo verde y el layout de una sola columna; la nav sí cambia de sección (en main solo hace scroll). Visualmente idéntica a main.
- `src-tauri/src/services/sidecar_http.rs` (120 líneas): extrae el transporte HTTP loopback + HMAC que estaba triplicado en `xades_sidecar`, `verifactu_submit_sidecar` y `sidecar_channels`. **Buen refactor**, si `cargo test` pasa.
- READMEs por carpeta (`src/`, `src-tauri/*`, `tools/`, `tests/`): útiles y baratos.
- `tsconfig.json` a `moduleResolution: bundler` y `verify-ui-contract.mjs` recorriendo todo `src/**` (fase-1 hizo lo mismo por su lado).
- **Borra** `MODULE_CONTRACT.md`, `REGULATORY_EVIDENCE_MATRIX.md`, `REGULATORY_TEST_PLAN.md`, `README_DEV.md`, `PRODUCT_BRIEF`, `cumplefactura.md`, todo `docs/` (UX_UI, maquetas, fuentes, planes) y `CLAUDE.md`. Esto rompe el gate regulatorio (`validate:evidence-matrix` lee la matriz) y elimina la fuente del rediseño.
- Regenera ~60 ficheros de evidencia (ruido).

Qué rescatar (cherry-pick manual, no merge): `sidecar_http.rs` + sus adaptaciones en los 3 servicios, los READMEs, y nada más. La división de UI está mejor hecha en fase-1 (`features/` tipado). Conviene decirle a Bilel que no borre docs ni regenere evidencias en ramas de código.

## 4. Funcionalidades: lo que existe hoy

Según código en main (detalle en `docs/INVENTARIO_FUNCIONAL_Y_ANALISIS_COMPETITIVO_2026-10-21.md`):

- **Emisión**: empresas, clientes, catálogo de productos, series configurables por ejercicio, editor de líneas (cantidad, precio, dto, IVA, IRPF), borrador → emisión con número asignado por Rust, huella AEAT, auditoría append-only. Rectificativas R1–R5 con método I/S y asistente de causa. Anulación.
- **Salida**: PDF básico sin QR (main) / PDF con QR tributario (estrella), JSON, CSV, XML VERI*FACTU alta y anulación validados contra XSD, auditoría JSON con verificación de cadena. Backup SQLite (restore solo valida, no restaura).
- **Fiscal**: preparación de firma, preflight XAdES, firma vía sidecar, preflight transporte AEAT, preflight/invocación de envío vía sidecar. Todo fail-closed detrás de flags de entorno; **ningún envío real a la AEAT** acreditado.
- **Solo en estrella**: cobros y vencimientos, recurrentes (generan borrador al abrir), presupuestos con conversión a factura, email SMTP con historial, ajuste de entorno QR.
- **Solo en fase-2**: tema/densidad persistidos, vista PDF embebida, confirmación de emisión, asistente de rectificativa en pasos, primer arranque de 4 pasos, estado fiscal de 4 pasos honesto.

## 5. Lo que falta para superar a la competencia

Referencia: FacturaDirecta, Billin, Factusol, Holded, Quipu y la app gratuita de la AEAT (análisis del 21-10). Ordenado por impacto en la venta:

| Prioridad | Brecha | Dónde está hoy | Impacto UX |
|---|---|---|---|
| P0 | Envío real VERI*FACTU con respuesta (CSV, aceptada con errores, rechazada) y cola offline con reintento | Fase 3 del plan; backend parcial (sidecar) | La columna de 4 pasos ya existe en fase-2 pero pasos 3 y 4 nunca se rellenan. Sin esto la promesa del producto no se ve. |
| P0 | Restore real de backup | Solo valida | Un usuario local-first sin restore no confía. Pantalla guiada: verificar → copia previa → restaurar → rollback. |
| P1 | Cobros, vencimientos, recordatorios | Hecho en estrella (backend + vista) | Portar vista a BDR. Es el gancho frente a FacturaDirecta/Billin. |
| P1 | Presupuesto → proforma → albarán → factura, recapitulativa | Presupuestos hechos en estrella; proforma/albarán no existen | Fase 4. Las 3 entradas de nav de fase-2 están vacías («no disponible»). |
| P1 | Recurrentes | Hecho en estrella (borrador al abrir) | Portar vista. Decisión pendiente: generación solo con conexión (UX_UI.md) vs local (estrella). |
| P1 | Email con PDF | Hecho en estrella (SMTP propio) | Portar pantalla Ajustes › Email + acción «Enviar» en factura. |
| P1 | PDF con logo, datos de pago y QR | QR hecho en estrella; sin logo ni plantilla | La vista previa de fase-2 avisa de que el PDF no lleva QR. Rebasar estrella lo resuelve. |
| P1 | Importación (clientes, catálogo, facturas históricas) | No existe | Imprescindible para migrar desde otro facturador. |
| P2 | Facturas simplificadas / modo mostrador | No existe (F2 soportado en XML) | Diferenciador frente a la app AEAT, que no las admite. |
| P2 | Intracomunitarias, VIES, menciones legales | No existe | Autónomo digital lo pide pronto. |
| P2 | Facturae / FACe | Bloqueado por alta de certificado | Mostrar «no disponible» honesto, como hace fase-2. |
| P3 | Portal cliente, pago online, banca, multiusuario | Fuera de v1 | No copiar a Holded. |

## 6. Diagnóstico UX/UI del estado actual

### main (captura `latest-browser-smoke.png`)

- Una sola página de 6.800 px de alto con 20 paneles; la nav lateral no filtra nada. Sin jerarquía: «Preflight XAdES» tiene el mismo peso que «Nueva factura».
- Rutas de Windows (`C:\CumpleFactura\Evidence\...`), URLs de sidecar y referencias `vault://` visibles en la UI principal. Lenguaje técnico (HMAC, WSDL, XSD) delante del usuario.
- Sin tema oscuro, sin tokens, sin tipografía de marca, sin estados vacíos, sin confirmación de emisión, sin feedback de carga. Botón «Emitir» en cabecera sin contexto de qué se emite.
- Formularios densos de 2 columnas con etiquetas en mayúsculas y sin ayuda contextual.

### fase-2 (capturas `docs/phase2/screenshots/`)

Resuelve la mayoría de lo anterior: shell BDR, tokens, Host Grotesk + Geist Mono, claro/oscuro, densidad, 9 áreas, tabla de facturas con 4 pasos, editor partido con vista previa, diálogo «Lo entiendo», Verifactu con cadena y certificado, técnico plegado en `<details>`. Lo que aún chirría:

1. Avisos técnicos repetidos arriba de cada pantalla («Escritorio local · consulta el estado fiscal… No hay comprobación activa…») y líneas de estado sueltas («Refrescar: OK», «Asistente rectificativa: OK») que se quedan pegadas. Falta un sistema de notificaciones (toast + registro).
2. Filtros ocupan 2 filas + botón «Buscar facturas»; la maqueta usa búsqueda instantánea y 3 chips. Hay «Datos actualizados» como texto suelto.
3. Ajustes mezcla tema/densidad, primer arranque y «Herramientas locales» en una sola página; debería ser una sección con subpáginas (Apariencia, Empresa, Series, Fiscalidad, Certificado, Copias, Avanzado).
4. Presupuestos, Proformas, Albaranes y Recurrentes son páginas vacías con el mismo texto. Mejor ocultar o marcar «Próximamente» en la nav hasta fase 4.
5. Falta: paginación con conteo total, acciones por fila (ver, PDF, rectificar, anular, enviar), ficha de factura (detalle con historial fiscal y cobros), listado de clientes/productos como tabla con búsqueda (hoy son formularios), estados vacíos con CTA, atajos visibles.
6. Selectores nativos `<select>` en la barra superior y en formularios; la maqueta usa controles propios. Decisión de `@bdr/ui`.
7. La vista «provisional» del editor y el PDF real conviven en el mismo hueco; el PDF sin QR contradice la maqueta. Se arregla al rebasar el QR de estrella.
8. Accesibilidad: axe limpio pero con incompletos; `aria-label` en span sin rol en el logo compartido (bug en `@bdr/ui`).

### estrella (captura `latest-browser-smoke.png`)

Nav de dos niveles (top + lateral contextual), tokens RSA, Sora. Mejor jerarquía que main, pero marca distinta a BDR. No merece la pena mantener dos sistemas: solo se porta la funcionalidad.

## 7. Reglas para que Opus ejecute sin errores

Estas reglas deben ir en cada prompt de fase:

1. **Rama base única**: trabajar desde `ux/cumplefactura-fase-2` (o desde `main` tras mergearla). Nunca desde `16d15ec`.
2. **No tocar**: numeración (`invoice_issue`), huellas, XML/XSD, `fiscal_records`, `audit_events`, migraciones 001–008. Todo cambio Rust pasa `cargo fmt --check` y `cargo test`.
3. **Contrato de UI**: cada `invoke("x")` nuevo debe existir en `lib.rs`; `npm run validate:ui-contract` en verde. No inventar comandos.
4. **Estados fiscales honestos**: un paso de Verifactu solo se marca con evidencia (`fiscal_records` + `fiscal_exports` + invocación confirmada). Nunca simular envío, cola, CSV ni certificado.
5. **Tokens, no colores**: solo variables de `@bdr/ui/tokens.css`. Violeta solo en el icono de producto. Menta para acciones primarias, Pizarra para nav activa, Sol para la palabra clave del título y estados «en cola / con errores».
6. **Tipografía**: Host Grotesk para texto; Geist Mono para números, NIF, importes, huellas, fechas y CSV.
7. **Formato es-ES**: `1.234,56 €`, fechas `dd/mm/aaaa`, vía `shared/moneyFormat.ts` e `invoiceDate.ts`. No usar `toFixed` ni división en coma flotante.
8. **Microcopy**: tuteo, sin humor en importes y avisos, nunca «homologado» ni «cumple la ley». Vacíos con CTA. Tabla de sí/no en `docs/UX_UI.md`.
9. **Accesibilidad**: foco visible 2 px, zona táctil ≥ 44 px, `Esc` cierra diálogos, texto además de color en estados, etiquetas en todos los campos.
10. **Tamaños**: 1024×700 mínimo y 1440×900; claro y oscuro; densidad 40/48 px. Capturas con `tools/verify-phase2-visual.mjs` por pantalla tocada.
11. **Un PR por pantalla o módulo**, con lista de capturas antes/después y resultado de `npm run build`, `validate:ui-contract`, `cargo test`.
12. **No borrar docs ni regenerar `tests/regulatory/evidence/`** en PRs de UI.
13. Un fichero React por pantalla, ≤ 300 líneas; lógica de datos en `shared/useWorkspace.ts` o hooks por feature; sin `any`, sin `@ts-nocheck`.

## 8. Decisiones que necesito antes del plan

Las responde Ricardo o el md de diseño nuevo:

1. ¿Confirmas fase-2 como tronco y archivar estrella (solo backend), Bilel (solo `sidecar_http` + READMEs) y las tres ramas `claude/*` antiguas?
2. ¿El nuevo md sustituye a `docs/UX_UI.md` o lo complementa? Si cambia marca/tokens, hay que actualizar `@bdr/ui` primero (repo `emprendurias-bdr/bdr-ui`, hoy vendorizado como tarball).
3. Nav: ¿mantener las 9 áreas con Presupuestos/Proformas/Albaranes/Recurrentes visibles pero vacías, u ocultarlas hasta fase 4?
4. ¿Se portan ya cobros, recurrentes, presupuestos y email de estrella (abre fase 4 antes que fase 3), o primero fase 3 (envío real y cola)?
5. ¿Controles nativos (`<select>`) o componentes propios en `@bdr/ui`?
6. Orden de pantallas a rediseñar. Propuesta: Facturas (lista + ficha) → Editor → Emitir → Verifactu → Ajustes (subpáginas) → Clientes/Productos (tablas) → Primer arranque → Documentos comerciales.
