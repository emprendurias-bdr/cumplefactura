//! Lista cerrada de endpoints SOAP VERI*FACTU de la AEAT.
//!
//! Qué hace: traduce el nombre de puerto del WSDL oficial (`SistemaFacturacion.wsdl`,
//! servicio `sfVerifactu`) a su host y ruta HTTPS.
//!
//! Qué no hace nunca: aceptar una URL libre. La app y la UI solo envían el nombre;
//! si el nombre no está aquí, el sidecar bloquea el envío. Así nadie puede desviar
//! el XML fiscal ni el certificado hacia otro servidor.
//!
//! Por qué hay cuatro: la AEAT separa producción y pruebas, y dentro de cada uno el
//! acceso con certificado de persona o representante (`SistemaVerifactu*`) del acceso
//! con certificado de sello (`*Sello*`).

/// Ruta común de los cuatro puertos SOAP.
const SOAP_PATH: &str = "/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP";

/// Puerto SOAP del WSDL VERI*FACTU.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EndpointName {
    SistemaVerifactu,
    SistemaVerifactuSello,
    SistemaVerifactuPruebas,
    SistemaVerifactuSelloPruebas,
}

/// Endpoint por defecto: pruebas con certificado de persona o representante.
pub const DEFAULT_ENDPOINT: EndpointName = EndpointName::SistemaVerifactuPruebas;

impl EndpointName {
    pub const ALL: [EndpointName; 4] = [
        EndpointName::SistemaVerifactu,
        EndpointName::SistemaVerifactuSello,
        EndpointName::SistemaVerifactuPruebas,
        EndpointName::SistemaVerifactuSelloPruebas,
    ];

    /// Busca un nombre exacto del WSDL. `None` si no está en la lista.
    pub fn parse(name: &str) -> Option<Self> {
        Self::ALL
            .into_iter()
            .find(|endpoint| endpoint.as_str() == name)
    }

    pub fn as_str(self) -> &'static str {
        match self {
            EndpointName::SistemaVerifactu => "SistemaVerifactu",
            EndpointName::SistemaVerifactuSello => "SistemaVerifactuSello",
            EndpointName::SistemaVerifactuPruebas => "SistemaVerifactuPruebas",
            EndpointName::SistemaVerifactuSelloPruebas => "SistemaVerifactuSelloPruebas",
        }
    }

    /// Host HTTPS del puerto (sin esquema).
    pub fn host(self) -> &'static str {
        match self {
            EndpointName::SistemaVerifactu => "www1.agenciatributaria.gob.es",
            EndpointName::SistemaVerifactuSello => "www10.agenciatributaria.gob.es",
            EndpointName::SistemaVerifactuPruebas => "prewww1.aeat.es",
            EndpointName::SistemaVerifactuSelloPruebas => "prewww10.aeat.es",
        }
    }

    pub fn path(self) -> &'static str {
        SOAP_PATH
    }

    /// URL completa, solo para mostrarla o registrarla.
    pub fn url(self) -> String {
        format!("https://{}{}", self.host(), self.path())
    }

    /// Producción tiene efectos legales: el sidecar exige un permiso aparte.
    pub fn is_production(self) -> bool {
        matches!(
            self,
            EndpointName::SistemaVerifactu | EndpointName::SistemaVerifactuSello
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn urls_match_official_wsdl_ports() {
        assert_eq!(
            EndpointName::SistemaVerifactuPruebas.url(),
            "https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP"
        );
        assert_eq!(
            EndpointName::SistemaVerifactu.url(),
            "https://www1.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP"
        );
        assert_eq!(
            EndpointName::SistemaVerifactuSello.url(),
            "https://www10.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP"
        );
        assert_eq!(
            EndpointName::SistemaVerifactuSelloPruebas.url(),
            "https://prewww10.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP"
        );
    }

    #[test]
    fn parse_is_exact_and_production_is_flagged() {
        for endpoint in EndpointName::ALL {
            assert_eq!(EndpointName::parse(endpoint.as_str()), Some(endpoint));
        }
        assert_eq!(EndpointName::parse("sistemaverifactupruebas"), None);
        assert_eq!(EndpointName::parse("https://evil.example/"), None);
        assert!(EndpointName::SistemaVerifactu.is_production());
        assert!(EndpointName::SistemaVerifactuSello.is_production());
        assert!(!DEFAULT_ENDPOINT.is_production());
        assert!(!EndpointName::SistemaVerifactuSelloPruebas.is_production());
    }
}
