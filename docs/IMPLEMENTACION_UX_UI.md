# Implementación del rediseño UX/UI — CumpleFactura

Guía para la sesión que implemente el rediseño. Diseño: `docs/UX_UI.md`. Maquetas: `docs/mockups/*.png` (y `.html`; tokens en `docs/mockups/_assets/app.css`). Fuente de las maquetas: `contapro/docs/mockups/_fuente/`.

## Antes de empezar

1. Lee `docs/UX_UI.md`, `CLAUDE.md`, `docs/revisar/PRODUCT_BRIEF_CUMPLEFACTURA.md`, `MODULE_CONTRACT.md` y `REGULATORY_TEST_PLAN.md`.
2. Rama nueva desde `main`; un PR por fase.
3. **No cambies** la numeración (la asigna Rust al emitir), el encadenado de huellas ni el formato XML sin pasar el gate regulatorio.
4. Comprobación por fase: `npm run build`, `npm run validate:ui-contract`, `npm run validate:regulatory`, `npm run validate:browser-smoke` y `npm run tauri:dev` revisando claro/oscuro a 1024×700 y 1440×900.

## Decisiones que ya están tomadas

- Marca BDR v1.0; Violeta solo como color de producto; acciones en Menta/Pizarra; Host Grotesk + Geist Mono locales.
- **Firma y envío desde el primer momento.** Modo VERI*FACTU por defecto: los registros no se firman (FAQ AEAT); se remiten con certificado de la empresa o de su representante. Modo NO VERI*FACTU (opcional): firma de registros y conservación, sin envío.
- **Online y offline.** Sin conexión se sigue emitiendo; registro en cola con `Incidencia = S`, reintento automático (cada 60 s, con control de flujo de la AEAT) hasta recibir respuesta; reenviar lotes sin confirmación.
- Estado fiscal de 4 pasos: Emitida → Registro de alta → Enviada → Respuesta (Aceptada · Aceptada con errores · Rechazada). Nunca rellenar un paso sin confirmación.
- Tema según sistema + ajuste del usuario; densidad cómoda por defecto, ajustable.
- Stack: se queda Vite + React + Tauri 2 (la misma SPA sirve para la web en Vercel). UI común en `@bdr/ui` (repo `emprendurias-bdr/bdr-ui`, ver guía de ContaPro, fase 0).

## Fase 1 — Partir `App.tsx` y aplicar marca

| Tarea | Dónde |
|---|---|
| Estructura `src/features/{invoices,customers,products,verifactu,settings,onboarding}` + `src/shared/` (tipos, cliente Tauri) | hoy todo en `src/App.tsx` (~2.300 líneas) |
| Router (p. ej. `react-router`) con las 9 áreas de `UX_UI.md` (las de documentos comerciales pueden quedar vacías hasta la fase 4) | `src/main.tsx` |
| `@bdr/ui/tokens.css` + fuentes; retirar verdes `#1d5f4a` e Inter de `src/styles.css` | `src/styles.css` |
| `AppShell` con empresa/periodo e indicador de conexión AEAT y cola | shell |
| Ajustes: tema y densidad persistidos en SQLite (escritorio) / preferencias de cuenta (web) | `features/settings` |
- Hecho cuando: misma funcionalidad que hoy, `validate:ui-contract` en verde (actualizar el contrato si cambia la estructura), sin regresiones en el gate regulatorio.

## Fase 2 — Pantallas (maquetas 1–5)

1. **Facturas**: filtros (serie, estado, envío AEAT), columna Verifactu de 4 pasos con texto, totales. Maqueta 1.
2. **Editor**: pantalla partida con vista previa PDF y hueco del QR; número propuesto «Se numerará … al emitir». Maqueta 2.
3. **Emitir**: `ConfirmDialog` con consecuencias (número y QR, registro encadenado, envío o cola, no editable). Maqueta 3.
4. **Verifactu**: aviso de conexión, pasos con CSV, cadena de registros con estado de envío e integridad, certificado (caducidad, entorno). Maquetas 4 y 5.
5. **Rectificativa**: asistente con propuesta R1–R5 y método como sugerencia.
6. **Primer arranque**: 4 pasos (empresa, fiscalidad, serie, certificado + carpeta).

## Fase 3 — Envío real y cola offline

| Tarea | Notas |
|---|---|
| Cola persistente de registros en SQLite (`pending`, `sent`, `accepted`, `accepted_with_errors`, `rejected`, `incident`) | El orden de la cadena no cambia aunque el envío se retrase |
| Cliente SOAP en Rust (o el sidecar existente) con TLS mutuo usando el certificado del almacén del sistema | Ya existe `verifactu_submit_sidecar_preflight/invoke` y endpoint de pruebas `prewww1…/VerifactuSOAP`: partir de ahí |
| Reintentos con `Incidencia = S` y respeto del tiempo de espera que devuelve la AEAT | Ver FAQ AEAT «sistemas VERI*FACTU» |
| Guardar respuesta (CSV, errores) y mostrarla en la factura | Estados en `Chip` |
| Entorno Pruebas/Producción visible siempre | Chip en Verifactu |
| Modo NO VERI*FACTU: firma de registros (XAdES) y sin envío | Detrás de un ajuste, con aviso claro |
| Tests: sin conexión, caída a mitad de lote, respuesta con errores, rechazo, reenvío idempotente | `tests/regulatory/` |

## Fase 4 — Documentos comerciales y recurrentes

| Tarea | Notas |
|---|---|
| Tipos `quote` (presupuesto), `proforma`, `delivery_note` (albarán) con series propias y estados (borrador, enviado, aceptado/rechazado, convertido) | No generan registro VERI*FACTU; el PDF dice «Documento sin valor fiscal» salvo el albarán, que dice «Albarán» |
| Conversión con un clic: presupuesto → proforma → albarán → factura, guardando el enlace entre documentos | La factura copia líneas; el número fiscal se asigna al emitir |
| Factura recapitulativa desde varios albaranes del mismo cliente y mes | Selector de albaranes pendientes de facturar |
| Rectificativa (abono) = nota de crédito; asistente R1–R5 existente | Etiqueta «Rectificativa (abono)» |
| Recurrentes: plantilla + periodicidad; generación **solo en servidor y con conexión**, idempotente por `cliente + plantilla + periodo`; si falla o no hay conexión, borrador pendiente con aviso | Tests: doble ejecución del programador no crea dos facturas |

## Fase 5 — Versión web y emisión sin conexión

- Misma SPA en Vercel + Supabase. El navegador no puede llamar a la AEAT con certificado del cliente: remite el backend de BDR **como colaborador social (objetivo) o con apoderamiento de cada empresa (alternativa)**, con el certificado de BDR en KMS/HSM. Registrar el apoderamiento/autorización por empresa y mostrarlo en Verifactu › Conexión y certificado.
- **Emisión sin conexión** (maqueta 6): permiso `offline_issuer` asignable a una sola persona por empresa; serie exclusiva; límites (horas y nº de facturas sin sincronizar, importe máximo); sin rectificativas, anulaciones ni recurrentes sin conexión. Los demás usuarios sin conexión solo crean borradores.
- Cola local: SQLite en escritorio; IndexedDB (PWA) en web. Al reconectar: subir facturas, validar que la serie exclusiva no tiene huecos ni duplicados, remitir en orden de la cadena.
- Tests: dos usuarios sin conexión a la vez (solo uno puede emitir), límite superado (bloquea emitir y lo explica), reconexión con cola larga, caducidad del permiso.

## Prompt sugerido para la sesión de implementación

```
Trabaja en emprendurias-bdr/cumplefactura. Lee docs/UX_UI.md y docs/IMPLEMENTACION_UX_UI.md.
Implementa la fase <N> en una rama nueva desde main y abre un PR al terminar.
No cambies numeración, encadenado ni XML sin pasar npm run validate:regulatory.
Usa las maquetas de docs/mockups como referencia visual y cierra con build, validate:ui-contract y revisión en tauri:dev (claro/oscuro).
```
