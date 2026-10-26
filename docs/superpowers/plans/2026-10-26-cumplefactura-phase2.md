# CumpleFactura fase 2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pantallas de facturas, editor, confirmación, Verifactu, rectificativa y primer arranque según las maquetas 1–5, conservando los comandos fiscales.
**Architecture:** Vistas React sobre el Workspace existente. Proyección fiscal pura que exige evidencia de la misma factura, registro y huella; componentes compartidos @bdr/ui. Los formularios y funciones nativas se conservan y se reorganizan.
**Tech Stack:** React 19, TypeScript, Vite, Tauri 2, @bdr/ui vendorizado temporalmente.
**Spec:** docs/UX_UI.md, docs/IMPLEMENTACION_UX_UI.md fase 2, docs/mockups/cumplefactura-{1,2,3,4,5}-\*.{png,html}.

## Global Constraints

- Violeta solo producto; acciones Menta/Pizarra; Host Grotesk y Geist Mono locales; Sol en una palabra por pantalla.
- Claro/oscuro/sistema; cómoda 48 px por defecto, compacta 40 px ajustable; controles táctiles ≥44 px.
- No cambiar lógica monetaria, numeración, huellas, XML, migraciones ni RLS.
- Ningún paso de envío/aceptación se confirma sin respuesta real vinculada a la factura. Datos ausentes se indican; no copiar valores de las maquetas.
- La firma/envío automático y cola pertenecen a fase 3; el aviso de emisión debe explicar la capacidad actual.
- Rama creada desde origin/main a2d429c y avance local rápido a cc4341e para consumir fase 1. PR dependiente de ux/cumplefactura-fase-1; no fusionar.
- El gate completo y publicación privada pendientes mantienen los PR en borrador. Las comprobaciones parciales no equivalen a cerrar la fase.

## Review Focus

- Respuesta de otra factura o huella antigua: no promover envío/aceptación.
- Doble clic en confirmar: un solo comando mientras está pendiente.
- Editar líneas después de guardar: invalidar borrador/confirmación, sin emitir datos obsoletos.
- Paginación y empresa: totales limitados a las filas visibles; no presentar sumas parciales como totales de empresa.
- Datos no expuestos por el backend (fecha/base/certificado/PDF): indicar ausencia, sin inventarlos.

### Task 1: Proyección fiscal y tabla

**Files:** src/features/verifactu/progress.ts, FiscalProgress.tsx; src/features/invoices/InvoiceTable.tsx; tests/ui/fiscal-progress.test.mjs.
**Interfaces:** consume InvoiceSummary, FiscalRecordSummary[], VerifactuSubmitSidecarInvocation|null; produce fiscalProgress(invoice, records, invocation) con cuatro pasos {label,confirmed}, responseLabel y CSV solo si corresponde a id/huella y hay llamada externa real.

- [x] RED: tests de borrador, alta coincidente, registro ajeno, respuesta sin llamada externa, huella antigua, respuesta Correcto con CSV y rechazo con texto.
- [x] Implementar proyección conservadora; tabla semántica, filtros nativos existentes y filtro de envío local identificado como tal; paginación intacta.
- [x] GREEN: node --experimental-strip-types --test tests/ui/\*.test.mjs; build.
- [ ] Commit de tabla/proyección y evidencia.

### Task 2: Editor y confirmaciones

**Files:** src/features/invoices/InvoiceWorkspace.tsx, InvoicePreview.tsx, InvoiceFlow.tsx, InvoiceEditor.tsx; src/App.tsx; tests UI de navegador.
**Interfaces:** consume Workspace y los cuatro pasos de Task 1; produce navegación lista/editor, ConfirmDialog de emisión y rectificativa, sin modificar invoke ni payloads.

- [x] RED: navegador debe abrir editor con Nueva factura/N, mostrar número propuesto, impedir emisión sin Lo entiendo y sin doble invocación; editar línea invalida borrador.
- [x] Formulario/vista previa con datos actuales, etiqueta de vista previa provisional y hueco QR sin código inventado; exportación PDF conserva comando nativo y límites visibles.
- [x] Rectificativa con pasos escenario → sugerencia R1–R5/I–S → revisión → confirmación; la causa jurídica la decides tú.
- [x] GREEN: build, contratos, navegador y comandos nativos preservados.
- [ ] Commit de editor/confirmaciones.

### Task 3: Verifactu y primer arranque

**Files:** src/features/verifactu/VerifactuScreen.tsx; src/features/onboarding/FirstRun.tsx; src/features/customers/CustomerCompanyForms.tsx; src/shared/SuiteShell.tsx; src/styles.css.
**Interfaces:** consume Task 1 y los formularios existentes; produce cuatro pasos de alta (empresa, fiscalidad, serie, certificado/carpeta) y vista de cadena/conexión/certificado con datos reales.

- [x] RED: navegar pasos por teclado, no completar certificado sin preflight; integridad no verificada no se muestra como correcta; navegación de nueve áreas funcional.
- [x] Mantener accesibles herramientas nativas/exportaciones. SII/TicketBAI/FACe se muestran con su capacidad actual y límite.
- [x] GREEN: tests/contratos y checks UI.
- [ ] Commit de vistas.

### Task 4: Verificación y entrega

**Files:** tools/verify-browser-smoke.mjs, tools/verify-phase2-browser.mjs, docs/phase2/\*, workflow de checks.
**Interfaces:** consume las vistas anteriores; produce capturas y resultados 1024×700/1440×900 en ambos temas, flujos y preferencias, revisión independiente y PR por fase.

- [x] Adaptar navegación de los smoke tests, preservando assertions y llamadas de dominio originales.
- [ ] Build, contrato, 39 invocaciones originales, tests UI, cargo test, XSD y gate regulatorio; registrar fallos/bloqueos sin modificar requisitos.
- [ ] Revisar imágenes frente a las maquetas, contraste/foco, tablas/labels, estados vacíos, pantallas pobladas, confirmaciones y teclado.
- [ ] Revisión independiente; corregir Critical/Important con regresión RED→GREEN.
- [ ] PR en borrador contra la rama de fase 1, resumen, capturas y pendientes; ningún merge.

Pre-flight: Task 1 alimenta tabla/Verifactu y Task 2 mantiene Workspace; Task 3 reutiliza formularios sin alterar sus payloads. Ningún consumidor puede promover un estado a partir de un preflight ni del texto genérico de status.

## Resultado local y revisión

Implementación y pruebas locales completadas en un único commit de pantallas para mantener coherente el flujo. Revisión independiente: dos incidencias de estado asíncrono (borrador tardío y certificado obsoleto), corregidas con pruebas RED→GREEN; comprobaciones repetidas en verde. El controlador añade esas protecciones de UI, conservando las 39 invocaciones/payloads. Fechas y bases nativas expuestas como presentación, sin cambiar auditoría ni XML.

Pendiente de entrega: CI Windows de esta fase, PR encadenado y actualización final de evidencias. Gate completo bloqueado por runner/fuentes; PDF original sin QR/diseño final, abono heredado fijo, paquete privado sin publicación. Ver docs/phase2/STATUS.md; no se declara completada la fase ni conformidad regulatoria.
