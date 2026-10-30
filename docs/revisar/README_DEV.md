# CumpleFactura - Developer README

Aplicacion desktop local-first para facturacion espanola. Base creada para Tauri 2, React, TypeScript, Rust y SQLite.

## Requisitos

- Node.js LTS
- npm
- Rust stable (`%USERPROFILE%\.cargo\bin` debe estar en PATH)
- Dependencias Tauri para Windows
- `tauri-driver` instalado en `%USERPROFILE%\.cargo\bin`
- WebDriver local: `edgedriver` dev dependency para Microsoft Edge WebView2/Tauri en Windows

## Comandos

```powershell
npm install
npm run dev
npm run tauri:dev
```

Validaciones utiles:

```powershell
npm run build
npm run validate:evidence-matrix
npm run validate:evidence-ledger
npm run validate:external-acceptance
npm run validate:contapro-sidecar-import
npm run validate:external-readiness
npm run validate:core-e2e
npm run validate:browser-smoke
npm run validate:secret-scan
npm run validate:tauri-desktop-e2e
npm run validate:regulatory
cd src-tauri
cargo check
cargo test
```

Build desktop:

```powershell
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
npm run tauri:build
```

## Estado actual

Incluido:

- Shell React/Vite con flujo demo emisor -> cliente -> borrador -> emision.
- Datos demo detras del control explicito `Activar datos demo`.
- Configuracion Tauri 2.
- CSP Tauri explicita; `csp: null` eliminado.
- Comandos Rust iniciales para empresa, cliente, factura, fiscal, defaults, exports y backup.
- Defaults de app/export resueltos por `app_defaults_get`; React no hardcodea un perfil de Windows.
- Dominio Rust para factura, totales, rectificativa, flags territoriales y hash fiscal.
- Series de facturacion configurables por empresa/ejercicio: codigo, año opcional, separador, padding y siguiente numero (`VENDI202601`, `AL-001`, `C-001`, `I-001`).
- Al guardar serie se inicializa `invoice_sequences` y se bloquea cualquier `next_number` que choque con facturas ya emitidas.
- Editor de factura con selector de serie por factura y lineas editables: cantidad, precio, descuento, IVA e IRPF.
- Alta/edicion real de empresas y clientes desde formularios; el demo solo rellena campos.
- Onboarding inicial guiado: empresa activa, fiscalidad local, serie activa y carpeta export persistida en `app_settings`.
- File picker nativo Tauri para carpeta export, backup, restore y artefactos PDF/JSON/CSV/XML/auditoria con campos de ruta read-only.
- Catalogo productos/servicios por empresa con SKU, precio, IVA, IRPF/descuento y boton para usar en linea de factura.
- Busqueda/filtros de facturas por texto, empresa, cliente, año, serie, estado y tipo.
- Paginacion local de facturas, auditoria y registros fiscales con `limit/offset`.
- Servicio de auditoria con hash chain.
- Pantalla de auditoria fiscal local con verificacion de cadena, incidencias, hash final por empresa y export JSON con `chain_verification`.
- Runtime SQLite local con migraciones, indices, listados, backup, PDF basico, exports JSON/CSV/auditoria y auditoria append-only.
- Numeracion automatica por empresa/ejercicio/serie usando `invoice_sequences`; `invoice_issue` ignora numeros enviados por UI.
- Registro fiscal SQLite `fiscal_records` append-only para `Alta` y `Anulacion`.
- Specs regulatorios en `tests/regulatory/`.
- Export XML VERI*FACTU borrador desde factura emitida, con huella SHA-256 AEAT, validacion XSD local, `PrimerRegistro`/`RegistroAnterior` desde cadena fiscal y sin envio.
- Export XML `RegistroAnulacion` desde factura emitida, XSD-validado, persistido como registro fiscal y marcando la factura como `Void`.
- Verificador de cadena fiscal: recalcula huellas AEAT, valida enlaces `previous_fiscal_hash`, detecta tamper de factura, duplicados y XML de anulacion ausente.
- Rectificativas `R1-R5` con metodo incremental/sustitutivo `I/S`: emite factura `Rectifying`, admite linea negativa, persiste causa/metodo, referencia la factura original en XML VERI*FACTU y marca la original como `Rectified`. Si el metodo es `S`, el XML incluye `ImporteRectificacion`.
- Preparacion local de firma/envio: valida XML, calcula SHA256, registra `fiscal_exports` y deja estado `prepared_for_signature` sin firmar ni enviar.
- Firma XAdES exact-XML mediante sidecar local `/verifactu/sign-xml`: requiere `CUMPLEFACTURA_ENABLE_REAL_XADES_SIDECAR=1`, secreto HMAC compartido, preflight listo y sidecar en modo XAdES real; registra export `signed_xades`.
- Preflight de envio VERI*FACTU via sidecar local `/verifactu/submit-preflight`: requiere XML `signed_xades`, `CUMPLEFACTURA_ENABLE_VERIFACTU_SUBMIT_SIDECAR_PREFLIGHT=1`, secreto HMAC y `vault://certs/...`; comprueba WSDL/vault/flags sin enviar XML bruto ni llamar AEAT.
- Frontera de envio VERI*FACTU via sidecar local `/verifactu/invoke-submit`: requiere `CUMPLEFACTURA_ENABLE_VERIFACTU_SUBMIT_SIDECAR_INVOKE=1`, XML firmado, secreto HMAC y certificado en vault; solo el sidecar puede llamar AEAT y el gate usa sidecar falso.
- Import local de readiness ContaPro sidecar `npm run validate:contapro-sidecar-import`: MVP solo VERI*FACTU/SII con manifiesto `accepted/passed`; FACe/TicketBAI quedan diferidos como evidencia redacted.
- Panel `Canales ContaPro sidecar`: muestra `mvp_importable`; preflight fail-closed accionable para SII `/sii/submit-preflight`.
- Preflight SII requiere `CUMPLEFACTURA_ENABLE_SII_SUBMIT_SIDECAR_PREFLIGHT=1`, HMAC y `vault://certs/...`; por defecto queda bloqueado.
- Validador XSD local `tools/validate-verifactu-xsd.ps1` + fixture `tests/regulatory/fixtures/verifactu-registro-alta-basic.xml`.
- Tests Rust que generan XML VERI*FACTU alta/anulacion desde `services::verifactu` y lo validan contra los XSD locales en Windows.
- Tests Rust de huella `RegistroAlta` y `RegistroAnulacion` contra ejemplos oficiales AEAT.
- Recursos Tauri para empaquetar validador PowerShell y XSD junto al ejecutable; fallback al arbol dev.
- Gate regulatorio reproducible `npm run validate:regulatory`, con evidencia JSON/Markdown en `tests/regulatory/evidence/`.
- Matriz de promesas/fuentes/tests/limites en `REGULATORY_EVIDENCE_MATRIX.md`.
- Validador de matriz `npm run validate:evidence-matrix`, integrado en el gate para bloquear promesas sin fuente, evidencia ejecutable o limite.
- Ledger SHA256 `npm run validate:evidence-ledger`, integrado en el gate para hashear fuentes normativas locales, artefactos del repo, fixtures, evidencias generadas y logs.
- Entrada de evidencia externa `npm run validate:external-acceptance`, integrada en el gate para validar manifiestos redacted con hashes SHA256; sin manifiesto real registra `not_provided`.
- Readiness externa `npm run validate:external-readiness`, integrada en el gate para declarar si faltan driver Tauri, sidecar verde, flags, vault, certificado o evidencia de aceptacion.
- E2E core real `npm run validate:core-e2e`: SQLite en memoria, dominio Rust, huella AEAT, XML XSD, PDF y paquete `prepared_for_signature`.
- Smoke E2E de navegador `npm run validate:browser-smoke`, integrado en el gate; usa mock Tauri local y genera `latest-browser-smoke.json/png`.
- Secret scan local `npm run validate:secret-scan`, integrado en el gate; genera evidencia redacted y no imprime valores.
- Desktop E2E `npm run validate:tauri-desktop-e2e`, integrado en el gate; standalone usa preflight por defecto y el gate activa WebDriver real con `CUMPLEFACTURA_TAURI_DESKTOP_E2E_REAL=1`.
- Readiness desktop E2E comprueba `src-tauri/target/release/cumplefactura.exe`, `tauri-driver`, Microsoft Edge WebDriver y evidencia latest pasada.
- Tests Rust en `domain::invoice`, `services::audit`, `services::pdf`, `services::verifactu` y `db` (persistencia, listados, backup, PDF, XML, append-only).
- Build Tauri release validado: `src-tauri/target/release/cumplefactura.exe`.

Pendiente:

- Mejorar onboarding inicial con wizard paso a paso.
- Anadir conteos totales, tamanos de pagina configurables y vistas guardadas.
- Ampliar specs regulatorios a tests Rust/TS de persistencia, XML y UI.
- Convertir selector `R1-R5/I-S` en asistente de causa con validaciones de negocio por caso.
- Probar firma XAdES con certificado real de homologacion/produccion montado en vault del sidecar.
- Probar transporte/envio AEAT real con certificado autorizado y registrar homologacion externa mediante manifiesto validado.
- Mantener E2E Tauri desktop real en gate y ampliar cobertura visual si se anaden flujos nuevos.
- Convertir `backup_restore` de preflight a recuperacion offline documentada si se decide permitir restore destructivo.
- Decidir alcance real SII/foral antes de prometerlo comercialmente.
- FACe sigue bloqueado por alta externa del certificado como SP; TicketBAI por politica/registro/licencia/homologacion foral.

## Regla de oro

La fuente regulatoria no esta en este repo. Para interpretar obligaciones usar `C:\03 LEGISLACION` y citar PDF/norma/version antes de convertir a codigo.

