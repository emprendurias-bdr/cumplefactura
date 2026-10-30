# `services/` — Dominio fiscal / export local

Mapa de arquitectura en `mod.rs` (`//!`).

Flujo: emisión → cadena/audit → export → XML XSD → submission → XAdES sidecar → transport/submit preflight → otros canales ContaPro.

`sidecar_http` = transporte loopback compartido (URL local, POST JSON, HMAC). Allowlists y blockers siguen en cada canal (`xades_sidecar`, `verifactu_submit_sidecar`, `sidecar_channels`).
