//! Asistente técnico de rectificativas: mapea escenario → códigos XSD R1–R5 y método S/I.
//!
//! No decide la causa jurídica; parte del escenario declarado por el usuario y documenta
//! referencias al XSD VERI*FACTU. Confianza marcada como `technical-xsd-mapping`.

use crate::domain::invoice::{RectificationMethod, RectificationReasonCode};
use serde::{Deserialize, Serialize};

/// Escenarios de negocio alineados con claves R1–R5 del XSD.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum RectificationScenario {
    Article80OneTwoOrLegalError,
    Article80Three,
    Article80Four,
    Other,
    SimplifiedInvoice,
}

/// Entrada del asistente: escenario, preferencia de método y si sustituye la factura completa.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RectificationAdviceInput {
    pub scenario: RectificationScenario,
    pub method_preference: Option<RectificationMethod>,
    pub replaces_full_invoice: bool,
}

/// Consejo técnico (códigos, notas, warnings) para construir la rectificativa.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RectificationAdvice {
    pub reason_code: RectificationReasonCode,
    pub method: RectificationMethod,
    pub confidence: String,
    pub source_refs: Vec<String>,
    pub notes: Vec<String>,
    pub warnings: Vec<String>,
}

/// Traduce escenario → `reason_code` + método (S si sustituye completa, si no I).
pub fn advise(input: RectificationAdviceInput) -> RectificationAdvice {
    let (reason_code, scenario_note) = match input.scenario {
        RectificationScenario::Article80OneTwoOrLegalError => (
            RectificationReasonCode::R1,
            "R1: factura rectificativa por art. 80.1/80.2 o error fundado en derecho.",
        ),
        RectificationScenario::Article80Three => (
            RectificationReasonCode::R2,
            "R2: factura rectificativa por art. 80.3.",
        ),
        RectificationScenario::Article80Four => (
            RectificationReasonCode::R3,
            "R3: factura rectificativa por art. 80.4.",
        ),
        RectificationScenario::Other => (
            RectificationReasonCode::R4,
            "R4: factura rectificativa resto de supuestos.",
        ),
        RectificationScenario::SimplifiedInvoice => (
            RectificationReasonCode::R5,
            "R5: factura rectificativa en facturas simplificadas.",
        ),
    };

    let method = input.method_preference.unwrap_or_else(|| {
        if input.replaces_full_invoice {
            RectificationMethod::S
        } else {
            RectificationMethod::I
        }
    });
    let method_note = match &method {
        RectificationMethod::S => "Metodo S: sustitutiva; el XML incluye ImporteRectificacion.",
        RectificationMethod::I => "Metodo I: incremental; el XML expresa el ajuste.",
    };

    RectificationAdvice {
        reason_code,
        method,
        confidence: "technical-xsd-mapping".to_string(),
        source_refs: vec![
            "src-tauri/resources/xsd/verifactu/SuministroInformacion.xsd: ClaveTipoFacturaType R1-R5".to_string(),
            "src-tauri/resources/xsd/verifactu/SuministroInformacion.xsd: ClaveTipoRectificativaType S/I".to_string(),
            "C:\\03 LEGISLACION\\AEAT\\FACTURACION Y SIF\\05 DOCUMENTACION TECNICA AEAT\\01 VERIFACTU\\SuministroInformacion VERI-FACTU.xsd".to_string(),
        ],
        notes: vec![
            scenario_note.to_string(),
            method_note.to_string(),
        ],
        warnings: vec![
            "Asistente tecnico: parte del escenario declarado por el usuario; no decide la causa juridica.".to_string(),
            "Revisar factura origen, base imponible y supuesto fiscal antes de emitir.".to_string(),
        ],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_declared_article_80_scenarios_to_r_codes() {
        let cases = [
            (
                RectificationScenario::Article80OneTwoOrLegalError,
                RectificationReasonCode::R1,
            ),
            (
                RectificationScenario::Article80Three,
                RectificationReasonCode::R2,
            ),
            (
                RectificationScenario::Article80Four,
                RectificationReasonCode::R3,
            ),
            (RectificationScenario::Other, RectificationReasonCode::R4),
            (
                RectificationScenario::SimplifiedInvoice,
                RectificationReasonCode::R5,
            ),
        ];

        for (scenario, expected) in cases {
            let advice = advise(RectificationAdviceInput {
                scenario,
                method_preference: None,
                replaces_full_invoice: false,
            });

            assert_eq!(advice.reason_code, expected);
            assert_eq!(advice.method, RectificationMethod::I);
            assert!(advice
                .warnings
                .iter()
                .any(|warning| warning.contains("no decide la causa juridica")));
        }
    }

    #[test]
    fn chooses_substitutive_method_for_full_replacement() {
        let advice = advise(RectificationAdviceInput {
            scenario: RectificationScenario::Other,
            method_preference: None,
            replaces_full_invoice: true,
        });

        assert_eq!(advice.reason_code, RectificationReasonCode::R4);
        assert_eq!(advice.method, RectificationMethod::S);
        assert!(advice
            .notes
            .iter()
            .any(|note| note.contains("ImporteRectificacion")));
    }

    #[test]
    fn explicit_method_preference_wins_over_replacement_flag() {
        let advice = advise(RectificationAdviceInput {
            scenario: RectificationScenario::Article80Three,
            method_preference: Some(RectificationMethod::I),
            replaces_full_invoice: true,
        });

        assert_eq!(advice.reason_code, RectificationReasonCode::R2);
        assert_eq!(advice.method, RectificationMethod::I);
    }
}
