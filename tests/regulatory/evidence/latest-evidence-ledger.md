# CumpleFactura evidence ledger

- Generated: 2026-11-19T23:35:38.342Z
- Status: failed
- Matrix rows: 36
- Gate run id: 20261120-013112

## Artifact Counts

- Normative sources: 6
- Repo artifacts: 22
- Evidence artifacts: 18
- Gate logs: 14

## Limits

- No artifact hash is a legal certification.
- No AEAT network transmission, CSV retrieval or external acceptance is performed by this ledger.
- External acceptance intake stores and hashes a redacted manifest only; without a supplied manifest it records not_provided.
- VERI*FACTU records are unsigned by design (RD 1007/2023 art. 16.3); real mTLS submission needs a certificate and CUMPLEFACTURA_SIDECAR_ALLOW_AEAT=1.
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
| repo artifact matrix | `matrix` | 17605 | `fe7604912591afbf58008449187ee1cb86a621c24c6c515ab227838af50a4dc7` |
| repo artifact module_contract | `module_contract` | 24125 | `6d9bd70f4075c11d398162607d336c377fdb0f783835a56e6ff887223036b5cd` |
| repo artifact test_plan | `test_plan` | 7009 | `91bc50d5b3a6988216312da24532d7db25aba3a65712959cce6b617d072bcc0e` |
| repo artifact package_scripts | `package_scripts` | 2087 | `93b8e1f5c35cbc072d458283ae537095517332b683aa210bdf0f784eb7dbbbfb` |
| repo artifact regulatory_gate | `regulatory_gate` | 9204 | `1a7d8cba589099bb895556b44e7efc56a3f54f88444ef506c56de37caa6dc710` |
| repo artifact matrix_verifier | `matrix_verifier` | 2846 | `75e334f07bd26aaf425bac97414f8eb9cdec491f4592329d374bd9ea80a7e6d0` |
| repo artifact core_e2e_verifier | `core_e2e_verifier` | 1407 | `e28ef11c2ac06f1a423cb960e34f2ca4a18dd7780f5753fcced2024d4e1cf802` |
| repo artifact browser_smoke_verifier | `browser_smoke_verifier` | 19227 | `70151f32cf4ced91edd15b61e5f393389f016fdf4cfb49bfb6ad8b95db523eae` |
| repo artifact secret_scan_verifier | `secret_scan_verifier` | 3819 | `e5a4ebc7ecd40db1e0efe1144653e5d512b3526cb9334eda4393ed78642bb985` |
| repo artifact tauri_desktop_e2e_verifier | `tauri_desktop_e2e_verifier` | 12398 | `eb39580f9c8732a6a40c763314b545cbf60d8b3743979e88f86cedf41aed065c` |
| repo artifact ledger_verifier | `ledger_verifier` | 14615 | `9bbecf08b7c321a4d44f005b29a648eed5e492e811afaad0a5f52dbaf42f22e7` |
| repo artifact sidecar_smoke_verifier | `sidecar_smoke_verifier` | 5836 | `59929d1781b3b6ee34302f9ea30d9b33276855d5aa7e996ef901ccd30df29528` |
| repo artifact sidecar_bundle_tool | `sidecar_bundle_tool` | 1512 | `4f7e659e7dd1fcbf279b2b050e9ea7f14855cc1890994de9b515856b0d28c0ea` |
| repo artifact tools_lib | `tools_lib` | 4532 | `0660738bf91c2fc613dd41f65911e6c6b66ee2e96959d2e398a90bb4d9898bb9` |
| repo artifact fiscal_contract_lib | `fiscal_contract_lib` | 5893 | `d028c746e1b5cdad3894068e38bea21c09e18d6157cbdfcbd87a832e3aeabb6d` |
| repo artifact sidecar_architecture | `sidecar_architecture` | 20415 | `a154dc454407f7f3fb58747997801ec28007b3afc745bd41b58fc0eb23d967a4` |
| repo artifact external_acceptance_verifier | `external_acceptance_verifier` | 12335 | `e159fc2d4f2752043454b9cc20a5bb273fcbae15e4ec9c365441e9ae3b27ad48` |
| repo artifact external_readiness_verifier | `external_readiness_verifier` | 8645 | `b77b5ae476e0380b2b95bda60856d5ff7a8d2e05f743d3783a6b80f71baa6f26` |
| repo artifact core_e2e_test | `core_e2e_test` | 12459 | `19447478ff711ff779e5076f78eb06fd472f37a1326b855e8dea06944a39b2a5` |
| repo artifact verifactu_fixture | `verifactu_fixture` | 2961 | `d962e0d09e3833cda035aa0a7029084e0fc42976990dc654cfb080ee5a0f6bd6` |
| repo artifact external_acceptance_manifest_fixture | `external_acceptance_manifest_fixture` | 1347 | `0140d265b9b2b20ec0874a0c2089aa83b21d32cda97082958c4ca2f2849e80cd` |
| repo artifact next_mvp_plan | `next_mvp_plan` | 2842 | `efe443f6fa054642b0131826c5fbabe220e3871793183305e370c044c655f835` |
| evidence artifact latest_core_e2e_json | `latest_core_e2e_json` | 2141 | `2559264727938d7ff1640f43e2f1e49d1b98a0c018a73980fd6761ddd857d249` |
| evidence artifact latest_core_e2e_xml | `latest_core_e2e_xml` | 2916 | `be1ad8413aa57a958d29736a05fe4bc2d99278c276803a74249fb4ab34bdd672` |
| evidence artifact latest_core_e2e_pdf | `latest_core_e2e_pdf` | 34731 | `da1acbc58cc7ad8f750a4ad18a5a284dd513d0dc624a15dc09fdff5f2a3aec02` |
| evidence artifact latest_core_e2e_invoice_json | `latest_core_e2e_invoice_json` | 1409 | `d6e80e70e3e4faed984276630aa2bdc3554207de6a33b1b0e339b16f8302104e` |
| evidence artifact latest_core_e2e_invoices_csv | `latest_core_e2e_invoices_csv` | 608 | `4df6733f70d678ead8e27cf835a1e2f5d6405d73147b39d56ca881225877809d` |
| evidence artifact latest_core_e2e_audit_json | `latest_core_e2e_audit_json` | 2974 | `f8005e1bd1820b9dc821cca97e2d387ab810f8fa69a318438443366cbbcc2832` |
| evidence artifact latest_browser_smoke_json | `latest_browser_smoke_json` | 1626 | `eb6ad27c282f8f8bd66dd4707d27d5d0781d1e8639414da22c73b4b93b83b012` |
| evidence artifact latest_browser_smoke_png | `latest_browser_smoke_png` | 155663 | `67fdcd5dec17a5c40015c724616afcd6ab46104e452b706c0f598dfe7e34134b` |
| evidence artifact latest_secret_scan_json | `latest_secret_scan_json` | 463 | `ecfccc813ae7ed44622832979c72138323ab40c66eb212b4858cd55eb9b89dbe` |
| evidence artifact latest_secret_scan_md | `latest_secret_scan_md` | 421 | `c1ad94b6d0cbcbc1782b9f8a654a58ceb08951b26bdc50d7f6e3c502daece5b8` |
| evidence artifact latest_tauri_desktop_e2e_json | `latest_tauri_desktop_e2e_json` | 820 | `f9ad38d3dcab97db3e5d637c6c660df772de94921307aa64c3ac2de24be5fd31` |
| evidence artifact latest_tauri_desktop_e2e_md | `latest_tauri_desktop_e2e_md` | 536 | `d4ade2796ad3ce00d4aba9bd84d0ebbcb0fdbf4aa0006ceb7bd776411f070737` |
| evidence artifact latest_external_acceptance_json | `latest_external_acceptance_json` | 1011 | `8a37abeb97594aeefd0dcb49836b40809637111b4c6e71d300ff2d90290fc0fd` |
| evidence artifact latest_external_acceptance_md | `latest_external_acceptance_md` | 638 | `71d2a132e4eae2f498ca78121a5e5a4fd301ffa0c1a34a901229c80a879a8141` |
| evidence artifact latest_sidecar_smoke_json | `latest_sidecar_smoke_json` | 641 | `5505f238403e3c8ca7f1d7200bcbe8e627dba621b65d0f89f127de2a1ec37078` |
| evidence artifact latest_sidecar_smoke_md | `latest_sidecar_smoke_md` | 550 | `44e1c0d93663b7f2381d5cb7334e38af363483e71bdf0463d31bcde345048938` |
| evidence artifact latest_external_readiness_json | `latest_external_readiness_json` | 9255 | `71fa0d9a3b54814a6917b7af0bcc0c2fabb8a216683a5758316d9f1fd0f69963` |
| evidence artifact latest_external_readiness_md | `latest_external_readiness_md` | 2147 | `4f9f632715a09c3b9d5e51c70ad0aff1e48f41226229075bf8c95fd73d5a886b` |
| gate log 20261120-013112-browser_smoke.log | `20261120-013112-browser_smoke` | 10478 | `dd5bbdd9e148b22e5616d72d217b322199e4753787c6bd9517fec17f2e499737` |
| gate log 20261120-013112-cargo_test.log | `20261120-013112-cargo_test` | 34496 | `31ce71b99effb7b8fe5cfa82205222bcc491d19b5fb2bce9217ef98ef1cd5db7` |
| gate log 20261120-013112-core_e2e.log | `20261120-013112-core_e2e` | 2606 | `fb955165cfe4c3d4a13e036a43cd5349169830d2e9a2e62fc1e9893ecaa84db7` |
| gate log 20261120-013112-evidence_matrix.log | `20261120-013112-evidence_matrix` | 966 | `5906e011c7fb1f75bac80902e59f2e1b520f3ba532eaf5a90b23e1de164384a1` |
| gate log 20261120-013112-external_acceptance.log | `20261120-013112-external_acceptance` | 868 | `60c1dfaa7837601be695e32a41cf800eb156cae1f08d12a3e34230214273ea5f` |
| gate log 20261120-013112-external_readiness.log | `20261120-013112-external_readiness` | 764 | `bb9fa0ff716515742faeaa7ddcdf2125b2a270980a8e2dda483eb3224624d713` |
| gate log 20261120-013112-npm_build.log | `20261120-013112-npm_build` | 1950 | `353269ab966b77efb68057165d4f5a1fa2268877909bc82f4353796b7d776a13` |
| gate log 20261120-013112-secret_scan.log | `20261120-013112-secret_scan` | 632 | `0656decb599b488271829039687f67808d9fa54bbdd777b1a06d09fe40dbfa3a` |
| gate log 20261120-013112-sidecar_build.log | `20261120-013112-sidecar_build` | 2374 | `e5ac98bd9994ff98b9fe5ccbd449d510b3d7fefea91f10238801e5c2d03ae5aa` |
| gate log 20261120-013112-sidecar_smoke.log | `20261120-013112-sidecar_smoke` | 458 | `88f3575299e12a70d4ba172dd0a385f2cd4d9b24e30d6065e69255c74623dab0` |
| gate log 20261120-013112-tauri_build.log | `20261120-013112-tauri_build` | 19864 | `52f80575c1ecf7722dc533e4b61ae4660aa3762f3ba8b7db8972c3a92e1fcaf0` |
| gate log 20261120-013112-tauri_desktop_e2e.log | `20261120-013112-tauri_desktop_e2e` | 1416 | `06eadfad8cfee38838e44e6fffcfeb1f0c7a8e5e08378cf4209c0c3b655f4cc2` |
| gate log 20261120-013112-ui_contract.log | `20261120-013112-ui_contract` | 52408 | `6a3bb53090c1b3222815d06029537fb3f40d84e1372a20208db68ebfce011d11` |
| gate log 20261120-013112-verifactu_xsd_fixture.log | `20261120-013112-verifactu_xsd_fixture` | 696 | `00988019553191f254a07c2d0be00806ea61ed5aca1b8f2948404ae723f8ee99` |
