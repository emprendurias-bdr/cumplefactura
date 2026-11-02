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
