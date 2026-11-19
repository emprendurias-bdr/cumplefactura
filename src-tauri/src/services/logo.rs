//! Logo de empresa para el PDF: lee JPEG y PNG sin librerías y los deja listos como XObject.
//!
//! JPEG va tal cual (`DCTDecode`, tamaño del marcador SOF). PNG de 8 bits en gris o RGB va con
//! sus IDAT concatenados (`FlateDecode` + predictores PNG). PNG con transparencia o paleta,
//! JPEG CMYK y cualquier otro formato → `logo_format_not_supported:<motivo>`: nunca se
//! reescala ni se recodifica la imagen (no hay crates de imagen).

/// Tamaño máximo del fichero de logo.
pub const MAX_LOGO_BYTES: usize = 1024 * 1024;

#[derive(Debug, Clone)]
pub struct LogoImage {
    pub width: u32,
    pub height: u32,
    pub color_space: &'static str,
    pub filter: &'static str,
    /// `/DecodeParms` para PNG; `None` en JPEG.
    pub decode_parms: Option<String>,
    pub data: Vec<u8>,
    /// `jpg` o `png`: extensión de la copia en `<app data>/logos`.
    pub extension: &'static str,
}

fn unsupported(reason: &str) -> String {
    format!("logo_format_not_supported:{reason}. Usa un JPEG o un PNG sin transparencia (RGB o gris, 8 bits)")
}

/// Valida y decodifica la cabecera del logo (no la imagen entera).
pub fn parse_logo(bytes: &[u8]) -> Result<LogoImage, String> {
    if bytes.len() > MAX_LOGO_BYTES {
        return Err("logo_too_large:1MB".to_string());
    }
    if bytes.starts_with(&[0xFF, 0xD8]) {
        parse_jpeg(bytes)
    } else if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        parse_png(bytes)
    } else {
        Err(unsupported("formato desconocido"))
    }
}

fn be16(bytes: &[u8], at: usize) -> Option<u32> {
    Some(u32::from(*bytes.get(at)?) << 8 | u32::from(*bytes.get(at + 1)?))
}

fn be32(bytes: &[u8], at: usize) -> Option<u32> {
    Some(be16(bytes, at)? << 16 | be16(bytes, at + 2)?)
}

fn parse_jpeg(bytes: &[u8]) -> Result<LogoImage, String> {
    let mut at = 2;
    while at + 4 <= bytes.len() {
        if bytes[at] != 0xFF {
            return Err(unsupported("JPEG dañado"));
        }
        let marker = bytes[at + 1];
        // Marcadores sin longitud (relleno, RSTn, TEM).
        if marker == 0xFF || marker == 0x01 || (0xD0..=0xD7).contains(&marker) {
            at += if marker == 0xFF { 1 } else { 2 };
            continue;
        }
        let length = be16(bytes, at + 2).ok_or_else(|| unsupported("JPEG dañado"))? as usize;
        // SOF0..SOF15 salvo DHT (C4), JPG (C8) y DAC (CC).
        if (0xC0..=0xCF).contains(&marker) && !matches!(marker, 0xC4 | 0xC8 | 0xCC) {
            let height = be16(bytes, at + 5).ok_or_else(|| unsupported("JPEG dañado"))?;
            let width = be16(bytes, at + 7).ok_or_else(|| unsupported("JPEG dañado"))?;
            let color_space = match bytes.get(at + 9) {
                Some(1) => "DeviceGray",
                Some(3) => "DeviceRGB",
                _ => return Err(unsupported("JPEG CMYK o con componentes raros")),
            };
            if width == 0 || height == 0 {
                return Err(unsupported("JPEG sin tamaño"));
            }
            return Ok(LogoImage {
                width,
                height,
                color_space,
                filter: "DCTDecode",
                decode_parms: None,
                data: bytes.to_vec(),
                extension: "jpg",
            });
        }
        at += 2 + length;
    }
    Err(unsupported("JPEG sin cabecera SOF"))
}

fn parse_png(bytes: &[u8]) -> Result<LogoImage, String> {
    let mut at = 8;
    let mut header = None;
    let mut data = Vec::new();
    while at + 8 <= bytes.len() {
        let length = be32(bytes, at).ok_or_else(|| unsupported("PNG dañado"))? as usize;
        let kind = &bytes[at + 4..at + 8];
        let body = bytes
            .get(at + 8..at + 8 + length)
            .ok_or_else(|| unsupported("PNG dañado"))?;
        match kind {
            b"IHDR" if body.len() >= 13 => header = Some(body.to_vec()),
            b"tRNS" => return Err(unsupported("PNG con transparencia")),
            b"IDAT" => data.extend_from_slice(body),
            b"IEND" => break,
            _ => {}
        }
        at += 12 + length;
    }
    let header = header.ok_or_else(|| unsupported("PNG sin IHDR"))?;
    let (width, height) = (be32(&header, 0).unwrap_or(0), be32(&header, 4).unwrap_or(0));
    let (bit_depth, color_type, interlace) = (header[8], header[9], header[12]);
    let colors = match color_type {
        0 => 1,
        2 => 3,
        3 => return Err(unsupported("PNG con paleta")),
        _ => return Err(unsupported("PNG con transparencia")),
    };
    if bit_depth != 8 || interlace != 0 || width == 0 || height == 0 || data.is_empty() {
        return Err(unsupported("PNG de 16 bits, entrelazado o vacío"));
    }
    Ok(LogoImage {
        width,
        height,
        color_space: if colors == 1 {
            "DeviceGray"
        } else {
            "DeviceRGB"
        },
        filter: "FlateDecode",
        decode_parms: Some(format!(
            "<< /Predictor 15 /Colors {colors} /BitsPerComponent 8 /Columns {width} >>"
        )),
        data,
        extension: "png",
    })
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    /// PNG RGB 8 bits válido con zlib «stored» (sin compresión), para tests y muestras.
    pub(crate) fn png(width: u32, height: u32, color_type: u8, pixel: &[u8]) -> Vec<u8> {
        // Cada fila: byte de filtro 0 (None) + píxeles.
        let row: Vec<u8> = std::iter::once(0)
            .chain(pixel.repeat(width as usize))
            .collect();
        let raw = row.repeat(height as usize);
        let mut zlib = vec![0x78, 0x01];
        for (index, chunk) in raw.chunks(65_535).enumerate() {
            let last = (index + 1) * 65_535 >= raw.len();
            zlib.push(last as u8);
            let len = chunk.len() as u16;
            zlib.extend_from_slice(&len.to_le_bytes());
            zlib.extend_from_slice(&(!len).to_le_bytes());
            zlib.extend_from_slice(chunk);
        }
        let (mut a, mut b) = (1u32, 0u32);
        for byte in &raw {
            a = (a + u32::from(*byte)) % 65_521;
            b = (b + a) % 65_521;
        }
        zlib.extend_from_slice(&(b << 16 | a).to_be_bytes());
        let mut ihdr = Vec::new();
        ihdr.extend_from_slice(&width.to_be_bytes());
        ihdr.extend_from_slice(&height.to_be_bytes());
        ihdr.extend_from_slice(&[8, color_type, 0, 0, 0]);
        let mut out = b"\x89PNG\r\n\x1a\n".to_vec();
        for (kind, body) in [(&b"IHDR"[..], ihdr), (b"IDAT", zlib), (b"IEND", Vec::new())] {
            out.extend_from_slice(&(body.len() as u32).to_be_bytes());
            out.extend_from_slice(kind);
            out.extend_from_slice(&body);
            out.extend_from_slice(&crc32(&[kind, &body].concat()).to_be_bytes());
        }
        out
    }

    fn crc32(bytes: &[u8]) -> u32 {
        let mut crc = 0xFFFF_FFFFu32;
        for byte in bytes {
            crc ^= u32::from(*byte);
            for _ in 0..8 {
                crc = if crc & 1 == 1 {
                    0xEDB8_8320 ^ (crc >> 1)
                } else {
                    crc >> 1
                };
            }
        }
        !crc
    }

    /// Cabecera JPEG mínima con SOF0 (no decodificable, suficiente para leer el tamaño).
    pub(crate) fn jpeg_header(width: u16, height: u16, components: u8) -> Vec<u8> {
        let mut out = vec![
            0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x04, 0x00, 0x00, 0xFF, 0xC0, 0x00, 0x0B, 8,
        ];
        out.extend_from_slice(&height.to_be_bytes());
        out.extend_from_slice(&width.to_be_bytes());
        out.extend_from_slice(&[components, 1, 0x11, 0, 0xFF, 0xD9]);
        out
    }

    #[test]
    fn reads_jpeg_size_and_png_without_alpha() {
        let jpeg = parse_logo(&jpeg_header(320, 120, 3)).expect("jpeg");
        assert_eq!(
            (jpeg.width, jpeg.height, jpeg.filter),
            (320, 120, "DCTDecode")
        );
        assert_eq!(jpeg.color_space, "DeviceRGB");

        let png = parse_logo(&png(4, 2, 2, &[10, 20, 30])).expect("png");
        assert_eq!((png.width, png.height, png.filter), (4, 2, "FlateDecode"));
        assert_eq!(
            png.decode_parms.as_deref(),
            Some("<< /Predictor 15 /Colors 3 /BitsPerComponent 8 /Columns 4 >>")
        );
    }

    #[test]
    fn rejects_alpha_palette_cmyk_unknown_and_large_files() {
        for bytes in [
            png(2, 2, 6, &[0, 0, 0, 255]),
            png(2, 2, 3, &[0]),
            jpeg_header(10, 10, 4),
            b"GIF89a".to_vec(),
        ] {
            let err = parse_logo(&bytes).expect_err("unsupported");
            assert!(err.starts_with("logo_format_not_supported:"), "{err}");
        }
        let big = vec![0u8; MAX_LOGO_BYTES + 1];
        assert_eq!(parse_logo(&big).expect_err("big"), "logo_too_large:1MB");
    }
}
