//! Restaurar una copia de seguridad sobre la base de datos activa.
//!
//! Qué hace `restore_database`, en este orden:
//! 1. valida la copia (`validate_backup_file`): SQLite íntegra, de CumpleFactura y no
//!    más nueva que esta app;
//! 2. guarda una copia previa de la base actual en `<carpeta de datos>/backups/`;
//! 3. cierra la conexión, sustituye el fichero, lo reabre y aplica las migraciones;
//! 4. verifica la cadena fiscal;
//! 5. si algo de 3–4 falla, vuelve a poner la copia previa (`rolled_back`).
//!
//! Qué no hace nunca: borrar la copia previa ni tocar el fichero de origen. Tampoco
//! deja la app sin base: si ni siquiera se puede volver atrás, el error dice dónde
//! está la copia previa.
//!
//! Por qué cerrar y reabrir: en Windows no se puede sustituir un fichero abierto, y
//! la conexión de `AppState` es la única; el mutex del llamante impide que otro
//! comando la use mientras tanto.

use super::*;
use crate::services::fiscal_chain;
use rusqlite::OpenFlags;
use std::path::Path;

/// Qué pasó al restaurar con `confirm = true`.
#[derive(Debug, Clone)]
pub struct RestoreOutcome {
    /// `restored` o `rolled_back`.
    pub status: &'static str,
    pub safety_backup_path: String,
    /// Resultado de verificar la cadena tras sustituir; `None` si no se llegó a verificar.
    pub chain_ok: Option<bool>,
    pub notes: Vec<String>,
}

/// La copia es una base SQLite íntegra de CumpleFactura con un esquema que esta app conoce.
pub fn validate_backup_file(path: &Path) -> Result<(), String> {
    let conn = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|_| "backup_not_sqlite".to_string())?;
    let integrity: String = conn
        .query_row("PRAGMA integrity_check", [], |row| row.get(0))
        .map_err(|_| "backup_not_sqlite".to_string())?;
    if integrity != "ok" {
        return Err("backup_integrity_check_failed".to_string());
    }
    let version: Option<i64> = conn
        .query_row("SELECT MAX(version) FROM schema_migrations", [], |row| {
            row.get(0)
        })
        .map_err(|_| "backup_not_cumplefactura".to_string())?;
    let latest = migrations().last().map_or(0, |migration| migration.version);
    match version {
        None => Err("backup_not_cumplefactura".to_string()),
        Some(version) if version > latest => Err("backup_newer_than_app".to_string()),
        Some(_) => Ok(()),
    }
}

/// Sustituye la base de `conn` por `source`, con copia previa y vuelta atrás.
pub fn restore_database(conn: &mut Connection, source: &Path) -> Result<RestoreOutcome, String> {
    let db_path = conn
        .path()
        .filter(|path| !path.is_empty())
        .map(PathBuf::from)
        .ok_or("restore_requires_file_database")?;
    if source.canonicalize().ok() == db_path.canonicalize().ok() {
        return Err("backup_source_is_active_database".to_string());
    }
    validate_backup_file(source)?;

    let safety = db_path
        .parent()
        .ok_or("restore_requires_file_database")?
        .join("backups")
        .join(format!(
            "antes-de-restaurar-{}.sqlite3",
            chrono::Utc::now().format("%Y%m%d-%H%M%S")
        ));
    let safety_backup_path = safety.to_string_lossy().to_string();
    backup_database(conn, &safety_backup_path)?;

    let attempt = replace_and_reopen(conn, &db_path, source)
        .and_then(|()| fiscal_chain::verify(conn).map(|report| report.valid));
    let (chain_ok, reason) = match attempt {
        Ok(true) => {
            return Ok(RestoreOutcome {
                status: "restored",
                safety_backup_path,
                chain_ok: Some(true),
                notes: vec!["Base restaurada; cadena fiscal verificada.".to_string()],
            })
        }
        Ok(false) => (
            Some(false),
            "fiscal_chain_invalid: la cadena fiscal de la copia no es válida".to_string(),
        ),
        Err(err) => (None, err),
    };
    replace_and_reopen(conn, &db_path, &safety).map_err(|err| {
        format!("restore_rollback_failed: {err}; copia previa en {safety_backup_path}")
    })?;
    Ok(RestoreOutcome {
        status: "rolled_back",
        safety_backup_path,
        chain_ok,
        notes: vec![
            reason,
            "Se ha vuelto a la base anterior desde la copia previa.".to_string(),
        ],
    })
}

/// Cierra `conn`, copia `from` sobre `db_path` y deja `conn` abierta sobre el resultado.
fn replace_and_reopen(conn: &mut Connection, db_path: &Path, from: &Path) -> Result<(), String> {
    let placeholder = Connection::open_in_memory().map_err(db_error)?;
    let old = std::mem::replace(conn, placeholder);
    if let Err((old, err)) = old.close() {
        *conn = old;
        return Err(db_error(err));
    }
    fs::copy(from, db_path).map_err(|err| format!("restore copy error: {err}"))?;
    *conn = open_database(db_path).map_err(db_error)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("cf-restore-{name}-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn company_count(conn: &Connection) -> i64 {
        conn.query_row("SELECT COUNT(*) FROM companies", [], |row| row.get(0))
            .unwrap()
    }

    fn add_company(conn: &Connection, name: &str) {
        let company =
            crate::domain::company::Company::from_input(crate::domain::company::CompanyInput {
                legal_name: name.to_string(),
                tax_id: format!("B{:08}", name.len() * 7 + name.as_bytes()[0] as usize),
                address: "Calle 1".to_string(),
                postal_code: "28001".to_string(),
                municipality: "Madrid".to_string(),
                province: "Madrid".to_string(),
                country_code: "ES".to_string(),
                default_series: None,
            });
        insert_company(conn, &company).unwrap();
    }

    #[test]
    fn restores_backup_and_keeps_safety_copy() {
        let dir = temp_dir("ok");
        let mut live = open_database(&dir.join("live.sqlite3")).unwrap();
        add_company(&live, "Uno SL");
        let backup = dir.join("copia.sqlite3");
        backup_database(&live, backup.to_str().unwrap()).unwrap();
        add_company(&live, "Dos SL");

        let outcome = restore_database(&mut live, &backup).unwrap();
        assert_eq!(outcome.status, "restored");
        assert_eq!(outcome.chain_ok, Some(true));
        assert_eq!(company_count(&live), 1);
        let safety = open_database(Path::new(&outcome.safety_backup_path)).unwrap();
        assert_eq!(company_count(&safety), 2);
        // La conexión restaurada sigue siendo utilizable y escribe en el fichero.
        add_company(&live, "Tres SL");
        drop(live);
        let reopened = open_database(&dir.join("live.sqlite3")).unwrap();
        assert_eq!(company_count(&reopened), 2);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn rolls_back_when_restored_chain_is_invalid() {
        let dir = temp_dir("rollback");
        let backup = dir.join("rota.sqlite3");
        {
            // Copia con una huella falsa: la cadena no verifica.
            let mut broken = open_database(&backup).unwrap();
            crate::db::tests::issued_invoice_with_export(&mut broken);
        }
        let mut live = open_database(&dir.join("live.sqlite3")).unwrap();
        add_company(&live, "Actual SL");

        let outcome = restore_database(&mut live, &backup).unwrap();
        assert_eq!(outcome.status, "rolled_back");
        assert_eq!(outcome.chain_ok, Some(false));
        assert!(outcome.notes[0].starts_with("fiscal_chain_invalid"));
        assert_eq!(company_count(&live), 1);
        let name: String = live
            .query_row("SELECT legal_name FROM companies", [], |row| row.get(0))
            .unwrap();
        assert_eq!(name, "Actual SL");
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn rejects_invalid_sources_before_touching_the_database() {
        let dir = temp_dir("invalid");
        let mut live = open_database(&dir.join("live.sqlite3")).unwrap();
        let not_sqlite = dir.join("texto.sqlite3");
        fs::write(&not_sqlite, b"no soy una base de datos").unwrap();
        assert_eq!(
            restore_database(&mut live, &not_sqlite).unwrap_err(),
            "backup_not_sqlite"
        );
        let foreign = dir.join("ajena.sqlite3");
        Connection::open(&foreign)
            .unwrap()
            .execute_batch("CREATE TABLE x (a);")
            .unwrap();
        assert_eq!(
            restore_database(&mut live, &foreign).unwrap_err(),
            "backup_not_cumplefactura"
        );
        let newer = dir.join("nueva.sqlite3");
        open_database(&newer)
            .unwrap()
            .execute(
                "INSERT INTO schema_migrations (version, name) VALUES (999, 'futura')",
                [],
            )
            .unwrap();
        assert_eq!(
            restore_database(&mut live, &newer).unwrap_err(),
            "backup_newer_than_app"
        );
        assert_eq!(
            restore_database(&mut live, &dir.join("live.sqlite3")).unwrap_err(),
            "backup_source_is_active_database"
        );
        assert!(!dir.join("backups").exists(), "no safety copy was needed");
        let mut memory = test_conn();
        assert_eq!(
            restore_database(&mut memory, &newer).unwrap_err(),
            "restore_requires_file_database"
        );
        fs::remove_dir_all(dir).unwrap();
    }
}
