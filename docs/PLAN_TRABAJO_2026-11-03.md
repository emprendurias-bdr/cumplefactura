# Plan de trabajo — CumpleFactura (cierre con el mínimo de código y dependencias)

Fecha: 2026-11-03. Autor: Fable 5.1 (sesión «Plan de trabajo optimizado»). Decide: Ricardo. Revisan: Bilel y David.

**Actualización 2026-11-03 (respuestas de Ricardo).** PR #7 fusionado en `main` (ADR-001 aceptada). Interfaz alineada con `design.md` desde el primer PR (ADR-003). Contraseña del certificado: la elige el cliente, con la opción recomendada por defecto (ADR-002). Documentos y Recurrentes especificados para Bilel y David en `docs/ESPEC_DOCUMENTOS_Y_RECURRENTES.md`. Primero lo fiscal, siempre (F3 antes que F4). Evidencia: solo la última ejecución del gate (§3, opción A). `Stepper` de 5 pasos, cambiado en `design.md` (ADR-003).

Fuentes: sesiones «Arrancar servidor frontend local» (3-nov), «Vilel branch merge review» (30-oct → 2-nov, PR #7) y «Repo UX/UI analysis» (30-oct, `docs/ANALISIS_REPO_UX_UI_2026-10-30.md` + `docs/PLAN_UX_UI_2026-10-30.md` + `docs/PROMPT_SESION_SUITE_BDR.md`), más verificación directa del repo en esta sesión.

---

## 0. Resumen en cinco líneas

1. Hay **cuatro interfaces y tres backends** vivos en ramas distintas. Nada de eso se termina mientras no haya un tronco único.
2. El tronco es **PR #7** (`limpieza/exhaustiva`): menos código (Rust de la app 9.610 → 7.387 líneas), menos dependencias (npm 229 → 164 paquetes; sin `lucide-react`, `hex` ni `hmac` en la app), sidecar VERI\*FACTU en Rust con 41 tests verdes en Linux, y fusiona limpio sobre `main`.
3. La UI de `ux/cumplefactura-fase-2` **no se fusiona**: se **porta** su diseño (tokens, shell, pantallas) sobre el frontend tipado de PR #7, sin `@bdr/ui` (que arrastra `@tanstack/react-table`), sin `lucide-react` y sin `axe-core`/`chromedriver`. Se rescatan sus módulos puros y sus tests sin dependencias.
4. El sidecar ya existe y está verificado; lo que faltaba era **estructura y arquitectura explicadas** (`sidecar/README.md`, `sidecar/ARQUITECTURA.md`) y tres decisiones de producto (contraseña del certificado, caducidad, tiempo de espera AEAT).
5. Orden: **F0 consolidar (1 día) → F1 homologar (bloquea Ricardo + certificado) → F2 UI BDR sobre PR #7 (6 PR, ~7 días) → F3 cierre fiscal (QR, cola, restore) → F4 comercial**. Nada se instala sin el protocolo 0.2 de `design.md`.

---

## 1. Estado real (verificado hoy)

| Rama / PR | Base | Qué contiene | Verificado en esta sesión | Veredicto |
|---|---|---|---|---|
| `main` 33c660b | — | Split de Bilel (secciones con `@ts-nocheck` ya corregido en PR #7), transporte `sidecar_http` hacia el sidecar Python de ContaPro, docs del rediseño (PR #4). | — | Base oficial, superada por PR #7. |
| **PR #7** `limpieza/exhaustiva` (9 commits, 1 por fase) | `main` | Workspace Cargo; `crates/fiscal-contract`; `sidecar/` Rust (`cumplefactura-sidecar`); app envía por el sidecar sin XAdES (RD 1007/2023 art. 16.3); fuera XAdES/SII/TicketBAI/import ContaPro (38 → 30 comandos); DB dividida por entidad; frontend tipado (`useCumpleFactura.ts`) sin librería de iconos; gate con smoke del sidecar; docs y specs actualizados. | `cargo test -p fiscal-contract -p cumplefactura-sidecar`: **41/41 ok** (Linux). `npm run build`: ok (JS 245 KB). `validate:ui-contract`: 30/30 comandos. `cargo test -p cumplefactura`: no compila aquí por falta de GTK (contenedor sin escritorio), igual que en la sesión original; Ricardo lo pasó en Windows/Linux con WebDriver. `mergeable_state: clean`. | **Tronco.** |
| PR #5 `ux/cumplefactura-fase-1` → PR #6 `ux/cumplefactura-fase-2` | `main` a2d429c | Shell BDR con `@bdr/ui` (tarball vendorizado + `@tanstack/react-table`), `lucide-react`, `features/`, `shared/useWorkspace.ts` (1.055 líneas), tema/densidad en SQLite, tabla de facturas con 4 pasos, editor partido, asistente de rectificativa, primer arranque, 76 capturas axe, CI Windows. 245 ficheros, +12.281. Publicada como página privada (sesión 3-nov). | `git merge-tree` contra PR #7: **12 conflictos** (`db/mod.rs`, `lib.rs`, `invoices.rs`, `core_e2e.rs`, `App.tsx`, `styles.css`, `tsconfig`, 3 tools, lockfile, `index.html`). 235 paquetes npm. | **Referencia de diseño, no se fusiona.** Se porta (F2). |
| `docs/analisis-repo-ux-ui-2026-10-30` | `main` | Análisis, plan UX en 8 PR y prompt de la sesión suite. Sin PR. | Solo docs; fusiona limpio. **Ya fusionada en esta rama.** | Fusionar. Su supuesto S1 («fase-2 como tronco») queda sustituido por este plan (ADR-001). |
| PR #3 `claude/cf-funcionalidades-estrella` (sobre PR #2) | commit inicial 16d15ec | Backend: migración 009 (`invoice_payments`, `recurring_invoices`, `quotes`, `email_log`), `db/business.rs`, QR tributario, email SMTP (`lettre` + `keyring`), PDF con QR, 20 comandos, 83 tests. UI RSA divergente. | Diverge de `main` desde el commit inicial; su migración 009 choca de número con la 009 de PR #7 (`verifactu_submissions`). | **Cantera.** Rebasar solo backend en F3/F4, renumerando a 010+. Cerrar el PR. |
| PR #1 `claude/ci`, PR #2 `claude/ui-estilo-contapro`, `claude/blissful-faraday-e2wet5`, `limpieza/fusion-bilel`, `bilel/cosas-hechas-no-se-si-funciona`, `docs/ux-ui-rediseno` | varias | Subconjuntos ya absorbidos por PR #7, fase-1 o `main`. | — | Cerrar PR y archivar ramas (etiqueta `archive/<nombre>` y borrar). |

Lo que las tres sesiones dejaron pendiente y sigue pendiente:

- Gate completo en Windows sobre PR #7 (`npm run validate:regulatory`) y regenerar evidencia.
- Envío real a la AEAT de pruebas con certificado (`tools/homolog-verifactu.mjs --enviar`) y manifiesto de aceptación redactado.
- Decisión sobre la contraseña del certificado (hoy variable de entorno).
- Fase-2 nunca pasó CI Windows (WebDriver) y no se fusionó.
- Las preguntas P1–P6 del análisis UX: respondidas el 03-11 (ver §7), incluidos los pasos del Stepper (5).

---

## 2. Decisiones (ADR)

### ADR-001 — Tronco único: PR #7

**Estado:** aceptada (Ricardo, 03-11). PR #7 fusionado en `main` el 03-11. **Decide:** Ricardo.

| Opción | Complejidad | Código resultante | Dependencias | Riesgo | Coste |
|---|---|---|---|---|---|
| **A. PR #7 como tronco; fase-2 se porta** | Baja: PR #7 fusiona limpio hoy. | Menor: 7.387 líneas Rust app + 1.674 sidecar + 727 contrato; frontend 3.416 líneas tipadas. | npm 4 + 9 dev; Rust app 9, sidecar 2 (`native-tls`, `roxmltree`). | Se reescribe la capa visual de fase-2 (≈6 pantallas) sobre otro esqueleto. | ~7 días de UI (F2). |
| B. fase-2 como tronco; PR #7 se rebasa encima | Alta: 12 conflictos en `db/mod.rs`, `lib.rs`, `App.tsx`, `styles.css`, tools y lockfile; fase-2 toca el `App.tsx` que PR #7 ya reemplazó. | Mayor: `useWorkspace.ts` 1.055 + `features/` 6.441 líneas + `db/mod.rs` monolítico. | npm 235 paquetes, tarball `@bdr/ui` no editable desde este repo, `lucide-react`, `axe-core`, `chromedriver`. | Dos a tres días de resolución de conflictos en código fiscal; CI Windows de fase-2 ya en rojo. | ~3 días de merge + luego la misma UI. |
| C. Mantener ambas y decidir después | Nula hoy. | Doble. | Doble. | Cada semana que pasa diverge más (ya 12 conflictos). | Creciente. |

**Decisión:** A. **Consecuencias:** se cierran PR #5 y #6 sin fusionar (la rama se conserva como referencia hasta terminar F2); el plan UX de 8 PR sigue valiendo en orden y criterios, pero cambia el supuesto S1 y los ficheros destino (§4, F2). Lo que se revisa más adelante: si `bdr-ui` se publica como paquete con tokens de `design.md` y sin `tanstack`, CumpleFactura puede consumirlo en vez de `src/ui/` (una dependencia, no cinco).

### ADR-002 — Sidecar VERI\*FACTU propio en Rust, sin firma XAdES

**Estado:** aceptada en PR #7 (sesión «Vilel branch merge review»); aquí se ratifica y se documenta.

| Opción | Dependencias | Seguridad | Código | Estado |
|---|---|---|---|---|
| **A. `cumplefactura-sidecar` (Rust, en este repo)** | `native-tls` (TLS del sistema, abre PKCS#12 de la FNMT) + `roxmltree`; `rcgen` solo en tests. | Único proceso con certificado; secreto HMAC por sesión por stdin; lista cerrada de 4 endpoints; fail-closed con `--allow-aeat` / `--allow-production`. | 1.674 líneas con tests; contrato compartido compila a la vez en app y sidecar. | Hecho, 41 tests. |
| B. Sidecar Python de ContaPro (`C:\07 DESARROLLO\apps\contapro\services\sidecar`) | Python + FastAPI + criptografía XAdES; vive en otro repo. | Firmaba XAdES (no exigida en VERI\*FACTU) y requería vault montado; la app solo hacía preflights. | 3 clientes Rust duplicados (`xades_sidecar`, `verifactu_submit_sidecar`, `sidecar_channels`: ~2.200 líneas) que PR #7 elimina. | Era el estado de `main`. |
| C. Cliente AEAT dentro de la app Tauri | `native-tls` en la app. | El certificado entraría en el proceso de la UI. | Menos ficheros. | Rechazada: rompe «el certificado nunca entra en la app». |

**Decisión:** A. Pendientes de producto, con recomendación (§5, F3):

- **Contraseña del certificado** (decidido 03-11: **la elige el cliente, con la recomendada por defecto**). Hoy sale de `CUMPLEFACTURA_CERT_PASSWORD[_<ID>]` en el entorno. En «Ajustes › Certificado», al cargar el certificado, la persona elige dónde se guarda:

  | Opción | Qué hace | Por defecto | Coste |
  |---|---|---|---|
  | **Solo durante esta sesión** (recomendada) | La app la pide la primera vez que hace falta, la guarda solo en la memoria del proceso de la app y la envía en el cuerpo firmado con HMAC de `submit-preflight` / `invoke-submit` (campo nuevo `certificate_password`). Al cerrar la app se olvida. | ✓ | 0 dependencias |
  | Recordar en este equipo | La guarda en el llavero del sistema (Administrador de credenciales en Windows, Llavero en macOS). No se vuelve a pedir. | | 1 dependencia (`keyring`): protocolo design.md §0.2 |
  | Variable de entorno (avanzado) | La de hoy. Solo para `tools/homolog-verifactu.mjs` y pruebas; no aparece en la interfaz. | | 0 |

  El texto bajo la opción recomendada: «Más seguro: nadie puede leerla después de cerrar la app.» En los tres casos el sidecar nunca guarda ni registra la contraseña, y la app nunca la escribe en SQLite ni en logs.
- **Caducidad del certificado.** `native-tls` no la expone. Opción sin dependencias: leer `notAfter` del PKCS#12 con un parseo DER mínimo (~80 líneas) en `vault.rs`; opción con dependencia: `x509-parser`. Recomendación: parseo mínimo, solo para avisar en el preflight (`certificate_expires_in_days`), nunca para bloquear.
- **`TiempoEsperaEnvio`.** La AEAT pide esperar N segundos entre envíos. Se guarda en `verifactu_submissions`; falta imponerlo en la app (`verifactu_submit::submit` compara `submitted_at + tiempo_espera` con ahora). ~20 líneas, sin dependencias.

### ADR-003 — Interfaz BDR alineada con `design.md` desde el primer PR, sin librería de componentes

**Estado:** aceptada (Ricardo, 03-11: «tiene que estar alineado desde el principio con el design.md»). Protocolo 0.2 con Bilel y David antes de F2.1 y F2.2, como exige `design.md` §11.

**Dónde está `design.md`.** En el repo `emprendurias-bdr/bdr-ui`, todavía **sin fusionar**: PR #1 (v1.2), PR #2 (v1.3, movimiento y puzle) y PR #4 (propuesta v1.4). `bdr-ui/SUITE_PLAN_2026-11-02.md` ya decidió (Ricardo, 02-11) **copiar** `tokens.css`, `bdr.css` y `motion.css` con la versión en un comentario, y publicar `@bdr/ui` 1.0 como paquete en la Ola 2. Requisito previo: fusionar PR #1 y #2 de `bdr-ui` (tarea 0.1 del SUITE_PLAN); si no, F2.1 copia de la rama de PR #2 y anota el commit.

**Qué significa «alineado desde el principio» en cada PR de F2:**

- F2.1 copia **tal cual** `tokens.css` (Anexo A), `motion.css` (Anexo B) y el script anti-parpadeo de `design.md` a `src/styles/bdr/`, con `/* bdr-ui design.md v1.3 · commit <sha> */`. Cero valores propios.
- Fuentes Host Grotesk y Geist Mono: los `.woff2` ya están en el repo (`docs/mockups/_assets/fonts/`, con licencia OFL); se mueven a `src/assets/fonts/`. Sin npm. Pasa por §0.2 porque `design.md` §4.7 lo exige.
- Iconos (`design.md` §4.9: Lucide, trazo 1,75): los trazos de Lucide se copian en `src/components/Icon.tsx`, que ya existe en PR #7. Sin `lucide-react`.
- Componentes con los **nombres exactos** de `design.md` §7 (`Button`, `StatusChip`, `DataTable`, `ConfirmDialog`, `Stepper`, `DocPreview`…), cada uno con su comentario de cabecera (§0.3), para que pasar a `@bdr/ui` 1.0 sea cambiar imports.
- Textos en `src/i18n/es.ts` desde el primer componente (§8).
- Cada pantalla pasa la lista de §12 en los 4 modos antes de pedir revisión.

**Conflicto resuelto en `design.md` (Ricardo, 03-11: 5 pasos).** El §10 fija para CumpleFactura un `Stepper` de 6 pasos: Emitida → Registro → XML → **Firmando** → Enviada → Aceptada. PR #7 envía sin firma XAdES (RD 1007/2023 art. 16.3), así que «Firmando» no ocurre nunca, y §7.8 prohíbe colorear un paso que no ha ocurrido. Cambiado en `design.md` v1.4 (rama del PR #4 de `bdr-ui`): **5 pasos** (Emitida → Registro → XML → Enviada → Aceptada); «Firmando» vuelve solo si algún día se implementa el modo «No VERI\*FACTU». F2 implementa los 5 pasos.

| Opción | Dependencias nuevas | Código | Control del diseño |
|---|---|---|---|
| **A. `src/ui/` propio con tokens de `design.md`** (lo que ya proponía el PR 3 del plan UX) | 0. Iconos: `src/components/Icon.tsx` de PR #7 (SVG inline). Tabla: HTML + CSS (sin tanstack). Diálogo: `<dialog>` nativo. Menú ⋯: `<details>`. | ~12 componentes × ≤150 líneas ≈ 1.500 líneas. | Total; `design.md` Anexo A copiado tal cual. |
| B. `@bdr/ui` 0.1.0 vendorizado como tarball | `@bdr/ui` + `@tanstack/react-table` (+ sus transitivas) y `lucide-react`. | Menos componentes propios, pero «puente» de tokens y envoltorios (PR 1 y 3 del plan UX ya lo preveían). | Parcial: el tarball no se edita desde este repo y aún no sigue `design.md`. |
| C. Esperar a `bdr-ui` publicado con `design.md` | 1 (cuando exista). | Mínimo. | Total, pero bloquea toda F2. |

**Decisión:** A, con los tokens de `design.md` copiados desde el primer día; migrar a C cuando `@bdr/ui` 1.0 exista (Ola 2 del SUITE_PLAN), cambiando imports.

---

## 3. Presupuesto de dependencias y código

| Capa | Hoy en PR #7 | Objetivo al cerrar | Regla |
|---|---|---|---|
| npm runtime | `react`, `react-dom`, `@tauri-apps/api`, `@tauri-apps/plugin-dialog` | **igual** | Nada más. Router por hash (ya existe), estado en un hook, i18n con objeto plano. |
| npm dev | `vite`, `@vitejs/plugin-react`, `typescript`, `@types/*` (3), `@tauri-apps/cli`, `@playwright/test`, `edgedriver` | igual; `chromedriver` y `axe-core` de fase-2 **no entran** | Playwright ya trae Chromium para el smoke; `edgedriver` solo para el E2E real en Windows. |
| Rust app | `tauri`, `tauri-plugin-dialog`, `rusqlite`, `serde`, `serde_json`, `chrono`, `sha2`, `uuid`, `fiscal-contract` | +1 como máximo (`qrcode`, ver F3) | QR tributario es obligación legal; un codificador propio (~400 líneas) es peor trato que un crate sin dependencias. Decisión por protocolo 0.2. |
| Rust sidecar | `native-tls`, `roxmltree`, `serde`, `serde_json`, `fiscal-contract` (+ `rcgen` test) | **igual** | Toda red sale por `aeat_client.rs`. |
| Rust contrato | `hmac`, `sha2`, `serde`, `serde_json`, `uuid` | igual | |
| Frontend | 3.416 líneas | ≤ 5.000 con toda la UI BDR | Un fichero por pantalla o componente, ≤ 300 líneas, cabecera con lógica/estado/estructura. Sin `any`. |
| `tests/regulatory/evidence/` | 116 ficheros (antes 452, 6,3 MB) | Solo `latest-*` y la última ejecución | Hecho 03-11: opción A. El gate borra los registros anteriores al terminar. |

**Evidencia del gate (decidido 03-11: opción A).** Cada vez que alguien ejecuta `npm run validate:regulatory` en Windows, el gate escribe en `tests/regulatory/evidence/` unos 14 registros con la fecha en el nombre (`20260604-142025-cargo_test.log`, `…-tauri_build.log`…) y sobrescribe unos 20 resúmenes `latest-*` (JSON, Markdown, PNG, el XML y el PDF de prueba). Había 35 ejecuciones guardadas: 452 ficheros y 6,3 MB en el repo. El gate y el ledger solo leen los `latest-*` y los registros de la **última** ejecución; los de las 34 anteriores no los usa nada. Problemas: cada PR que pasa el gate añade unos 30 ficheros al diff, y los históricos engordan el repo sin aportar. Opciones:

| Opción | Qué se sube al repo | Qué se pierde |
|---|---|---|
| A. Solo la última ejecución (recomendada) | Los `latest-*` y los registros de esa ejecución. Los anteriores se ignoran con `.gitignore` y se borran una vez. | El historial de ejecuciones antiguas (sigue en el historial de git). |
| B. Todo, como hoy | Todo. | Nada; diffs ruidosos y repo creciendo. |
| C. Nada | La evidencia se adjunta a cada PR o release como fichero. | Trazabilidad dentro del repo; el ledger tendría que leerla de fuera. |

Regla general: **antes de añadir una librería se escribe en el PR cuántas líneas ahorra, qué trae transitivamente y la frase del protocolo 0.2** («Por favor, pregúntale a Bilel y a Dabiz qué les parece este enfoque antes de aplicarlo»).

---

## 4. Fases y PR

Estimaciones en días de trabajo de Opus con revisión de Ricardo. «Bloquea» = sin eso no empieza.

### F0 — Consolidar (0,5–1 día, Ricardo)

| # | Tarea | Hecho cuando |
|---|---|---|
| F0.1 | Fusionar **PR #7** en `main` (o esta rama, que lo contiene junto con los docs del análisis y este plan). | `main` compila: `npm run build`, `validate:ui-contract`, `cargo test --workspace` (Windows). |
| F0.2 | Cerrar PR #5, #6 sin fusionar con comentario «se porta en F2, ver docs/PLAN_TRABAJO_2026-11-03.md»; cerrar PR #1, #2, #3 («absorbido» / «cantera F3-F4»). | 1 PR abierto como máximo por fase. |
| F0.3 | Archivar ramas: `git tag archive/<rama> origin/<rama>` y borrar `claude/ci`, `claude/ui-estilo-contapro`, `claude/blissful-faraday-e2wet5`, `limpieza/fusion-bilel`, `bilel/cosas-hechas-no-se-si-funciona`, `docs/ux-ui-rediseno`, `docs/analisis-repo-ux-ui-2026-10-30`. Conservar `ux/cumplefactura-fase-2` y `claude/cf-funcionalidades-estrella` hasta terminar F2 y F4. | `git branch -r` muestra `main`, 2 ramas de referencia y la de trabajo activa. |
| F0.4 | Gate Windows sobre `main`: `npm run validate:regulatory`; commit de evidencia regenerada. | Evidencia `latest-*` con fecha de noviembre. |
| F0.5 | Avisar a Bilel y David: tronco, reglas de §3 y §6, y que no se borren docs ni se regenere evidencia en PR de código. | Mensaje enviado. |

### F1 — Homologar el envío (bloquea: certificado de pruebas de Ricardo)

| # | Tarea | Hecho cuando |
|---|---|---|
| F1.1 | `cargo build -p cumplefactura-sidecar --release`; copiar un `.p12` al vault; `node tools/homolog-verifactu.mjs --xml <registro> --cert vault://certs/<id> --vault-dir <carpeta>` (solo preflight). | `status: ready`. |
| F1.2 | Mismo comando con `--enviar` contra `SistemaVerifactuPruebas`. El NIF de `ObligadoEmision` debe ser el del titular del certificado. | Evidencia redactada con `csv` o `codigo_error` de la AEAT. |
| F1.3 | Si la AEAT rechaza por esquema (`Codigo[4102]`) o por contenido, corregir en `services/verifactu.rs` con test que reproduzca el caso. | Registro `accepted` o `accepted_with_errors`. |
| F1.4 | Manifiesto de aceptación externa redactado (`tests/regulatory/fixtures/external-acceptance-manifest.example.json` como plantilla) y `npm run validate:external-acceptance`. | Gate en verde con `external_acceptance: passed`. |

No se promete comercialmente «envía a la AEAT» hasta F1.4.

### F2 — Interfaz BDR sobre PR #7 (6 PR, ~7 días, Opus; en paralelo con F1)

Sigue el orden y los criterios de `docs/PLAN_UX_UI_2026-10-30.md` (tokens → shell → componentes → pantallas) con estos cambios: base `main` tras F0; nada de `@bdr/ui` ni `lucide-react`; destino `src/sections/*` y `src/useCumpleFactura.ts` de PR #7 en vez de `features/` y `useWorkspace.ts`; los 30 comandos del contrato no cambian.

| PR | Contenido | Se rescata de fase-2 (copiar, sin dependencias) | Días |
|---|---|---|---|
| F2.1 Tokens y modos | `src/styles/tokens.css` (Anexo A de `design.md` tal cual), `type.css`, `appearance.ts`, script anti-parpadeo en `index.html`, `AppearancePanel.tsx`; preferencias en `app_settings` (ya existe; sin tabla nueva). Un único hex permitido fuera de tokens: ninguno. | `tools/verify-phase2-visual.mjs` → `tools/verify-modes-visual.mjs` (Playwright ya instalado). | 1 |
| F2.2 Shell | `src/shell/{Shell,TopBar,SideNav,ChainChip}.tsx`, `Hero.tsx`, `Toast.tsx` + store con `useSyncExternalStore`. Nav de 7 (`design.md` §5.1): Facturas · Documentos · Recurrentes · Clientes · Productos · Verifactu · Ajustes. Documentos y Recurrentes con su `EmptyState` explicativo hasta F4. | `shared/routes.ts` + `tests/ui/routes.test.mjs` (node:test). | 1,5 |
| F2.3 Componentes | `src/ui/`: Button, StatusChip + `status.ts`, Field/Select/MoneyInput/DateInput, DataTable (HTML+CSS), Card/StatCard, Callout, ConfirmDialog (`<dialog>`), Stepper, DocPreview, EmptyState, ActivityLog, SourceBreakdown, Skeleton; `src/i18n/es.ts`; galería `#/_galeria` solo en dev. | `shared/moneyFormat.ts`, `invoiceDate.ts`, `numberProposal.ts` y sus 3 tests. | 1,5 |
| F2.4 Facturas | Lista con filtros en una fila, menú ⋯, ficha `#/facturas/:id` con Stepper, DocPreview (`invoice_pdf_preview` existe en fase-2: portar el comando Rust, ~60 líneas, sin dependencias), ActivityLog. | Estructura de `InvoiceTable.tsx`, `InvoiceDetail` (nuevo). | 1,5 |
| F2.5 Editor, emisión y Verifactu | Editor partido 1fr/420 px, ConfirmDialog de emisión con «Lo entiendo», `Ctrl+Enter`, asistente de rectificativa en 4 pasos; pantalla Verifactu con el flujo real de PR #7 (Exportar XML → Comprobación previa → Enviar → Respuesta AEAT) y técnico en `<details>`. | `RectificationWizard.tsx`, `FiscalProgress` → `progress.ts` + test. | 1,5 |
| F2.6 Ajustes, primer arranque, clientes y productos | Subpáginas de Ajustes (Empresa, Series, Fiscalidad, Certificado, Copias, Avanzado); `FirstRun` a pantalla completa; Clientes y Productos como tabla + formulario lateral. | `FirstRun.tsx`, `Onboarding.tsx` (estructura). | 1 |

Pasos del Stepper Verifactu: **5**, como fija `design.md` v1.4 §10 (ADR-003). Pasos 4 y 5 solo se colorean con fila en `verifactu_submissions`.

### F3 — Cierre fiscal y local-first (4 PR, ~4 días; empieza tras F1.2)

| PR | Contenido | Dependencias | Días |
|---|---|---|---|
| F3.1 Contraseña, caducidad y espera | Según ADR-002: selector de tres opciones con «Solo durante esta sesión» por defecto; `certificate_password` en el cuerpo HMAC; llavero solo si se aprueba `keyring` por §0.2; `certificate_expires_in_days` en el preflight; `TiempoEsperaEnvio` impuesto en la app. Tests en `handlers`, `vault` y `verifactu_submit`, incluido uno que comprueba que la contraseña no aparece en respuestas, logs ni SQLite. Actualizar `sidecar/ARQUITECTURA.md` §Contrato. | 0 (+1 si llavero) | 2 |
| F3.2 QR tributario y PDF | QR en PDF y en la ficha: obligatorio en la factura (RD 1007/2023 art. 6; especificaciones en Orden HAC/1177/2024). Citar artículo y versión desde `C:\03 LEGISLACION` antes de implementar, como exige la regla de oro. Rescatar `services/qr.rs` y el PDF de `claude/cf-funcionalidades-estrella` sin `image`: solo matriz → vectores PDF. | `qrcode` (sin features) **o** codificador propio; protocolo 0.2. | 1 |
| F3.3 Cola y reintento manual | `verifactu_submissions.status = transport_error` → la lista muestra «Sin confirmar» y botón «Reintentar» que repite preflight + envío **solo a petición del usuario** (sin reintentos automáticos, como exige la spec). Sin tabla nueva. | 0 | 0,5 |
| F3.4 Restore real de copia | Hoy `backup_restore` solo valida. Flujo: verificar → copia previa → sustituir fichero con la app cerrada a datos → reabrir → verificar cadena. ConfirmDialog con motivo. | 0 | 1 |

### F4 — Comercial (después de F3: «primero lo fiscal siempre», Ricardo 03-11)

Especificación completa para Bilel y David: **`docs/ESPEC_DOCUMENTOS_Y_RECURRENTES.md`** (qué es cada documento, reglas, modelo de datos, estados, comandos, flujos, pantallas, criterios de aceptación y reparto). Hasta que se implementen, Documentos y Recurrentes se ven en el menú con un `EmptyState` que explica qué son y cómo funcionarán (texto en §6 de esa especificación).


Rebasar solo backend, renumerando la migración 009 → 010 y adaptando a la DB dividida de PR #7: cobros y vencimientos, recurrentes (borrador al abrir), presupuestos → factura. **Email SMTP no entra** (`lettre` + `keyring`): en su lugar «Enviar por correo» abre el cliente del sistema con el PDF guardado (`mailto:` + `plugin-dialog`), cero dependencias; se revisa si los usuarios lo piden. Cada entidad es un PR con su pantalla en `src/ui/`.

---

## 4b. Ronda de UX/UI (03-11): decisiones de Ricardo y siguiente ronda

**Dónde estamos.** Backend de F3 y F4 integrado en `claude/adoring-brown-zw9671` (127 tests). La interfaz rediseñada con `design.md` está terminándose en paralelo; una revisión de capturas provisionales encontró 7 fallos que ya se le han pasado al agente (chip de cadena sin evidencia, dos acciones principales por pantalla, chip «Recomendada» estirado, opción del llavero sin aspecto deshabilitado, campo de contraseña a todo el ancho, etiqueta del hero de Recurrentes, avatar vacío, serie incoherente entre hero y barra).

**Decisiones (Ricardo, 03-11):**

| # | Tema | Decisión |
|---|---|---|
| D1 | PDF de factura | Plantilla con logo y tabla, sin librerías nuevas: cabecera con logo, emisor y cliente, tabla de líneas, totales, QR y leyenda, observaciones. Que el PDF se parezca a `DocPreview`. |
| D2 | Observaciones | Campo «Observaciones» en la factura (migración aditiva). Pasa desde presupuesto, proforma, albaranes y plantilla recurrente; sale en el PDF; **no** entra en huella ni XML. |
| D3 | Origen de recurrentes | `invoice_list` y la ficha dicen «Recurrente · <plantilla> · <periodo>» en los borradores generados. |
| D4 | Datos de ejemplo | Solo en desarrollo (`import.meta.env.DEV`), nunca en la app instalada. |
| D5 | `FechaOperacion` en recapitulativas | No se rellena en las recapitulativas; las fechas de cada albarán van en las líneas del PDF. Las facturas normales no cambian (salida byte a byte igual). **Pendiente**: confirmar con `C:\03 LEGISLACION` y la FAQ de la AEAT antes de homologar. |
| D6 | Proforma pagada | El anticipo se registra como **cobro**. Trae el módulo de cobros de `claude/cf-funcionalidades-estrella` (tabla de cobros, vencimiento), adaptado: el cobro de la proforma pasa a la factura al convertir. |
| D7 | Series de documentos | Configurables en Ajustes › Series, con `P`, `PF`, `AL` por defecto. |
| D8 | Albarán sin precios | Se puede facturar: el borrador marca esas líneas «pendiente de precio» y la emisión se bloquea hasta ponerlo. Las líneas de texto «Albarán AL-… · fecha» no cuentan. |

**Siguiente ronda (orden):**

| Paso | Qué | Quién |
|---|---|---|
| R1 | Terminar e integrar la interfaz; capturas con datos en 4 modos; publicar una página de revisión con todas las pantallas | Agente UI + integración |
| R2 | Backend de D1, D2, D3, D5, D6, D7, D8 (migración 012, PDF con logo, cobros, series de documentos, marca de precio pendiente) | Agente backend, en paralelo con R1 |
| R3 | Interfaz de D1–D8 sobre la integración de R1 y R2 | Agente UI |
| R4 | Revisión de Ricardo sobre la página de capturas; lista de ajustes visuales; una pasada de correcciones | Ricardo + Opus |
| R5 | Visto bueno de Bilel y Dabiz (protocolo `design.md` §0.2: tokens, shell, fuentes, `qrcode`); gate completo en Windows; fusión en `main` | Ricardo, Bilel, Dabiz |
| R6 | Homologación con la AEAT de pruebas (certificado de Ricardo) | Ricardo |

**Estado a 04-11:** R1, R2 y R3 hechos e integrados en `claude/adoring-brown-zw9671`. Rust: 142 tests; interfaz: 40 tests, 56/56 comandos conectados, smoke del navegador en verde; E2E con la ventana real de Tauri en Linux en verde (13 pasos, sidecar real). R4: Ricardo marcó 15 de 16 pantallas como «Bien» en la página de revisión, sin notas; la segunda versión (22 pantallas) está publicada. Quedan R5 (visto bueno de Bilel y Dabiz, gate completo en Windows, fusión en `main`) y R6 (homologación). Pendientes menores: vista del logo en pantalla (necesita el protocolo `asset` de Tauri), `FechaOperacion` de las recapitulativas por confirmar con la norma, estado de cobro de rectificativas negativas.

Fuera de esta ronda, para decidir después: email (hoy `mailto:`), importación de clientes, productos y facturas, facturas simplificadas o modo mostrador, intracomunitarias y VIES, y las decisiones abiertas de `design.md` §13 (modo por defecto, texto del panel ⚙).

## 5. Riesgos

| Riesgo | Señal | Mitigación |
|---|---|---|
| La AEAT rechaza el XML en F1 por detalles de contenido (NIF, series, `TipoHuella`). | `Codigo[41xx]` en la respuesta. | F1.3 con test por cada código visto; no tocar huellas sin oráculo byte a byte (PR #7 lo hizo). |
| Bilel o David siguen en ramas desde el commit inicial. | PR con cientos de ficheros y `db/mod.rs` monolítico. | F0.5 y revisión de que cada PR sale de `main` posterior a F0.1. |
| «Mínimo código» se convierte en código sin tests. | PR de UI sin `tests/ui` ni capturas. | Verificación por PR (§6) obligatoria; capturas en 4 modos. |
| La contraseña del certificado acaba en logs o en SQLite. | `grep -r password` fuera de `vault.rs` / memoria. | Secret scan del gate + test que comprueba que la respuesta del sidecar no contiene la contraseña. |
| Evidencia regulatoria genera ruido en todos los PR. | Diffs de 60 ficheros `.log`. | Decisión §3 sobre versionar solo `latest-*`. |

---

## 6. Verificación por PR (todo en verde antes de pedir revisión)

```
npm run build
npm run validate:ui-contract
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace            # en Windows; en Linux sin escritorio: -p fiscal-contract -p cumplefactura-sidecar
npm run validate:sidecar-smoke    # si se tocó sidecar/ o crates/
node tools/verify-modes-visual.mjs   # si se tocó UI (desde F2.1)
npm run validate:regulatory       # Windows, antes de fusionar en main
```

Formato de PR: título `<fase>(<área>): <qué>`, cuerpo con objetivo, ficheros, decisiones, capturas, comandos ejecutados con resultado, pendientes. Un PR por fila de las tablas de §4. Nunca dos filas en un PR.

---

## 7. Preguntas para Ricardo

| # | Pregunta | Respuesta (03-11) |
|---|---|---|
| 1 | ¿PR #7 como tronco? | Sí. Fusionado en `main`. |
| 2 | ¿Librería de componentes? | Alineado con `design.md` desde el principio (ADR-003). |
| 3 | ¿Dónde se guarda la contraseña del certificado? | La elige el cliente; por defecto, solo durante la sesión (ADR-002). |
| 4 | ¿Documentos y Recurrentes en el menú? | Visibles con explicación; especificados para Bilel y David. |
| 5 | ¿Qué evidencia se versiona? | Solo la última ejecución (opción A). Hecho. |
| 6 | ¿Fiscal o comercial primero? | Fiscal siempre. |
| 7 | ¿Stepper de 5 o 6 pasos? | 5 pasos. Cambiado en `design.md`. |
