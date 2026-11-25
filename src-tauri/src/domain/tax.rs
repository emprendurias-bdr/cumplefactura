//! Territory flags fiscales (CommonTerritory, VeriFactu, Sii, TicketBAI, Navarra).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TerritoryFlag {
    CommonTerritory,
    Sii,
    VeriFactu,
    TicketBaiBizkaia,
    TicketBaiAraba,
    TicketBaiGipuzkoa,
    NavarraHtn,
}

/// Calificación de la operación de una línea: listas L9 (S1, S2, N1, N2) y L10 (E1–E6) del
/// anexo de la Orden HAC/1177/2024 («Diseño de registro», hoja «Listas»). Por defecto S1: las
/// facturas normales no cambian. IGIC, IPSI y las claves de régimen especiales no existen aquí.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(try_from = "String")]
pub enum VatTreatment {
    /// Sujeta y no exenta.
    #[default]
    S1,
    /// Sujeta y no exenta con inversión del sujeto pasivo (Ley 37/1992 art. 84.Uno.2º).
    S2,
    /// Exenta por el art. 20 de la Ley 37/1992.
    E1,
    /// Exenta por el art. 21 (exportaciones).
    E2,
    /// Exenta por el art. 22.
    E3,
    /// Exenta por los arts. 23 y 24.
    E4,
    /// Exenta por el art. 25 (entregas intracomunitarias).
    E5,
    /// Exenta por otros.
    E6,
    /// No sujeta por los arts. 7, 14 u otros.
    N1,
    /// No sujeta por reglas de localización.
    N2,
}

/// IGIC, IPSI, E7/E8 u otra clave que llegue de la interfaz: `vat_treatment_unsupported:<código>`.
impl TryFrom<String> for VatTreatment {
    type Error = String;
    fn try_from(code: String) -> Result<Self, String> {
        Self::parse(&code)
    }
}

impl VatTreatment {
    pub fn code(self) -> &'static str {
        match self {
            Self::S1 => "S1",
            Self::S2 => "S2",
            Self::E1 => "E1",
            Self::E2 => "E2",
            Self::E3 => "E3",
            Self::E4 => "E4",
            Self::E5 => "E5",
            Self::E6 => "E6",
            Self::N1 => "N1",
            Self::N2 => "N2",
        }
    }

    /// Lo que guarda SQLite (`invoice_lines.vat_treatment`); desconocido = error, nunca S1.
    pub fn parse(code: &str) -> Result<Self, String> {
        Ok(match code {
            "S1" => Self::S1,
            "S2" => Self::S2,
            "E1" => Self::E1,
            "E2" => Self::E2,
            "E3" => Self::E3,
            "E4" => Self::E4,
            "E5" => Self::E5,
            "E6" => Self::E6,
            "N1" => Self::N1,
            "N2" => Self::N2,
            other => return Err(format!("vat_treatment_unsupported:{other}")),
        })
    }

    pub fn is_s1(&self) -> bool {
        *self == Self::S1
    }

    /// E1–E6 van en `OperacionExenta`; el resto en `CalificacionOperacion` (choice del XSD).
    pub fn is_exempt(self) -> bool {
        matches!(
            self,
            Self::E1 | Self::E2 | Self::E3 | Self::E4 | Self::E5 | Self::E6
        )
    }
}

/// Tipos de IVA vigentes desde una fecha, con los recargos de equivalencia que admite cada uno.
struct VatRatePeriod {
    from: (i32, u32, u32),
    /// (tipo de IVA, recargos admitidos) en puntos básicos.
    rates: &'static [(i32, &'static [i32])],
}

/// Lista única de tipos por fecha de devengo (Ley 37/1992 art. 90.Dos).
/// - 21 %: art. 90.Uno. 10 %: art. 91.Uno. 4 %: art. 91.Dos. 0 %: art. 91.Cuatro (donativos a
///   entidades sin fines lucrativos).
/// - Recargo (art. 161): 5,2 % con el 21 %; 1,75 % tabaco (con el 21 %); 1,4 % con el 10 %;
///   0,5 % con el 4 %. El 0 % no tiene recargo.
///
/// Desde 01/01/2025, al terminar los tipos temporales de alimentos y energía. Texto consolidado
/// del BOE con última modificación de 28/02/2026.
/// shortcut: no hay tabla anterior a 2025; si hiciera falta rectificar operaciones de 2024 con
/// tipos temporales (0 %, 2 %, 5 %, 7,5 %), añadir aquí ese periodo con su norma.
const VAT_RATE_PERIODS: &[VatRatePeriod] = &[VatRatePeriod {
    from: (2025, 1, 1),
    rates: &[
        (2_100, &[520, 175]),
        (1_000, &[140]),
        (400, &[50]),
        (0, &[]),
    ],
}];

/// Comprueba tipo y recargo de una línea frente a la tabla vigente en `date` y a su calificación.
pub fn check_vat_rate(
    date: chrono::NaiveDate,
    treatment: VatTreatment,
    tax_rate_basis_points: i32,
    surcharge_rate_basis_points: i32,
) -> Result<(), String> {
    if treatment != VatTreatment::S1 {
        // S2: cuota a cargo del destinatario; exentas y no sujetas: sin cuota ni recargo.
        if tax_rate_basis_points != 0 || surcharge_rate_basis_points != 0 {
            return Err(format!("vat_rate_not_allowed_for:{}", treatment.code()));
        }
        return Ok(());
    }
    let period = VAT_RATE_PERIODS
        .iter()
        .rev()
        .find(|period| {
            let (y, m, d) = period.from;
            chrono::NaiveDate::from_ymd_opt(y, m, d).is_some_and(|from| date >= from)
        })
        .ok_or_else(|| format!("vat_rate_table_missing:{date}"))?;
    let (_, surcharges) = period
        .rates
        .iter()
        .find(|(rate, _)| *rate == tax_rate_basis_points)
        .ok_or_else(|| format!("vat_rate_unknown:{tax_rate_basis_points}"))?;
    if surcharge_rate_basis_points != 0 && !surcharges.contains(&surcharge_rate_basis_points) {
        return Err(format!(
            "surcharge_rate_unknown:{surcharge_rate_basis_points}:{tax_rate_basis_points}"
        ));
    }
    Ok(())
}

/// `n / d` redondeado al céntimo más próximo; la mitad se aleja de cero (-0,5 → -1).
pub fn round_div(n: i64, d: i64) -> i64 {
    let q = n / d;
    let r = n % d;
    if 2 * r.abs() >= d {
        q + n.signum()
    } else {
        q
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;

    fn day() -> NaiveDate {
        NaiveDate::from_ymd_opt(2026, 11, 26).unwrap()
    }

    #[test]
    fn rate_table_accepts_current_rates_and_surcharges() {
        for (rate, surcharge) in [
            (2_100, 0),
            (2_100, 520),
            (2_100, 175),
            (1_000, 140),
            (400, 50),
            (0, 0),
        ] {
            check_vat_rate(day(), VatTreatment::S1, rate, surcharge).expect("vigente");
        }
    }

    #[test]
    fn rate_table_rejects_unknown_rates_and_mismatched_surcharge() {
        assert_eq!(
            check_vat_rate(day(), VatTreatment::S1, 1_600, 0).unwrap_err(),
            "vat_rate_unknown:1600"
        );
        assert!(check_vat_rate(day(), VatTreatment::S1, 1_000, 520)
            .unwrap_err()
            .starts_with("surcharge_rate_unknown"));
        assert!(check_vat_rate(day(), VatTreatment::S1, 0, 50).is_err());
        let old = NaiveDate::from_ymd_opt(2024, 6, 1).unwrap();
        assert!(check_vat_rate(old, VatTreatment::S1, 2_100, 0)
            .unwrap_err()
            .starts_with("vat_rate_table_missing"));
    }

    #[test]
    fn non_s1_lines_carry_no_rate() {
        check_vat_rate(day(), VatTreatment::E5, 0, 0).expect("exenta sin tipo");
        check_vat_rate(day(), VatTreatment::S2, 0, 0).expect("inversión sin cuota");
        assert_eq!(
            check_vat_rate(day(), VatTreatment::N2, 2_100, 0).unwrap_err(),
            "vat_rate_not_allowed_for:N2"
        );
        assert!(VatTreatment::parse("E7").is_err());
        let err = serde_json::from_str::<VatTreatment>("\"E8\"").unwrap_err();
        assert!(err.to_string().contains("vat_treatment_unsupported:E8"));
        assert_eq!(serde_json::to_string(&VatTreatment::E5).unwrap(), "\"E5\"");
    }

    #[test]
    fn round_div_rounds_half_away_from_zero() {
        assert_eq!(round_div(250, 100), 3);
        assert_eq!(round_div(249, 100), 2);
        assert_eq!(round_div(-250, 100), -3);
        assert_eq!(round_div(-249, 100), -2);
        assert_eq!(round_div(0, 100), 0);
    }
}
