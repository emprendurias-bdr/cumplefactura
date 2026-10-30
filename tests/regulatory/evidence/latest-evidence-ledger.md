# CumpleFactura evidence ledger

- Generated: 2026-10-28T10:53:18.189Z
- Status: failed
- Matrix rows: 40
- Gate run id: latest

## Artifact Counts

- Normative sources: 6
- Repo artifacts: 18
- Evidence artifacts: 20
- Gate logs: 15

## Limits

- No artifact hash is a legal certification.
- No AEAT network transmission, CSV retrieval or external acceptance is performed by this ledger.
- External acceptance intake stores and hashes a redacted manifest only; without a supplied manifest it records not_provided.
- Certificate-backed XAdES remains pending unless sidecar runs with a real authorized certificate.
- Desktop Tauri standalone default is preflight; regulatory gate enables real WebDriver mode.

## SHA256

| Role | Id | Bytes | SHA256 |
|---|---|---:|---|
| normative source cumplefactura_technical_matrix | `cumplefactura_technical_matrix` | 0 | `missing` |
| normative source verifactu_hash_detail_pdf | `verifactu_hash_detail_pdf` | 0 | `missing` |
| normative source verifactu_signature_pdf | `verifactu_signature_pdf` | 0 | `missing` |
| normative source verifactu_wsdl | `verifactu_wsdl` | 0 | `missing` |
| normative source verifactu_suministro_lr_xsd | `verifactu_suministro_lr_xsd` | 0 | `missing` |
| normative source verifactu_suministro_informacion_xsd | `verifactu_suministro_informacion_xsd` | 0 | `missing` |
| repo artifact matrix | `matrix` | 18747 | `e4864895077cca8aa8d44d73558aa827e7e34772e37468707318bf46a75d40c7` |
| repo artifact module_contract | `module_contract` | 0 | `missing` |
| repo artifact test_plan | `test_plan` | 0 | `missing` |
| repo artifact package_scripts | `package_scripts` | 2007 | `de954f620637ceb23fc071ee88ce47c4fc11357456db350a485d1e02c573c931` |
| repo artifact regulatory_gate | `regulatory_gate` | 9161 | `6d3b9c3c123023cab6a2b26f71698fc9cf1e552165167d5b6d717027c69894c3` |
| repo artifact matrix_verifier | `matrix_verifier` | 3805 | `0e1cf9120c0471f2a2e85d313973b25cdb21ef349e38ea87c53a55dcb720de3d` |
| repo artifact core_e2e_verifier | `core_e2e_verifier` | 1406 | `ed932bf04c520b9d656fcf3c64e7e58186d4eae9da1c2800c4ea0f2d3ed18dde` |
| repo artifact browser_smoke_verifier | `browser_smoke_verifier` | 25360 | `bb2f64b42003ed2bbf6df45e661e958743eefc32dc79ff0c70ea6280f7e0d404` |
| repo artifact secret_scan_verifier | `secret_scan_verifier` | 4378 | `9fd5519e6768e1da061d35c46ef78d71b02e5be80f47c83aa31bb576b106181c` |
| repo artifact tauri_desktop_e2e_verifier | `tauri_desktop_e2e_verifier` | 10566 | `9baf5f37ae887e84203ece728fa0f063dabd0d6408082dc4378afdc201b0eaf4` |
| repo artifact ledger_verifier | `ledger_verifier` | 15858 | `c9b3dd3aa3841ef3b15a98eddeabfb597174ea47eb6ccb0fa6474161948a078a` |
| repo artifact contapro_sidecar_importer | `contapro_sidecar_importer` | 5697 | `855bd14e255ef0f0f498a2c35e822d3b289531d59e62f4a17c8507234f5030d6` |
| repo artifact external_acceptance_verifier | `external_acceptance_verifier` | 12977 | `a2207f6cf1a72f2808d2453c855552356a14a5d8eb2ab8e06315173fc3b9810c` |
| repo artifact external_readiness_verifier | `external_readiness_verifier` | 13784 | `1c2594cd6b665465036ec9d6a12d10cced058376abb258b67b627e38032c9dfa` |
| repo artifact core_e2e_test | `core_e2e_test` | 12616 | `0a681c3eb2fd805bedcaf182c5576b21a5151f9f5536d8ce0b0e18bb649a403d` |
| repo artifact verifactu_fixture | `verifactu_fixture` | 2961 | `d962e0d09e3833cda035aa0a7029084e0fc42976990dc654cfb080ee5a0f6bd6` |
| repo artifact external_acceptance_manifest_fixture | `external_acceptance_manifest_fixture` | 1347 | `0140d265b9b2b20ec0874a0c2089aa83b21d32cda97082958c4ca2f2849e80cd` |
| repo artifact next_mvp_plan | `next_mvp_plan` | 0 | `missing` |
| evidence artifact latest_core_e2e_json | `latest_core_e2e_json` | 1865 | `a6f14d0feaeb832443569ae472a629183d6e5c5f2c33fb906189a3466da65937` |
| evidence artifact latest_core_e2e_xml | `latest_core_e2e_xml` | 2916 | `be1ad8413aa57a958d29736a05fe4bc2d99278c276803a74249fb4ab34bdd672` |
| evidence artifact latest_core_e2e_pdf | `latest_core_e2e_pdf` | 1120 | `b52ceea447457dad16a34ec9383d93e09813bf0f09c0eb477587d9be363601b6` |
| evidence artifact latest_core_e2e_invoice_json | `latest_core_e2e_invoice_json` | 971 | `b64d5497fb43c08e014a3e6e791b7827c04968985047008dae2b94522f6e1606` |
| evidence artifact latest_core_e2e_invoices_csv | `latest_core_e2e_invoices_csv` | 605 | `126ad4e06eb4dea069f24798bed776a05f63a086c8c94d1d964706d6237092b9` |
| evidence artifact latest_core_e2e_audit_json | `latest_core_e2e_audit_json` | 2669 | `bf17db1609fdcc04b2703359f3fe778bf7b80e01257ac01049962e0244f24346` |
| evidence artifact latest_browser_smoke_json | `latest_browser_smoke_json` | 1610 | `be906aa0ddae87910fe9fa212846474e0aff02b23057ebb2dd9a47881f2ac1c3` |
| evidence artifact latest_browser_smoke_png | `latest_browser_smoke_png` | 169064 | `3b81fd4cdfa0dd509f41e72034e877c4aa4d35fb896d68b71e389843663d8369` |
| evidence artifact latest_secret_scan_json | `latest_secret_scan_json` | 463 | `0f666bc26f0291c59639d256aaa2e06ad3a4b8fcc9594570000f5049906aa9e3` |
| evidence artifact latest_secret_scan_md | `latest_secret_scan_md` | 421 | `270ca6ed1b62c5a45336c6a2a4d359d8cb29ca8a2cfde253a5a74b9885f49a52` |
| evidence artifact latest_tauri_desktop_e2e_json | `latest_tauri_desktop_e2e_json` | 1000 | `03612aa4065c363e669977c2912f00c72d0e2a91a92b938a1cdec0b6d1fd8ea6` |
| evidence artifact latest_tauri_desktop_e2e_md | `latest_tauri_desktop_e2e_md` | 537 | `94fa7448a86c47faae55d75eff946bbb65813d4680b08d00f51c10ed7b965d4f` |
| evidence artifact latest_external_acceptance_json | `latest_external_acceptance_json` | 1002 | `d0445ecf5ebceb258eb192aa03262e53aefb327dc5d8f056a86b8b93f422a2c2` |
| evidence artifact latest_external_acceptance_md | `latest_external_acceptance_md` | 638 | `607785a044e6dcc51acf74539a406fda747b12ca836ec1600463871b7a2a39b3` |
| evidence artifact latest_contapro_sidecar_import_json | `latest_contapro_sidecar_import_json` | 2804 | `4bd18f163d73037a4d8108fca8d9b4e16f1a9b8adfabe68dbe2b7a9de225c9ca` |
| evidence artifact latest_contapro_sidecar_import_md | `latest_contapro_sidecar_import_md` | 990 | `7d0732c683658307415b490d09d0f2eaf29456ddd53a76a682fe0f1c9f9ebfa7` |
| evidence artifact latest_external_readiness_json | `latest_external_readiness_json` | 14147 | `89a4a9b6f579c76c2b46d69b7a199df65d7238f502394f400393a9d330393f6c` |
| evidence artifact latest_external_readiness_md | `latest_external_readiness_md` | 2940 | `76a28e1af779f39f383b0052c48f1000134cdee011168a60596ca2d53fe26aee` |
| evidence artifact latest_regulatory_gate_json | `latest_regulatory_gate_json` | 13914 | `5a0b02137b8f917d00a06cb71bb40eece48ccdb7aa683d992018aa2afcb017b2` |
| evidence artifact latest_regulatory_gate_md | `latest_regulatory_gate_md` | 4832 | `d62dbc8876036d91752a8a43c60dea860c6742aac6acdbfe0d7f1359b3933904` |
| gate log 20261028-124731-cargo_fmt_check.log | `20261028-124731-cargo_fmt_check` | 1044 | `9773106fda53a0862773aa2f5251cac281a5bb03958e3507b3e5eb6ddd1f7ea7` |
| gate log 20261028-124731-cargo_test.log | `20261028-124731-cargo_test` | 13804 | `9d6c1bde9b329664800d6952fff3091ffdff52e09991ee4fde3ccda378f4486f` |
| gate log 20261028-124731-npm_build.log | `20261028-124731-npm_build` | 1118 | `3989195704d420b25aff6eb3dd4111e630831f6453eb864ccf1d133408591f48` |
| gate log 20261028-124731-ui_contract.log | `20261028-124731-ui_contract` | 52942 | `d501ff4f97138c983d17a17e9566173592e188ee699879f3fe0a9a8fb8ea5f6c` |
| gate log 20261028-124731-core_e2e.log | `20261028-124731-core_e2e` | 2690 | `f019a15c6b88f8df3b4219fe7c216657d8f8a4f9a44daf2c2c293478ac358cc9` |
| gate log 20261028-124731-browser_smoke.log | `20261028-124731-browser_smoke` | 2946 | `7bc6d537c11bfa1d893ebf5ff27943a3f771756fea5db02233d7bcfebb23f0cd` |
| gate log 20261028-124731-secret_scan.log | `20261028-124731-secret_scan` | 890 | `70d8cd99339dae1ea2ee6c44cb65644a3a005e6e939afea9fee21c323f10da80` |
| gate log 20261028-124731-external_acceptance.log | `20261028-124731-external_acceptance` | 1126 | `b4a35699a4a719ad9c3ebeaf7621b134b9dabaab972a18d4d19af90c0a6762b5` |
| gate log 20261028-124731-contapro_sidecar_import.log | `20261028-124731-contapro_sidecar_import` | 716 | `fb1255c8e010cde1aaab1a5bad9b858a74aafd94247b21a1745f8f5935e147ca` |
| gate log 20261028-124731-evidence_matrix.log | `20261028-124731-evidence_matrix` | 2146 | `5b3377db0bb974d450c535fcbc38b1416ee13cea45e01ddb724bd0bbae9fe2cc` |
| gate log 20261028-124731-verifactu_xsd_fixture.log | `20261028-124731-verifactu_xsd_fixture` | 972 | `ce4278983ad52ae40a34b70ba4ba4e9c1c8cb7c89362ce8f0500fda76cbc12fc` |
| gate log 20261028-124731-tauri_build.log | `20261028-124731-tauri_build` | 19194 | `f7228fffb80a597e9aac11dc2d6ba2f5cb0eb499c923e5d30da6ec2b0d5ca5c8` |
| gate log 20261028-124731-tauri_desktop_e2e.log | `20261028-124731-tauri_desktop_e2e` | 1692 | `a71da1cc81187c3cc7d7e6c2ed24811ee337e35e0976192802dccf2561de82f5` |
| gate log 20261028-124731-external_readiness.log | `20261028-124731-external_readiness` | 1022 | `85ab1cf93d2b35ff03b00b1c795cf842d2beaefc9c4fd4b44c745ff193839b50` |
| gate log 20261028-124731-evidence_ledger.log | `20261028-124731-evidence_ledger` | 2134 | `4a8e37870f1cf140dd601c7aeebfda344ec9901c2e9ab094f2d63fba91c6f1d8` |
