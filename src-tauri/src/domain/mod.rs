//! Modelo de dominio puro (sin SQLite ni IPC).
//!
//! Tipos serializables + validación/helpers usados por commands, db y services.

pub mod company;
pub mod customer;
pub mod invoice;
pub mod product;
pub mod settings;
pub mod tax;
