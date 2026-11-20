# Requisitos del SIF frente a CumpleFactura

Fecha: 2026-11-20. Tarea L1. Rama evaluada: `claude/adoring-brown-zw9671` (f503f7d). Solo lectura del código; no es asesoramiento jurídico ni certificación.

## Fuentes

| Abreviatura | Norma o documento | Versión leída |
|---|---|---|
| RRSIF | RD 1007/2023, Reglamento de requisitos de los sistemas informáticos de facturación | BOE consolidado, últ. act. 03/12/2025 |
| Orden | Orden HAC/1177/2024, especificaciones VERI\*FACTU | BOE consolidado, últ. act. 28/10/2024 (incluye corrección BOE-A-2024-23180) |
| RF | RD 1619/2012, Reglamento de facturación | BOE consolidado |
| RDL 15/2025 | Real Decreto-ley 15/2025, de 2 de diciembre (BOE-A-2025-24446) | texto publicado |
| DocQR | AEAT, «Detalle de las especificaciones técnicas del código QR de la factura…» | v0.5.0, 10/12/2025 |
| Val | AEAT, «Validaciones y errores. Sistemas informáticos de facturación y VERI\*FACTU» | v1.2.2 |
| FAQ | AEAT, «Aclaraciones a dudas de los desarrolladores» | v1.3, 04/12/2025 |

Los PDF de `C:\03 LEGISLACION\legislacion_icac_revision\AEAT\FACTURACION Y SIF\` son punteros Git LFS sin descargar en este equipo (y la carpeta `C:\03 LEGISLACION\AEAT\` que esperan los validadores no existe; ver G1). Se leyeron BOE y sede de la AEAT en línea el 20/11/2026.

**Modalidad.** La app se presenta como VERI\*FACTU. En esa modalidad no se aplican los arts. 6.b–f, 7.f, 7.h–j, 8 y 9 de la Orden (Orden art. 3) ni hace falta firmar los registros (RRSIF art. 16.3), y se presume que cumple el art. 8 del RRSIF (RRSIF art. 16.2). **Esa presunción exige remitir efectivamente todos los registros «de forma continuada, segura, correcta, íntegra, automática, consecutiva, instantánea y fehaciente» (RRSIF art. 16.1).** Hoy el envío es manual (fila 11): si no se corrige, la app no es VERI\*FACTU y le aplicarían la firma, el registro de eventos y la conservación de la Orden arts. 6–9.

Estado: **cumple** · **parcial** · **no** · **n/a** (no aplica en VERI\*FACTU).

## Tabla

| # | Requisito | Norma | Estado | Evidencia en la app | Tarea |
|---|---|---|---|---|---|
| 1 | Integridad e inalterabilidad: alteraciones detectadas; correcciones con registro adicional | RRSIF 8.2.a; Orden 6.a | parcial | Registros fiscales solo-añadir por trigger: `src-tauri/src/db/migrations/002_fiscal_records.sql:22-31`; huella SHA-256 con vectores oficiales: `src-tauri/src/services/verifactu.rs:249`. La tabla `invoices` se protege solo en la app (`src-tauri/src/db/invoices.rs:110`, `not_draft`) y la factura emitida lee datos vivos del emisor y del cliente | N4 (instantánea), S2 |
| 2 | Trazabilidad: registros encadenados con parte de la huella anterior | RRSIF 8.2.b y 10.1.ñ; Orden 7.a–e | cumple | `verifactu.rs:223-245` (Encadenamiento/PrimerRegistro); verificador `src-tauri/src/services/fiscal_chain.rs:43` | — |
| 3 | Fecha, hora, minuto y segundo de generación, correctamente fechados | RRSIF 8.2.b y 10.1.p; Orden 7.e | parcial | `FechaHoraHusoGenRegistro` = `issued_at` (`verifactu.rs:247`); la hora no sale aún del reloj del sistema en la misma transacción | N1 |
| 4 | Numeración correlativa sin duplicados por serie | RF 6.1.a; FAQ aclaración 6 | parcial | Reserva fuera de la transacción del alta; vista previa no reserva | N1 |
| 5 | Contenido del registro de alta (obligado, destinatario, tipo, desglose, importes) | RRSIF 10.1.a–n; Orden 10 y anexo | parcial | XML válido contra XSD (`verifactu.rs`, test `generated_xml_passes_local_xsd_contract`); falta calificación por línea, F2 sin `Destinatarios`, `IDOtro`, dígito de control de NIF | N2, N3 |
| 6 | Identificación del SIF y del productor en el registro | RRSIF 10.1.o; Orden anexo 2.6 | no | `verifactu.rs:553-554` pone la razón social y el NIF **del usuario** como productor; `TipoUsoPosibleSoloVerifactu`=`N` (`:564`) contradice la propuesta de declaración | N2 (+ H2) |
| 7 | Registro de anulación | RRSIF 11; Orden 11 | parcial | `src-tauri/src/commands/fiscal.rs:254-322` genera, valida y encadena; la factura queda anulada antes de que la AEAT acepte | S1 |
| 8 | Subsanación (`Subsanacion`/`RechazoPrevio`) de registros rechazados o con errores | Orden anexo L17; Val apdo. RechazoPrevio; FAQ aclaración 17 | no | Sin rastro en el código | falta tarea |
| 9 | Rectificativas R1–R5, por sustitución o diferencias | RF 15; Orden anexo (TipoFactura, TipoRectificativa) | cumple | `verifactu.rs` (`push_rectification_info`); tests `builds_rectifying_registro_alta_xml_shape` y sustitutiva | — (N3 para desglose) |
| 10 | Huella SHA-256 sin firma electrónica en VERI\*FACTU | RRSIF 12 y 16.3; Orden 13 | cumple | `verifactu.rs:248-249`; vectores oficiales en tests | — |
| 11 | **Remisión automática, continuada e instantánea de todos los registros** | RRSIF 8.1 y 16.1 | **no** | Envío manual en 3 acciones: `src-tauri/src/services/verifactu_submit.rs:13-14` («Reintentar es siempre una decisión manual»); `src/sections/VerifactuSection.tsx:3` («esta versión no envía sola ni tiene cola») | **falta tarea** |
| 12 | Incidencias: remitir en cuanto sea posible en orden, reintentar al menos cada hora, avisar indicando cuántos registros faltan | Orden 16.4 | no | `transport_error` se guarda y se reintenta a mano (`src/sections/VerifactuEnvio.tsx:87`); sin reintento horario ni contador de pendientes | S1 (guardar estados) + **falta tarea** (cola y aviso) |
| 13 | Control de flujo: esperar `t` (60 s inicial, actualizado por la AEAT) o acumular hasta 1.000 registros | Orden 16.2; anexo 2.2 | parcial | `verifactu_submit.rs:181-201` bloquea el envío mientras corre `TiempoEsperaEnvio` por empresa y endpoint; un registro por envío | S1 |
| 14 | Remitir a producción solo con consentimiento; opción VERI\*FACTU dura hasta fin del año natural | RRSIF 16.5 | parcial | Producción bloqueada en v1 (sidecar sin `--allow-production`); sin control de renuncia | S3; renuncia: falta tarea (menor) |
| 15 | Conservación, accesibilidad, legibilidad, descarga y volcado seguro | RRSIF 8.2.c; Orden 8 (n/a en VERI\*FACTU, Orden 3) | parcial | Exportación JSON/CSV/auditoría y copia SQLite: `src-tauri/src/lib.rs:63-69`; el XML de alta no se archiva en la app | N4 |
| 16 | Registro de eventos | RRSIF 8.3; Orden 9 | n/a | No aplica en VERI\*FACTU (Orden art. 3). Existe auditoría interna solo-añadir: `src-tauri/src/db/migrations/001_initial.sql:101-110` | S2 (auditoría, no obligatoria) |
| 17 | QR: ISO/IEC 18004:2015, corrección M, 30×30 a 40×40 mm | Orden 21.1; DocQR apdo. 2 | parcial | Nivel M: `src-tauri/src/services/qr.rs:70`. Lado total 35 mm **incluida** la zona de silencio de 4 módulos (`src-tauri/src/services/pdf.rs:20-21`, `:606`): con una URL de ~110 caracteres (versión 6–7, 41–45 módulos) el símbolo mide ≈ 29–30 mm. Si el tamaño se mide sin zona de silencio, puede quedar por debajo de 30 mm (**sin confirmar** cómo mide la AEAT) | falta tarea (QR) |
| 18 | QR: URL de cotejo, 4 parámetros, `dd-mm-aaaa`, importe con punto, «URL encoding» UTF-8 | Orden 21.2; DocQR apdos. 4–6 | cumple | `qr.rs:17-18` (URL de pruebas y producción = DocQR 5.1), `qr.rs:49-64`, test `qr.rs:147` | S3 (usar URL de producción al abrir producción; hoy `Test` por defecto, `qr.rs:25`) |
| 19 | QR: al principio de la factura, arriba **centrado o arriba a la izquierda**, primera página, ≥ 2 mm en blanco alrededor | DocQR apdo. 3 | no | Arriba **a la derecha**: `pdf.rs:371`, `:384-386`. Zona en blanco ≈ 2,6–2,9 mm: cumple | falta tarea (QR) |
| 20 | Texto «QR tributario:» encima del QR | DocQR apdo. 3 | no | No se imprime | falta tarea (QR) |
| 21 | Frase «Factura verificable en la sede electrónica de la AEAT» o «VERI\*FACTU» justo debajo, con letra **igual o mayor** que el resto de datos | RF 6.5.b; Orden 20.1.b; DocQR apdo. 3 | parcial | Debajo del QR: `pdf.rs:387`; pero a **6,5 pt**, menor que los datos de la factura (8–10 pt: `pdf.rs:354`, `:425`) | falta tarea (QR) |
| 22 | La frase solo si el sistema remite todos los registros | RF 6.5.b; RRSIF 16.1 | no | Se imprime en toda factura emitida aunque no se haya enviado (`pdf.rs:148-149`, `:387`). Sin envío automático (fila 11) la frase puede ser falsa | depende de la fila 11 |
| 23 | Factura electrónica: la URL del QR como campo propio | Orden 20.2 | n/a | La app no emite factura electrónica estructurada (Facturae fuera de v1) | — |
| 24 | Contenido de la factura y fecha de las operaciones si difiere de la de expedición | RF 6.1 y 6.1.i; RF 13 (recapitulativas) | cumple | PDF con fechas de cada albarán en las líneas de la recapitulativa (`pdf.rs:87`, `:142-143`); ver §D5 | N4 (datos congelados) |
| 25 | Declaración responsable visible en el sistema, por versión | RRSIF 13.2; Orden 15.3 | no | No existe pantalla | L2 + H5 (borrador: `docs/legal/DECLARACION_RESPONSABLE_SIF.md`) |
| 26 | Integración con libros registro | RRSIF DA 3.ª | parcial | CSV de facturas sin formato de libro | X1 |
| 27 | Acceso de la AEAT a registros y copias | RRSIF 14 | parcial | Exportaciones locales (fila 15) | N4 |
| 28 | Distribución identificable (versión del instalador = versión declarada) | Orden 15.1.c | no | `src-tauri/Cargo.toml:3` dice `0.1.0`; `FABRICANTE.md` dice 1.0.0 | P2 |
| 29 | Verificación continua de la evidencia | — (calidad) | parcial | Gate con 6 pasos en rojo (PR #13) | P1, G1 |

Propuesta para «falta tarea»: **S4 — cola de remisión automática** (filas 8, 11, 12, 22: envío al emitir, cola persistente en orden, reintento horario, aviso con pendientes, subsanación) y **D9 — QR conforme a DocQR v0.5.0** (filas 17, 19, 20, 21: arriba centrado, «QR tributario:», frase a ≥ tamaño del cuerpo, símbolo ≥ 30 mm sin zona de silencio). S4 es la más grande: sin ella no hay modalidad VERI\*FACTU y la declaración no puede firmarse.

## Cuestiones resueltas

### D5 — `FechaOperacion` en facturas recapitulativas

- **Norma:** la factura debe indicar la fecha de las operaciones «siempre que se trate de una fecha distinta a la de expedición» (RF art. 6.1.i). Las recapitulativas agrupan operaciones de un mismo mes natural (RF art. 13.1) y se expiden como máximo el último día del mes, o el 16 del mes siguiente si el destinatario es empresario o profesional (RF art. 13.2).
- **Registro:** `FechaOperacion` es opcional en el esquema (`src-tauri/resources/xsd/verifactu/SuministroInformacion.xsd:142`, `minOccurs="0"`). La Orden no la menciona ni habla de recapitulativas. Val v1.2.2 (validaciones de `RegistroAlta`, punto 7 y validaciones de tipo impositivo) prevé expresamente que no se informe: usa «FechaExpedicionFactura … si no se informa FechaOperacion». No puede ser posterior a la fecha actual ni anterior a la de expedición salvo claves de régimen 14 o 15 (Val, punto 1 y 7).
- **FAQ:** la v1.3 no trata `FechaOperacion` en recapitulativas: **sin confirmar** qué prefiere la AEAT.
- **Conclusión:** D5 es conforme. Omitir `FechaOperacion` en la recapitulativa es válido; las fechas de cada albarán van en el PDF (cumple RF 6.1.i). Riesgo menor: si los tipos de IVA cambiaran entre el mes de las operaciones y el de expedición (caso del día 1–16 del mes siguiente), la AEAT validaría el tipo con la fecha de expedición. Alternativa equivalente, también válida: informar la fecha del último albarán. Las facturas normales repiten la fecha de expedición en `FechaOperacion` (`verifactu.rs:205-206`); es redundante pero admitido.

### QR — especificación frente a `qr.rs` y el PDF

| Punto | Especificación | App | |
|---|---|---|---|
| URL (VERI\*FACTU) | Pruebas `https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR`; producción `https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR` (DocQR 5.1) | Iguales (`qr.rs:17-18`) | cumple |
| Parámetros | Solo `nif`, `numserie` (≤ 60, ASCII 32–126), `fecha` `DD-MM-AAAA`, `importe` con punto y 2 decimales (DocQR 6) | `qr.rs:58-63`, mismos formateadores que el XML | cumple |
| Codificación | «URL encoding» UTF-8 de los valores (DocQR 4) | RFC 3986 por componente (`qr.rs:80`) | cumple |
| Norma y corrección | ISO/IEC 18004:2015, nivel M (Orden 21.1) | `EcLevel::M` (`qr.rs:70`) | cumple |
| Tamaño | 30×30 a 40×40 mm (Orden 21.1) | 35 mm con zona de silencio; símbolo ≈ 29–30 mm | parcial, sin confirmar |
| Zona en blanco | ≥ 2 mm, recomendado 6 mm (DocQR 3) | 4 módulos ≈ 2,6–2,9 mm | cumple |
| Posición | Al principio, arriba, centrado o arriba a la izquierda; una vez, primera página; primer QR del documento (DocQR 3) | Arriba a la derecha (`pdf.rs:384-386`) | no |
| Texto encima | «QR tributario:» (DocQR 3) | No | no |
| Frase debajo | «Factura verificable en la sede electrónica de la AEAT» o «VERI\*FACTU», letra ≥ resto de datos (DocQR 3; Orden 20.1.b) | Frase correcta, 6,5 pt (`pdf.rs:387`) | parcial |
| Pruebas | — | Añade «Entorno de pruebas AEAT» bajo la frase (`pdf.rs:389-396`) | correcto mientras sea pruebas |

### Fechas de obligación

RDL 15/2025, disposición final primera, da nueva redacción a la disposición final cuarta del RRSIF: los contribuyentes del Impuesto sobre Sociedades (RRSIF art. 3.1.a) deben tener los sistemas adaptados **antes del 1 de enero de 2027**; el resto de obligados del art. 3.1 (IRPF con actividades económicas, IRNR con establecimiento permanente, entidades en atribución de rentas), **antes del 1 de julio de 2027**. La FAQ v1.3 confirma ambas fechas. **Coinciden con lo que asume el plan.** Los productores deben ofrecer los productos adaptados en nueve meses desde la entrada en vigor de la Orden (RRSIF art. 3.2 y DF 4.ª); la Orden entró en vigor el 29/10/2024, así que ese plazo ya venció (≈ 29/07/2025, cálculo propio): CumpleFactura no puede venderse como SIF sin estar adaptado y declarado.

## Preguntas abiertas para Ricardo

1. ¿Se crea S4 (cola de remisión automática) antes del congelado del 14/12? Sin ella la app no es VERI\*FACTU (fila 11).
2. ¿Se crea D9 (QR conforme a DocQR v0.5.0)?
3. ¿La v1 se declara «solo VERI\*FACTU» (`TipoUsoPosibleSoloVerifactu`=`S`)?
4. D5: ¿mantener la omisión de `FechaOperacion` o informar la fecha del último albarán?
5. ¿Descargar los PDF LFS de `C:\03 LEGISLACION` (o crear `C:\03 LEGISLACION\AEAT\`) para que el gate y las citas tengan copia local?
</content>
