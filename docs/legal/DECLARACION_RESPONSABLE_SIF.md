# Declaración responsable del sistema informático de facturación — BORRADOR

Fecha del borrador: 2026-11-20. Tarea L1 (`docs/BACKLOG_GA.md`, rama `cf/ga-backlog`). Firma: acción H5 de Ricardo.

> **No firmar todavía.** Este texto certifica que la versión cumple el RD 1007/2023 y la Orden HAC/1177/2024. Hoy la app no cumple todos los requisitos (ver `docs/legal/REQUISITOS_SIF.md`, filas «no» y «falta tarea»). La AEAT recuerda que certificar como cumplidor un SIF que no lo es «sería sancionable» (FAQ de desarrolladores v1.3, 04/12/2025, aclaración 3). La sanción está en el art. 201 bis de la Ley 58/2003, General Tributaria; su cuantía no se ha leído en fuente oficial en esta tarea: **sin confirmar**.

## 1. Marco normativo (fuentes leídas el 20/11/2026)

| Qué | Dónde |
|---|---|
| Obligación de la productora de certificar mediante declaración responsable | RD 1007/2023 (RRSIF), art. 13.1 |
| Por escrito y visible en el propio sistema, **en cada una de sus versiones**; se entrega también al cliente y al comercializador al adquirir el producto | RRSIF art. 13.2 |
| La productora o comercializadora conserva las declaraciones de todas las versiones y las entrega a petición del cliente o de la AEAT | RRSIF art. 13.3 |
| Contenido: datos del sistema, datos identificativos y de localización del productor, fecha y lugar de la firma | RRSIF art. 13.4 |
| Contenido mínimo detallado (letras a–l) | Orden HAC/1177/2024, art. 15.1 |
| Contenido recomendado (contacto, web, explicación del cumplimiento) | Orden HAC/1177/2024, art. 15.2 |
| Disponible «de manera legible e individualizada dentro del propio sistema informático», accesible «de forma rápida, fácil e intuitiva»; también al cliente y al comercializador, en papel o en electrónico | Orden HAC/1177/2024, art. 15.3 |
| Solo se incorpora a un SIF instalado que cumpla el RD 1007/2023 | FAQ de desarrolladores AEAT v1.3, aclaración 3 |
| Base legal de la certificación | Ley 58/2003, art. 29.2.j) |

Versiones leídas: RD 1007/2023 consolidado en BOE con última actualización 03/12/2025 (incluye RD 254/2025 y RDL 15/2025); Orden HAC/1177/2024 consolidada, última actualización 28/10/2024 (incluye la corrección de errores BOE-A-2024-23180). Los PDF de `C:\03 LEGISLACION\...\AEAT\FACTURACION Y SIF\` están en este equipo como punteros Git LFS sin descargar; se leyó el BOE en línea.

### Dónde debe estar y quién firma

- **Dónde:** dentro de la propia app, legible y como pantalla o documento propio (Orden art. 15.3). Propuesta para L2: Ajustes → «Declaración responsable», con el texto de la versión instalada y botón para guardarla en PDF. Además, entregarla con el instalador y en la página de venta (la web solo es recomendación: Orden art. 15.2.b).
- **Por versión:** una declaración por cada versión distribuida (RRSIF art. 13.2; Orden art. 15.1.c y 15.1.k). Cada versión nueva del instalador obliga a revisar y volver a fechar la declaración. Se conservan todas (RRSIF art. 13.3): propuesta `docs/legal/declaraciones/<version>.md` firmada en PDF.
- **Quién firma:** la persona o entidad productora del sistema (Orden art. 15.1.l: «la persona o entidad productora del sistema informático suscribe»). Si es una sociedad, su representante legal. La norma no exige un formato de firma concreto; solo fecha (día, mes, año) y lugar (localidad y país). Recomendación (no exigida por la norma): firma electrónica cualificada en el PDF.

## 2. Texto propuesto

Los datos salen de `docs/legal/FABRICANTE.md` (rama `cf/ga-backlog`, acción H2). Donde dice PENDIENTE falta el dato.

---

**DECLARACIÓN RESPONSABLE DEL SISTEMA INFORMÁTICO DE FACTURACIÓN**

a) **Nombre del sistema informático:** PENDIENTE (hoy «CumpleFactura»; nombre comercial sin decidir).

b) **Código identificador del sistema informático:** PENDIENTE (hoy «CF»; 2 caracteres, Orden anexo apartado 2.6; no puede coincidir con otro sistema del mismo productor).

c) **Identificador completo de la versión:** 1.0.0 (según `FABRICANTE.md`). Ojo: el código declara hoy `0.1.0` (`src-tauri/Cargo.toml:3`, usado en el XML por `src-tauri/src/services/verifactu.rs:557`); P2 lo alinea.

d) **Componentes y funcionalidades:**
- *Software:* aplicación de escritorio para Windows (Tauri 2, interfaz React, núcleo Rust) con base de datos SQLite local; proceso auxiliar `cumplefactura-sidecar`, incluido en el instalador, que es el único que usa el certificado electrónico del usuario y se comunica con la AEAT.
- *Hardware:* no incluye hardware; se ejecuta en el ordenador del usuario.
- *Funcionalidades principales:* alta de empresas, clientes y productos; emisión de facturas completas, rectificativas (R1–R5, por sustitución o diferencias) y recapitulativas; numeración por empresa, año y serie; registro de facturación de alta y de anulación con huella SHA-256 encadenada; remisión de los registros a la AEAT (modalidad VERI\*FACTU); PDF de la factura con código QR y frase «Factura verificable en la sede electrónica de la AEAT»; exportación de registros (XML, JSON, CSV) y copia de seguridad local.

e) **¿Solo puede funcionar como VERI\*FACTU?:** PENDIENTE de decisión. Propuesta: **Sí**, porque la modalidad «No VERI\*FACTU» (firma de registros y registro de eventos) está fuera de la versión 1. Hoy el XML dice `N` (`verifactu.rs:564`); N2 debe dejar XML y declaración iguales.

f) **¿Lo pueden usar varios obligados tributarios, o un usuario para varios?:** Sí (una instalación gestiona varias empresas; `verifactu.rs:565-566`).

g) **Tipos de firma de registros y eventos:** no aplica (solo VERI\*FACTU; RRSIF art. 16.3).

h) **Productor (nombre y apellidos o razón social):** PENDIENTE.

i) **NIF del productor:** PENDIENTE.

j) **Dirección postal completa de contacto:** PENDIENTE.

k) **Declaración de cumplimiento:** La entidad productora declara que el sistema informático de facturación identificado, en la versión indicada en esta declaración, cumple con lo dispuesto en el artículo 29.2.j) de la Ley 58/2003, de 17 de diciembre, General Tributaria; en el Reglamento que establece los requisitos que deben adoptar los sistemas y programas informáticos o electrónicos que soporten los procesos de facturación de empresarios y profesionales, y la estandarización de formatos de los registros de facturación, aprobado por el Real Decreto 1007/2023, de 5 de diciembre; en la Orden HAC/1177/2024, de 17 de octubre; y en las especificaciones publicadas en la sede electrónica de la Agencia Estatal de Administración Tributaria que las desarrollan.

l) **Fecha y lugar de suscripción:** PENDIENTE (día, mes y año; localidad y país).

Firma: PENDIENTE (persona o representante legal de la entidad productora).

*Información adicional recomendada (Orden art. 15.2):* correo y teléfono de soporte PENDIENTE; web del productor PENDIENTE; resumen del cumplimiento: `docs/legal/REQUISITOS_SIF.md`.

---

## 3. Antes de firmar (H5)

1. H2: completar `FABRICANTE.md` (razón social, NIF, dirección, nombre e id del sistema).
2. Cerrar las filas «no» de `REQUISITOS_SIF.md`; sobre todo la remisión automática e instantánea y los reintentos (RRSIF art. 16.1; Orden art. 16.4), y la posición y textos del QR.
3. Homologación en el entorno de pruebas de la AEAT con alta, anulación y rectificativa aceptadas (regla de corte del backlog, 23/12).
4. L2: pantalla en Ajustes con este texto, ya con los datos reales y la versión del instalador.
</content>
