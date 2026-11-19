# Fabricante del sistema informático de facturación (SIF)

Lo rellena Ricardo (acción H2 de `docs/BACKLOG_GA.md`). Las tareas N2, P2 y L2 leen este fichero con `git show origin/cf/ga-backlog:docs/legal/FABRICANTE.md`. Mientras un campo diga `PENDIENTE`, esas tareas dejan el dato marcado y lo avisan en su PR.

Son datos de empresa (públicos), no secretos. No poner aquí certificados, contraseñas ni claves.

| Campo | Valor | Dónde se usa |
|---|---|---|
| Razón social del fabricante | PENDIENTE | XML `SistemaInformatico/NombreRazon`, declaración responsable |
| NIF del fabricante | PENDIENTE | XML `SistemaInformatico/NIF`, declaración responsable |
| Nombre del sistema informático | PENDIENTE (hoy «CumpleFactura»; el nombre comercial está sin decidir) | XML `NombreSistemaInformatico`, instalador |
| Id del sistema informático (2 caracteres) | PENDIENTE (hoy «CF») | XML `IdSistemaInformatico` |
| Versión | 1.0.0 | XML `Version`, instalador |
| Identificador de la app (Tauri) | PENDIENTE (hoy `com.local.cumplefactura`) | instalador, carpeta de datos |
| Dirección postal del fabricante | PENDIENTE | declaración responsable |
