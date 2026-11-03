//! Arranque del sidecar.
//!
//! Qué hace, en este orden:
//! 1. lee los interruptores (`--allow-aeat`, `--allow-production`, `--vault-dir`);
//! 2. lee de stdin una línea con el secreto de sesión (64 caracteres hex);
//! 3. escucha en `127.0.0.1` en un puerto libre que elige el sistema;
//! 4. escribe en stdout una única línea JSON `{"port":…,"pid":…,"version":…}`;
//! 5. vigila stdin: cuando la app cierra su extremo (o muere), el sidecar termina.
//!
//! Qué no hace nunca: aceptar el secreto por argumentos o entorno, escribir el
//! secreto en ningún sitio ni escuchar fuera de loopback.
//!
//! Por qué el vigilante de stdin: si la app se cierra de golpe, el sistema
//! operativo cierra la tubería y el sidecar sale solo. Así no quedan procesos
//! huérfanos con un certificado abierto.

use cumplefactura_sidecar::config::{parse_args, parse_secret, SidecarConfig};
use cumplefactura_sidecar::{server, AeatBackend};
use fiscal_contract::messages::Handshake;
use std::io::{self, BufRead, Read, Write};
use std::net::{Ipv4Addr, TcpListener};
use std::process::ExitCode;

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("cumplefactura-sidecar: {error}");
            ExitCode::from(2)
        }
    }
}

fn run() -> Result<(), String> {
    let args = parse_args(std::env::args().skip(1))?;
    let mut line = String::new();
    io::stdin()
        .lock()
        .read_line(&mut line)
        .map_err(|err| format!("no se pudo leer stdin: {err}"))?;
    let config = SidecarConfig::new(parse_secret(&line)?, args);

    let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0))
        .map_err(|err| format!("no se pudo abrir el puerto local: {err}"))?;
    let handshake = Handshake {
        port: listener.local_addr().map_err(|err| err.to_string())?.port(),
        pid: std::process::id(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    };
    let mut stdout = io::stdout().lock();
    serde_json::to_writer(&mut stdout, &handshake).map_err(|err| err.to_string())?;
    stdout
        .write_all(b"\n")
        .and_then(|_| stdout.flush())
        .map_err(|err| err.to_string())?;
    drop(stdout);

    std::thread::spawn(|| {
        let _ = io::copy(&mut io::stdin().lock().take(u64::MAX), &mut io::sink());
        std::process::exit(0);
    });

    server::serve(listener, &config, &AeatBackend);
    Ok(())
}
