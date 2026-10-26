# CumpleFactura — fase 2, pantallas

Fecha: 2026-10-26. Rama `ux/cumplefactura-fase-2`, creada desde main `a2d429c` y apoyada en la fase 1 para revisión encadenada. No fusionar. La fase permanece abierta mientras no pasen todos sus requisitos.

## Implementado

Tabla con filtros, fecha civil nativa, base persistida y totales de la página; editor partido, número propuesto por Rust, confirmación con «Lo entiendo», PDF real de solo lectura y vista provisional invalidada al editar; asistente de rectificativa; estado Verifactu de cuatro pasos y primer arranque de cuatro pasos. Se conservan accesibles las herramientas y exportaciones anteriores.

El envío y la respuesta se muestran únicamente al coincidir factura, registro, huella, exportación y XML con una invocación externa confirmada. Una prevalidación nunca confirma envío. CSV obligatorio para mostrar aceptación. Tras perder una confirmación de emisión se pide revisar la lista y se bloquea el reintento automático; doble clic no duplica la operación en curso.

`useWorkspace.ts` conserva sus 39 invocaciones y argumentos originales; añade exclusión de guardados concurrentes e invalida respuestas de borrador/certificado de otra versión de los parámetros. Los cálculos y parsers originales no cambian; `cents` pasa al formateador compartido sin dividir en coma flotante. Cantidades no representables con seguridad bloquean el guardado y la emisión. No hay migraciones ni cambios de numeración, huellas o XML. La revisión independiente detectó dos carreras (borrador tardío y certificado obsoleto), corregidas con reproducción RED→GREEN. La base añadida al resultado de `invoice_list` queda excluida de la serialización original de auditoría/exportación.

El nuevo comando `invoice_pdf_preview(invoiceId)` solo lee la factura persistida y devuelve su PDF (máximo 2 MiB). El cliente no proporciona rutas. El generador conserva exactamente los bytes del fixture original: SHA-256 `981c79acf60784a164a30ee8633d0a8d73b6f0a0f8b04b80210c71e597daeb06`.

## Comprobaciones

| Comprobación | Evidencia / alcance |
|---|---|
| Build, contrato UI, preservación de 39 invocaciones | Correctos en local |
| Tests puros de interfaz | 25 correctos: 19 de estados/importes/fecha/numeración/rutas y 6 de WebDriver heredados de fase 1 |
| Rustfmt y Rust Linux | 68 tests correctos; preferencias, PDF, SQLite, huellas, XML y núcleo |
| XSD y core E2E | Correctos; logs y `native-core/` |
| Flujo de navegador | Correcto con mock Tauri; pérdida de ACK de emisión/abono, doble clic, PDF obsoleto y configuración |
| Capturas y axe | `browser-results.json`: 76 casos, 1024×700 / 1440×900, claro/oscuro, tablas 40/48 px; resultados y revisiones incompletas conservados |
| Smoke anterior | Adaptado a navegación nueva manteniendo comprobaciones de dominio; `smoke/` |
| `npm run validate:regulatory` completo | Bloqueado en Linux: el runner exige `cargo.exe`; además depende del corpus normativo y evidencia sidecar externos |
| Ventana real Tauri Windows de fase 2 | Pendiente de CI; el éxito de fase 1 no se atribuye a este cambio |

La ejecución Windows de fase 1 [40337474642](https://github.com/emprendurias-bdr/cumplefactura/actions/runs/40337474642) pasó Rust/XSD/núcleo y la ventana real con comandos Rust. No efectuó ninguna llamada a la AEAT. Los fixtures de navegador de esta fase son sintéticos y no acreditan envío ni aceptación real.

## Límites que impiden declarar la fase cerrada

- El PDF original todavía usa su diseño anterior y no incluye QR VERI*FACTU; la interfaz lo indica. La vista provisional sigue BDR, pero no se presenta como PDF fiscal final.
- El abono heredado tiene base fija −10 €, IVA −2,10 € y total −12,10 €; se muestran antes de confirmar. No se ha cambiado esa lógica fiscal ni se afirma que el importe sea configurable.
- Cola, envío automático, persistencia de respuestas y modo NO VERI*FACTU pertenecen a fase 3. Los controles actuales no simulan dichas capacidades.
- Certificado, caducidad y conexión no se inventan; los campos ausentes permanecen sin comprobar.
- Publicación privada `@emprendurias-bdr/ui` pendiente de acceso al repositorio/Packages. Se mantiene el tarball local temporal. Preferencias de cuenta y backend web pendientes de fase 5.
- Axe conserva comprobaciones incompletas. El logo compartido tiene un `aria-label` en un span sin rol; debe corregirse en el paquete común. El contraste de algunas líneas de los modales requiere inspección manual por solapamiento visual, y el visor PDF nativo queda fuera del DOM analizado. Cero infracciones detectadas no acredita conformidad WCAG completa.

La matriz de requisitos y las diferencias respecto a las maquetas están en `../../replica/phase2/parity.md`. Ningún PR se fusiona desde este trabajo.
