# Fabricante del sistema informático de facturación (SIF)

Lo rellena Ricardo (acción H2 de `docs/BACKLOG_GA.md`). Las tareas N2, P2 y L2 leen este fichero con `git show origin/cf/ga-backlog:docs/legal/FABRICANTE.md`. Mientras un campo diga `PENDIENTE`, esas tareas dejan el dato marcado y lo avisan en su PR.

Son datos de empresa (públicos), no secretos. No poner aquí certificados, contraseñas ni claves.

| Campo | Valor | Dónde se usa |
|---|---|---|
| Razón social del fabricante | VENDINGSAIZARAGON, S.L. | XML `SistemaInformatico/NombreRazon`, declaración responsable |
| NIF del fabricante | B98945173 | XML `SistemaInformatico/NIF`, declaración responsable |
| Nombre del sistema informático | CumpleFactura (provisional: el nombre comercial se decidirá más adelante) | XML `NombreSistemaInformatico`, instalador |
| Id del sistema informático (2 caracteres) | CF | XML `IdSistemaInformatico` |
| Versión | 1.0.0 | XML `Version`, instalador |
| Identificador de la app (Tauri) | `es.saizaragon.cumplefactura` | instalador, carpeta de datos |
| Dirección postal del fabricante | Calle Naranjo 38, 46117 Bétera, Valencia, España | declaración responsable |
