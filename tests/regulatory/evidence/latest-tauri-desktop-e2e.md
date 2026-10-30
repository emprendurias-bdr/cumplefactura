# CumpleFactura Tauri desktop E2E

- Generated: 2026-06-28T19:23:08.962Z
- Status: passed
- Mode: real
- Release exe: `C:\07 DESARROLLO\apps\CumpleFactura\src-tauri\target\release\cumplefactura.exe`

## Checks

- release_exe_exists: true
- tauri_driver_available: true
- webdriver_available: true
- webdriver_session_created: true
- ui_text_detected: true
- real_rust_commands_executed: true
- verifactu_xml_exported: true
- submission_prepared: true

## Limits

- Real mode launches the release executable via tauri-driver and Microsoft Edge WebDriver.
- It executes local UI events that call real Rust/Tauri commands for company, customer, draft, issue, VERI*FACTU XML export and local signature/submission preparation.
- It performs no AEAT call and uses no secrets.
