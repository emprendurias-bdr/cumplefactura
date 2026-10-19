# ROADMAP CumpleFactura — 10 funciones (5 ⭐ + 5 estándar)

> Leyenda: ✅ hecho · 🟡 parcial · ⏳ pendiente.
> Rama: `claude/cf-funcionalidades-estrella` (apilada sobre `claude/ui-estilo-contapro`). Contrato de comandos: [`MODULE_CONTRACT.md`](MODULE_CONTRACT.md). Red e interoperabilidad: [`docs/plans/RED_CUMPLEFACTURA_E_INTEROP_CONTAPRO.md`](docs/plans/RED_CUMPLEFACTURA_E_INTEROP_CONTAPRO.md); las 10 funciones de integración entre apps están en `contapro/docs/roadmap/INTERCONEXION.md`.
>
> Reglas que no cambian:
> - la emisión es siempre manual (`invoice_issue`);
> - `audit_events` y `fiscal_records` son *append-only*;
> - los secretos van al keyring del sistema, nunca a SQLite ni al repo.
>
> Verificación local: `cargo test --lib` (83), `npm run build`, `validate:ui-contract` y `validate:browser-smoke`. `core_e2e` necesita Windows o PowerShell para la validación XSD.

| # | Función | Estado | Pendiente |
|---|---|---|---|
| ⭐1 | QR tributario VERI*FACTU + PDF profesional | ✅ | Pasar a producción tras homologar |
| ⭐2 | Cobros y vencimientos | ✅ | Remesas SEPA (mejora) |
| ⭐3 | Facturas recurrentes | ✅ | Programador en segundo plano |
| ⭐4 | Presupuestos y proformas → factura | ✅ | PDF y envío del presupuesto |
| ⭐5 | Envío por email | 🟡 | Acuse de descarga: requiere la red alojada |
| 6 | Modo mostrador / facturas simplificadas | ⏳ | — |
| 7 | Intracomunitarias, exportación y multimoneda | ⏳ | — |
| 8 | Facturae / FACe | ⏳ | — |
| 9 | Multiusuario + móvil | ⏳ | — |
| 10 | Enlace de pago (tarjeta/Bizum) con conciliación | ⏳ | — |

---

## ⭐1 QR tributario + PDF profesional — ✅

- **Qué hay**:
  - `services/qr.rs`:
    - URL `ValidarQR` con NIF, número/serie, fecha e importe, usando los mismos formateadores que el XML VERI*FACTU;
    - nivel de corrección M;
    - leyenda "Factura verificable en la sede electrónica de la AEAT".
  - `services/pdf.rs`:
    - QR de 35 mm arriba a la derecha y marca de entorno de pruebas;
    - BORRADOR sin QR;
    - caja de cliente, líneas, IRPF, huella y paginación de 22 + 38 líneas.
  - Ajustes › QR tributario elige el entorno (`app_settings.qr_environment`, por defecto `test`).
- **Verificado**: QR decodificado con `zbarimg` y PDF renderizado con `pdftoppm`.
- **Pendiente**:
  - Cambiar a Producción solo cuando el SIF esté remitiendo de verdad (ver la homologación en ContaPro).
  - Logo de empresa en el PDF.
- **Consejo**: no mover el QR del inicio del documento. La norma exige que sea visible antes del contenido.

## ⭐2 Cobros y vencimientos — ✅

- **Qué hay**:
  - Migración 009 (`invoices.due_date`, `invoice_payments`).
  - `db/business.rs`:
    - registro de cobros parciales sin sobrecobro;
    - métodos transferencia, tarjeta, efectivo, domiciliación, Bizum y otros.
  - Vista Facturas › Cobros: KPIs, estados (cobrada, parcial, pendiente, vencida con días) y ficha con cobros y emails.
- **Siguiente**:
  - Remesa SEPA de domiciliaciones (pain.008) para cuotas recurrentes.
  - Aviso automático de vencidas al abrir la app.
- **Consejo**: los cobros son operativos, no fiscales. No tocan `fiscal_records`.

## ⭐3 Facturas recurrentes — ✅

- **Qué hay**:
  - Tabla `recurring_invoices` con plantillas mensual, trimestral y anual con fecha fin.
  - `recurring_generate_due` crea un **borrador** por plantilla vencida y avanza la fecha. Se ejecuta al abrir la app.
- **Siguiente**:
  - Generación en segundo plano con la app cerrada (tarea programada del SO o *tray*).
  - Opción de enviar por email al emitir.
- **Consejo**: mantener "borrador + emisión manual". Emitir solo sería un cambio de criterio fiscal.

## ⭐4 Presupuestos y proformas → factura — ✅

- **Qué hay**:
  - Tabla `quotes` con numeración `P{año}-NNNN` y estados borrador, enviado, aceptado, rechazado y facturado.
  - Con un clic se convierten en borrador de factura sin volver a teclear líneas.
- **Siguiente**:
  - PDF del presupuesto (reutilizar `pdf.rs` con título "PRESUPUESTO" y sin QR).
  - Envío por email y aceptación por enlace cuando exista la red.

## ⭐5 Envío por email — 🟡

- **Qué hay**:
  - `services/email.rs` con `lettre` (SMTP propio: STARTTLS, TLS o sin cifrar para pruebas). La contraseña va al keyring (`CumpleFactura-SMTP`).
  - Envío de factura y de recordatorio con el PDF adjunto, y prueba de envío.
  - Historial en `email_log`.
  - Verificado contra un servidor SMTP local real (test `#[ignore]` `smtp_roundtrip_against_local_server`, con `CF_SMTP_TEST_PORT`).
- **Bloqueado**: el acuse de lectura o descarga necesita el servidor de la red (I3 en INTERCONEXION.md); SMTP no lo da de forma fiable.
- **Revisar en CI Windows**: compilación de `keyring` (windows-native) y `lettre` con `rustls` + `ring`.
- **Consejo**: Gmail y Outlook exigen contraseña de aplicación; está explicado en la propia pantalla.

---

## 6 Modo mostrador / facturas simplificadas — ⏳

- **Cómo**:
  - Tipo `Simplified` (F2) ya soportado por VERI*FACTU en el sidecar.
  - Pantalla táctil con productos frecuentes, cobro en efectivo o tarjeta y ticket de 80 mm.
  - Serie propia y límite de 400 € (3.000 € en ciertos sectores) validado en Rust.
- **Consejo**: el ticket también lleva QR VERI*FACTU; reutilizar `qr.rs`.

## 7 Intracomunitarias, exportación y multimoneda — ⏳

- **Cómo**:
  - Validar el NIF-IVA en VIES (con caché y sin bloquear la emisión si VIES no responde).
  - Menciones legales automáticas: "Inversión del sujeto pasivo", "Exenta art. 25 LIVA" o "art. 21 LIVA".
  - Tipo de cambio BCE en la fecha de devengo, guardando el importe en EUR y en la divisa.
  - Alimentar el 349 en ContaPro.
- **Consejo**: guardar la mención legal en la propia factura emitida, no calcularla al imprimir.

## 8 Facturae / FACe — ⏳

- **Cómo**:
  - Exportar Facturae 3.2.2 (el sidecar de ContaPro ya la genera y firma con XAdES-BES).
  - Envío a FACe vía sidecar.
  - Códigos DIR3 (oficina contable, órgano gestor y unidad tramitadora) en la ficha del cliente público.
- **Bloqueo**: alta del certificado como usuario SP en FACe (ver `contapro/docs/memory/fiscal-compliance.md`).

## 9 Multiusuario + móvil — ⏳

- **Cómo**:
  - Identidad común `login-core` (I2).
  - Roles emisor, contable y solo lectura.
  - Base de datos sincronizada (SQLite local + réplica en la red) con resolución de conflictos por factura.
  - La app móvil empezaría por consulta, cobros y fotos de gastos.
- **Consejo**: la numeración debe seguir reservándose en un único sitio (servidor o puesto maestro) para no duplicar números.

## 10 Enlace de pago con conciliación — ⏳

- **Cómo**:
  - Enlace de pago por factura (Redsys, Stripe o Bizum a través de la pasarela del banco) en el email y en el PDF.
  - El webhook marca el cobro con `payment_register` (método `card` o `bizum`).
  - En ContaPro, conciliación con el abono (I9).
- **Consejo**: las claves de la pasarela van al keyring y el webhook solo existe con la red alojada. En local, consultar el estado por *polling*.
