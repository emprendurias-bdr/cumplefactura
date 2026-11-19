# Especificación — Documentos comerciales y Facturas recurrentes

Fecha: 2026-11-03. Estado: **propuesta para Bilel y David** (implementación) y Ricardo (decisiones de §9). Fase F4 de `docs/PLAN_TRABAJO_2026-11-03.md`: se empieza después del cierre fiscal (F3).

Fuentes: `docs/UX_UI.md` (decisiones del 26-10), `bdr-ui/design.md` v1.3 (§5, §7, §8, §10), rama `claude/cf-funcionalidades-estrella` (migración `009_cobros_recurrentes_presupuestos_email.sql`, `db/business.rs`, `ROADMAP.md`), y el backend actual de `main` (PR #7).

> **Regla de oro (README_DEV).** La fuente regulatoria no está en este repo. Cada punto marcado **[verificar norma]** se contrasta con el texto en `C:\03 LEGISLACION` (artículo y versión) antes de escribir código, y la cita se pega en el PR.

---

## 1. Qué son y para qué sirven

| Módulo | Qué es | Para qué lo usa la persona | ¿Tiene valor fiscal? |
|---|---|---|---|
| **Presupuesto** | Oferta de precio a un cliente, con validez hasta una fecha. | Mandar un precio antes de trabajar; cuando el cliente acepta, convertirlo en factura o en albarán sin volver a teclear. | No. No numera en la serie de facturas, no genera registro VERI\*FACTU, no lleva QR. |
| **Proforma** | Factura «de mentira»: mismo aspecto, pero sin efecto fiscal. Se usa para pedir un anticipo, para aduanas o para que el cliente tramite el pago. | Cobrar por adelantado o justificar un pago antes de emitir la factura real. | No. El PDF dice «Factura proforma · sin valor fiscal» de forma visible. [verificar norma: que la proforma no es factura a efectos del RD 1619/2012] |
| **Albarán** | Nota de entrega: qué se ha entregado o hecho, cuándo y a quién. Puede ir sin precios. | Justificar entregas a lo largo del mes y facturarlas juntas al final. | No por sí mismo. Varios albaranes del mismo cliente y mes se agrupan en **una factura recapitulativa**, que sí es fiscal. |
| **Factura recapitulativa** | Una factura normal que reúne operaciones de varias fechas del mismo mes y cliente. | Facturar una vez al mes en vez de una vez por entrega. | Sí: es una factura más (serie, número, huella, VERI\*FACTU). [verificar norma: RD 1619/2012 art. 13 — mismo destinatario, mismo mes natural, plazo de expedición] |
| **Factura recurrente** | Plantilla que prepara un **borrador** de factura cada periodo (mensual, trimestral, anual) para un cliente. | Cuotas, alquileres, mantenimientos: no repetir la misma factura a mano cada mes. | La plantilla no. El borrador tampoco. Solo cuando la persona **emite** el borrador nace la factura fiscal. |
| **Rectificativa (abono)** | Ya existe (R1–R5). Lo que en otros programas se llama «nota de crédito». | Corregir o abonar una factura emitida. | Sí. No forma parte de este módulo; solo se nombra para no duplicarlo. |

Cadena completa (cada paso se crea desde el anterior con un clic, conservando líneas y enlace):

```
Presupuesto ──aceptar──▶ Proforma ──▶ Albarán(es) ──agrupar del mes──▶ Factura (recapitulativa)
     │                       │                                               ▲
     └──────────convertir directamente────────────────────────────────────────┘
Plantilla recurrente ──cada periodo──▶ Borrador de factura ──emitir (manual)──▶ Factura
```

Ningún paso es obligatorio: se puede ir de presupuesto a factura sin proforma ni albarán.

## 2. Reglas que no se negocian

1. **Solo la factura es fiscal.** Presupuestos, proformas, albaranes y plantillas no tocan `invoice_sequences`, `fiscal_records`, `fiscal_exports`, `verifactu_submissions` ni la cadena de huellas.
2. **La emisión siempre es manual.** Nada se emite solo: ni las recurrentes ni las conversiones. Convertir crea un **borrador** de factura; emitirlo sigue pasando por el `ConfirmDialog` de emisión de siempre (`invoice_issue`).
3. **Series propias por tipo** (`P-2026-0001`, `PF-2026-0001`, `AL-2026-0001`), separadas de las de facturas, para que nunca se confundan ni dejen huecos en la serie fiscal.
4. **El PDF de los no fiscales lo dice**: título («Presupuesto», «Factura proforma», «Albarán»), leyenda «Documento sin valor fiscal», **sin QR** y sin huella.
5. **Auditoría**: crear, cambiar de estado, convertir y anular se registran en `audit_events` (append-only, como hoy). Borrar solo se permite en borrador; después se **anula** con motivo (design.md §7.7: motivo obligatorio en apps fiscales).
6. **Inmutables tras enviarse**: un documento `sent` no se edita; se duplica como versión nueva y el anterior queda `superseded`.
7. **Importes en céntimos** (`*_cents INTEGER`) y cálculo de totales con el mismo código que las facturas (`domain::invoice`), sin duplicar fórmulas.
8. **Sin dependencias nuevas.** Todo con `rusqlite`, `serde`, `chrono` y el PDF actual.

## 3. Modelo de datos (para pasar a SQL sin interpretar)

Migraciones nuevas: `010_commercial_documents.sql` y `011_recurring_invoices.sql`. La `009` ya existe en `main` (`verifactu_submissions`); la `009` de la rama estrella se **renumera**, no se reutiliza su número.

### 3.1 `commercial_documents`

Una tabla para los tres tipos: misma forma, distinto `kind`. Menos código que tres tablas.

| Campo | Tipo | Obligatorio | Ejemplo | Notas |
|---|---|---|---|---|
| `id` | TEXT (uuid) | sí | `6f1c…` | |
| `company_id` | TEXT → `companies.id` | sí | | |
| `customer_id` | TEXT → `customers.id` | sí | | |
| `kind` | TEXT | sí | `quote` | `quote` · `proforma` · `delivery_note` |
| `series_code` | TEXT | sí | `P` | Por defecto `P`, `PF`, `AL` |
| `fiscal_year` | INTEGER | sí | `2026` | |
| `number` | INTEGER | sí | `14` | Se asigna en Rust al pasar a `sent` (no en borrador) |
| `status` | TEXT | sí | `draft` | Ver §3.4 |
| `issue_date` | TEXT (ISO) | sí | `2026-11-03` | Fecha del documento |
| `valid_until` | TEXT (ISO) | no | `2026-12-03` | Solo `quote` y `proforma` |
| `delivery_date` | TEXT (ISO) | no | `2026-11-03` | Solo `delivery_note`; es la fecha de la operación |
| `show_prices` | INTEGER (0/1) | sí | `1` | Albarán valorado o sin precios |
| `notes` | TEXT | sí | `''` | Condiciones, forma de pago |
| `taxable_base_cents`, `tax_cents`, `withholding_cents`, `total_cents` | INTEGER | sí | | Calculados en Rust al guardar |
| `source_document_id` | TEXT → `commercial_documents.id` | no | | De qué documento sale (presupuesto → proforma) |
| `invoice_id` | TEXT → `invoices.id` | no | | Factura (o borrador) en la que acabó |
| `void_reason` | TEXT | no | | Obligatorio si `status = void` |
| `created_at`, `updated_at` | TEXT | sí | | |

Restricciones: `UNIQUE (company_id, kind, series_code, fiscal_year, number)` cuando `number` no es nulo; `CHECK (kind IN (...))`; `CHECK (status IN (...))`.

### 3.2 `commercial_document_lines`

Misma forma que `invoice_lines` (descripción, cantidad, precio, descuento, IVA, IRPF, `product_id` opcional, `position`), con `document_id` en vez de `invoice_id`. Así la conversión copia filas campo a campo.

### 3.3 `commercial_sequences`

| Campo | Tipo | Notas |
|---|---|---|
| `company_id`, `kind`, `series_code`, `fiscal_year` | clave primaria compuesta | |
| `next_number` | INTEGER | Se reserva en la misma transacción que el paso a `sent`, como `invoice_sequences` |

### 3.4 Estados y transiciones

| Tipo | Estados | Transiciones permitidas |
|---|---|---|
| Presupuesto | `draft` · `sent` · `accepted` · `rejected` · `expired` · `converted` · `void` · `superseded` | draft→sent · sent→accepted/rejected/expired/superseded · accepted→converted · draft→(borrar) · sent/accepted→void |
| Proforma | `draft` · `sent` · `paid` · `converted` · `void` · `superseded` | draft→sent · sent→paid/converted/superseded · paid→converted · sent/paid→void |
| Albarán | `draft` · `delivered` · `invoiced` · `void` | draft→delivered · delivered→invoiced (solo vía factura) · delivered→void |

`expired` lo calcula la lectura (`valid_until < hoy` y `status = sent`), no un proceso en segundo plano. `converted` e `invoiced` solo los pone Rust al crear el borrador de factura.

Textos en pantalla (design.md §8 y `status.ts`): Borrador · Enviado · Aceptado · Rechazado · Caducado · Convertido · Pagado · Entregado · Facturado · Anulado · Sustituido.

### 3.5 `recurring_invoices` (se parte de la tabla de la rama estrella)

| Campo | Tipo | Obligatorio | Notas |
|---|---|---|---|
| `id` | TEXT | sí | |
| `company_id`, `customer_id` | TEXT | sí | |
| `label` | TEXT | sí | «Cuota mantenimiento web» |
| `series_code` | TEXT | sí | Serie de **factura** con la que se emitirá |
| `frequency` | TEXT | sí | `monthly` · `quarterly` · `yearly` |
| `day_of_period` | INTEGER | sí | Día del periodo en que toca (1–28, para que exista en todos los meses) |
| `start_date`, `end_date` | TEXT | sí / no | |
| `next_run_date` | TEXT | sí | Próximo periodo pendiente |
| `template_json` | TEXT | sí | Líneas y notas; mismo formato que el borrador de factura |
| `active` | INTEGER | sí | Pausar sin borrar |
| `created_at`, `updated_at` | TEXT | sí | |

### 3.6 `recurring_runs` (nueva, para no duplicar)

| Campo | Tipo | Notas |
|---|---|---|
| `recurring_id` + `period_key` | clave primaria | `period_key` = `2026-11` (mensual), `2026-T4` (trimestral), `2026` (anual) |
| `invoice_id` | TEXT → `invoices.id` | Borrador creado |
| `created_at` | TEXT | |

La clave primaria es la **idempotencia** de `docs/UX_UI.md` (`cliente + plantilla + periodo`): aunque la generación se lance dos veces, cada periodo crea un solo borrador.

## 4. Contratos (comandos Tauri, snake_case como `MODULE_CONTRACT.md`)

| Comando | Entrada | Salida | Errores |
|---|---|---|---|
| `commercial_document_list` | `company_id`, `kind`, filtros (`status`, `customer_id`, `year`), `limit`, `offset` | `{ items, total }` | — |
| `commercial_document_get` | `id` | documento + líneas + enlaces (`source`, `invoice`) | `not_found` |
| `commercial_document_save_draft` | documento sin `number` + líneas | documento con totales | `validation_error:<campo>` · `not_draft` |
| `commercial_document_delete_draft` | `id` | `{}` | `not_draft` |
| `commercial_document_send` | `id` | documento con `number` asignado y `status = sent`/`delivered` | `not_draft` · `empty_lines` |
| `commercial_document_set_status` | `id`, `status`, `reason?` | documento | `transition_not_allowed:<de>→<a>` · `reason_required` |
| `commercial_document_derive` | `id`, `target_kind` (`proforma` · `delivery_note`) | nuevo documento en borrador | `transition_not_allowed` |
| `commercial_document_to_invoice_draft` | `ids[]` (uno, o varios albaranes) | borrador de factura (`invoice_id`) | `mixed_customers` · `mixed_months` · `already_invoiced` · `not_delivered` |
| `commercial_document_pdf` | `id`, `target_path` | ruta y SHA-256 | `io_error` |
| `recurring_list` / `recurring_save` / `recurring_set_active` / `recurring_delete` | plantilla | plantilla | `validation_error:<campo>` |
| `recurring_generate_due` | `today?` (por defecto hoy) | `{ created: [invoice_id…], skipped: [period_key…] }` | — |
| `recurring_preview` | `id`, `count` (≤ 12) | próximas fechas y totales | — |

Todos registran en `verify-ui-contract.mjs` (cada `invoke` de la UI debe existir en `lib.rs`).

## 5. Cómo funciona cada flujo

### 5.1 Presupuesto → factura
1. Documentos › Presupuestos › «Nuevo presupuesto». Editor igual que el de facturas (cliente, líneas, validez, notas) con `DocPreview` a la derecha.
2. «Enviar» asigna número y pasa a `sent`. Genera el PDF. En v1 el envío es «Guardar PDF» o «Abrir en el correo» (`mailto:`), sin SMTP propio.
3. El cliente acepta: «Marcar como aceptado».
4. «Convertir en factura» → `commercial_document_to_invoice_draft` crea un **borrador de factura** con las mismas líneas, enlazado (`invoice_id`), y abre el editor de factura. El presupuesto pasa a `converted`.
5. La persona revisa y emite con la confirmación de siempre.

### 5.2 Proforma
Igual que el presupuesto, con «Marcar como pagada» (registra el anticipo como nota, no como cobro fiscal) y conversión a factura. El PDF lleva «Factura proforma · sin valor fiscal» en la cabecera, en grande.

### 5.3 Albaranes y factura recapitulativa
1. Cada entrega: «Nuevo albarán» con fecha de entrega y líneas; «Marcar como entregado» asigna número.
2. A fin de mes, en la lista de Albaranes, filtro por cliente y mes, casillas de selección y barra «N seleccionados · Facturar juntos» (design.md §7.4).
3. `commercial_document_to_invoice_draft` con los `ids` comprueba: mismo cliente, mismo mes natural, todos `delivered`, ninguno facturado. Si algo falla, el botón queda deshabilitado con el motivo («Hay albaranes de otro cliente»).
4. Crea un borrador de factura con una línea por línea de albarán, precedida de una línea de texto «Albarán AL-2026-0012 · 05/11/2026». Los albaranes pasan a `invoiced` cuando la factura se **emite** (no al crear el borrador): si se borra el borrador, vuelven a `delivered`.
5. Aviso en el editor si hoy es posterior al plazo de expedición. [verificar norma: RD 1619/2012 art. 11 y 13 — plazo para la recapitulativa según el destinatario sea o no empresario]

### 5.4 Facturas recurrentes
1. Recurrentes › «Nueva plantilla»: cliente, serie, líneas, frecuencia, día, inicio y fin. `recurring_preview` muestra las próximas 3 fechas e importes antes de guardar.
2. **Al abrir la app** (y con un botón «Generar ahora») se llama a `recurring_generate_due`: por cada plantilla activa y cada periodo vencido sin fila en `recurring_runs`, crea un **borrador** de factura y su fila. Si la app estuvo cerrada tres meses, crea los tres borradores, cada uno con su fecha de periodo, y lo dice: «Hemos preparado 3 borradores de “Cuota mantenimiento”».
3. Los borradores aparecen en Facturas con el chip `BORRADOR` y la etiqueta de la plantilla. Se emiten a mano, uno a uno o seleccionando varios (cada uno con su confirmación).
4. Pausar (`active = 0`) no borra el historial. Borrar una plantilla no borra sus facturas.

Por qué al abrir la app y no en segundo plano: la app es local y no tiene servidor; un programador del sistema operativo añadiría código por plataforma y permisos. Como solo se crean borradores (sin número ni efecto fiscal), generarlos al abrir es seguro. Cuando exista la versión web, el servidor hará lo mismo con la misma clave de idempotencia.

## 6. Pantallas (componentes de design.md §7)

Navegación (design.md §5.1, máximo 7): **Facturas · Documentos · Recurrentes · Clientes · Productos · Verifactu · Ajustes**. Documentos tiene pestañas Presupuestos · Proformas · Albaranes.

| Ruta | Pantalla | Componentes | Vacío / carga / error |
|---|---|---|---|
| `#/documentos/presupuestos` | Lista | `Hero` plain «Tus **presupuestos**» + primario «Nuevo presupuesto» · `DataTable` (Número mono · Fecha · Cliente · Validez · Estado `StatusChip` · Total mono · ⋯) | Vacío: «Aún no hay presupuestos. Crea el primero.» · `Skeleton` · error con «Reintentar» |
| `#/documentos/presupuestos/:id` | Ficha / editor | `Field`, `MoneyInput`, `DateInput`, `DocPreview`, `ActivityLog`, `ConfirmDialog` (convertir, anular con motivo) | — |
| `#/documentos/proformas` y `/:id` | Igual | Igual, con «Marcar como pagada» | — |
| `#/documentos/albaranes` | Lista con selección | `DataTable` con casillas y barra flotante «Facturar juntos» | — |
| `#/recurrentes` | Lista de plantillas | `DataTable` (Plantilla · Cliente · Frecuencia · Próxima fecha mono · Importe · Activa) · `StatCard` «Borradores pendientes de emitir» | Vacío: «Aún no hay facturas recurrentes. Crea una para no repetir cada mes la misma factura.» |
| `#/recurrentes/:id` | Editor de plantilla | `Field`, `Select` frecuencia, vista de próximas fechas, `ActivityLog` | — |

**Hasta que cada módulo esté implementado** (decisión de Ricardo, 03-11): la entrada del menú se ve y abre un `EmptyState` explicativo, sin botones que no funcionen:

- Documentos: «**Presupuestos, proformas y albaranes.** Prepara un precio, cobra un anticipo o registra entregas, y conviértelos en factura con un clic. Ninguno tiene valor fiscal hasta que se convierte en factura. Llega después del envío a la AEAT.»
- Recurrentes: «**Facturas que se repiten.** Crea una plantilla y cada mes, trimestre o año tendrás un borrador listo para revisar y emitir. Nunca se emite nada sin ti. Llega después del envío a la AEAT.»

## 7. Qué se reutiliza de la rama `claude/cf-funcionalidades-estrella`

| Pieza | Se reutiliza | Cambia |
|---|---|---|
| Tabla `quotes` y su numeración `P{año}-NNNN` | La idea y los tests | Pasa a `commercial_documents` con `kind`; líneas en tabla propia en vez de `draft_json` |
| Tabla `recurring_invoices` y `recurring_generate_due` | Lógica de fechas y tests | Añade `recurring_runs` (idempotencia) y `series_code`; `draft_json` → `template_json` |
| `QuotesView.tsx`, `RecurringView.tsx` | Solo como referencia de campos | UI nueva con `src/ui/` y tokens de design.md |
| `email.rs` (`lettre` + `keyring`) | No en v1 | «Abrir en el correo» con `mailto:`; SMTP propio se revisa cuando lo pidan usuarios |
| Cobros (`invoice_payments`) | Fuera de este documento | Encaja con `interop.payment.matched.v1` de ContaPro (SUITE_PLAN E5) |

## 8. Criterios de aceptación (comprobables)

1. Ningún comando de este módulo escribe en `invoice_sequences`, `fiscal_records`, `fiscal_exports` ni `verifactu_submissions` (test que cuenta filas antes y después).
2. Convertir un presupuesto crea un borrador de factura con las mismas líneas y totales al céntimo; el presupuesto queda `converted` y enlazado.
3. `commercial_document_to_invoice_draft` rechaza albaranes de dos clientes, de dos meses, no entregados o ya facturados, con el código de error de §4.
4. Borrar el borrador de una recapitulativa devuelve sus albaranes a `delivered`; emitirla los pasa a `invoiced`.
5. `recurring_generate_due` ejecutado dos veces el mismo día crea los borradores una sola vez.
6. Tras 3 periodos sin abrir la app se crean 3 borradores con su fecha de periodo.
7. El PDF de presupuesto, proforma y albarán no contiene QR ni huella y muestra «Documento sin valor fiscal».
8. Toda transición inválida devuelve `transition_not_allowed:<de>→<a>` y no cambia nada.
9. Cada pantalla pasa la lista de design.md §12 en los 4 modos.

## 9. Decisiones (Ricardo, 03-11)

Resueltas: 1 → no se rellena `FechaOperacion` en recapitulativas hasta confirmarlo con la norma; 2 → el anticipo se registra como **cobro** (trae el módulo de cobros); 3 → series configurables con `P`, `PF`, `AL` por defecto; 4 → se factura y la emisión se bloquea mientras haya líneas «pendiente de precio». Detalle en `docs/PLAN_TRABAJO_2026-11-03.md` §4b.

Texto original de las preguntas:

1. **Fecha de operación en la recapitulativa.** El registro VERI\*FACTU tiene un solo campo `FechaOperacion`. Con albaranes de varias fechas, ¿se usa la última fecha de entrega, se omite el campo, o se pregunta al asesor? Propuesta: omitirlo y poner las fechas en las líneas del PDF, **pendiente de confirmar con la norma y la FAQ de la AEAT**.
2. **Proforma «pagada»**: ¿registrar el anticipo como cobro (y luego descontarlo en la factura) o solo como nota? Propuesta v1: nota.
3. **Series**: ¿códigos `P`, `PF`, `AL` fijos o configurables en Ajustes › Series como las de factura? Propuesta: configurables, con esos por defecto.
4. **Albarán sin precios**: ¿se permite facturar uno sin precios (habría que ponerlos en el borrador)? Propuesta: sí, el borrador avisa de las líneas a 0 €.

## 10. Reparto propuesto

| Bloque | Quién | Entregable |
|---|---|---|
| Migración 010 + `db/commercial_documents.rs` + comandos §4 (documentos) + tests §8.1–8.4, 8.7–8.8 | Bilel | PR `f4(documentos): modelo y comandos` |
| Migración 011 + `db/recurring.rs` + comandos §4 (recurrentes) + tests §8.5–8.6 | David | PR `f4(recurrentes): modelo y generación idempotente` |
| PDF sin valor fiscal (reutiliza `services/pdf.rs`) | Bilel | Dentro de su PR |
| Pantallas §6 con `src/ui/` | Opus | Un PR por módulo, después de los dos anteriores |

Antes de empezar cada PR: plan esquemático en el PR y OK de Ricardo (protocolo design.md §0.2, porque es un cambio sustancial de esquema).
