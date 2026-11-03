//! Cliente HTTPS con certificado de cliente hacia la AEAT.
//!
//! Qué hace: abre TCP al host del endpoint, negocia TLS 1.2+ presentando la
//! identidad del vault (TLS mutuo), envía un único `POST` SOAP y lee la respuesta
//! con el lector HTTP compartido (`Content-Length`, `chunked` o hasta el cierre).
//!
//! Qué no hace nunca:
//! - Aceptar certificados de servidor inválidos o nombres que no coincidan.
//! - Seguir redirecciones ni reintentar: un reintento automático podría registrar
//!   dos veces la misma factura. Reintentar es decisión de la persona usuaria.
//! - Recibir una URL de fuera: el destino sale siempre de `EndpointName`.
//!
//! Por qué es el único módulo con red: así basta con revisar este fichero para
//! saber todo lo que el sidecar puede enviar a internet.
//!
//! Por qué HTTP escrito a mano: `native-tls` abre los PKCS#12 de la FNMT
//! directamente (`Identity::from_pkcs12`); los clientes HTTP ligeros solo aceptan
//! certificados PEM y obligarían a añadir otra librería para convertirlos.

use fiscal_contract::endpoints::EndpointName;
use fiscal_contract::http::read_http_message;
use fiscal_contract::MAX_BODY_BYTES;
use native_tls::{Identity, Protocol, TlsConnector};
use std::io::{BufReader, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::time::Duration;

/// Destino HTTPS ya resuelto. En producción siempre viene de `EndpointName`.
#[derive(Debug, Clone)]
pub struct Target {
    pub host: String,
    pub port: u16,
    pub path: String,
}

impl Target {
    pub fn for_endpoint(endpoint: EndpointName) -> Self {
        Self {
            host: endpoint.host().to_string(),
            port: 443,
            path: endpoint.path().to_string(),
        }
    }
}

/// Respuesta HTTP en bruto. La AEAT devuelve los SOAP Fault con estado 500, así
/// que el cuerpo se conserva sea cual sea el estado.
#[derive(Debug, Clone)]
pub struct HttpResponse {
    pub status: u16,
    pub body: Vec<u8>,
}

/// Envía el sobre SOAP al endpoint con la identidad del certificado.
pub fn post_soap(
    endpoint: EndpointName,
    identity: Identity,
    envelope: &str,
    timeout: Duration,
) -> Result<HttpResponse, String> {
    let connector = TlsConnector::builder()
        .identity(identity)
        .min_protocol_version(Some(Protocol::Tlsv12))
        .build()
        .map_err(|err| format!("tls_setup_error: {err}"))?;
    post_soap_to(
        &Target::for_endpoint(endpoint),
        &connector,
        envelope,
        timeout,
    )
}

/// Envío a un destino concreto con un conector ya configurado. Público para que
/// los tests puedan apuntar a un servidor TLS local.
pub fn post_soap_to(
    target: &Target,
    connector: &TlsConnector,
    envelope: &str,
    timeout: Duration,
) -> Result<HttpResponse, String> {
    let address = (target.host.as_str(), target.port)
        .to_socket_addrs()
        .map_err(|err| format!("dns_error: {err}"))?
        .next()
        .ok_or_else(|| "dns_error: sin direcciones".to_string())?;
    let tcp = TcpStream::connect_timeout(&address, timeout)
        .map_err(|err| format!("connect_error: {err}"))?;
    tcp.set_read_timeout(Some(timeout))
        .and_then(|_| tcp.set_write_timeout(Some(timeout)))
        .map_err(|err| format!("connect_error: {err}"))?;
    let mut tls = connector
        .connect(&target.host, tcp)
        .map_err(|err| format!("tls_handshake_error: {err}"))?;

    let request = format!(
        "POST {path} HTTP/1.1\r\nHost: {host}\r\nContent-Type: text/xml; charset=utf-8\r\nSOAPAction: \"\"\r\nContent-Length: {length}\r\nUser-Agent: CumpleFactura-sidecar/{version}\r\nConnection: close\r\n\r\n",
        path = target.path,
        host = target.host,
        length = envelope.len(),
        version = env!("CARGO_PKG_VERSION"),
    );
    tls.write_all(request.as_bytes())
        .and_then(|_| tls.write_all(envelope.as_bytes()))
        .and_then(|_| tls.flush())
        .map_err(|err| format!("send_error: {err}"))?;

    let response = read_http_message(&mut BufReader::new(tls), MAX_BODY_BYTES)?;
    let status = response
        .status_code()
        .ok_or_else(|| "aeat_invalid_status_line".to_string())?;
    Ok(HttpResponse {
        status,
        body: response.body,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use fiscal_contract::http::read_http_message;
    use native_tls::{Certificate, TlsAcceptor};
    use std::net::TcpListener;

    /// Servidor TLS local con certificado autofirmado generado al vuelo. Comprueba
    /// la petición que llega y responde con `response`. No prueba el TLS mutuo
    /// (native-tls no puede exigir certificado de cliente en servidor); eso se
    /// comprueba contra la AEAT de pruebas con `tools/homolog-verifactu.mjs`.
    fn tls_server(
        response: &'static [u8],
    ) -> (Target, Certificate, std::thread::JoinHandle<String>) {
        let generated = rcgen::generate_simple_self_signed(vec!["localhost".to_string()]).unwrap();
        let cert_pem = generated.cert.pem();
        let key_pem = generated.signing_key.serialize_pem();
        let identity = Identity::from_pkcs8(cert_pem.as_bytes(), key_pem.as_bytes()).unwrap();
        let acceptor = TlsAcceptor::new(identity).unwrap();
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let handle = std::thread::spawn(move || {
            let (tcp, _) = listener.accept().unwrap();
            let mut tls = acceptor.accept(tcp).unwrap();
            let request = {
                let mut reader = BufReader::new(&mut tls);
                read_http_message(&mut reader, MAX_BODY_BYTES).unwrap()
            };
            tls.write_all(response).unwrap();
            tls.flush().unwrap();
            format!(
                "{}|{}|{}|{}",
                request.start_line,
                request.header("content-type").unwrap_or(""),
                request.header("soapaction").unwrap_or(""),
                String::from_utf8_lossy(&request.body)
            )
        });
        let target = Target {
            host: "localhost".to_string(),
            port,
            path: "/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP".to_string(),
        };
        (
            target,
            Certificate::from_pem(cert_pem.as_bytes()).unwrap(),
            handle,
        )
    }

    fn connector_trusting(certificate: Certificate) -> TlsConnector {
        TlsConnector::builder()
            .add_root_certificate(certificate)
            .min_protocol_version(Some(Protocol::Tlsv12))
            .build()
            .unwrap()
    }

    #[test]
    fn sends_soap_over_tls_and_reads_chunked_response() {
        let (target, certificate, server) = tls_server(
            b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n5\r\n<ok/>\r\n0\r\n\r\n",
        );
        let response = post_soap_to(
            &target,
            &connector_trusting(certificate),
            "<soap/>",
            Duration::from_secs(10),
        )
        .unwrap();
        assert_eq!(response.status, 200);
        assert_eq!(response.body, b"<ok/>");
        assert_eq!(
            server.join().unwrap(),
            "POST /wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP HTTP/1.1|text/xml; charset=utf-8|\"\"|<soap/>"
        );
    }

    #[test]
    fn keeps_body_of_http_500_faults() {
        let (target, certificate, server) =
            tls_server(b"HTTP/1.1 500 Internal Server Error\r\nContent-Length: 8\r\n\r\n<Fault/>");
        let response = post_soap_to(
            &target,
            &connector_trusting(certificate),
            "<soap/>",
            Duration::from_secs(10),
        )
        .unwrap();
        assert_eq!(
            (response.status, response.body.as_slice()),
            (500, &b"<Fault/>"[..])
        );
        server.join().unwrap();
    }

    #[test]
    fn rejects_untrusted_server_certificate() {
        let (target, _certificate, _server) = tls_server(b"HTTP/1.1 200 OK\r\n\r\n");
        let connector = TlsConnector::new().unwrap();
        let err =
            post_soap_to(&target, &connector, "<soap/>", Duration::from_secs(10)).unwrap_err();
        assert!(err.starts_with("tls_handshake_error"), "{err}");
    }

    #[test]
    fn endpoint_targets_use_https_port_and_official_path() {
        let target = Target::for_endpoint(EndpointName::SistemaVerifactuPruebas);
        assert_eq!(
            (target.host.as_str(), target.port, target.path.as_str()),
            (
                "prewww1.aeat.es",
                443,
                "/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP"
            )
        );
    }
}
