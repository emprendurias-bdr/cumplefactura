# CumpleFactura — fase 1 en curso

Rama: `ux/cumplefactura-fase-1`, desde main a2d429c. No fusionar. El trabajo continúa repo por repo con la UI compartida vendorizada temporalmente; la publicación privada ya no bloquea la implementación local.

## Implementado

- App dividido en shared/types, helpers, controlador de estado y features invoices/customers/products/verifactu/settings/onboarding.
- Shell BDR y nueve áreas por hash; documentos comerciales identificados como todavía no disponibles hasta fase 4.
- Tokens, fuentes locales, icono BDR y colores semánticos desde @bdr/ui.
- Dependencia temporal `file:vendor/emprendurias-bdr-ui-0.1.0.tgz`, build verificado del paquete privado pendiente de publicación. Sustituirla después por `npm:@emprendurias-bdr/ui@0.1.0`. No se publicó nada en npmjs.
- Preferencias de apariencia controladas por el usuario, con carga inicial protegida ante cambios del usuario y escrituras serializadas. Dos comandos nativos guardan JSON bajo ui_preferences en la tabla existente, sin migración ni alteración de los ajustes fiscales.
- La web sin backend conserva una preferencia temporal e informa de la limitación; no se inventan sesión de cuenta ni capacidad de emisión web.
- Sin estados de conexión, envío o aceptación inventados; aviso explícito de cola aún no disponible.
- Contrato de UI inspecciona ahora todos los módulos, preservando sus checks originales. 39 invocaciones nativas y formas de argumentos coinciden con la línea base; la revisión confirmó 121 declaraciones originales sin cambios semánticos, incluidas las monetarias.

## Verificación

Build, contrato de UI y smoke original con mock Tauri pasan. En la continuación también pasan `cargo fmt --all --check`, `cargo test --locked` (67 pruebas Linux, incluida la preferencia SQLite), `validate:core-e2e` y `validate:verifactu:xsd`. Las cuatro pruebas limitadas por `cfg(target_os = "windows")` requieren el job Windows; el total Linux no las incluye. Comprobación de rutas: el salto al contenido no cambia la pantalla. Se capturan y analizan nueve áreas en claro/oscuro a 1024×700 y 1440×900; los resultados exactos están en browser-results.json. No confundir la inspección del mock con pruebas nativas o envío AEAT.

La revisión encontró y se corrigieron pérdida de mensajes en rutas secundarias, salto al contenido interpretado como ruta, contraste de enlaces Menta sobre blanco, falta de nombres de campos, carrera de preferencias y densidad sin efecto en listas. Los registros de validación conservan fallos iniciales; no se filtran ni se presentan como verdes.

## Bloqueos para cerrar la fase

- PowerShell 7.5.2 y Rust 1.99.1 ya instalados en el entorno privado del workspace. `npm run validate:regulatory` sigue bloqueado: su runner busca `cargo.exe` y `npm.cmd`. No se ha cambiado ni rebajado ese gate.
- El test de preferencias SQLite y el núcleo E2E ya pasan en Linux. La compilación detectó la ausencia de `icons/icon.png`; se generaron iconos de escritorio desde `public/favicon.svg` mediante la CLI de Tauri. El job Windows de Rust/SQLite/XSD/núcleo pasó en la ejecución 40301828927. La prueba adicional de ventana Tauri se ejecutó y falló en 40326481501 y 40329432130: el preflight encuentra el ejecutable y los drivers, pero la conexión inicial de WebDriver falla. Se sustituye la espera fija de arranque por el endpoint W3C de disponibilidad y se amplía el diagnóstico; el resultado real posterior aún debe comprobarse.
- Publicación privada @emprendurias-bdr/ui pendiente; el consumidor usa la instantánea local para ser reproducible.
- Persistencia de cuenta web y backend web quedan pendientes; no simularla con almacenamiento de sesión.
- El escáner de secretos del workspace devuelve un falso positivo sobre `tokens = json.load(fh)` en la copia local no versionada de Replica. No se ha excluido esa carpeta ni debilitado el escáner. Pasa sobre un `git archive HEAD` limpio del PR; la CI escanea ese mismo contenido versionado, y su resultado se verifica aparte.
- Este PR debe mantenerse en borrador hasta verificar los gates exigidos y corregir cualquier resultado pendiente. Los logs y artefactos nuevos están en `native-core/`; no se sobrescribió la evidencia histórica de `tests/regulatory/evidence/`.

Resultado final automatizado: 36 casos de nueve áreas a 1024×700/1440×900 en claro y oscuro, cero violaciones axe detectadas; build, contrato y smoke con mock pasan. Los tres selectores de rectificativa y campos técnicos mantienen ahora nombres visibles. El contrato normaliza únicamente espacios en sus guards para tolerar formato JSX multilínea, sin quitar comprobaciones.

Diagnóstico concreto de 40333116803: el runner usa WebView2 131.0.2903.86, pero la primera ruta de EdgeDriver era de la versión 156. Se detecta ahora el runtime WebView2 (no el navegador Edge), se usa caché por versión, se prioriza la descarga compatible y se comprueban los tres primeros componentes de versión. Siete tests Node pasan, incluidos disponibilidad y compatibilidad. El E2E real debe repetirse; este arreglo no se declara probado hasta ese resultado.
