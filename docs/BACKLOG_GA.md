# Backlog GA — CumpleFactura a mercado antes del 01/01/2027

Fecha: 2026-11-19. Decide: Ricardo. Revisan: Bilel y Dabiz.

Lista única de lo que falta para vender CumpleFactura. Sale de una auditoría de solo lectura del 19/11/2026 sobre `origin/main` (ee09006) y `claude/adoring-brown-zw9671` (PR #8).

**Frontera (ADR-0008, decisión del 17/11):** la contabilidad y los modelos AEAT viven en ContaPro. CumpleFactura emite, registra en VERI\*FACTU y exporta.

**Cómo se trabaja:** cada tarea Claude la ejecuta una tarea programada nocturna en su propia rama `cf/*` y abre un PR en borrador. **Ninguna tarea fusiona.** El estado real de cada tarea es el de su PR; esta lista se actualiza en la revisión semanal.

**Regla de corte:** si el 23/12 la AEAT de pruebas no ha aceptado alta, anulación y rectificativa, la GA se retrasa. No se anuncia «envía a la AEAT» antes de eso.

Tamaños: S ≤ medio día · M 1–2 días · L 3–5 días.

## Acciones de Ricardo (camino crítico)

- [ ] **H1** Visto bueno de Bilel y Dabiz al PR #8 (protocolo 0.2 de `design.md`). Para el 24/11. Bloquea que nada llegue a `main`.
- [ ] **H2** Rellenar `docs/legal/FABRICANTE.md` en esta rama (razón social y NIF del fabricante del SIF, nombre e identificador de la app). Para el 23/11. Bloquea N2, P2 y L2.
- [ ] **H3** Certificado de pruebas en el vault y `node tools/homolog-verifactu.mjs --enviar`. Para el 27/11, tras N2.
- [ ] **H4** Pedir certificado de firma de código (tarda días). Sin él, el instalador muestra aviso de SmartScreen.
- [ ] **H5** Firmar la declaración responsable (borrador en L1). Para el 21/12.
- [ ] **H6** Precio y forma de venta. Para el 14/12.
- [ ] **H7** Cerrar PR #1, #2, #3, #5 y #6 y archivar las ramas superadas. Sin fecha.

## Carril N — Núcleo de la factura

- [ ] **N1** (M) `cf/n1-numeracion` ← adoring-brown. Número reservado dentro de la transacción del alta; hora del registro desde el reloj del sistema; un único formato de número para vista previa, XML y PDF. Lote 1 (19/11).
- [ ] **N2** (M) `cf/n2-xml-campos` ← N1. `SistemaInformatico` con datos del fabricante; `TipoUsoPosibleSoloVerifactu` según norma; F2 sin `Destinatarios`; `IDOtro` para extranjeros; dígito de control de NIF/NIE/CIF. Lote 2 (23/11).
- [ ] **N3** (L) `cf/n3-desglose` ← N2. Calificación por línea (sujeta, inversión del sujeto pasivo, exenta con causa, no sujeta, recargo de equivalencia); tipos vigentes por fecha; redondeo según norma; lo no soportado no se puede emitir. Lote 3 (25/11).
- [ ] **N4** (M) `cf/n4-instantanea` ← N3. Datos de emisor y cliente congelados en la factura al emitir; XML de alta archivado en la app. Lote 4 (27/11).

## Carril S — Envío y trazabilidad

- [ ] **S1** (M) `cf/s1-estado-envio` ← adoring-brown. Errores de transporte guardados («sin confirmar»), `soap_fault` y todos los códigos; `TiempoEsperaEnvio`; la anulación no se aplica hasta la aceptación; filtros de CSV y auditoría. Lote 1.
- [ ] **S2** (M) `cf/s2-auditoria` ← S1. Auditoría de todos los cambios de datos maestros, ajustes, exportaciones y envíos; verificación de la cadena de `audit_events`. Lote 2.
- [ ] **S3** (S) `cf/s3-produccion` ← S2. Envío real activable desde Ajustes; producción solo con confirmación explícita. **No fusionar antes de homologar.** Lote 3.

## Carril P — Publicación

- [ ] **P1** (S) `cf/p1-ci` ← adoring-brown. GitHub Actions adaptado de `claude/ci` al workspace; `npm test` para `tests/ui`. Lote 1.
- [ ] **P2** (M) `cf/p2-instalador` ← P1. Identificador, iconos, NSIS en español, versión `1.0.0-rc`, `docs/RELEASE.md`. Lote 2.
- [ ] **G1** (S) `cf/g1-gate` ← adoring-brown. Gate regulatorio completo en Windows y evidencia `latest-*` regenerada. Sin arreglos. Lote 1.

## Carril L — Legal

- [ ] **L1** (M) `cf/l1-legal` ← adoring-brown. Borrador de declaración responsable; requisitos del reglamento frente a la app; `FechaOperacion` (D5) y especificación del QR; matriz regulatoria; contradicciones entre docs. Solo documentos. Lote 1.
- [ ] **L2** (S) `cf/l2-declaracion-ui` ← L1. Pantalla de declaración responsable en Ajustes. Lote 2.

## Carril X — Puente contable

- [ ] **X1** (M) `cf/x1-libro-expedidas` ← adoring-brown. CSV «Libro registro de facturas expedidas» por periodo, legible por el importador de ContaPro. Lote 1.

## Hitos

| Fecha | Hito |
|---|---|
| 19–27/11 | Lotes nocturnos 1–4 |
| 24/11 | H1: PR #8 aprobado y fusionado |
| 30/11–11/12 | Bucle de homologación; cada rechazo de la AEAT es una tarea nueva (subsanación incluida) |
| 14/12 | Congelar código fiscal; gate completo en Windows sobre `main` |
| 15–18/12 | Beta con instalador firmado en las sociedades propias |
| 21–23/12 | Declaración firmada; producción abierta (S3); versión 1.0.0 |
| 28–30/12 | Margen |

Orden de fusión: PR #8 → N → S → X → L → P. Conflictos esperables y triviales: `i18n/es.ts`, `lib.rs`, lista de migraciones en `db/mod.rs`.

## Fuera de alcance de la GA

Contabilidad, libros y modelos (ContaPro); eventos `invoice.issued` (X1 lo cubre con CSV); cifrado de la base (exige dependencia nueva: protocolo 0.2); actualizador automático; usuarios y licencias; macOS y Linux; SII, TicketBAI, Facturae; versión web.
