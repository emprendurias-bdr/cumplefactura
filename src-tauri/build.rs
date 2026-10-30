//! Build script: genera contexto Tauri (`tauri_build`) antes de compilar el crate.

fn main() {
    tauri_build::build();
}
