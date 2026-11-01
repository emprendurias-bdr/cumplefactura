//! Capa IPC Tauri: comandos invocables desde la UI.
//!
//! Cada submódulo valida input mínimo, toma el lock de `AppState` y delega en
//! `domain` / `db` / `services`. El registro vive en `lib.rs` (`invoke_handler`).

pub mod app;
pub mod company;
pub mod customers;
pub mod fiscal;
mod fiscal_assets;
pub mod invoices;
pub mod products;
pub mod settings;
