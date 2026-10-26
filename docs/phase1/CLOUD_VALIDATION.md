# Validación de la continuación de fase 1

Fecha: 2026-10-26. La fase sigue abierta; este informe no acredita presentación ni aceptación ante la AEAT.

## Resultados locales

| Comprobación | Resultado |
|---|---|
| `npm run build` | Correcto |
| `npm run validate:ui-contract` | Correcto |
| `node tools/verify-refactor-contract.mjs` | 39 invocaciones originales preservadas |
| Prueba de rutas | 1 correcta |
| `node tools/verify-phase1-browser.mjs` | 36 casos, cero infracciones axe detectadas |
| `cargo fmt --all --check` | Correcto después de formatear preferences.rs |
| `cargo test --locked` | 67 correctas en Linux; incluye preferencias SQLite y núcleo fiscal local |
| `npm run validate:core-e2e` | Correcto: SQLite, huella, XML con XSD, PDF y exportaciones locales |
| `npm run validate:verifactu:xsd` | Correcto para el fixture |
| `npm run validate:regulatory` | Bloqueado al resolver `cargo.exe` en el runner Windows |
| `npm run validate:secret-scan` en el workspace | Falla por `tokens = json.load(fh)` en el código Python público de Replica, no versionado en este PR |
| Escáner sobre un `git archive HEAD` limpio | Correcto, cero hallazgos; no incluye los archivos locales de preparación |

Los logs y los artefactos sintéticos del núcleo están en `native-core/`. Se conservaron las evidencias históricas de `tests/regulatory/evidence/`. Los resultados no demuestran uso de certificados, envío SOAP ni aceptación de la AEAT.

## Cambios derivados de las comprobaciones

- El compilador no encontraba `src-tauri/icons/icon.png`. Los iconos nativos se generaron desde el SVG oficial BDR ya presente en `public/favicon.svg`, con `npx tauri icon public/favicon.svg`, conservando los archivos de escritorio. La compilación y los tests pasan tras añadirlos.
- El nuevo módulo de preferencias necesitaba formato Rust; el cambio es exclusivamente de formato.
- La revisión de navegador usa `/usr/bin/chromium` cuando está instalado y Chromium de Playwright en otros entornos.
- `.github/workflows/phase1-checks.yml` define UI/navegador en Linux y Rust/SQLite/XSD/núcleo en Windows. Sus jobs se presentan como comprobaciones parciales: no sustituyen el gate completo ni el E2E de la ventana.

## Entorno

Rust 1.99.1, PowerShell 7.5.2, GTK 3.24.49, WebKitGTK 2.52.6 y libsoup 3.6.5. Herramientas y bibliotecas instaladas bajo `/workspace`, sin modificar el sistema. El archivo descargado de PowerShell se verificó contra `hashes.sha256` de su release oficial; los paquetes Debian se resolvieron con metadatos firmados.

En este entorno se cargan las rutas privadas con `source /workspace/.setup/tauri-env.sh`. Es configuración local, no una dependencia del producto. En Windows se utilizan las herramientas nativas del job.

## Revisión y límites pendientes

Una revisión independiente del diff de esta continuación no encontró incidencias confirmadas. Se comprobaron formatos y aspecto del PNG; el aspecto del icono en una ventana o instalador sigue pendiente. La revisión no ejecutó Windows ni GitHub Actions: los logs locales son evidencia Linux, y los jobs remotos deben verificarse por separado. Tras subir el commit 9735485, GitHub inició ambos jobs; no se presume su resultado. Se usa solo el evento del PR para evitar duplicar la ejecución al subir una rama con PR abierto. El refactor anterior ya tuvo su propia revisión.

Las pruebas de núcleo y XSD de Windows pasaron en la ejecución 40301828927. La prueba adicional de ventana falló en 40326481501 y 40329432130 al conectar con WebDriver: los tres prerrequisitos estaban disponibles y el error era `fetch failed`. Se reemplazó la espera fija de 1,5 segundos por `/status` de W3C y se guardan causa y salida del driver cuando falla. Tres tests RED→GREEN comprueban disponibilidad tardía, timeout y salida del proceso. Esto no demuestra aún la corrección del fallo real. Quedan el gate regulatorio completo, la ventana Tauri, la publicación del paquete privado y las preferencias de cuenta web. El falso positivo de Replica se conserva visible: no se ha añadido una exclusión ni cambiado las reglas del escáner.
