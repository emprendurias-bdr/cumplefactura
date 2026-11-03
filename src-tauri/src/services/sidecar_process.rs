//! Arranque y vigilancia del proceso `cumplefactura-sidecar`.
//!
//! Qué hace:
//! - Localiza el binario junto al ejecutable de la app (Tauri lo coloca ahí al
//!   empaquetarlo como `externalBin`; en desarrollo, cargo lo deja en el mismo `target/`).
//! - Lo lanza la primera vez que hace falta, con un secreto HMAC nuevo de 32 bytes
//!   escrito en su stdin, y lee de su stdout el puerto en el que escucha.
//! - Antes de cada uso comprueba que sigue vivo y, si murió, lo relanza.
//! - `shutdown` lo termina al cerrar la app.
//!
//! Qué no hace nunca: pasar el secreto por argumentos o entorno, ni abrir certificados.
//! La app solo conoce la carpeta del vault para indicársela al sidecar.
//!
//! Interruptores (variables de entorno de la app):
//! - `CUMPLEFACTURA_SIDECAR_ALLOW_AEAT=1` arranca el sidecar con `--allow-aeat`.
//!   Sin ella, el sidecar responde pero no puede llamar a la AEAT.
//! - `CUMPLEFACTURA_CERT_VAULT_DIR` cambia la carpeta de certificados
//!   (por defecto `<datos de la app>/certs`).
//! - `CUMPLEFACTURA_SIDECAR_PATH` (solo compilaciones de desarrollo) fuerza la ruta del binario.

use fiscal_contract::messages::Handshake;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{mpsc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Manager};

pub const ALLOW_AEAT_ENV: &str = "CUMPLEFACTURA_SIDECAR_ALLOW_AEAT";
pub const VAULT_DIR_ENV: &str = "CUMPLEFACTURA_CERT_VAULT_DIR";
const BINARY_OVERRIDE_ENV: &str = "CUMPLEFACTURA_SIDECAR_PATH";
const BINARY_NAME: &str = "cumplefactura-sidecar";
const HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(10);

/// Datos para hablar con un sidecar en marcha.
#[derive(Debug, Clone)]
pub struct SidecarClient {
    pub port: u16,
    pub secret: Vec<u8>,
}

/// Cómo lanzar el sidecar.
#[derive(Debug, Clone)]
pub struct LaunchConfig {
    pub binary: PathBuf,
    pub vault_dir: PathBuf,
    pub allow_aeat: bool,
}

impl LaunchConfig {
    /// Resuelve binario, vault e interruptores para esta instalación.
    pub fn resolve(app: &AppHandle) -> Result<Self, String> {
        let exe_dir = std::env::current_exe()
            .ok()
            .and_then(|exe| exe.parent().map(Path::to_path_buf))
            .ok_or("sidecar_binary_not_found: no se pudo resolver la carpeta de la app")?;
        let binary = find_binary(&exe_dir).ok_or_else(|| {
            format!(
                "sidecar_binary_not_found: falta {} junto a la app",
                binary_file_name()
            )
        })?;
        let vault_dir = match std::env::var(VAULT_DIR_ENV) {
            Ok(dir) if !dir.trim().is_empty() => PathBuf::from(dir),
            _ => app
                .path()
                .app_data_dir()
                .map_err(|err| format!("cannot resolve app data dir: {err}"))?
                .join("certs"),
        };
        std::fs::create_dir_all(&vault_dir)
            .map_err(|err| format!("cannot create certificate vault dir: {err}"))?;
        Ok(Self {
            binary,
            vault_dir,
            allow_aeat: std::env::var(ALLOW_AEAT_ENV).as_deref() == Ok("1"),
        })
    }
}

fn binary_file_name() -> String {
    format!("{BINARY_NAME}{}", std::env::consts::EXE_SUFFIX)
}

/// Busca el binario junto al ejecutable de la app.
pub fn find_binary(exe_dir: &Path) -> Option<PathBuf> {
    if cfg!(debug_assertions) {
        if let Some(path) = std::env::var_os(BINARY_OVERRIDE_ENV).map(PathBuf::from) {
            return path.is_file().then_some(path);
        }
    }
    let candidate = exe_dir.join(binary_file_name());
    candidate.is_file().then_some(candidate)
}

struct Running {
    child: Child,
    /// Mientras esta tubería siga abierta, el sidecar sigue vivo.
    _stdin: ChildStdin,
    client: SidecarClient,
}

/// Estado compartido de Tauri: como mucho un sidecar por app.
#[derive(Default)]
pub struct SidecarManager {
    running: Mutex<Option<Running>>,
}

impl SidecarManager {
    /// Devuelve un cliente para el sidecar, lanzándolo si no está vivo.
    pub fn client(
        &self,
        launch: impl FnOnce() -> Result<LaunchConfig, String>,
    ) -> Result<SidecarClient, String> {
        let mut guard = self
            .running
            .lock()
            .map_err(|_| "sidecar lock poisoned".to_string())?;
        if let Some(running) = guard.as_mut() {
            if matches!(running.child.try_wait(), Ok(None)) {
                return Ok(running.client.clone());
            }
        }
        if let Some(dead) = guard.take() {
            stop(dead);
        }
        let running = spawn(&launch()?)?;
        let client = running.client.clone();
        *guard = Some(running);
        Ok(client)
    }

    /// Termina el sidecar si está en marcha.
    pub fn shutdown(&self) {
        if let Some(running) = self.running.lock().ok().and_then(|mut guard| guard.take()) {
            stop(running);
        }
    }
}

fn stop(mut running: Running) {
    let _ = running.child.kill();
    let _ = running.child.wait();
}

fn spawn(launch: &LaunchConfig) -> Result<Running, String> {
    // Dos UUID v4 dan 32 bytes de un generador criptográfico del sistema.
    let secret: Vec<u8> = [uuid::Uuid::new_v4(), uuid::Uuid::new_v4()]
        .iter()
        .flat_map(|id| *id.as_bytes())
        .collect();

    let mut command = Command::new(&launch.binary);
    command.arg("--vault-dir").arg(&launch.vault_dir);
    if launch.allow_aeat {
        command.arg("--allow-aeat");
    }
    command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(if cfg!(debug_assertions) {
            Stdio::inherit()
        } else {
            Stdio::null()
        });
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    let mut child = command
        .spawn()
        .map_err(|err| format!("sidecar_spawn_error: {err}"))?;

    let started = handshake(&mut child, &secret);
    match started {
        Ok((stdin, port)) => Ok(Running {
            child,
            _stdin: stdin,
            client: SidecarClient { port, secret },
        }),
        Err(err) => {
            let _ = child.kill();
            let _ = child.wait();
            Err(err)
        }
    }
}

/// Entrega el secreto y espera la línea `{"port":…}`.
fn handshake(child: &mut Child, secret: &[u8]) -> Result<(ChildStdin, u16), String> {
    let mut stdin = child.stdin.take().ok_or("sidecar_stdin_unavailable")?;
    writeln!(stdin, "{}", fiscal_contract::to_hex(secret))
        .and_then(|_| stdin.flush())
        .map_err(|err| format!("sidecar_secret_write_error: {err}"))?;
    let stdout = child.stdout.take().ok_or("sidecar_stdout_unavailable")?;
    let (sender, receiver) = mpsc::channel();
    std::thread::spawn(move || {
        let mut line = String::new();
        let _ = sender.send(BufReader::new(stdout).read_line(&mut line).map(|_| line));
    });
    let line = match receiver.recv_timeout(HANDSHAKE_TIMEOUT) {
        Ok(Ok(line)) => line,
        Ok(Err(err)) => return Err(format!("sidecar_handshake_error: {err}")),
        Err(_) => return Err("sidecar_start_timeout".to_string()),
    };
    let handshake: Handshake =
        serde_json::from_str(line.trim()).map_err(|_| "sidecar_handshake_invalid".to_string())?;
    if handshake.pid != child.id() {
        return Err("sidecar_handshake_pid_mismatch".to_string());
    }
    Ok((stdin, handshake.port))
}

#[cfg(test)]
mod tests {
    use super::*;
    use fiscal_contract::messages::{SubmitPreflightRequest, SubmitPreflightResponse};

    /// Binario del sidecar compilado en el mismo `target/` del workspace.
    fn built_sidecar() -> Option<PathBuf> {
        let target = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()?
            .join("target")
            .join(if cfg!(debug_assertions) {
                "debug"
            } else {
                "release"
            });
        find_binary(&target)
    }

    #[test]
    fn missing_binary_is_reported() {
        assert!(find_binary(Path::new("/ruta/que/no/existe")).is_none());
        let manager = SidecarManager::default();
        let err = manager
            .client(|| {
                Ok(LaunchConfig {
                    binary: PathBuf::from("/ruta/que/no/existe/cumplefactura-sidecar"),
                    vault_dir: std::env::temp_dir(),
                    allow_aeat: false,
                })
            })
            .unwrap_err();
        assert!(err.starts_with("sidecar_spawn_error"), "{err}");
    }

    /// Lanza el sidecar real, le hace un preflight firmado, comprueba que se reutiliza
    /// y que se relanza si muere. Se omite si el binario aún no está compilado.
    #[test]
    fn launches_reuses_and_restarts_real_sidecar() {
        let Some(binary) = built_sidecar() else {
            eprintln!("sidecar no compilado: ejecuta cargo build -p cumplefactura-sidecar");
            return;
        };
        let launch = || {
            Ok(LaunchConfig {
                binary: binary.clone(),
                vault_dir: std::env::temp_dir(),
                allow_aeat: false,
            })
        };
        let manager = SidecarManager::default();
        let first = manager.client(launch).expect("sidecar arranca");
        assert_eq!(first.secret.len(), 32);

        let body = serde_json::to_vec(&SubmitPreflightRequest {
            endpoint_name: "SistemaVerifactuPruebas".to_string(),
            certificate_ref: "vault://certs/no-existe".to_string(),
            certificate_password: None,
        })
        .unwrap();
        let preflight: SubmitPreflightResponse = fiscal_contract::http::post_json_loopback(
            first.port,
            fiscal_contract::PATH_SUBMIT_PREFLIGHT,
            &first.secret,
            &body,
            Duration::from_secs(5),
        )
        .expect("preflight firmado");
        assert_eq!(preflight.status, "blocked");
        assert!(preflight
            .blockers
            .contains(&"aeat_calls_disabled".to_string()));

        assert_eq!(manager.client(launch).unwrap().port, first.port);

        if let Some(running) = manager.running.lock().unwrap().as_mut() {
            running.child.kill().unwrap();
            running.child.wait().unwrap();
        }
        let restarted = manager.client(launch).expect("se relanza");
        assert_ne!(restarted.secret, first.secret);
        manager.shutdown();
        assert!(manager.running.lock().unwrap().is_none());
    }
}
