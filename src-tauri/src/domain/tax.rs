//! Régimen fiscal y territory flags (CommonTerritory, VeriFactu, Sii…).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
pub enum TaxRegime {
    General,
    Exempt,
    ReverseCharge,
    RecargoEquivalencia,
    CanariasIgic,
    Foral,
}

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
