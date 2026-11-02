//! Configuración de arranque del sidecar.
//!
//! Qué hace: interpreta los argumentos de línea de comandos y la línea secreta que
//! la app escribe en stdin, y los reúne en `SidecarConfig`.
//!
//! Qué no hace nunca:
//! - Leer el secreto de sesión de argumentos o variables de entorno. Ambos son
//!   visibles para otros procesos del mismo usuario (`ps`, Administrador de tareas).
//! - Guardar contraseñas de certificados. `vault` las busca solo en el momento de usarlas.
//!
//! Por qué tres interruptores separados:
//! - sin `--allow-aeat` el sidecar nunca abre una conexión saliente (modo gate y desarrollo);
//! - sin `--allow-production` solo se aceptan los endpoints de pruebas de la AEAT;
//! - `--vault-dir` fija la única carpeta de la que se pueden leer certificados.

use std::path::PathBuf;

#[derive(Debug, Clone)]
pub struct SidecarConfig {
    /// Clave HMAC de la sesión: 32 bytes aleatorios generados por la app.
    pub shared_secret: Vec<u8>,
    /// Permite llamadas reales a la AEAT.
    pub allow_aeat: bool,
    /// Permite los endpoints de producción (`SistemaVerifactu`, `SistemaVerifactuSello`).
    pub allow_production: bool,
    /// Carpeta de certificados `<id>.p12` / `<id>.pfx`.
    pub vault_dir: Option<PathBuf>,
}

/// Interruptores leídos de la línea de comandos.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct CliArgs {
    pub allow_aeat: bool,
    pub allow_production: bool,
    pub vault_dir: Option<PathBuf>,
}

pub const USAGE: &str =
    "uso: cumplefactura-sidecar [--allow-aeat] [--allow-production] [--vault-dir <carpeta>]\n\
     El secreto de sesion (64 caracteres hex) se lee de la primera linea de stdin.";

/// Interpreta los argumentos. Un argumento desconocido es un error: mejor no
/// arrancar que arrancar con una configuración distinta de la pedida.
pub fn parse_args(args: impl IntoIterator<Item = String>) -> Result<CliArgs, String> {
    let mut parsed = CliArgs::default();
    let mut args = args.into_iter();
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--allow-aeat" => parsed.allow_aeat = true,
            "--allow-production" => parsed.allow_production = true,
            "--vault-dir" => {
                let dir = args
                    .next()
                    .filter(|value| !value.trim().is_empty())
                    .ok_or("--vault-dir necesita una carpeta")?;
                parsed.vault_dir = Some(PathBuf::from(dir));
            }
            other => return Err(format!("argumento desconocido: {other}\n{USAGE}")),
        }
    }
    Ok(parsed)
}

/// Convierte la línea de stdin en la clave HMAC. Exige 32 bytes en hexadecimal.
pub fn parse_secret(line: &str) -> Result<Vec<u8>, String> {
    let secret =
        fiscal_contract::from_hex(line.trim()).ok_or("el secreto de stdin debe ser hexadecimal")?;
    if secret.len() != 32 {
        return Err("el secreto de stdin debe tener 32 bytes (64 caracteres hex)".to_string());
    }
    Ok(secret)
}

impl SidecarConfig {
    pub fn new(shared_secret: Vec<u8>, args: CliArgs) -> Self {
        Self {
            shared_secret,
            allow_aeat: args.allow_aeat,
            allow_production: args.allow_production,
            vault_dir: args.vault_dir,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(list: &[&str]) -> Result<CliArgs, String> {
        parse_args(list.iter().map(|value| value.to_string()))
    }

    #[test]
    fn defaults_are_fail_closed() {
        assert_eq!(args(&[]).unwrap(), CliArgs::default());
    }

    #[test]
    fn parses_every_switch() {
        let parsed = args(&["--allow-aeat", "--vault-dir", "/v", "--allow-production"]).unwrap();
        assert!(parsed.allow_aeat && parsed.allow_production);
        assert_eq!(parsed.vault_dir, Some(PathBuf::from("/v")));
    }

    #[test]
    fn rejects_unknown_or_incomplete_arguments() {
        assert!(args(&["--allow-everything"]).is_err());
        assert!(args(&["--vault-dir"]).is_err());
        assert!(args(&["--vault-dir", " "]).is_err());
    }

    #[test]
    fn secret_must_be_32_hex_bytes() {
        assert_eq!(
            parse_secret(&format!("{}\n", "ab".repeat(32)))
                .unwrap()
                .len(),
            32
        );
        assert!(parse_secret("abcd").is_err());
        assert!(parse_secret(&"zz".repeat(32)).is_err());
    }
}
