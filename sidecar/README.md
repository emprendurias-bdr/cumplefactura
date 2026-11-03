# `sidecar/` — `cumplefactura-sidecar`

Proceso aparte que la app de escritorio arranca cuando hace falta enviar un registro VERI\*FACTU. Es el **único** código del repositorio que abre el certificado del contribuyente y el **único** que se conecta a internet. La app genera, numera, encadena y valida el XML; el sidecar lo envuelve en SOAP, lo manda por TLS mutuo a la AEAT y devuelve el resultado interpretado.

Este fichero explica la **estructura** (qué hay en cada fichero, en qué orden leerlo, cómo compilarlo, probarlo y extenderlo). La **arquitectura** (por qué existe, base legal, ciclo de vida, contrato HTTP, modelo de amenazas, límites) está en [`ARQUITECTURA.md`](ARQUITECTURA.md).

## 1. Dónde encaja

```
src/ (React) ──invoke──▶ src-tauri/ (Rust)
                            ├─ services/sidecar_process.rs   arranca el sidecar, le da el secreto por stdin,
                            │                                lee el puerto por stdout, lo vigila y lo mata al salir
                            └─ services/verifactu_submit.rs  POST JSON firmado con HMAC al puerto loopback
                                        │
                                        │  http://127.0.0.1:<puerto>  +  x-signature: HMAC-SHA256(secreto, cuerpo)
                                        ▼
                         sidecar/ (este crate) ──TLS 1.2+ con certificado de cliente──▶ AEAT (4 endpoints fijos)

crates/fiscal-contract/   lo que comparten los dos lados: rutas, mensajes JSON, HMAC, endpoints, lector HTTP
```

Tres crates en un workspace (`Cargo.toml` de la raíz): `src-tauri` (app), `sidecar` (este) y `crates/fiscal-contract` (contrato). Si el contrato cambia, app y sidecar dejan de compilar a la vez: no pueden desalinearse en silencio.

## 2. Mapa de ficheros

Orden de lectura recomendado: de arriba abajo. Cada fichero empieza con un comentario `//!` que dice **qué hace, qué no hace nunca y por qué**.

| Orden | Fichero | Líneas | Responsabilidad | Depende de |
|---|---|---|---|---|
| 1 | `src/lib.rs` | 60 | Mapa de módulos y `AeatBackend`, el único `Backend` real (vault + HTTPS). | todos los módulos |
| 2 | `src/main.rs` | 65 | Arranque: argumentos → secreto por stdin → `TcpListener` en `127.0.0.1:0` → handshake JSON por stdout → vigilante de stdin → `server::serve`. | `config`, `server` |
| 3 | `src/config.rs` | 123 | `parse_args` (`--allow-aeat`, `--allow-production`, `--vault-dir`), `parse_secret` (64 hex = 32 bytes), `SidecarConfig`. | `fiscal_contract::from_hex` |
| 4 | `src/server.rs` | 251 | Frontera de confianza: solo pares loopback, lee una petición (≤ 4 MiB, 15 s), `GET /healthz` sin firma, todo `POST` con HMAC, enruta, responde y cierra. `route()` no toca sockets y se prueba directamente. | `handlers`, `fiscal_contract::http` |
| 5 | `src/handlers.rs` | 514 | **Política.** `healthz`, `preflight` (acumula todos los bloqueos sin red; añade la caducidad del certificado y sus avisos) e `invoke_submit` (comprobaciones en orden; la primera que falla devuelve 409 sin abrir conexión). Define el trait `Backend` para inyectar un vault y una AEAT falsos en tests. | `soap`, `fiscal_contract::{endpoints, messages}` |
| 6 | `src/vault.rs` | 433 | `vault://certs/<id>` → `<vault_dir>/<id>.p12|.pfx` + contraseña (la de la petición, `certificate_password`; si no llega, `CUMPLEFACTURA_CERT_PASSWORD_<ID>` o `CUMPLEFACTURA_CERT_PASSWORD`) → `native_tls::Identity`. Ruta canonizada dentro del vault; errores como códigos fijos, nunca rutas. `certificate_not_after`: lee `notAfter` con un apretón de manos TLS en memoria consigo mismo y un parseo DER mínimo. | `native-tls` |
| 7 | `src/soap.rs` | 244 | `wrap_regfactu` (sobre SOAP 1.1 alrededor del XML exacto de la app; rechaza cualquier raíz que no sea `sfLR:RegFactuSistemaFacturacion`) y `parse_response` (CSV, `EstadoEnvio`, `EstadoRegistro`, error, `TiempoEsperaEnvio`, `Fault`). | `roxmltree` |
| 8 | `src/aeat_client.rs` | 235 | **Único módulo con red saliente.** TCP → TLS 1.2+ con identidad del vault → un `POST` → lectura con el lector HTTP común. Sin redirecciones, sin reintentos, sin URLs externas (solo `EndpointName`). | `native-tls`, `fiscal_contract::http` |
| 9 | `tests/process.rs` | 129 | Ejecuta el binario real como lo hace la app: secreto por stdin, handshake, llamadas firmadas, 401 sin firma, 409 sin `--allow-aeat`, salida al cerrar stdin. | binario compilado |

Contrato compartido (`crates/fiscal-contract/src/`): `lib.rs` (rutas, cabeceras, límites, `certificate_id`, hex, SHA-256, HMAC con verificación en tiempo constante), `messages.rs` (structs JSON de handshake, salud, preflight, envío y error), `endpoints.rs` (los 4 puertos del WSDL oficial y cuáles son producción), `http.rs` (lector HTTP/1.1 mínimo y cliente loopback firmado). 727 líneas con tests.

Lado app (`src-tauri/src/services/`): `sidecar_process.rs` (localiza el binario junto al ejecutable, lo lanza con un secreto nuevo de 32 bytes, relanza si muere, `shutdown` al cerrar) y `verifactu_submit.rs` (relee el XML y exige el SHA-256 exportado, impone `TiempoEsperaEnvio`, llama a preflight/envío, rechaza respuestas que filtren la referencia del certificado, el secreto o la contraseña, guarda **toda** respuesta en `verifactu_submissions`, también `transport_error`).

## 3. Flujo de una petición, línea a línea

1. **La app** (`verifactu_submit::submit`) construye `InvokeSubmitRequest { xml, xml_sha256, endpoint_name, certificate_ref, timeout_seconds, certificate_password }` y lo envía con `fiscal_contract::http::post_json_loopback`, que firma el cuerpo exacto con HMAC-SHA256 y el secreto de la sesión.
2. **`server::handle_connection`** comprueba que el par es loopback, lee la petición completa y la pasa a `route`.
3. **`server::route`** exige `x-signature` válida (401 si no), deserializa el JSON (400 si no) y llama a `handlers::invoke_submit`.
4. **`handlers::invoke_submit`** comprueba, en este orden y sin red: endpoint en la lista cerrada → producción solo con `--allow-production` → SHA-256 del XML igual al declarado → raíz `RegFactuSistemaFacturacion` (`soap::wrap_regfactu`) → `--allow-aeat` → el certificado abre (`Backend::load_certificate`, es decir `vault::load`, con `certificate_password` si llegó). La primera que falla devuelve `(409, ErrorResponse { error, external_call_performed: false })`.
5. **`aeat_client::post_soap`** abre TCP al host del endpoint, negocia TLS con la identidad, envía el sobre SOAP y lee la respuesta (incluido un 500 con `Fault`).
6. **`soap::parse_response`** reduce el XML de la AEAT a `AeatOutcome` (`accepted`, `accepted_with_errors`, `rejected`, `transport_error`).
7. **`handlers::invoke_submit`** devuelve `InvokeSubmitResponse` con `external_call_performed: true`; `server` lo serializa y cierra la conexión.
8. **La app** comprueba que el SHA-256 devuelto es el enviado y que la respuesta no contiene la referencia del certificado, el secreto ni la contraseña; guarda la respuesta (también `transport_error`) en `verifactu_submissions` (un mismo XML solo puede quedar aceptado una vez). Antes del paso 1 ya rechazó `xml_already_accepted_by_aeat` y `aeat_wait_time_pending:<segundos>`.

El preflight sigue los pasos 1–4 sin llegar nunca al 5: devuelve 200 con `status: blocked` y **todos** los bloqueos, para que la pantalla muestre de una vez lo que falta. Si el certificado abre, añade `certificate_expires_at` y `certificate_expires_in_days` (o `null` si no se pudieron leer) y los avisos `certificate_expires_soon` (≤ 30 días) o `certificate_expired` (este también bloquea).

## 4. Compilar, ejecutar y probar

```bash
# Tests del contrato y del sidecar (funcionan en Linux, macOS y Windows; no necesitan Tauri ni escritorio)
cargo test -p fiscal-contract -p cumplefactura-sidecar

# Binario release en target/release/cumplefactura-sidecar[.exe]
cargo build -p cumplefactura-sidecar --release

# Arranque manual (la app lo hace sola): el secreto va por stdin, el puerto sale por stdout
printf '%s\n' "$(openssl rand -hex 32)" | ./target/release/cumplefactura-sidecar --vault-dir ./certs
#   {"port":51234,"pid":4321,"version":"0.1.0"}

# Smoke del binario como lo usa el gate (nunca pasa --allow-aeat)
node tools/verify-sidecar-smoke.mjs

# Copiar el binario con el sufijo de plataforma que exige Tauri para externalBin
node tools/build-sidecar.mjs            # → src-tauri/binaries/cumplefactura-sidecar-<triple>[.exe]

# Homologación manual contra la AEAT de pruebas (requiere certificado real; fuera del gate)
node tools/homolog-verifactu.mjs --xml <registro.xml> --cert vault://certs/<id> --vault-dir <carpeta>           # solo preflight
node tools/homolog-verifactu.mjs --xml <registro.xml> --cert vault://certs/<id> --vault-dir <carpeta> --enviar  # envío real
```

Interruptores de arranque (todos apagados por defecto; la app solo pasa `--allow-aeat` si `CUMPLEFACTURA_SIDECAR_ALLOW_AEAT=1`, y nunca pasa `--allow-production` en v1):

| Interruptor | Efecto |
|---|---|
| `--allow-aeat` | Permite abrir conexiones a la AEAT. Sin él, todo responde pero nada sale a internet. |
| `--allow-production` | Permite `SistemaVerifactu` y `SistemaVerifactuSello`. Sin él, solo los dos endpoints de pruebas. |
| `--vault-dir <carpeta>` | Única carpeta de la que se leen certificados `<id>.p12` / `<id>.pfx`. |

Variables de entorno que lee el sidecar: `CUMPLEFACTURA_CERT_PASSWORD_<ID>` y `CUMPLEFACTURA_CERT_PASSWORD` (contraseña del PKCS#12), solo si la petición no trae `certificate_password`. Ninguna otra. El secreto HMAC **nunca** va por entorno ni argumentos.

Contraseña del certificado (ADR-002): la app la manda en el cuerpo firmado (`certificate_password`) en modo `session` (por defecto) y `keychain` (mientras no haya llavero, igual que `session`); en modo `env` manda `null`. **Nunca** se registra, nunca aparece en una respuesta, nunca se guarda en disco ni en SQLite: el sidecar la usa para abrir el PKCS#12 y la suelta.

## 5. Qué prueba cada test

| Dónde | Qué queda demostrado |
|---|---|
| `config::tests` | Por defecto todo cerrado; argumentos desconocidos o incompletos impiden arrancar; el secreto debe ser 32 bytes hex. |
| `server::tests` | `/healthz` sin firma; `POST` sin firma o con otro secreto → 401; JSON inválido → 400; ruta desconocida → 404; método incorrecto → 405; preflight y envío siguen la política. |
| `handlers::tests` | Orden exacto de las comprobaciones con `FakeBackend` (sin certificados ni red); el preflight acumula todos los bloqueos; la respuesta nunca contiene `vault://`, el XML ni la contraseña; la contraseña de la petición llega al vault; avisos de caducidad (> 30 días, ≤ 30 días, caducado) con fecha inyectada; errores de red → `transport_error` con `http_status: null`. |
| `vault::tests` | Referencias fuera del vault o con `..` rechazadas; vault ausente; fichero ausente; contraseña ausente; PKCS#12 inválido; ruta feliz con un `.p12` generado con `openssl` si está instalado, con la contraseña del entorno y con la de la petición (nunca hay certificados en el repo); `notAfter` leído del DER (`rcgen`) y de una identidad real; fechas UTCTime/GeneralizedTime. |
| `soap::tests` | Sobre sin BOM ni doble declaración; raíz distinta o DTD rechazadas; respuestas aceptada, con errores, rechazada, `Fault` y no XML. |
| `aeat_client::tests` | TLS contra un servidor local con certificado autofirmado generado al vuelo (`rcgen`): cabeceras SOAP correctas, lectura `chunked`, cuerpo de un 500 conservado, servidor no confiable rechazado. |
| `tests/process.rs` | El binario real: handshake, firma, fail-closed, salida al cerrar stdin, rechazo de secreto corto o flag desconocido. |
| App: `sidecar_process::tests`, `verifactu_submit::tests`, `db::tests` | Lanzar, reutilizar y relanzar el sidecar real; validaciones del lado app; la contraseña viaja al sidecar pero no se serializa ni vuelve; `TiempoEsperaEnvio` por empresa y endpoint; `transport_error` guardado y reintento manual posible; una sola aceptación por XML en SQLite. |

Lo que **no** prueban los tests automáticos y se comprueba con `tools/homolog-verifactu.mjs`: el TLS mutuo contra la AEAT real (`native-tls` no puede exigir certificado de cliente como servidor en el test local).

## 6. Cómo cambiarlo sin romper las garantías

- **Añadir un endpoint HTTP** (por ejemplo, una consulta de estado): 1) struct de petición y respuesta en `crates/fiscal-contract/src/messages.rs` y constante `PATH_*` en `lib.rs`; 2) función de política en `handlers.rs` sobre el trait `Backend`, con test usando `FakeBackend`; 3) rama en `server::route` **dentro** del bloque que verifica HMAC; 4) test en `server::tests`; 5) cliente en `src-tauri/src/services/verifactu_submit.rs`. Si el endpoint sale a internet, su destino se añade a `endpoints.rs` como variante de `EndpointName`, nunca como URL libre.
- **Añadir un dato al preflight** (como la caducidad del certificado): campo nuevo con `#[serde(default)]` en `SubmitPreflightResponse`, cálculo en `vault.rs` que devuelva solo el dato (nunca el certificado), método en `Backend` y test en `handlers::tests` de que aparece y de que la respuesta sigue sin contener secretos.
- **Cambiar cómo se obtiene la contraseña**: solo `vault::load_with` decide el orden (petición → `_<ID>` → genérica). Un origen nuevo (keyring) se añade ahí y se prueba con `load_with`.
- **No hacer nunca**: aceptar una URL en una petición; registrar cuerpos, rutas del vault o contraseñas; reintentar envíos automáticamente; relajar `min_protocol_version` o la validación del certificado de servidor; leer el secreto de argumentos o entorno.

## 7. Dependencias y por qué estas

| Crate | Uso | Motivo |
|---|---|---|
| `native-tls` 0.2 | TLS mutuo con PKCS#12 | TLS del sistema (SChannel en Windows, Secure Transport en macOS, OpenSSL en Linux) y abre `.p12/.pfx` de la FNMT sin convertir. |
| `roxmltree` 0.21 | Leer SOAP de la AEAT y comprobar la raíz del registro | Solo lectura, sin dependencias, rechaza DTD (sin XXE). |
| `serde`, `serde_json` | Mensajes del contrato | Ya usadas por la app. |
| `fiscal-contract` | Contrato común | Crate del workspace; trae `hmac`, `sha2`, `uuid`. |
| `rcgen` 0.14 (solo `dev-dependencies`) | Certificado autofirmado para el test TLS | No entra en el binario. |

Tamaño del binario release: < 1 MB. Dependencias totales: dos crates externos en tiempo de ejecución además de `serde`.
