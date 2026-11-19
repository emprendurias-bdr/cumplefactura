# Sidecar VERI*FACTU de CumpleFactura

Proceso aparte que acompaña a la app de escritorio. Es el único componente que abre el certificado del contribuyente y el único que se conecta a la AEAT.

## Por qué existe

La app genera, numera, encadena y valida los registros de facturación. Todo eso es local y no necesita secretos. Enviar un registro a la AEAT sí los necesita: un certificado electrónico y su contraseña.

Separarlo en un proceso propio da tres garantías:

- **El certificado nunca entra en la app.** La app solo conoce una referencia `vault://certs/<id>`. Un fallo en la interfaz, en SQLite o en una dependencia de la UI no puede filtrar el certificado.
- **Todo lo que sale a internet se revisa en un solo fichero.** Solo `src/aeat_client.rs` abre conexiones salientes, y solo hacia los cuatro endpoints oficiales.
- **Se puede apagar por completo.** Sin `--allow-aeat`, el sidecar responde a todo pero nunca abre una conexión. Así funciona en el gate regulatorio y en desarrollo.

## Base legal del envío sin firma

| Norma | Qué dice | Consecuencia |
|---|---|---|
| RD 1007/2023, art. 16.3 | Los sistemas VERI*FACTU no tienen obligación de firmar los registros; basta con la huella. | El XML viaja sin `ds:Signature`. |
| Orden HAC/1177/2024, art. 3 | Excluye para VERI*FACTU el art. 6.c, que impone la firma. | Sin firma XAdES en v1. |
| Orden HAC/1177/2024, arts. 4 y 5 | La remisión se autentica con certificado electrónico en la conexión. | TLS mutuo con el PKCS#12 del vault. |
| `SuministroInformacion.xsd` de la AEAT | `ds:Signature` tiene `minOccurs="0"`. | El XML sin firma es válido contra el esquema. |

El modo «No VERI*FACTU», que firma registros y no los envía, queda fuera de v1.

## Piezas y responsabilidades

```
┌──────────────────────── App CumpleFactura (Tauri) ────────────────────────┐
│ UI React ─invoke→ comandos Rust ─→ SQLite, XML VERI*FACTU, huella, XSD     │
│                                   └→ services/sidecar_process.rs           │
│                                         arranca y vigila el sidecar        │
│                                   └→ services/verifactu_submit.rs          │
│                                         POST firmado con HMAC              │
└──────────────────────────────────────┬─────────────────────────────────────┘
                                       │ HTTP en 127.0.0.1:<puerto efímero>
                                       │ cabecera x-signature = HMAC-SHA256
┌──────────────────────────────────────▼──── cumplefactura-sidecar ─────────┐
│ main.rs     arranque, secreto por stdin, handshake por stdout, vigilante   │
│ server.rs   solo loopback, límite 4 MiB, verifica HMAC, enruta             │
│ handlers.rs política: orden de comprobaciones, respuestas                  │
│ vault.rs    vault://certs/<id> → <vault>/<id>.p12|.pfx + contraseña        │
│ soap.rs     sobre SOAP 1.1 y lectura de RespuestaRegFactuSistemaFacturacion│
│ aeat_client.rs  TLS 1.2+ con certificado de cliente → AEAT                 │
└──────────────────────────────────────┬─────────────────────────────────────┘
                                       │ HTTPS + TLS mutuo
                                       ▼
            prewww1.aeat.es / prewww10.aeat.es (pruebas)
            www1 / www10.agenciatributaria.gob.es (producción, bloqueado en v1)
```

`crates/fiscal-contract` contiene lo que comparten la app y el sidecar: rutas, mensajes JSON, HMAC, la lista de endpoints y el lector HTTP. Si el contrato cambia, ambos dejan de compilar a la vez.

## Ciclo de vida del proceso

1. La primera acción fiscal que lo necesita hace que la app lance `cumplefactura-sidecar`. El binario va dentro del instalador como `externalBin` de Tauri. En Windows se lanza sin ventana de consola.
2. La app genera 32 bytes aleatorios y los escribe en hexadecimal en el stdin del sidecar. Es el secreto HMAC de esa sesión. No viaja por argumentos ni por variables de entorno, que otros procesos pueden leer.
3. El sidecar escucha en `127.0.0.1` en un puerto libre y escribe una sola línea en stdout: `{"port":51234,"pid":4321,"version":"0.1.0"}`.
4. La app guarda el puerto, el secreto y el proceso. Antes de cada llamada comprueba que sigue vivo y lo relanza si ha muerto.
5. Cuando la app se cierra, mata el proceso. Si la app muere de golpe, el sistema cierra la tubería de stdin y el vigilante del sidecar termina el proceso. No quedan huérfanos con el certificado abierto.

Interruptores de arranque:

| Interruptor | Por defecto | Efecto |
|---|---|---|
| `--allow-aeat` | apagado | Sin él, ninguna conexión saliente. La app lo pasa solo si `CUMPLEFACTURA_SIDECAR_ALLOW_AEAT=1`. |
| `--allow-production` | apagado | Sin él, solo endpoints de pruebas. v1 no lo pasa nunca. |
| `--vault-dir <carpeta>` | ninguno | Única carpeta de certificados. La app pasa `<datos de la app>/certs` o `CUMPLEFACTURA_CERT_VAULT_DIR`. |

## Contrato HTTP

Todas las peticiones `POST` llevan `Content-Type: application/json`, `x-signature` y `Connection: close`. La firma es el HMAC-SHA256 en hexadecimal del cuerpo exacto con el secreto de sesión.

### `GET /healthz`

Sin autenticación. Respuesta 200:

```json
{"status":"ok","version":"0.1.0","aeat_calls_enabled":false,"production_enabled":false}
```

### `POST /verifactu/submit-preflight`

Comprueba si se podría enviar ahora. Nunca sale a internet.

```json
{"endpoint_name":"SistemaVerifactuPruebas","certificate_ref":"vault://certs/mi-empresa",
 "certificate_password":"…"}
```

`certificate_password` es opcional (`null` o ausente): si no llega, el sidecar usa `CUMPLEFACTURA_CERT_PASSWORD_<ID>` o `CUMPLEFACTURA_CERT_PASSWORD`. Ver «Contraseña del certificado» más abajo.

Respuesta 200:

```json
{"status":"blocked","blockers":["certificate_password_required","aeat_calls_disabled"],
 "warnings":[],"endpoint_name":"SistemaVerifactuPruebas","endpoint_allowed":true,
 "certificate_loaded":false,"certificate_source":null,
 "certificate_expires_at":null,"certificate_expires_in_days":null,
 "aeat_calls_enabled":false,"production_enabled":false,"external_call_performed":false}
```

Con el certificado abierto, `certificate_expires_at` es su `notAfter` (`AAAA-MM-DDThh:mm:ssZ`) y `certificate_expires_in_days` los días completos que quedan (negativo si ya caducó); `null` si no se pudieron leer. Avisos: `certificate_expires_soon` (≤ 30 días) y `certificate_expired` (también en `blockers`).

Códigos de bloqueo posibles:

| Código | Significado |
|---|---|
| `endpoint_name_not_allowed` | El nombre no es uno de los cuatro puertos del WSDL. |
| `production_endpoint_disabled` | Endpoint de producción sin `--allow-production`. |
| `certificate_ref_invalid` | La referencia no es `vault://certs/<id>` con `[A-Za-z0-9_-]`, o apunta fuera del vault. |
| `certificate_vault_dir_missing` | No hay carpeta de vault o no existe. |
| `certificate_not_found` | No hay `<id>.p12` ni `<id>.pfx`. |
| `certificate_password_required` | No llegó `certificate_password` y faltan `CUMPLEFACTURA_CERT_PASSWORD_<ID>` y `CUMPLEFACTURA_CERT_PASSWORD`. La interfaz pide la contraseña. |
| `certificate_pkcs12_invalid` | El fichero no abre con esa contraseña. |
| `certificate_expired` | El `notAfter` del certificado ya pasó. |
| `aeat_calls_disabled` | Arrancado sin `--allow-aeat`. |

### Contraseña del certificado

Tres modos, elegidos en los ajustes de la app (`certificate_password_mode`, ADR-002):

| Modo | Qué manda la app | Dónde vive la contraseña |
|---|---|---|
| `session` (por defecto) | `certificate_password` en cada preflight/envío | En la memoria de la interfaz mientras la app está abierta. |
| `keychain` | Igual que `session` mientras no se apruebe la librería del llavero | — |
| `env` | `null` | Variable de entorno del sidecar (homologación y pruebas). |

Regla: la contraseña **nunca** se registra (los logs no llevan cuerpos), **nunca** aparece en una respuesta (los errores del vault son códigos fijos sin detalle), **nunca** se guarda en disco ni en SQLite, y el sidecar la suelta en cuanto abre el PKCS#12. Solo viaja por loopback, dentro del cuerpo firmado con HMAC. La app, además, rechaza cualquier respuesta del sidecar que la contenga (contraseñas de 8 caracteres o más, para no confundirla con un código de la AEAT).

### Caducidad sin librerías

`native-tls` no expone el certificado de una `Identity` y el PKCS#12 va cifrado. `vault::certificate_not_after` hace un apretón de manos TLS del sidecar consigo mismo por una tubería en memoria (sin red ni sockets; 5 s como máximo): el lado servidor usa la identidad y el lado cliente lee el certificado del par en DER (`peer_certificate`, disponible en SChannel, Secure Transport y OpenSSL). Del DER solo se lee `tbsCertificate.validity.notAfter`. Si algo falla, los campos van a `null` y no hay aviso: la caducidad nunca impide un envío salvo que ya haya pasado.

### `POST /verifactu/invoke-submit`

Envía a la AEAT el documento `sfLR:RegFactuSistemaFacturacion` completo que generó y validó la app.

```json
{"xml":"<sfLR:RegFactuSistemaFacturacion …>…</sfLR:RegFactuSistemaFacturacion>",
 "xml_sha256":"<sha256 en hexadecimal>","endpoint_name":"SistemaVerifactuPruebas",
 "certificate_ref":"vault://certs/mi-empresa","timeout_seconds":30,"certificate_password":null}
```

Comprobaciones, en este orden. La primera que falla devuelve 409 sin haber abierto ninguna conexión:

1. endpoint en la lista cerrada;
2. producción solo con `--allow-production`;
3. el SHA-256 del XML coincide con `xml_sha256`;
4. la raíz es `RegFactuSistemaFacturacion` del espacio de nombres `SuministroLR`;
5. `--allow-aeat` activo;
6. el certificado abre.

```json
{"error":"aeat_calls_disabled","external_call_performed":false}
```

Si todas pasan, se envía y la respuesta es 200 aunque la AEAT rechace el registro:

```json
{"xml_sha256":"…","endpoint_name":"SistemaVerifactuPruebas","operation":"RegFactuSistemaFacturacion",
 "status":"accepted","http_status":200,"csv":"A-7JDEZ2XZFQZ3W3","estado_envio":"Correcto",
 "estado_registro":"Correcto","codigo_error":null,"descripcion_error":null,
 "tiempo_espera_envio_seconds":60,"soap_fault":null,"external_call_performed":true}
```

| `status` | Cuándo |
|---|---|
| `accepted` | `EstadoEnvio=Correcto` y el registro no trae errores. |
| `accepted_with_errors` | `EstadoRegistro=AceptadoConErrores` o `EstadoEnvio=ParcialmenteCorrecto`. |
| `rejected` | `EstadoEnvio=Incorrecto` o la AEAT devolvió un `SOAP Fault`, que va en `soap_fault`. |
| `transport_error` | No hubo respuesta AEAT interpretable: DNS, TLS, red o respuesta ilegible. El detalle va en `descripcion_error`. |

`external_call_performed: true` significa que se intentó la conexión. Con `transport_error` la AEAT pudo recibir el registro sin que llegara la respuesta. La app lo guarda igualmente en `verifactu_submissions`, lo muestra como «sin confirmar» y deja reintentar **solo a petición del usuario**.

Antes de llamar al sidecar, la app rechaza `xml_already_accepted_by_aeat` (ese XML ya tiene una respuesta `accepted` o `accepted_with_errors`) y `aeat_wait_time_pending:<segundos>` (la última respuesta de la AEAT para esa empresa y ese endpoint pidió esperar y aún no ha pasado el tiempo).

Otros errores del canal: 400 `bad_request` (JSON ilegible), 401 `hmac_invalid`, 404 `not_found`, 405 `method_not_allowed`, 413 `body_too_large`.

## Modelo de amenazas

| Amenaza | Defensa |
|---|---|
| Otro programa local llama al sidecar | Secreto por sesión, HMAC en cada `POST` y solo se aceptan pares loopback. |
| Robar el secreto mirando procesos | El secreto va por stdin, no por argumentos ni entorno. |
| Desviar el registro o el certificado a otro servidor | Solo nombres de endpoint, nunca URLs. Destinos fijos en `fiscal-contract/src/endpoints.rs`. |
| Leer ficheros fuera del vault | Id restringido a `[A-Za-z0-9_-]` y ruta canonizada dentro del vault. |
| XML manipulado entre la app y la AEAT | La app envía el SHA-256 y el sidecar lo recalcula. La app comprueba el hash devuelto. |
| XXE o DTD en el XML | `roxmltree` rechaza DTD. |
| Enviar a producción por error | Hace falta `--allow-production`, que v1 nunca pasa. |
| Doble registro por reintento automático | No hay reintentos automáticos. La app impide reenviar un XML ya aceptado e impone `TiempoEsperaEnvio`. |
| Servidor AEAT suplantado | Validación TLS estándar del sistema, sin excepciones. |
| Filtración por logs o respuestas | Los logs solo llevan método, ruta, estado y traza. Las respuestas no contienen referencias, rutas, contraseñas ni el XML de la AEAT. La app rechaza respuestas que contengan la referencia, el secreto o la contraseña. |
| Contraseña robada de la app o del disco | En modo `session` solo vive en memoria y viaja por loopback firmada; nunca se escribe en SQLite, logs ni ficheros. |
| Sidecar huérfano con el certificado abierto | Vigilante de stdin y cierre explícito al salir la app. |

## Límites conocidos de v1

- **Sin llavero del sistema.** El modo `keychain` se acepta pero funciona como `session` hasta que se apruebe la librería (`keyring`).
- **Caducidad por apretón de manos en memoria.** Probada en Linux (OpenSSL); en Windows y macOS usa la misma API de `native-tls` pero no se ha probado con un certificado FNMT real. Si falla, `null`.
- **PKCS#12 antiguos en Linux.** OpenSSL 3 no abre ficheros cifrados con RC2 o 3DES sin el proveedor «legacy». En Windows y macOS no hay problema.
- **El TLS mutuo solo se prueba contra la AEAT real.** Los tests automáticos prueban TLS con un servidor local, pero `native-tls` no puede exigir certificado de cliente como servidor. El envío real se comprueba con `node tools/homolog-verifactu.mjs` contra el entorno de pruebas.
- **Un envío cada vez.** El servidor atiende las peticiones en serie, a propósito.

## Dependencias

| Crate | Para qué | Por qué esta |
|---|---|---|
| `native-tls` | TLS mutuo con PKCS#12 | Usa el TLS del sistema (SChannel en Windows) y abre `.p12/.pfx` directamente. |
| `roxmltree` | Leer la respuesta SOAP | Solo lectura, sin dependencias, rechaza DTD. |
| `serde`, `serde_json` | Mensajes JSON | Compartidas con la app. |
| `fiscal-contract` | Contrato común | Crate propio del workspace (incluye `hmac`, `sha2` y `uuid`). |
| `rcgen` (solo tests) | Certificado autofirmado para el test TLS | No entra en el binario. |

## Cómo probarlo

```bash
cargo test -p cumplefactura-sidecar        # política, SOAP, vault, TLS y proceso real
node tools/build-sidecar.mjs --debug       # compila y copia a src-tauri/binaries/
node tools/verify-sidecar-smoke.mjs        # smoke del binario empaquetado (gate)
node tools/homolog-verifactu.mjs --help    # envío real a la AEAT de pruebas (manual)
```

## Secuencias

Las tres interacciones completas, con el fichero que ejecuta cada paso. La estructura de ficheros y el orden de lectura están en [`README.md`](README.md).

### Arranque y handshake

```
App (sidecar_process.rs)                      Sidecar (main.rs)
──────────────────────────                    ─────────────────────────────
spawn("cumplefactura-sidecar",
      ["--vault-dir", <certs>, "--allow-aeat"?])
  stdin  ◀──────────── tubería ────────────▶  parse_args (config.rs)
escribe 64 hex (32 bytes aleatorios) + "\n" ─▶ parse_secret → SidecarConfig
                                              TcpListener::bind(127.0.0.1:0)
  ◀─ stdout: {"port":P,"pid":N,"version":V} ─  handshake JSON (una sola línea)
comprueba pid == child.id()                   hilo vigilante: stdin EOF → exit(0)
guarda SidecarClient { port, secret }         server::serve(listener) hasta morir
```

Si la app muere, el sistema cierra la tubería y el sidecar sale solo. Si el sidecar muere, la app lo relanza con un secreto nuevo en la siguiente llamada.

### Comprobación previa (`POST /verifactu/submit-preflight`)

```
verifactu_submit::preflight        server.rs            handlers::preflight        vault.rs
────────────────────────────       ─────────────        ───────────────────        ────────────
read_checked_xml (SHA-256 igual
al exportado)
post_json_loopback (firma HMAC) ─▶ par loopback?
                                   read_http_message
                                   verify_hmac_hex ──▶  EndpointName::parse
                                                        producción sin flag?
                                                        Backend::load_certificate ─▶ certificate_id
                                                                                     <vault>/<id>.p12|.pfx
                                                                                     contraseña (cuerpo o env)
                                                                                     Identity::from_pkcs12
                                                        certificate_not_after ─▶ TLS en memoria → notAfter
                                                        --allow-aeat?
                                   ◀── 200 {status: ready|blocked, blockers[], …,
                                            external_call_performed: false}
rechaza si external_call_performed == true
```

### Envío (`POST /verifactu/invoke-submit`)

```
verifactu_submit::submit   server.rs      handlers::invoke_submit   soap.rs            aeat_client.rs          AEAT
──────────────────────     ─────────      ───────────────────────   ────────────       ─────────────────       ────
read_checked_xml
¿XML ya aceptado?
check_wait_time
post_json_loopback ──────▶ HMAC ok ─────▶ 1 endpoint en lista
                                          2 producción solo con flag
                                          3 sha256(xml) == xml_sha256
                                          4 wrap_regfactu ─────────▶ raíz RegFactu…
                                                                     sobre SOAP 1.1
                                          5 --allow-aeat
                                          6 load_certificate
                                          7 post_soap ──────────────────────────────▶ TLS 1.2+ mTLS ──▶ POST
                                                                                      read_http_message ◀── 200|500
                                          parse_response ◀────────── AeatOutcome
                           ◀── 200 {status, csv, estado_*, …, external_call_performed: true}
sha256 devuelto == enviado?
¿filtra cert ref, secreto o contraseña?
insert verifactu_submissions (siempre, también transport_error)
```

Cualquier fallo en 1–6 devuelve `409 {error, external_call_performed:false}` **antes** del paso 7. Un fallo en 7 devuelve 200 con `status: transport_error` y `external_call_performed: true`: la AEAT pudo recibir el registro, así que la app lo guarda, lo muestra como «sin confirmar» y no lo reintenta sola.
