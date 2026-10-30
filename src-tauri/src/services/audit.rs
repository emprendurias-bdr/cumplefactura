//! Trail de auditoría local: eventos encadenados por hash (no es certificación AEAT).
//!
//! Cada evento guarda `payload_hash` + `previous_hash` opcional; `chain_hash()` fija el eslabón
//! para detectar manipulación en el historial de emisión/anulación.

use chrono::Utc;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;

/// Evento inmutable de auditoría (factura emitida/anulada, actor, hashes).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditEvent {
    pub id: String,
    pub entity_type: String,
    pub entity_id: String,
    pub action: String,
    pub actor: String,
    pub occurred_at: String,
    pub payload_hash: String,
    pub previous_hash: Option<String>,
}

/// Secuencia ordenada de eventos (consulta de cabeza de cadena).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct AuditTrail {
    pub events: Vec<AuditEvent>,
}

impl AuditEvent {
    /// Alta de evento `invoice_issued` con UUID y timestamp UTC.
    pub fn invoice_issued(
        entity_id: String,
        actor: String,
        payload_hash: String,
        previous_hash: Option<String>,
    ) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            entity_type: "invoice".to_string(),
            entity_id,
            action: "invoice_issued".to_string(),
            actor,
            occurred_at: Utc::now().to_rfc3339(),
            payload_hash,
            previous_hash,
        }
    }

    /// Alta de evento `invoice_voided` (misma forma de encadenado que issued).
    pub fn invoice_voided(
        entity_id: String,
        actor: String,
        payload_hash: String,
        previous_hash: Option<String>,
    ) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            entity_type: "invoice".to_string(),
            entity_id,
            action: "invoice_voided".to_string(),
            actor,
            occurred_at: Utc::now().to_rfc3339(),
            payload_hash,
            previous_hash,
        }
    }

    /// SHA-256 del contenido del evento + previous_hash (eslabón de la trail).
    pub fn chain_hash(&self) -> String {
        let mut hasher = Sha256::new();
        hasher.update(self.entity_type.as_bytes());
        hasher.update(self.entity_id.as_bytes());
        hasher.update(self.action.as_bytes());
        hasher.update(self.actor.as_bytes());
        hasher.update(self.occurred_at.as_bytes());
        hasher.update(self.payload_hash.as_bytes());
        if let Some(previous_hash) = &self.previous_hash {
            hasher.update(previous_hash.as_bytes());
        }
        hex::encode(hasher.finalize())
    }
}

impl AuditTrail {
    /// Hash del último evento de la trail, si hay alguno.
    #[allow(dead_code)]
    pub fn latest_hash(&self) -> Option<String> {
        self.events.last().map(AuditEvent::chain_hash)
    }
}
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chain_hash_changes_when_previous_hash_changes() {
        let first = AuditEvent::invoice_issued(
            "invoice-1".to_string(),
            "tester".to_string(),
            "payload-hash".to_string(),
            None,
        );
        let second = AuditEvent::invoice_issued(
            "invoice-1".to_string(),
            "tester".to_string(),
            "payload-hash".to_string(),
            Some("previous".to_string()),
        );

        assert_ne!(first.chain_hash(), second.chain_hash());
    }
}
