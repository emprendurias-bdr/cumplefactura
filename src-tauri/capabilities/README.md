# `capabilities/` — ACL Tauri (editable)

Fuente de permisos IPC. Hoy: [`default.json`](default.json) — ventana `main`, `core:default`, `dialog:allow-open|save`.

`$schema` apunta a `../gen/schemas/desktop-schema.json` (generado).

Tras cambiar permisos, regenera schemas con `tauri build` / `tauri dev`. No editar `gen/schemas` a mano.
