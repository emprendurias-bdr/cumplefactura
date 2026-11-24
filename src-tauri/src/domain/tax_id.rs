//! NIF español (DNI, NIE y CIF de entidades) con su carácter de control.
//!
//! Formato y control: Orden EHA/451/2008 (composición del NIF de personas jurídicas y
//! entidades) y RD 1065/2007 arts. 18-21. Los NIF de personas físicas que empiezan por
//! K, L o M se rechazan hasta confirmar su cálculo (pregunta abierta para Ricardo).

const DNI_LETTERS: &[u8; 23] = b"TRWAGMYFPDXBNJZSQVHLCKE";
const CIF_LETTERS: &[u8; 10] = b"JABCDEFGHI";

/// `Ok` si `value` es un NIF español válido (mayúsculas, sin espacios ni guiones).
/// Error estable `invalid_tax_id:<valor>` para la interfaz.
pub fn validate_spanish_tax_id(value: &str) -> Result<(), String> {
    if is_valid_spanish_tax_id(value) {
        Ok(())
    } else {
        Err(format!("invalid_tax_id:{value}"))
    }
}

fn is_valid_spanish_tax_id(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 9 || !bytes.iter().all(u8::is_ascii_alphanumeric) {
        return false;
    }
    let all_digits = |range: std::ops::Range<usize>| bytes[range].iter().all(u8::is_ascii_digit);
    // Solo se llama tras `all_digits`: el texto son cifras y cabe en u32.
    let digits = |range: std::ops::Range<usize>| value[range].parse::<u32>().ok();
    let last = bytes[8];
    match bytes[0] {
        // DNI: 8 cifras + letra.
        b'0'..=b'9' => {
            all_digits(0..8) && digits(0..8).is_some_and(|n| DNI_LETTERS[(n % 23) as usize] == last)
        }
        // NIE: X/Y/Z valen 0/1/2 delante de las 7 cifras.
        b'X' | b'Y' | b'Z' => {
            let prefix = (bytes[0] - b'X') as u32;
            all_digits(1..8)
                && digits(1..8)
                    .is_some_and(|n| DNI_LETTERS[((prefix * 10_000_000 + n) % 23) as usize] == last)
        }
        // Entidades: letra + 7 cifras + control (cifra o letra según la clase de entidad).
        b'A' | b'B' | b'C' | b'D' | b'E' | b'F' | b'G' | b'H' | b'J' | b'N' | b'P' | b'Q'
        | b'R' | b'S' | b'U' | b'V' | b'W' => {
            if !all_digits(1..8) {
                return false;
            }
            let control = cif_control(&bytes[1..8]);
            let as_digit = b'0' + control;
            let as_letter = CIF_LETTERS[control as usize];
            match bytes[0] {
                b'A' | b'B' | b'E' | b'H' => last == as_digit,
                b'N' | b'P' | b'Q' | b'R' | b'S' | b'W' => last == as_letter,
                _ => last == as_digit || last == as_letter,
            }
        }
        _ => false,
    }
}

/// Control del CIF: posiciones pares suman tal cual; impares se doblan y suman sus cifras.
fn cif_control(digits: &[u8]) -> u8 {
    let sum: u32 = digits
        .iter()
        .enumerate()
        .map(|(index, byte)| {
            let digit = (byte - b'0') as u32;
            if index % 2 == 0 {
                let doubled = digit * 2;
                doubled / 10 + doubled % 10
            } else {
                digit
            }
        })
        .sum();
    ((10 - sum % 10) % 10) as u8
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_valid_dni_nie_and_cif() {
        // DNI del ejemplo oficial de la huella (AEAT) y ficticios con control correcto.
        for valid in [
            "89890001K",
            "00000000T",
            "12345678Z", // DNI
            "X1234567L",
            "Y1234567X",
            "Z1234567R", // NIE
            "B98945173",
            "B00000000",
            "A58818501", // CIF con cifra
            "Q2826000H",
            "P0800000B",
            "S2800000H", // CIF con letra
            "G00000000",
            "G0000000J", // clase G admite cifra o letra
        ] {
            assert!(validate_spanish_tax_id(valid).is_ok(), "{valid}");
        }
    }

    #[test]
    fn rejects_bad_control_or_format() {
        for invalid in [
            "12345678A", // DNI con letra errónea
            "X1234567A", // NIE con letra errónea
            "B98945174", // CIF con cifra errónea
            "B9894517C", // A/B/E/H exigen cifra
            "Q2826000 ", // espacio
            "Q28260008", // P/Q/R/S/N/W exigen letra
            "12345678z", // minúscula
            "K1234567L", // K/L/M: pendiente de confirmar
            "I1234567A", // letra de entidad inexistente
            "1234567Z",  // corto
            "",
        ] {
            assert_eq!(
                validate_spanish_tax_id(invalid),
                Err(format!("invalid_tax_id:{invalid}")),
                "{invalid}"
            );
        }
    }
}
