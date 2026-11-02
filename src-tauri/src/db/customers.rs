//! Clientes y terceros.

use super::*;

pub fn upsert_customer(conn: &Connection, customer: &Customer) -> Result<(), String> {
    conn.execute(
        "INSERT INTO customers (id, display_name, tax_id, kind, address, postal_code, municipality, province, country_code, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
         ON CONFLICT(id) DO UPDATE SET
           display_name = excluded.display_name,
           tax_id = excluded.tax_id,
           kind = excluded.kind,
           address = excluded.address,
           postal_code = excluded.postal_code,
           municipality = excluded.municipality,
           province = excluded.province,
           country_code = excluded.country_code,
           updated_at = excluded.updated_at",
        params![
            customer.id,
            customer.display_name,
            customer.tax_id,
            format!("{:?}", customer.kind),
            customer.address,
            customer.postal_code,
            customer.municipality,
            customer.province,
            customer.country_code,
            customer.updated_at,
        ],
    )
    .map(|_| ())
    .map_err(db_error)
}

#[derive(Debug, Clone, Serialize)]
pub struct CustomerSummary {
    pub id: String,
    pub display_name: String,
    pub tax_id: String,
    pub kind: String,
    pub address: String,
    pub postal_code: String,
    pub municipality: String,
    pub province: String,
    pub country_code: String,
    pub updated_at: String,
}

pub fn list_customers(conn: &Connection) -> Result<Vec<CustomerSummary>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, display_name, tax_id, kind, address, postal_code, municipality, province, country_code, updated_at
             FROM customers ORDER BY updated_at DESC",
        )
        .map_err(db_error)?;
    let rows = stmt
        .query_map([], |row| {
            Ok(CustomerSummary {
                id: row.get(0)?,
                display_name: row.get(1)?,
                tax_id: row.get(2)?,
                kind: row.get(3)?,
                address: row.get(4)?,
                postal_code: row.get(5)?,
                municipality: row.get(6)?,
                province: row.get(7)?,
                country_code: row.get(8)?,
                updated_at: row.get(9)?,
            })
        })
        .map_err(db_error)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(db_error)
}
