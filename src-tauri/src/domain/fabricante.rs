//! Persona o entidad productora del SIF (bloque `SistemaInformatico` del XML VERI*FACTU).
//!
//! Datos de `docs/legal/FABRICANTE.md` (rama `cf/ga-backlog`, acción H2). Son del fabricante,
//! no de la empresa que factura: Orden HAC/1177/2024, «Diseño de registro VERI*FACTU»,
//! bloque `SistemaInformatico` y su nota (datos del productor del componente principal).

pub const RAZON_SOCIAL: &str = "VENDINGSAIZARAGON, S.L.";
pub const NIF: &str = "B98945173";
/// Nombre provisional: el comercial se decidirá más adelante (FABRICANTE.md). Máx. 30.
pub const NOMBRE_SISTEMA: &str = "CumpleFactura";
/// Máx. 2 caracteres (`TextMax2Type`).
pub const ID_SISTEMA: &str = "CF";
/// La del paquete compilado: el registro declara la versión que lo generó de verdad.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

#[cfg(test)]
mod tests {
    use super::*;

    /// Ningún dato puede quedar como marcador `PENDIENTE_` (acción H2).
    #[test]
    fn manufacturer_data_is_complete_and_fits_xsd() {
        for value in [RAZON_SOCIAL, NIF, NOMBRE_SISTEMA, ID_SISTEMA, VERSION] {
            assert!(!value.starts_with("PENDIENTE_"), "{value}");
            assert!(!value.trim().is_empty());
        }
        assert!(RAZON_SOCIAL.chars().count() <= 120);
        assert!(NOMBRE_SISTEMA.chars().count() <= 30);
        assert_eq!(ID_SISTEMA.chars().count(), 2);
        assert!(VERSION.chars().count() <= 50);
        assert!(super::super::tax_id::validate_spanish_tax_id(NIF).is_ok());
    }
}
