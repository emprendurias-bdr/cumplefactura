# Documentos a revisar

Documentos que la limpieza de Bilel (rama `bilel/cosas-hechas-no-se-si-funciona`) borraba.
Ningun script, test ni codigo los lee, asi que la app funciona igual sin ellos.
Se guardan aqui porque tienen contenido de producto o de entorno que no esta en otro sitio.
Decidir uno a uno: conservar (moverlo a `docs/`), fusionar con otro documento o borrar.

| Documento | Que contiene | Por que no se borra sin mirar |
|---|---|---|
| `PRODUCT_BRIEF_CUMPLEFACTURA.md` | Alcance del MVP, imprescindibles y fuera de alcance | Es la definicion de producto; CLAUDE.md lo cita |
| `IDENTITY_ADOPTION.md` | Plan de login comun (Keycloak, tenants) | CLAUDE.md lo cita; decision de arquitectura futura |
| `README_DEV.md` | Requisitos y comandos de desarrollo en Windows (tauri-driver, edgedriver) | El README nuevo es mucho mas corto y no cubre el E2E de escritorio |
| `REPLANTEAMIENTO_ARQUITECTURA.md` | Diagnostico de encaje en la suite modular | Decision de arquitectura sin otra copia |
| `cumplefactura.md` | Investigacion de mercado y posicionamiento (ADR-005) | Estrategia de producto sin otra copia |

Se restauraron en la raiz, porque los usan los scripts del gate regulatorio:
`REGULATORY_EVIDENCE_MATRIX.md`, `MODULE_CONTRACT.md`, `REGULATORY_TEST_PLAN.md` y `CLAUDE.md`.

Se borraron definitivamente los planes de sprint de junio en `docs/plans/`, ya implementados
y cubiertos por el smoke de navegador. Siguen en el historial de git.
