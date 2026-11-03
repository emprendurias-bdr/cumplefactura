# `services/` — Servicios fiscales locales

Mapa completo en `mod.rs` (`//!`).

Flujo: emisión → huella y cadena (`fiscal_chain`) + auditoría (`audit`) → exportaciones (`pdf`, `export`) → XML VERI\*FACTU validado con XSD (`verifactu`) → envío (`verifactu_submit`) por el sidecar que arranca `sidecar_process`.

| Módulo | Rol |
|---|---|
| `verifactu` | XML `RegistroAlta`/`RegistroAnulacion` y huellas AEAT (`AltaHash`, `AnulacionHash`, `IssuedAlta`) |
| `verifactu_submit` | Registra la exportación XML (SHA-256), impone `TiempoEsperaEnvio` y hace preflight/envío contra el sidecar |
| `sidecar_process` | Lanza `cumplefactura-sidecar`, le entrega el secreto por stdin, lo relanza y lo cierra |
| `qr` | URL de cotejo AEAT y matriz del QR tributario que `pdf` dibuja en facturas emitidas (dependencia `qrcode`, sin features) |
| `fiscal_chain` | Recalcula huellas y enlaces de la cadena persistida |
| `pdf`, `logo` | Plantilla PDF común (factura y documentos comerciales) y lectura de logos JPEG/PNG sin librerías |
| `audit`, `export`, `rectification_advisor` | Auditoría encadenada, exportaciones y asistente R1-R5/I-S |

Aquí no hay red: el único tráfico es HTTP en `127.0.0.1` con el sidecar.
