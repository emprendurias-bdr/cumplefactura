//! Sobre SOAP 1.1 de VERI*FACTU: envolver la petición y leer la respuesta.
//!
//! Qué hace:
//! - `wrap_regfactu` mete el documento `sfLR:RegFactuSistemaFacturacion` que genera
//!   la app dentro de `soapenv:Envelope/Body`. El WSDL oficial (`SistemaFacturacion.wsdl`)
//!   declara estilo `document`, `soapAction=""` y ese elemento como cuerpo, así que
//!   no hay que transformar nada: solo quitar la declaración XML y envolver.
//! - `parse_response` extrae de `RespuestaRegFactuSistemaFacturacion` (esquema
//!   `RespuestaSuministro.xsd`) el CSV, los estados y todos los errores (de
//!   `RespuestaLinea` y de `RegistroDuplicado`), o el `soapenv:Fault` si la AEAT
//!   rechazó el mensaje entero.
//!
//! Qué no hace nunca: entrada/salida, firmas ni cambios en el registro. El XML viaja
//! tal cual lo validó la app contra el XSD, para que su huella siga siendo válida.
//! Tampoco acepta DTD (roxmltree las rechaza), lo que evita ataques XXE.
//!
//! Por qué sin firma: RD 1007/2023, art. 16.3. Los sistemas VERI*FACTU no tienen
//! obligación de firmar los registros; basta con la huella. La autenticación la da
//! el certificado de cliente en la conexión TLS (Orden HAC/1177/2024, arts. 4 y 5).

use fiscal_contract::messages::ErrorRegistro;

const NS_SUMINISTRO_LR: &str = "https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR.xsd";
const ROOT_ELEMENT: &str = "RegFactuSistemaFacturacion";

/// Resultado interpretado de la respuesta AEAT.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct AeatOutcome {
    /// `accepted`, `accepted_with_errors`, `rejected` o `transport_error`.
    pub status: String,
    pub csv: Option<String>,
    pub estado_envio: Option<String>,
    pub estado_registro: Option<String>,
    pub codigo_error: Option<String>,
    pub descripcion_error: Option<String>,
    pub tiempo_espera_envio_seconds: Option<u64>,
    pub soap_fault: Option<String>,
    pub errores: Vec<ErrorRegistro>,
}

/// Envuelve el registro en un sobre SOAP 1.1.
///
/// Rechaza cualquier documento cuya raíz no sea `sfLR:RegFactuSistemaFacturacion`:
/// el sidecar no es un proxy genérico hacia la AEAT.
pub fn wrap_regfactu(xml: &str) -> Result<String, &'static str> {
    let body = strip_declaration(xml);
    let document = roxmltree::Document::parse(body).map_err(|_| "xml_not_well_formed")?;
    let root = document.root_element();
    if root.tag_name().name() != ROOT_ELEMENT
        || root.tag_name().namespace() != Some(NS_SUMINISTRO_LR)
    {
        return Err("xml_root_not_regfactu");
    }
    Ok(format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\
         <soapenv:Envelope xmlns:soapenv=\"http://schemas.xmlsoap.org/soap/envelope/\">\n\
         <soapenv:Header/>\n\
         <soapenv:Body>\n{}\n</soapenv:Body>\n\
         </soapenv:Envelope>\n",
        body.trim_end()
    ))
}

/// Interpreta la respuesta HTTP de la AEAT, sea cual sea su código de estado.
pub fn parse_response(body: &[u8]) -> AeatOutcome {
    let Some(document) = std::str::from_utf8(body)
        .ok()
        .and_then(|text| roxmltree::Document::parse(text).ok())
    else {
        return transport_error("aeat_response_not_xml");
    };
    let text = |name: &str| first_text(&document, name);

    if document
        .descendants()
        .any(|node| node.is_element() && node.tag_name().name() == "Fault")
    {
        let fault = [text("faultcode"), text("faultstring")]
            .into_iter()
            .flatten()
            .collect::<Vec<_>>()
            .join(": ");
        return AeatOutcome {
            status: "rejected".to_string(),
            soap_fault: Some(fault),
            ..AeatOutcome::default()
        };
    }

    let Some(estado_envio) = text("EstadoEnvio") else {
        return transport_error("aeat_response_unrecognized");
    };
    let estado_registro = text("EstadoRegistro");
    // Una línea por envío: si la línea es `Incorrecto`, el registro no quedó aceptado.
    let status = match (estado_envio.as_str(), estado_registro.as_deref()) {
        (_, Some("Incorrecto")) => "rejected",
        ("Correcto", Some("AceptadoConErrores")) => "accepted_with_errors",
        ("Correcto", _) => "accepted",
        ("ParcialmenteCorrecto", _) => "accepted_with_errors",
        _ => "rejected",
    };
    let errores = registro_errors(&document);
    let first = errores.first().cloned().unwrap_or_default();
    AeatOutcome {
        status: status.to_string(),
        csv: text("CSV"),
        estado_envio: Some(estado_envio),
        estado_registro,
        codigo_error: first.codigo,
        descripcion_error: first.descripcion,
        tiempo_espera_envio_seconds: text("TiempoEsperaEnvio").and_then(|t| t.parse().ok()),
        soap_fault: None,
        errores,
    }
}

/// Cada código/descripción de error, emparejados por su elemento padre
/// (`RespuestaLinea` o `RegistroDuplicado`), en orden de aparición.
fn registro_errors(document: &roxmltree::Document) -> Vec<ErrorRegistro> {
    let child_text = |parent: roxmltree::Node, name: &str| {
        parent
            .children()
            .find(|node| node.is_element() && node.tag_name().name() == name)
            .and_then(|node| node.text())
            .map(str::trim)
            .filter(|text| !text.is_empty())
            .map(str::to_string)
    };
    document
        .descendants()
        .filter(|node| node.is_element())
        .filter_map(|parent| {
            let codigo = child_text(parent, "CodigoErrorRegistro");
            let descripcion = child_text(parent, "DescripcionErrorRegistro");
            (codigo.is_some() || descripcion.is_some()).then_some(ErrorRegistro {
                codigo,
                descripcion,
            })
        })
        .collect()
}

/// Resultado para fallos en los que no hubo respuesta AEAT interpretable.
pub fn transport_error(description: &str) -> AeatOutcome {
    AeatOutcome {
        status: "transport_error".to_string(),
        descripcion_error: Some(description.to_string()),
        ..AeatOutcome::default()
    }
}

fn strip_declaration(xml: &str) -> &str {
    let xml = xml.trim_start_matches('\u{feff}').trim_start();
    match xml.strip_prefix("<?xml") {
        Some(rest) => rest
            .split_once("?>")
            .map_or(xml, |(_, body)| body.trim_start()),
        None => xml,
    }
}

/// Texto del primer elemento con ese nombre local, sin espacios alrededor.
fn first_text(document: &roxmltree::Document, local_name: &str) -> Option<String> {
    document
        .descendants()
        .find(|node| node.is_element() && node.tag_name().name() == local_name)
        .and_then(|node| node.text())
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(str::to_string)
}

#[cfg(test)]
mod tests {
    use super::*;

    const REGISTRO: &str = "\u{feff}<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<sfLR:RegFactuSistemaFacturacion xmlns:sfLR=\"https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR.xsd\"><sfLR:Cabecera/></sfLR:RegFactuSistemaFacturacion>\n";

    fn respuesta(estado_envio: &str, linea: &str) -> String {
        format!(
            r#"<env:Envelope xmlns:env="http://schemas.xmlsoap.org/soap/envelope/"><env:Body>
<tikR:RespuestaRegFactuSistemaFacturacion xmlns:tikR="https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/RespuestaSuministro.xsd" xmlns:tik="https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroInformacion.xsd">
<tikR:CSV>A-7JDEZ2XZFQZ3W3</tikR:CSV><tikR:TiempoEsperaEnvio>60</tikR:TiempoEsperaEnvio>
<tikR:EstadoEnvio>{estado_envio}</tikR:EstadoEnvio>{linea}
</tikR:RespuestaRegFactuSistemaFacturacion></env:Body></env:Envelope>"#
        )
    }

    #[test]
    fn wraps_registro_without_declaration_or_bom() {
        let envelope = wrap_regfactu(REGISTRO).unwrap();
        assert!(
            envelope.starts_with("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<soapenv:Envelope")
        );
        assert_eq!(envelope.matches("<?xml").count(), 1);
        assert!(!envelope.contains('\u{feff}'));
        assert!(envelope.contains("<soapenv:Body>\n<sfLR:RegFactuSistemaFacturacion"));
        assert!(roxmltree::Document::parse(&envelope).is_ok());
    }

    #[test]
    fn refuses_other_documents_and_dtds() {
        assert_eq!(
            wrap_regfactu("<Otra/>").err(),
            Some("xml_root_not_regfactu")
        );
        assert_eq!(
            wrap_regfactu("<RegFactuSistemaFacturacion/>").err(),
            Some("xml_root_not_regfactu")
        );
        assert_eq!(wrap_regfactu("<a>").err(), Some("xml_not_well_formed"));
        assert_eq!(
            wrap_regfactu("<!DOCTYPE x [<!ENTITY e SYSTEM \"file:///etc/passwd\">]><x>&e;</x>")
                .err(),
            Some("xml_not_well_formed")
        );
    }

    #[test]
    fn parses_accepted_response() {
        let outcome = parse_response(
            respuesta(
                "Correcto",
                "<tikR:RespuestaLinea><tikR:EstadoRegistro>Correcto</tikR:EstadoRegistro></tikR:RespuestaLinea>",
            )
            .as_bytes(),
        );
        assert_eq!(outcome.status, "accepted");
        assert_eq!(outcome.csv.as_deref(), Some("A-7JDEZ2XZFQZ3W3"));
        assert_eq!(outcome.tiempo_espera_envio_seconds, Some(60));
        assert_eq!(outcome.estado_registro.as_deref(), Some("Correcto"));
    }

    #[test]
    fn parses_accepted_with_errors_and_rejected() {
        let linea = "<tikR:RespuestaLinea><tikR:EstadoRegistro>AceptadoConErrores</tikR:EstadoRegistro><tikR:CodigoErrorRegistro>2004</tikR:CodigoErrorRegistro><tikR:DescripcionErrorRegistro> Aviso </tikR:DescripcionErrorRegistro></tikR:RespuestaLinea>";
        let outcome = parse_response(respuesta("Correcto", linea).as_bytes());
        assert_eq!(outcome.status, "accepted_with_errors");
        assert_eq!(outcome.codigo_error.as_deref(), Some("2004"));
        assert_eq!(outcome.descripcion_error.as_deref(), Some("Aviso"));

        assert_eq!(
            parse_response(respuesta("ParcialmenteCorrecto", "").as_bytes()).status,
            "accepted_with_errors"
        );
        let rejected = parse_response(
            respuesta(
                "Incorrecto",
                "<tikR:RespuestaLinea><tikR:EstadoRegistro>Incorrecto</tikR:EstadoRegistro><tikR:CodigoErrorRegistro>1100</tikR:CodigoErrorRegistro></tikR:RespuestaLinea>",
            )
            .as_bytes(),
        );
        assert_eq!(rejected.status, "rejected");
        assert_eq!(rejected.codigo_error.as_deref(), Some("1100"));
    }

    #[test]
    fn keeps_every_error_and_rejects_incorrect_line() {
        let linea = "<tikR:RespuestaLinea><tikR:EstadoRegistro>Incorrecto</tikR:EstadoRegistro><tikR:CodigoErrorRegistro>1100</tikR:CodigoErrorRegistro><tikR:DescripcionErrorRegistro>Valor no permitido</tikR:DescripcionErrorRegistro><tikR:RegistroDuplicado><tik:IdPeticionRegistroDuplicado>1</tik:IdPeticionRegistroDuplicado><tik:EstadoRegistroDuplicado>Correcta</tik:EstadoRegistroDuplicado><tik:CodigoErrorRegistro>3000</tik:CodigoErrorRegistro><tik:DescripcionErrorRegistro>Registro duplicado</tik:DescripcionErrorRegistro></tikR:RegistroDuplicado></tikR:RespuestaLinea>";
        let outcome = parse_response(respuesta("ParcialmenteCorrecto", linea).as_bytes());
        assert_eq!(outcome.status, "rejected");
        assert_eq!(outcome.codigo_error.as_deref(), Some("1100"));
        assert_eq!(
            outcome.errores,
            vec![
                ErrorRegistro {
                    codigo: Some("1100".to_string()),
                    descripcion: Some("Valor no permitido".to_string()),
                },
                ErrorRegistro {
                    codigo: Some("3000".to_string()),
                    descripcion: Some("Registro duplicado".to_string()),
                },
            ]
        );
    }

    #[test]
    fn parses_soap_fault_as_rejected() {
        let outcome = parse_response(
            br#"<env:Envelope xmlns:env="http://schemas.xmlsoap.org/soap/envelope/"><env:Body><env:Fault><faultcode>env:Client</faultcode><faultstring>Codigo[4102].El XML no cumple el esquema</faultstring></env:Fault></env:Body></env:Envelope>"#,
        );
        assert_eq!(outcome.status, "rejected");
        assert_eq!(
            outcome.soap_fault.as_deref(),
            Some("env:Client: Codigo[4102].El XML no cumple el esquema")
        );
    }

    #[test]
    fn unparseable_or_unknown_responses_are_transport_errors() {
        assert_eq!(parse_response(b"<html>502</html").status, "transport_error");
        let unknown = parse_response(b"<ok/>");
        assert_eq!(unknown.status, "transport_error");
        assert_eq!(
            unknown.descripcion_error.as_deref(),
            Some("aeat_response_unrecognized")
        );
    }
}
