//! Capa de dominio fiscal/local de CumpleFactura (Rust).
//!
//! Arquitectura (flujo típico, fail-closed hacia AEAT):
//! 1. Emisión → huella/cadena (`fiscal_chain`) + eventos (`audit`).
//! 2. Export local → PDF (`pdf`), JSON/CSV/auditoría (`export`).
//! 3. XML VERI*FACTU → generación + validación XSD (`verifactu`).
//! 4. Paquete sin firmar (`submission`) → XAdES vía sidecar local (`xades_sidecar`).
//! 5. Preflight transporte (`aeat_transport`) / envío SOAP solo vía sidecar (`verifactu_submit_sidecar`).
//! 6. Otros canales ContaPro (SII/TicketBAI/FACe) → `sidecar_channels` (import + preflight; FACe diferido).
//! 7. Asistente técnico de rectificativas → `rectification_advisor` (no decide causa jurídica).
//!
//! Los comandos Tauri en `commands::fiscal` orquestan estos módulos; aquí no hay UI ni acceso a red
//! excepto HTTP local al sidecar cuando los flags de entorno lo habilitan.

pub mod aeat_transport;
pub mod audit;
pub mod export;
pub mod fiscal_chain;
pub mod pdf;
pub mod rectification_advisor;
pub mod sidecar_channels;
pub mod sidecar_http;
pub mod submission;
pub mod verifactu;
pub mod verifactu_submit_sidecar;
pub mod xades_sidecar;
