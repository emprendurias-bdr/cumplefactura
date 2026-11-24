//! Libro registro de facturas expedidas (RIVA, RD 1624/1992, art. 63) en CSV.
//!
//! Una fila por factura y por tipo impositivo (art. 63.5: si una factura lleva varios tipos,
//! se distingue la parte de cada uno). Formato pensado para el importador de ContaPro
//! (`invoices_issued`): separador `;`, cabeceras en minúscula, fecha `AAAA-MM-DD`, importes con
//! coma decimal y UTF-8 con BOM. Las columnas que ContaPro no conoce las ignora.
//!
//! Qué entra: facturas emitidas (`Issued`) y rectificadas (`Rectified`) de la empresa cuya fecha
//! de expedición cae en el rango. Fuera: borradores (no son facturas) y anuladas (`Void`): el
//! registro de anulación de VERI*FACTU deja la factura sin efecto, así que no se lleva al libro.
//! Las rectificativas por diferencias (I) salen con el signo guardado (negativo si reducen la
//! base); las de sustitución (S) restan la original con filas negativas y suman la nueva.
//!
//! Opción `include_void` (decisión 15.1): las anuladas salen en una fila con importes a cero para
//! que la numeración se vea completa, y se añade al final la columna `estado` (EMITIDA,
//! RECTIFICADA, ANULADA). Sin la opción el CSV no cambia (sin `estado`), para no romper lectores.

use crate::services::export;
use crate::services::verifactu::{
    format_invoice_number, money, registro_alta_invoice_type_for_kind,
};
use rusqlite::{params, Connection};

const HEADER: &str = "fecha;fecha_operacion;serie;numero;tipo_factura;cliente_nombre;cliente_nif;\
base;porcentaje_iva;cuota_iva;porcentaje_recargo;cuota_recargo;porcentaje_irpf;retencion_irpf;\
total;tipo_rectificativa;factura_rectificada;fecha_factura_rectificada;tipo_operacion\n";

/// Resultado para la UI: cuántas facturas y filas se escribieron.
pub struct LibroResumen {
    pub facturas: usize,
    pub filas: usize,
    pub anuladas: usize,
}

/// Genera el CSV del periodo `[from, to]` (fechas `AAAA-MM-DD`, ambas incluidas).
pub fn libro_expedidas_csv(
    conn: &Connection,
    company_id: &str,
    from: &str,
    to: &str,
    include_void: bool,
) -> Result<(String, LibroResumen), String> {
    let (from, to) = (iso_date(from)?, iso_date(to)?);
    if from > to {
        return Err("period start must not be after period end".to_string());
    }
    let mut invoices = conn
        .prepare(
            "SELECT i.id, i.series, i.number, i.kind, i.issued_at, i.rectification_reason_code,
                    i.rectification_method, cu.display_name, cu.tax_id, r.series, r.number, r.issued_at, r.id,
                    i.status
             FROM invoices i
             JOIN customers cu ON cu.id = i.customer_id
             LEFT JOIN invoices r ON r.id = i.rectifies_invoice_id
             WHERE i.company_id = ?1
               AND (i.status IN ('Issued', 'Rectified') OR (?4 AND i.status = 'Void'))
               AND i.number IS NOT NULL AND i.issued_at IS NOT NULL
               AND substr(i.issued_at, 1, 10) BETWEEN ?2 AND ?3
             ORDER BY i.issued_at, i.series, i.number",
        )
        .map_err(db_error)?;
    // Por tipo de IVA (y de IRPF, para no mezclar porcentajes de retención en una fila).
    let mut groups = conn
        .prepare(
            "SELECT tax_rate_basis_points, withholding_rate_basis_points,
                    SUM(taxable_base_cents), SUM(tax_cents), SUM(withholding_cents)
             FROM invoice_lines WHERE invoice_id = ?1
             GROUP BY 1, 2 ORDER BY 1 DESC, 2",
        )
        .map_err(db_error)?;

    let rows = invoices
        .query_map(params![company_id, from, to, include_void], |row| {
            Ok(Header {
                id: row.get(0)?,
                series: row.get(1)?,
                number: row.get(2)?,
                kind: row.get(3)?,
                issued_at: row.get(4)?,
                reason: row.get(5)?,
                method: row.get(6)?,
                customer_name: row.get(7)?,
                customer_tax_id: row.get(8)?,
                rectified: match (row.get::<_, Option<String>>(9)?, row.get(10)?, row.get(11)?) {
                    (Some(series), Some(number), Some(issued_at)) => {
                        Some((series, number, issued_at))
                    }
                    _ => None,
                },
                rectified_id: row.get(12)?,
                status: row.get(13)?,
            })
        })
        .map_err(db_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(db_error)?;

    let mut csv = if include_void {
        format!("\u{feff}{};estado\n", HEADER.trim_end())
    } else {
        format!("\u{feff}{HEADER}")
    };
    let (mut filas, mut anuladas) = (0, 0);
    for invoice in &rows {
        let tipo_factura =
            registro_alta_invoice_type_for_kind(&invoice.kind, invoice.reason.as_deref())?;
        let (rect_number, rect_date) = match &invoice.rectified {
            Some((series, number, issued_at)) => (
                export::cell(&format_invoice_number(series, *number)),
                issued_at[..10].to_string(),
            ),
            None => (String::new(), String::new()),
        };
        let mut group_rows = |id: &str, sign: i64| {
            groups
                .query_map(params![id], |row| {
                    Ok([
                        row.get(0)?,
                        row.get(1)?,
                        sign * row.get::<_, i64>(2)?,
                        sign * row.get::<_, i64>(3)?,
                        sign * row.get::<_, i64>(4)?,
                    ])
                })
                .map_err(db_error)?
                .collect::<Result<Vec<[i64; 5]>, _>>()
                .map_err(db_error)
        };
        // Sustitución (S): la rectificativa lleva los importes nuevos completos y la original sigue
        // en el libro; se resta la original (filas negativas) para que el libro sume lo correcto.
        let estado = match invoice.status.as_str() {
            "Void" => "ANULADA",
            "Rectified" => "RECTIFICADA",
            _ => "EMITIDA",
        };
        // Anulada (solo con `include_void`): una fila a cero; no suma ni resta nada al periodo.
        let lines = if estado == "ANULADA" {
            anuladas += 1;
            vec![[0; 5]]
        } else {
            let mut lines = match (invoice.method.as_deref(), &invoice.rectified_id) {
                (Some("S"), Some(original)) => group_rows(original, -1)?,
                _ => Vec::new(),
            };
            lines.extend(group_rows(&invoice.id, 1)?);
            lines
        };
        for [iva_bp, irpf_bp, base, cuota, retencion] in lines {
            // Recargo de equivalencia: aún no se emite (N3); columnas vacías hasta entonces.
            // Fecha de operación vacía: hoy coincide siempre con la de expedición (art. 63.3).
            csv.push_str(&format!(
                "{};;{};{};{};{};{};{};{};{};;;{};{};{};{};{};{};venta_nacional",
                &invoice.issued_at[..10],
                export::cell(&invoice.series),
                export::cell(&format_invoice_number(&invoice.series, invoice.number)),
                tipo_factura,
                export::cell(&invoice.customer_name),
                export::cell(&invoice.customer_tax_id),
                decimal(base),
                decimal(iva_bp),
                decimal(cuota),
                decimal(irpf_bp),
                decimal(retencion),
                decimal(base + cuota - retencion),
                invoice.method.as_deref().unwrap_or(""),
                rect_number,
                rect_date,
            ));
            if include_void {
                csv.push(';');
                csv.push_str(estado);
            }
            csv.push('\n');
            filas += 1;
        }
    }
    Ok((
        csv,
        LibroResumen {
            facturas: rows.len(),
            filas,
            anuladas,
        },
    ))
}

struct Header {
    id: String,
    series: String,
    number: i64,
    kind: String,
    issued_at: String,
    reason: Option<String>,
    method: Option<String>,
    customer_name: String,
    customer_tax_id: String,
    rectified: Option<(String, i64, String)>,
    rectified_id: Option<String>,
    status: String,
}

/// Céntimos o puntos básicos → `1234,56` (coma decimal, sin miles: lo leen Excel y ContaPro).
fn decimal(value: i64) -> String {
    money(value).replace('.', ",")
}

fn iso_date(value: &str) -> Result<String, String> {
    chrono::NaiveDate::parse_from_str(value.trim(), "%Y-%m-%d")
        .map(|date| date.format("%Y-%m-%d").to_string())
        .map_err(|_| format!("invalid date (expected YYYY-MM-DD): {value}"))
}

fn db_error(err: rusqlite::Error) -> String {
    format!("database error: {err}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_conn;

    /// Datos ficticios: NIF de prueba, nunca reales.
    fn seed(conn: &Connection) {
        conn.execute_batch(
            "INSERT INTO companies (id, legal_name, tax_id, address, postal_code, municipality, province, created_at)
             VALUES ('co', 'Empresa Demo SL', 'B00000000', 'C/ Uno 1', '28001', 'Madrid', 'Madrid', '2026-01-01T00:00:00Z'),
                    ('otra', 'Otra SL', 'B11111111', 'C/ Dos 2', '28001', 'Madrid', 'Madrid', '2026-01-01T00:00:00Z');
             INSERT INTO customers (id, display_name, tax_id, kind, address, postal_code, municipality, province, updated_at)
             VALUES ('cu', 'Cliente; Demo \"SA\"', 'A00000000', 'Company', 'C/ Tres 3', '28001', 'Madrid', 'Madrid', '2026-01-01T00:00:00Z');
             INSERT INTO invoices (id, company_id, customer_id, fiscal_year, series, number, kind, status,
                                   rectifies_invoice_id, rectification_reason_code, rectification_method,
                                   taxable_base_cents, tax_cents, withholding_cents, total_cents, created_at, issued_at)
             VALUES
              ('f1', 'co', 'cu', 2026, 'A', 1, 'Complete', 'Rectified', NULL, NULL, NULL, 10000, 2100, 0, 12100, 'x', '2026-04-02T10:00:00+02:00'),
              ('f2', 'co', 'cu', 2026, 'A', 2, 'Complete', 'Issued', NULL, NULL, NULL, 30000, 4100, 0, 34100, 'x', '2026-04-15T10:00:00+02:00'),
              ('f3', 'co', 'cu', 2026, 'R', 1, 'Rectifying', 'Issued', 'f1', 'R1', 'I', -1000, -210, 0, -1210, 'x', '2026-05-03T09:00:00+02:00'),
              ('f4', 'co', 'cu', 2026, 'A', 3, 'Complete', 'Issued', NULL, NULL, NULL, 50000, 10500, 7500, 53000, 'x', '2026-06-30T23:00:00+02:00'),
              ('anulada', 'co', 'cu', 2026, 'A', 4, 'Complete', 'Void', NULL, NULL, NULL, 100, 21, 0, 121, 'x', '2026-05-10T10:00:00+02:00'),
              ('borrador', 'co', 'cu', 2026, 'A', NULL, 'Complete', 'Draft', NULL, NULL, NULL, 100, 21, 0, 121, 'x', NULL),
              ('fuera', 'co', 'cu', 2026, 'A', 5, 'Complete', 'Issued', NULL, NULL, NULL, 100, 21, 0, 121, 'x', '2026-07-01T00:30:00+02:00'),
              ('ajena', 'otra', 'cu', 2026, 'A', 1, 'Complete', 'Issued', NULL, NULL, NULL, 100, 21, 0, 121, 'x', '2026-05-10T10:00:00+02:00');
             INSERT INTO invoice_lines (id, invoice_id, position, description, quantity, unit_price_cents,
                                        taxable_base_cents, tax_rate_basis_points, tax_cents,
                                        withholding_rate_basis_points, withholding_cents)
             VALUES
              ('l1', 'f1', 1, 'Servicio', 1, 10000, 10000, 2100, 2100, 0, 0),
              ('l2a', 'f2', 1, 'General', 1, 10000, 10000, 2100, 2100, 0, 0),
              ('l2b', 'f2', 2, 'Reducido', 1, 20000, 20000, 1000, 2000, 0, 0),
              ('l3', 'f3', 1, 'Abono', 1, -1000, -1000, 2100, -210, 0, 0),
              ('l4', 'f4', 1, 'Honorarios', 1, 50000, 50000, 2100, 10500, 1500, 7500),
              ('l5', 'anulada', 1, 'X', 1, 100, 100, 2100, 21, 0, 0),
              ('l6', 'fuera', 1, 'X', 1, 100, 100, 2100, 21, 0, 0),
              ('l7', 'ajena', 1, 'X', 1, 100, 100, 2100, 21, 0, 0);",
        )
        .expect("seed");
    }

    #[test]
    fn libro_expedidas_matches_reference_csv() {
        let conn = test_conn();
        seed(&conn);
        let (csv, resumen) =
            libro_expedidas_csv(&conn, "co", "2026-04-01", "2026-06-30", false).expect("libro");
        let expected = format!(
            "\u{feff}{HEADER}\
2026-04-02;;\"A\";\"A-1\";F1;\"Cliente; Demo \"\"SA\"\"\";\"A00000000\";100,00;21,00;21,00;;;0,00;0,00;121,00;;;;venta_nacional\n\
2026-04-15;;\"A\";\"A-2\";F1;\"Cliente; Demo \"\"SA\"\"\";\"A00000000\";100,00;21,00;21,00;;;0,00;0,00;121,00;;;;venta_nacional\n\
2026-04-15;;\"A\";\"A-2\";F1;\"Cliente; Demo \"\"SA\"\"\";\"A00000000\";200,00;10,00;20,00;;;0,00;0,00;220,00;;;;venta_nacional\n\
2026-05-03;;\"R\";\"R-1\";R1;\"Cliente; Demo \"\"SA\"\"\";\"A00000000\";-10,00;21,00;-2,10;;;0,00;0,00;-12,10;I;\"A-1\";2026-04-02;venta_nacional\n\
2026-06-30;;\"A\";\"A-3\";F1;\"Cliente; Demo \"\"SA\"\"\";\"A00000000\";500,00;21,00;105,00;;;15,00;75,00;530,00;;;;venta_nacional\n"
        );
        assert_eq!(csv, expected);
        assert_eq!((resumen.facturas, resumen.filas), (4, 5));
    }

    /// Decisión 15.1: con la opción, la anulada sale una vez a cero con `estado=ANULADA`; el resto
    /// son las filas de referencia más la columna `estado`, y los totales del periodo no cambian.
    #[test]
    fn include_void_lists_voided_invoice_at_zero() {
        let conn = test_conn();
        seed(&conn);
        let (base, _) =
            libro_expedidas_csv(&conn, "co", "2026-04-01", "2026-06-30", false).expect("libro");
        let (csv, resumen) =
            libro_expedidas_csv(&conn, "co", "2026-04-01", "2026-06-30", true).expect("libro");
        let lines: Vec<&str> = csv.lines().collect();
        assert!(lines[0].ends_with(";tipo_operacion;estado"));
        let voided: Vec<&&str> = lines.iter().filter(|l| l.contains("\"A-4\"")).collect();
        assert_eq!(
            voided,
            [&"2026-05-10;;\"A\";\"A-4\";F1;\"Cliente; Demo \"\"SA\"\"\";\"A00000000\";0,00;0,00;0,00;;;0,00;0,00;0,00;;;;venta_nacional;ANULADA"]
        );
        assert!(lines[1].ends_with(";RECTIFICADA") && lines[2].ends_with(";EMITIDA"));
        // Quitando la anulada y la columna `estado`, queda el CSV de referencia.
        let rest: Vec<&str> = lines[1..]
            .iter()
            .filter(|l| !l.ends_with(";ANULADA"))
            .map(|l| l.rsplit_once(';').expect("estado").0)
            .collect();
        assert_eq!(rest, base.lines().skip(1).collect::<Vec<_>>());
        assert_eq!(
            (resumen.facturas, resumen.filas, resumen.anuladas),
            (5, 6, 1)
        );
        assert_eq!(period_total(&csv), period_total(&base));
    }

    /// Suma de la columna `total` en céntimos; se cuenta desde `venta_nacional` hacia la izquierda
    /// porque los textos entrecomillados pueden llevar `;`.
    fn period_total(csv: &str) -> i64 {
        csv.lines()
            .skip(1)
            .map(|line| {
                let fixed = line.split_once(";venta_nacional").expect("fila").0;
                let total = fixed.rsplitn(5, ';').nth(3).expect("total");
                total.replace(',', "").parse::<i64>().expect("céntimos")
            })
            .sum()
    }

    #[test]
    fn substitution_rectificativa_subtracts_the_original() {
        let conn = test_conn();
        seed(&conn);
        conn.execute_batch(
            "INSERT INTO invoices (id, company_id, customer_id, fiscal_year, series, number, kind, status,
                                   rectifies_invoice_id, rectification_reason_code, rectification_method,
                                   taxable_base_cents, tax_cents, withholding_cents, total_cents, created_at, issued_at)
             VALUES ('s1', 'co', 'cu', 2026, 'R', 2, 'Rectifying', 'Issued', 'f4', 'R1', 'S', 40000, 8400, 6000, 42400, 'x', '2026-08-01T10:00:00+02:00');
             INSERT INTO invoice_lines (id, invoice_id, position, description, quantity, unit_price_cents,
                                        taxable_base_cents, tax_rate_basis_points, tax_cents,
                                        withholding_rate_basis_points, withholding_cents)
             VALUES ('ls1', 's1', 1, 'Honorarios', 1, 40000, 40000, 2100, 8400, 1500, 6000);",
        )
        .expect("seed S");
        let (csv, resumen) =
            libro_expedidas_csv(&conn, "co", "2026-08-01", "2026-08-31", false).expect("libro");
        let rows: Vec<&str> = csv.lines().skip(1).collect();
        assert_eq!(resumen.filas, 2);
        assert!(
            rows[0].contains(";-500,00;21,00;-105,00;;;15,00;-75,00;-530,00;S;\"A-3\";2026-06-30;")
        );
        assert!(rows[1].contains(";400,00;21,00;84,00;;;15,00;60,00;424,00;S;\"A-3\";2026-06-30;"));
    }

    #[test]
    fn rejects_bad_period() {
        let conn = test_conn();
        assert!(libro_expedidas_csv(&conn, "co", "2026-07-01", "2026-06-30", false).is_err());
        assert!(libro_expedidas_csv(&conn, "co", "30/06/2026", "2026-06-30", false).is_err());
    }
}
