//! Servicios fiscales locales de CumpleFactura.
//!
//! Flujo típico:
//! 1. Emisión → huella y cadena (`fiscal_chain`) + eventos de auditoría (`audit`).
//! 2. Exportaciones locales → PDF con QR tributario (`pdf`, `qr`), JSON/CSV/auditoría (`export`).
//! 3. XML VERI*FACTU → generación y validación XSD (`verifactu`).
//! 4. Envío a la AEAT → `verifactu_submit` habla con el sidecar que arranca
//!    `sidecar_process`. Solo el sidecar abre el certificado y sale a internet.
//! 5. Asistente técnico de rectificativas → `rectification_advisor` (no decide la causa jurídica).
//!
//! Aquí no hay UI ni red, salvo el canal HTTP loopback con el sidecar.

pub mod audit;
pub mod export;
pub mod fiscal_chain;
pub mod pdf;
pub mod qr;
pub mod rectification_advisor;
pub mod sidecar_process;
pub mod verifactu;
pub mod verifactu_submit;
