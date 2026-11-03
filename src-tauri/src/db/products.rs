//! Catálogo de productos y servicios por empresa.

use super::*;

pub fn upsert_product(conn: &Connection, product: &Product) -> Result<(), String> {
    require_company(conn, &product.company_id)?;
    conn.execute(
        "INSERT INTO products (
           id, company_id, sku, name, description, kind, unit_price_cents,
           tax_rate_basis_points, withholding_rate_basis_points, discount_rate_basis_points,
           active, updated_at
         )
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
         ON CONFLICT(id) DO UPDATE SET
           sku = excluded.sku,
           name = excluded.name,
           description = excluded.description,
           kind = excluded.kind,
           unit_price_cents = excluded.unit_price_cents,
           tax_rate_basis_points = excluded.tax_rate_basis_points,
           withholding_rate_basis_points = excluded.withholding_rate_basis_points,
           discount_rate_basis_points = excluded.discount_rate_basis_points,
           active = excluded.active,
           updated_at = excluded.updated_at",
        params![
            product.id,
            product.company_id,
            product.sku,
            product.name,
            product.description,
            format!("{:?}", product.kind),
            product.unit_price_cents,
            product.tax_rate_basis_points,
            product.withholding_rate_basis_points,
            product.discount_rate_basis_points,
            if product.active { 1 } else { 0 },
            product.updated_at,
        ],
    )
    .map(|_| ())
    .map_err(db_error)
}

pub fn list_products(conn: &Connection, company_id: &str) -> Result<Vec<Product>, String> {
    require_company(conn, company_id)?;
    let mut stmt = conn
        .prepare(
            "SELECT id, company_id, sku, name, description, kind, unit_price_cents,
                    tax_rate_basis_points, withholding_rate_basis_points, discount_rate_basis_points,
                    active, updated_at
             FROM products
             WHERE company_id = ?1
             ORDER BY active DESC, updated_at DESC, name ASC",
        )
        .map_err(db_error)?;
    let rows = stmt
        .query_map(params![company_id], |row| {
            let kind: String = row.get(5)?;
            Ok(Product {
                id: row.get(0)?,
                company_id: row.get(1)?,
                sku: row.get(2)?,
                name: row.get(3)?,
                description: row.get(4)?,
                kind: match kind.as_str() {
                    "Product" => crate::domain::product::ProductKind::Product,
                    _ => crate::domain::product::ProductKind::Service,
                },
                unit_price_cents: row.get(6)?,
                tax_rate_basis_points: row.get(7)?,
                withholding_rate_basis_points: row.get(8)?,
                discount_rate_basis_points: row.get(9)?,
                active: row.get::<_, i64>(10)? == 1,
                updated_at: row.get(11)?,
            })
        })
        .map_err(db_error)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(db_error)
}
