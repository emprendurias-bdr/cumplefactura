# Spec - VERI*FACTU XSD contract

## Sources
- C:\03 LEGISLACION\legislacion_icac_revision\AEAT\FACTURACION Y SIF\05 DOCUMENTACION TECNICA AEAT\01 VERIFACTU\SuministroLR VERI-FACTU.xsd
- C:\03 LEGISLACION\legislacion_icac_revision\AEAT\FACTURACION Y SIF\05 DOCUMENTACION TECNICA AEAT\01 VERIFACTU\SuministroInformacion VERI-FACTU.xsd
- W3C xmldsig-core-schema.xsd copied locally for ds:Signature import.

## Implemented
- Local schemas live in `src-tauri/resources/xsd/verifactu/`.
- `tools/validate-verifactu-xsd.ps1` validates XML against `SuministroLR.xsd` using .NET `System.Xml.Schema`.
- `tests/regulatory/fixtures/verifactu-registro-alta-basic.xml` is a minimal `RegistroAlta` F1 fixture.
- `npm run validate:verifactu:xsd` runs the contract check.
- `services::verifactu::tests::generated_xml_passes_local_xsd_contract` generates XML with the Rust service and validates it against the same local XSD contract on Windows.
- `verifactu_xml_draft_export` writes XML through `write_verifactu_xml_draft_validated`, so command-level export fails if local XSD validation fails.
- Tauri bundles `tools/validate-verifactu-xsd.ps1` and `src-tauri/resources/xsd/verifactu/`; runtime resolution prefers bundled resources and falls back to the dev tree.

## Must
- Keep schema imports local/offline.
- Validate exported XML before enabling any real AEAT transport.
- Add fixtures for anulacion and rectificativa before supporting those flows.

## Reject
- Network dependency in validation tests.
- Treating XSD validation as full legal/fiscal compliance.
