# Red CumpleFactura e interoperabilidad con ContaPro

Estado: propuesta de diseño (pendiente de decisiones del titular)
Fecha: 2026-10-18
Ámbito: CumpleFactura (Tauri + SQLite, local-first) y ContaPro (Next.js + Supabase).

## 1. Objetivo

1. Desde CumpleFactura se puede **buscar empresas** que usan el programa y **conectarlas**.
2. Si A emite una factura a B y B está en la red, la factura **aparece automáticamente en "Recibidas"** de B sin teclearla.
3. Quien no tenga el programa puede abrir una **cuenta gratuita solo de recepción** (B2B y B2C), lo que incentiva la adopción.
4. Emitidas y recibidas se exportan en un formato que **ContaPro importa sin retoques**.
5. Todas las apps comparten interfaz (shell, tokens RSA) y se distinguen por su color de acento, para que un futuro ERP modular sea "añadir módulo" y no "aprender otra app".

## 2. Punto de partida

- CumpleFactura emite en local, sin red: numeración, huella VERI*FACTU, auditoría append-only y XML con XSD local. No tiene servidor ni identidad de usuario.
- ContaPro es SaaS multiempresa sobre Supabase/RLS, con importadores CSV de facturas (`src/lib/contabilidad/csv.ts`) y el sidecar fiscal (VERI*FACTU, SII, TicketBAI, Facturae).
- La identidad común del workspace es `login-core` (Keycloak gestionado, multi-tenant, sin signup público). CumpleFactura ya declaró que la adoptará al pasar a multiusuario (`IDENTITY_ADOPTION.md`).
- UI: hecha en esta iteración. CumpleFactura usa el shell de ContaPro y los tokens RSA, con acento azul fiscal `#46577D`.

## 3. Arquitectura propuesta

La emisión **sigue siendo local-first**. La red solo transporta copias selladas de facturas ya emitidas; nunca numera, nunca altera y nunca es requisito para emitir.

```
CumpleFactura A (SQLite)                Servicio Red CumpleFactura               CumpleFactura B / cuenta gratuita
 invoice_issue ──► outbox local ──HTTPS──► directorio (opt-in)                     ┌─► received_invoices (SQLite, inmutable)
                    (reintentos)           buzones por NIF verificado ──HTTPS──────┤
                                           acuses: entregada/aceptada/rechazada    └─► portal web (solo lectura/descarga)
```

Componentes:

| Componente | Responsabilidad | Propuesta |
|---|---|---|
| Identidad | Usuarios, tenant por empresa, invitaciones | `login-core` (Keycloak). Sin signup abierto: alta por invitación o cuenta gratuita con verificación de email |
| Verificación de empresa | Evitar que alguien publique un NIF ajeno | Firma de un reto con el certificado electrónico de la empresa vía sidecar (sin sacar la clave), o validación manual en fase piloto |
| Directorio | Buscar empresas por NIF/nombre | Tabla `network_companies` **opt-in**: solo NIF, razón social y estado de verificación. Sin datos de contacto públicos |
| Conexiones | Relación cliente-proveedor aceptada por ambos | `network_links (from_company, to_company, status)` |
| Buzón | Entrega de facturas | `network_deliveries (id, sender_nif, receiver_nif, invoice_hash, payload_ref, format, status, timestamps)`. El payload va cifrado en almacenamiento de objetos |
| Cliente CumpleFactura | Outbox y descarga | Tablas locales `network_outbox` y `received_invoices` (append-only, con verificación de hash contra la huella del emisor) |
| Portal gratuito | Receptores sin programa | Web mínima de solo lectura (descarga PDF/XML y export ContaPro) |

Backend recomendado: **proyecto Supabase propio para la red** (Postgres + RLS + Storage), separado del de ContaPro. Así un fallo o cambio en el ERP no afecta al intercambio, y viceversa. Comparte identidad vía `login-core`.

Flujo de entrega:
1. A emite en local (igual que hoy). Si el NIF del cliente tiene conexión aceptada, se crea una fila en `network_outbox`.
2. Con red, el outbox sube el paquete sellado: JSON canónico + PDF + XML VERI*FACTU + huella. Reintenta si falla.
3. El servicio comprueba que el remitente está verificado para el NIF emisor y deja la entrega en el buzón de B.
4. B descarga, verifica la huella y la guarda en `received_invoices`. Aparece en *Facturas > Recibidas* con estado *pendiente de revisar*. B puede aceptarla o rechazarla, y el acuse vuelve a A.

## 4. Formato de intercambio

- **v1 (interno):** paquete JSON canónico `cumplefactura.invoice.v1` con cabecera (emisor, receptor, serie/número, fecha, tipo, rectificación), líneas (cantidad, precio, descuento, IVA, IRPF), totales, huella VERI*FACTU y hash SHA-256 del PDF/XML adjuntos. Se firma con la clave del emisor de la red.
- **v2 (interoperable):** emitir también **Facturae 3.2.2** (ya soportado por el sidecar de ContaPro) y/o **UBL 2.1**, para encajar con la futura obligación de factura electrónica B2B.

> **Aviso regulatorio — validar antes de producción.** Una red que intercambia facturas entre empresas puede quedar sujeta a los requisitos de las *plataformas privadas de facturación electrónica* del reglamento de factura electrónica B2B (Ley 18/2022 "Crea y Crece"): interoperabilidad entre plataformas, formatos admitidos y comunicación de estados de pago. Hay que contrastarlo con la normativa vigente (`C:\03 LEGISLACION\AEAT`) antes de abrir la red a terceros. También aplica el RGPD: directorio opt-in, minimización de datos y DPA con el proveedor de hosting.

## 5. Exportación compatible con ContaPro

ContaPro importa hoy estas plantillas (`src/lib/contabilidad/csv.ts`):

| Plantilla | Columnas |
|---|---|
| `facturas_emitidas.csv` | `numero, fecha, cliente_nif, cliente_nombre, base, porcentaje_iva, tipo_operacion` (venta_nacional, venta_intra, exportacion, venta_exenta_int) |
| `facturas_recibidas.csv` | `numero, fecha, proveedor_nif, proveedor_nombre, base, porcentaje_iva, tipo_operacion, deducible, cuenta_gasto_code` (compra_nacional, compra_intra, importacion, isp, bien_inversion, compra_no_deducible) |

Desajustes con lo que CumpleFactura sabe expresar:
- Una factura de CumpleFactura puede tener **varias líneas con tipos de IVA distintos**, pero la plantilla admite **un único `porcentaje_iva`**. ContaPro descarta números repetidos (error `23505`), así que no vale una fila por tipo.
- El **IRPF por factura** no viaja (ContaPro lo toma del tercero).
- Las **rectificativas** no tienen columnas propias (causa R1-R5, factura rectificada).

Propuesta:
- **Fase A (rápida):** comando Tauri `invoice_export_contapro_csv` con las dos plantillas exactas. Exporta las facturas de un solo tipo de IVA y **bloquea con error explícito** las de varios tipos, en lugar de exportarlas mal.
- **Fase B (recomendada):** como ambos productos son nuestros, añadir a ContaPro un importador del paquete `cumplefactura.invoice.v1` (líneas, tipos, IRPF, rectificativas y huella), reutilizando sus RPC actuales de alta de facturas. Es el mismo formato que viaja por la red, así que un solo contrato sirve para todo.

## 6. Interfaz común del ecosistema

- Shell común: barra superior de áreas, sub-sidebar por área y cabecera de página con *eyebrow*.
- Tokens RSA compartidos (`rsa-tokens.css`). Cada app solo redefine `--accent`:

| App | Acento | Token |
|---|---|---|
| ContaPro | Oliva `#4A5A2E` | `--rsa-group` |
| CumpleFactura | Azul fiscal `#46577D` | `--rsa-fiscal` |
| Libres para próximos módulos | Energía `#D6C66A`, tierra `#B8896A`, tech `#4F8F83` | `--rsa-energy`, `--rsa-vending`, `--rsa-tech` |

- Monograma de dos letras en Manrope 800 sobre el color de la app: RS (marca), CF (CumpleFactura).
- Pendiente: extraer el shell a un paquete compartido cuando haya un tercer módulo. Ahora mismo cada app lo implementa con su stack: Tailwind en ContaPro, CSS plano en CumpleFactura.

## 7. Fases

| Fase | Entrega | Depende de |
|---|---|---|
| 0 | UI común + vistas *Recibidas* y *Red de empresas* como maqueta | Hecho (rama `claude/ui-estilo-contapro`) |
| A | Export ContaPro CSV (tipo de IVA único, bloqueo si hay varios) | Nada |
| B | Paquete `cumplefactura.invoice.v1` + importador en ContaPro | Fase A |
| C | Recibidas locales: importar paquetes v1 a mano (fichero) en `received_invoices` | Fase B |
| D | Servicio de red: identidad `login-core`, verificación de empresa, directorio, buzón y outbox | Decisiones 1-4 y revisión regulatoria |
| E | Cuenta gratuita (portal de recepción) | Fase D |

Las fases A a C dan valor sin servidor: intercambio por fichero e importación en ContaPro. La red automática llega en D.

## 8. Decisiones pendientes del titular

1. **Hosting de la red:** ¿Supabase gestionado (rápido) o servidor propio/NAS (más control, más operación)?
2. **Verificación de empresas:** ¿certificado electrónico desde el primer día o validación manual en el piloto?
3. **Modelo de cuentas:** confirmar *completa* (emite y recibe) frente a *gratuita* (solo recibe), y si B2C recibe por email con enlace o también con cuenta.
4. **Formato oficial:** ¿Facturae, UBL o ambos para la fase v2?
5. **Prioridad:** ¿empezamos por la fase A (export ContaPro), que no necesita servidor?
