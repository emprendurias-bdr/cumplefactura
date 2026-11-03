//! Empresas emisoras y configuración de series de facturación.

use super::*;

pub fn insert_company(conn: &Connection, company: &Company) -> Result<(), String> {
    conn.execute(
        "INSERT INTO companies (id, legal_name, tax_id, address, postal_code, municipality, province, country_code, default_series, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            company.id,
            company.legal_name,
            company.tax_id,
            company.address,
            company.postal_code,
            company.municipality,
            company.province,
            company.country_code,
            company.default_series,
            company.created_at,
        ],
    )
    .map(|_| ())
    .map_err(db_error)
}

pub fn update_company(conn: &Connection, input: &CompanyUpdateInput) -> Result<Company, String> {
    input.validate()?;
    let default_series = input.normalized_default_series();
    let created_at: String = conn
        .query_row(
            "SELECT created_at FROM companies WHERE id = ?1",
            params![input.id],
            |row| row.get(0),
        )
        .optional()
        .map_err(db_error)?
        .ok_or_else(|| format!("company not found: {}", input.id))?;

    conn.execute(
        "UPDATE companies
         SET legal_name = ?2, tax_id = ?3, address = ?4, postal_code = ?5,
             municipality = ?6, province = ?7, country_code = ?8, default_series = ?9
         WHERE id = ?1",
        params![
            input.id,
            input.legal_name,
            input.tax_id,
            input.address,
            input.postal_code,
            input.municipality,
            input.province,
            input.country_code,
            default_series,
        ],
    )
    .map_err(db_error)?;

    Ok(Company {
        id: input.id.clone(),
        legal_name: input.legal_name.clone(),
        tax_id: input.tax_id.clone(),
        address: input.address.clone(),
        postal_code: input.postal_code.clone(),
        municipality: input.municipality.clone(),
        province: input.province.clone(),
        country_code: input.country_code.clone(),
        default_series,
        created_at,
    })
}

pub fn upsert_invoice_series_config(
    conn: &mut Connection,
    input: InvoiceSeriesConfigInput,
) -> Result<InvoiceSeriesConfig, String> {
    input.validate()?;
    require_company(conn, &input.company_id)?;

    let series_code = input.normalized_series_code();
    let separator = input.normalized_separator();
    let label = input.normalized_label();
    let resolved_series = input.resolved_series();
    let max_existing =
        max_invoice_number(conn, &input.company_id, input.fiscal_year, &resolved_series)?;
    if input.next_number <= max_existing {
        return Err(format!(
            "next_number must be greater than existing max invoice number {max_existing}"
        ));
    }

    let existing_id: Option<String> = conn
        .query_row(
            "SELECT id FROM invoice_series_configs
             WHERE company_id = ?1 AND fiscal_year = ?2 AND series_code = ?3",
            params![input.company_id, input.fiscal_year, series_code],
            |row| row.get(0),
        )
        .optional()
        .map_err(db_error)?;
    let id = existing_id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let created_at = chrono::Utc::now().to_rfc3339();
    let tx = conn.transaction().map_err(db_error)?;

    if input.is_default {
        tx.execute(
            "UPDATE invoice_series_configs SET is_default = 0
             WHERE company_id = ?1 AND fiscal_year = ?2",
            params![input.company_id, input.fiscal_year],
        )
        .map_err(db_error)?;
        tx.execute(
            "UPDATE companies SET default_series = ?2 WHERE id = ?1",
            params![input.company_id, resolved_series],
        )
        .map_err(db_error)?;
    }

    tx.execute(
        "INSERT INTO invoice_series_configs
         (id, company_id, label, series_code, fiscal_year, include_year, separator, padding, next_number, is_default, active, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 1, ?11)
         ON CONFLICT(company_id, fiscal_year, series_code) DO UPDATE SET
           label = excluded.label,
           include_year = excluded.include_year,
           separator = excluded.separator,
           padding = excluded.padding,
           next_number = excluded.next_number,
           is_default = excluded.is_default,
           active = 1",
        params![
            id,
            input.company_id,
            label,
            series_code,
            input.fiscal_year,
            if input.include_year { 1 } else { 0 },
            separator,
            input.padding,
            input.next_number,
            if input.is_default { 1 } else { 0 },
            created_at,
        ],
    )
    .map_err(db_error)?;

    tx.execute(
        "INSERT INTO invoice_sequences (company_id, fiscal_year, series, next_number)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(company_id, fiscal_year, series) DO UPDATE SET next_number = excluded.next_number",
        params![
            input.company_id,
            input.fiscal_year,
            resolved_series,
            input.next_number,
        ],
    )
    .map_err(db_error)?;
    tx.commit().map_err(db_error)?;

    let configs = list_invoice_series_configs(conn, &input.company_id, input.fiscal_year)?;
    configs
        .into_iter()
        .find(|config| config.series_code == series_code)
        .ok_or_else(|| "invoice series config not found after save".to_string())
}

pub fn list_invoice_series_configs(
    conn: &Connection,
    company_id: &str,
    fiscal_year: i32,
) -> Result<Vec<InvoiceSeriesConfig>, String> {
    require_company(conn, company_id)?;
    let mut stmt = conn
        .prepare(
            "SELECT cfg.id, cfg.company_id, cfg.label, cfg.series_code, cfg.fiscal_year,
                    cfg.include_year, cfg.separator, cfg.padding,
                    COALESCE(seq.next_number, cfg.next_number) AS next_number,
                    cfg.is_default, cfg.active, cfg.created_at
             FROM invoice_series_configs cfg
             LEFT JOIN invoice_sequences seq
               ON seq.company_id = cfg.company_id
              AND seq.fiscal_year = cfg.fiscal_year
              AND seq.series = CASE
                WHEN cfg.include_year = 1 THEN cfg.series_code || cfg.fiscal_year
                ELSE cfg.series_code
              END
             WHERE cfg.company_id = ?1 AND cfg.fiscal_year = ?2 AND cfg.active = 1
             ORDER BY cfg.is_default DESC, cfg.series_code ASC",
        )
        .map_err(db_error)?;
    let rows = stmt
        .query_map(params![company_id, fiscal_year], |row| {
            let series_code: String = row.get(3)?;
            let fiscal_year: i32 = row.get(4)?;
            let include_year = row.get::<_, i64>(5)? == 1;
            let separator: String = row.get(6)?;
            let padding: i32 = row.get(7)?;
            let next_number: i64 = row.get(8)?;
            let resolved_series =
                crate::domain::company::resolve_series(&series_code, fiscal_year, include_year);
            Ok(InvoiceSeriesConfig {
                id: row.get(0)?,
                company_id: row.get(1)?,
                label: row.get(2)?,
                series_code,
                fiscal_year,
                include_year,
                separator: separator.clone(),
                padding,
                next_number,
                is_default: row.get::<_, i64>(9)? == 1,
                active: row.get::<_, i64>(10)? == 1,
                preview: format_invoice_number(&resolved_series, &separator, padding, next_number),
                resolved_series,
                created_at: row.get(11)?,
            })
        })
        .map_err(db_error)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(db_error)
}

pub fn company_tax_id(conn: &Connection, company_id: &str) -> Result<String, String> {
    conn.query_row(
        "SELECT tax_id FROM companies WHERE id = ?1",
        params![company_id],
        |row| row.get(0),
    )
    .optional()
    .map_err(db_error)?
    .ok_or_else(|| format!("company not found: {company_id}"))
}

pub(super) fn require_company(conn: &Connection, company_id: &str) -> Result<(), String> {
    conn.query_row(
        "SELECT 1 FROM companies WHERE id = ?1",
        params![company_id],
        |_| Ok(()),
    )
    .optional()
    .map_err(db_error)?
    .ok_or_else(|| format!("company not found: {company_id}"))
}

#[derive(Debug, Clone, Serialize)]
pub struct CompanySummary {
    pub id: String,
    pub legal_name: String,
    pub tax_id: String,
    pub address: String,
    pub postal_code: String,
    pub municipality: String,
    pub province: String,
    pub country_code: String,
    pub default_series: String,
    pub created_at: String,
}

pub fn list_companies(conn: &Connection) -> Result<Vec<CompanySummary>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, legal_name, tax_id, address, postal_code, municipality, province, country_code, default_series, created_at
             FROM companies ORDER BY created_at DESC",
        )
        .map_err(db_error)?;
    let rows = stmt
        .query_map([], |row| {
            Ok(CompanySummary {
                id: row.get(0)?,
                legal_name: row.get(1)?,
                tax_id: row.get(2)?,
                address: row.get(3)?,
                postal_code: row.get(4)?,
                municipality: row.get(5)?,
                province: row.get(6)?,
                country_code: row.get(7)?,
                default_series: row.get(8)?,
                created_at: row.get(9)?,
            })
        })
        .map_err(db_error)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(db_error)
}
