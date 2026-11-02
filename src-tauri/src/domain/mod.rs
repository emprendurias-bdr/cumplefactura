//! Modelo de dominio puro (sin SQLite ni IPC).
//!
//! Tipos serializables + validación/helpers usados por commands, db y services.

pub mod company;
pub mod customer;
pub mod invoice;
pub mod product;
pub mod settings;
pub mod tax;

/// Error `"<campo> is required"` si el valor está vacío o solo tiene espacios.
pub fn require(field: &str, value: &str) -> Result<(), String> {
    if value.trim().is_empty() {
        Err(format!("{field} is required"))
    } else {
        Ok(())
    }
}
