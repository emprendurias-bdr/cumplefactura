//! Ejecuta el binario real como lo hace la app: secreto por stdin, handshake por
//! stdout, peticiones firmadas por loopback y salida al cerrar stdin.

use fiscal_contract::http::{post_json_loopback, read_http_message};
use fiscal_contract::messages::{Handshake, SubmitPreflightRequest, SubmitPreflightResponse};
use fiscal_contract::{to_hex, MAX_BODY_BYTES, PATH_INVOKE_SUBMIT, PATH_SUBMIT_PREFLIGHT};
use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Write};
use std::net::TcpStream;
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

const SECRET: [u8; 32] = [0x5a; 32];

fn spawn(args: &[&str]) -> (Child, Handshake) {
    let mut child = Command::new(env!("CARGO_BIN_EXE_cumplefactura-sidecar"))
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .expect("arranca el sidecar");
    writeln!(child.stdin.as_mut().unwrap(), "{}", to_hex(&SECRET)).unwrap();
    let mut line = String::new();
    BufReader::new(child.stdout.take().unwrap())
        .read_line(&mut line)
        .unwrap();
    let handshake: Handshake = serde_json::from_str(&line).expect("handshake JSON");
    (child, handshake)
}

fn wait_exit(child: &mut Child, limit: Duration) -> bool {
    let start = Instant::now();
    while start.elapsed() < limit {
        if child.try_wait().unwrap().is_some() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    false
}

#[test]
fn handshake_signed_calls_and_exit_on_stdin_close() {
    let (mut child, handshake) = spawn(&[]);
    assert_eq!(handshake.pid, child.id());

    let mut stream = TcpStream::connect(("127.0.0.1", handshake.port)).unwrap();
    stream
        .write_all(b"GET /healthz HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n")
        .unwrap();
    let health = read_http_message(&mut BufReader::new(stream), MAX_BODY_BYTES).unwrap();
    assert_eq!(health.status_code(), Some(200));

    let request = SubmitPreflightRequest {
        endpoint_name: "SistemaVerifactuPruebas".to_string(),
        certificate_ref: "vault://certs/no-existe".to_string(),
        certificate_password: None,
    };
    let body = serde_json::to_vec(&request).unwrap();
    let preflight: SubmitPreflightResponse = post_json_loopback(
        handshake.port,
        PATH_SUBMIT_PREFLIGHT,
        &SECRET,
        &body,
        Duration::from_secs(5),
    )
    .unwrap();
    assert_eq!(preflight.status, "blocked");
    assert_eq!(
        preflight.blockers,
        vec!["certificate_vault_dir_missing", "aeat_calls_disabled"]
    );

    let unsigned = post_json_loopback::<Value>(
        handshake.port,
        PATH_SUBMIT_PREFLIGHT,
        b"secreto-equivocado",
        &body,
        Duration::from_secs(5),
    )
    .unwrap_err();
    assert_eq!(unsigned, "sidecar_http_401: hmac_invalid");

    let xml = "<sfLR:RegFactuSistemaFacturacion xmlns:sfLR=\"https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR.xsd\"/>";
    let invoke = json!({
        "xml": xml,
        "xml_sha256": fiscal_contract::sha256_hex(xml.as_bytes()),
        "endpoint_name": "SistemaVerifactuPruebas",
        "certificate_ref": "vault://certs/no-existe",
        "timeout_seconds": 10
    });
    let blocked = post_json_loopback::<Value>(
        handshake.port,
        PATH_INVOKE_SUBMIT,
        &SECRET,
        &serde_json::to_vec(&invoke).unwrap(),
        Duration::from_secs(5),
    )
    .unwrap_err();
    assert_eq!(blocked, "sidecar_http_409: aeat_calls_disabled");

    drop(child.stdin.take());
    assert!(
        wait_exit(&mut child, Duration::from_secs(5)),
        "el sidecar debe salir al cerrarse stdin"
    );
}

#[test]
fn refuses_to_start_without_valid_secret_or_with_unknown_flags() {
    let mut child = Command::new(env!("CARGO_BIN_EXE_cumplefactura-sidecar"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();
    writeln!(child.stdin.as_mut().unwrap(), "corto").unwrap();
    assert_eq!(child.wait().unwrap().code(), Some(2));

    let status = Command::new(env!("CARGO_BIN_EXE_cumplefactura-sidecar"))
        .arg("--abrir-todo")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .unwrap();
    assert_eq!(status.code(), Some(2));
}
