# Replica adaptada — CumpleFactura fase 2

Fuente autorizada: `docs/UX_UI.md`, `docs/IMPLEMENTACION_UX_UI.md` fase 2 y PNG/HTML 1–5 de `docs/mockups/`; tokens en `_assets/app.css`. Sustituyen las propuestas locales anteriores. Adaptación de Replica MIT, upstream `Jakeschincariol/replica-skill` commit `77c9436fb3d18c3d58169efb8caf4fe906b0dc51`. Se conserva el producto React/Tauri existente y sus contratos.

| Requisito / referencia | Implementación | Comprobación / diferencia |
|---|---|---|
| Facturas, maqueta 1 | InvoiceTable + InvoiceFilters + FiscalProgress | Tabla, filtros y totales visibles; 40/48 px, ambos temas/tamaños. Fixture de una factura, no las cifras de la maqueta |
| Editor, maqueta 2 | InvoiceWorkspace + InvoicePreview | Formulario y vista provisional BDR, número nativo, límites de importes y PDF invalidado al editar. PDF fiscal conserva diseño anterior, sin QR |
| Emitir, maqueta 3 | ConfirmDialog compartido | Lo entiendo, consecuencias, foco y una sola emisión en curso. Texto describe capacidad real: envío y cola pendientes |
| Verifactu, maquetas 4–5 | VerifactuScreen | Estados vinculados a evidencia. Sin conexión/cola/CSV/certificado ficticios; esos estados de ejemplo no se copian como datos reales |
| Rectificativa, guía §6 | RectificationWizard | Escenario, propuesta, revisión, confirmación. Conserva abono legado de importe fijo con aviso visible |
| Primer arranque, guía | FirstRun | Empresa, fiscalidad, serie, certificado/carpeta; guardar no acredita certificado |
| Teclado y accesibilidad | Componentes compartidos + estilos BDR | N y / fuera de formularios/diálogos; Esc; confirmaciones; 76 capturas y axe. Incompletos conservados, sin afirmar WCAG certificada |
| Integridad fiscal | Controlador original + proyección conservadora | 39 llamadas originales conservadas, 68 tests Rust, XSD/core. Gate regulatorio completo bloqueado |

Capturas: `docs/phase2/screenshots/`. Automatización: `tools/verify-phase2-browser.mjs`, `tools/verify-phase2-visual.mjs`; resultados JSON y límites en `docs/phase2/`. Comparación visual manual realizada sobre tabla, editor a 1024 y 1440, confirmación y estado fiscal en claro/oscuro. Se corrigieron controles IRPF/borrado recortados a 1024 y contraste de la página provisional en oscuro. No se calcula una puntuación de paridad: datos y capacidades reales difieren de los ejemplos de las maquetas. Estado: implementado parcialmente, entrega en borrador, sin autorización de publicación ni cierre regulatorio inferidos.
