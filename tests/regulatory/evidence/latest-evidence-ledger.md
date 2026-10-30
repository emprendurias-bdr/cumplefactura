# CumpleFactura evidence ledger

- Generated: 2026-06-28T19:23:26.504Z
- Status: passed
- Matrix rows: 40
- Gate run id: 20260628-212017

## Artifact Counts

- Normative sources: 6
- Repo artifacts: 18
- Evidence artifacts: 18
- Gate logs: 14

## Limits

- No artifact hash is a legal certification.
- No AEAT network transmission, CSV retrieval or external acceptance is performed by this ledger.
- External acceptance intake stores and hashes a redacted manifest only; without a supplied manifest it records not_provided.
- Certificate-backed XAdES remains pending unless sidecar runs with a real authorized certificate.
- Desktop Tauri standalone default is preflight; regulatory gate enables real WebDriver mode.

## SHA256

| Role | Id | Bytes | SHA256 |
|---|---|---:|---|
| normative source cumplefactura_technical_matrix | `cumplefactura_technical_matrix` | 5081 | `9f2297c110ad4eb8ea1da4c94c202f3febd8fbf917effee3b0a9f9022eca1515` |
| normative source verifactu_hash_detail_pdf | `verifactu_hash_detail_pdf` | 1174110 | `f4334c254bb875b417247b54315199f89d75a8c4814dfd1e86efec562653d7de` |
| normative source verifactu_signature_pdf | `verifactu_signature_pdf` | 1497921 | `60953acd5d437a745db9076377739d8ef3f05c31967c1424cd4f6a8ac04af481` |
| normative source verifactu_wsdl | `verifactu_wsdl` | 8780 | `05919120708ff7650612fa6683c9336eaf919335d9a4db10e86759190af48602` |
| normative source verifactu_suministro_lr_xsd | `verifactu_suministro_lr_xsd` | 1573 | `cbdac8d427cc5ab5d77ca48974cab0f35d6bb819c4c66db361681e3710aeba36` |
| normative source verifactu_suministro_informacion_xsd | `verifactu_suministro_informacion_xsd` | 49540 | `ee4c1655175644de44c4c25055ffeb8e5f4bb4bc3834ce8254d4222ef18c8aa1` |
| repo artifact matrix | `matrix` | 18634 | `7a32d11ca976c025f8ace7c5fefdef940660cb8e796f8c974546dc8aa321e14b` |
| repo artifact module_contract | `module_contract` | 17718 | `ed6c5598ad2207424ede4626db7b5151ce28777728271a05b7b71e8bfc5d09f9` |
| repo artifact test_plan | `test_plan` | 7792 | `d067e0bfcaa6f72929572fb4924c15ced468d34b627a64a017e5add611cfbe6a` |
| repo artifact package_scripts | `package_scripts` | 1962 | `2bb8878b3d39a523a0113cd5e4e51df7c55b02f2b6d21e6c28f6400c50cb804a` |
| repo artifact regulatory_gate | `regulatory_gate` | 8827 | `17b05e56ef3278ef980158c5c216e7357ebf8ca7f78793b174ed8fe1b603b131` |
| repo artifact matrix_verifier | `matrix_verifier` | 3597 | `aed3511505caeb9a335b77ec6b771f8c4da1cf9439fccfdad06d61eeada29b35` |
| repo artifact core_e2e_verifier | `core_e2e_verifier` | 1292 | `d93487e9a091d1341fcfafa036d18ae67059acf3dc263a79d43e6f26a6f76b18` |
| repo artifact browser_smoke_verifier | `browser_smoke_verifier` | 23650 | `a25d374fe8752863e057e15ba0af75f8b1323ce2194b48ef179f15473e8622ff` |
| repo artifact secret_scan_verifier | `secret_scan_verifier` | 4167 | `c522d2d729ca4f0c773bde02b8aa4df321ea9cc2390d4cd9ab43b31953475038` |
| repo artifact tauri_desktop_e2e_verifier | `tauri_desktop_e2e_verifier` | 10232 | `49a4ffbebd27c6aa4fcb0b115fcce19b3b7d4d35d94c5088465cc244e24c86ae` |
| repo artifact ledger_verifier | `ledger_verifier` | 15392 | `36778b2e10385be1258336598016af7d4cee16cca9aadd9128a37f1b7d26d279` |
| repo artifact contapro_sidecar_importer | `contapro_sidecar_importer` | 5466 | `643b5c71b42ee1387e1b34ed6e3f8b4529558998e44daa0ca0773cfa8672e8f7` |
| repo artifact external_acceptance_verifier | `external_acceptance_verifier` | 12542 | `251031f6f36421a297d54e90500a5c2c7b5e0edb9a562d882e86018a1b865e89` |
| repo artifact external_readiness_verifier | `external_readiness_verifier` | 13359 | `c0a9004645515dfce7e2a905bf9e502fc56913fb0b237fba04e17eb7a016ae60` |
| repo artifact core_e2e_test | `core_e2e_test` | 12289 | `d2c31ddb2804f4483959f2bf2f6c5dc3bd602fa5aacdaec2e0d193fbef6d2e80` |
| repo artifact verifactu_fixture | `verifactu_fixture` | 2904 | `3016e9edd918f721343fe37a808000ecf020dc38e377b2a3ef0b61cec7a28de2` |
| repo artifact external_acceptance_manifest_fixture | `external_acceptance_manifest_fixture` | 1321 | `2595ac4341563701a1c0f6bdc6671b7a8c284f17c3dd412052c820b45eaf76f8` |
| repo artifact next_mvp_plan | `next_mvp_plan` | 2785 | `2ad45afe62a5f53ee9d33539db61a34ccf5f7a36e360687ed24ecee2c8d55e2e` |
| evidence artifact latest_core_e2e_json | `latest_core_e2e_json` | 1830 | `203b2f57d4fbbdcef117ef235cadfff0fcd2a4d7cb61e9530778e02de3e1a026` |
| evidence artifact latest_core_e2e_xml | `latest_core_e2e_xml` | 2916 | `be1ad8413aa57a958d29736a05fe4bc2d99278c276803a74249fb4ab34bdd672` |
| evidence artifact latest_core_e2e_pdf | `latest_core_e2e_pdf` | 1120 | `6ce2a66c028d91e80046840f4ee3f713a35e46fbdb1d9426a4dbc98ab4a00aad` |
| evidence artifact latest_core_e2e_invoice_json | `latest_core_e2e_invoice_json` | 971 | `a9982ef32ec2c0f32acd58251f955fe75e2a67502e6ea25c3d9ecaa5bd543e3a` |
| evidence artifact latest_core_e2e_invoices_csv | `latest_core_e2e_invoices_csv` | 608 | `0dbbe179da53273c1921c435e18c8b3c1220432d174d8fdc782865eb94418801` |
| evidence artifact latest_core_e2e_audit_json | `latest_core_e2e_audit_json` | 2678 | `b0c5034acbf59cfab01d38e96ebcfa0383977f53e92f57cefc7dcc6a970ee7b6` |
| evidence artifact latest_browser_smoke_json | `latest_browser_smoke_json` | 1589 | `9d6ff138e04fa0957babbdccb9a84c70f3cb68af46d2b8138122d43bbaa96a97` |
| evidence artifact latest_browser_smoke_png | `latest_browser_smoke_png` | 155663 | `67fdcd5dec17a5c40015c724616afcd6ab46104e452b706c0f598dfe7e34134b` |
| evidence artifact latest_secret_scan_json | `latest_secret_scan_json` | 463 | `d5cc97aa0f0d1f13c33b5ba7e6676561ecb856610f4c86ce813b749dcdaf9a67` |
| evidence artifact latest_secret_scan_md | `latest_secret_scan_md` | 421 | `fc21d67be1c1a2b7e8f106cfe5363d6e9c724c62ead7be318842920f0c45c4b9` |
| evidence artifact latest_tauri_desktop_e2e_json | `latest_tauri_desktop_e2e_json` | 1606 | `6e0408c99c3b508afa836f94fdce869513140420cd871fcf7c3a9394de2e4f64` |
| evidence artifact latest_tauri_desktop_e2e_md | `latest_tauri_desktop_e2e_md` | 770 | `da100d27ea4cbe023500c04fbbf3012a7c18594b02e3f83e0c61a34d19543e5d` |
| evidence artifact latest_external_acceptance_json | `latest_external_acceptance_json` | 995 | `631130c4d48a1b6faff8ee81be9e5d44829a4500127e5871b1dded267eeb9ca8` |
| evidence artifact latest_external_acceptance_md | `latest_external_acceptance_md` | 638 | `f5625854c6339c1cfe7bdd4aac6a4e5222e1c9913b3e323b8eae811e50f58a83` |
| evidence artifact latest_contapro_sidecar_import_json | `latest_contapro_sidecar_import_json` | 3011 | `7ebc2c1bd7261cd75b6ba21b8639cc1d30d6e03860eca70d35f5a68dc58c2a76` |
| evidence artifact latest_contapro_sidecar_import_md | `latest_contapro_sidecar_import_md` | 1089 | `3ffb43997e157dfcddc2e40875fd7124a72d69873e8b3083023d666b924994a8` |
| evidence artifact latest_external_readiness_json | `latest_external_readiness_json` | 11927 | `639e46beacdde5a49784953e0bc5d564b963789def35f01370b3e5bff07d3e5d` |
| evidence artifact latest_external_readiness_md | `latest_external_readiness_md` | 2186 | `b1baefa995d7a5cfb4f00f0324ad1b8cceabe33024f0082c5ab74eb570d000be` |
| gate log 20260628-212017-browser_smoke.log | `20260628-212017-browser_smoke` | 642 | `a064bd3a722080c844760d992281a5408da328a379220a9f938ea520831c55dc` |
| gate log 20260628-212017-cargo_fmt_check.log | `20260628-212017-cargo_fmt_check` | 972 | `2e617e3bfdb3c56772be617239d08788c42dea2ed3e0276f88b39c7b738e6064` |
| gate log 20260628-212017-cargo_test.log | `20260628-212017-cargo_test` | 13418 | `22af5d44f7e09d3e2444b19916fa4410330fc21e068a1e7ea03085b20126577c` |
| gate log 20260628-212017-contapro_sidecar_import.log | `20260628-212017-contapro_sidecar_import` | 700 | `818b9a41832dda18cc29c9f63eee49376e70b4b57594849c2615e67a76737414` |
| gate log 20260628-212017-core_e2e.log | `20260628-212017-core_e2e` | 1990 | `d48170b65405e4f168a73d7e629fd75f8286ef5af4ab58728975a858baa08dfb` |
| gate log 20260628-212017-evidence_matrix.log | `20260628-212017-evidence_matrix` | 336 | `65bac1216e90c1b208c37cb85c03f4239ce3b2fdd40ed1c760dbe7891fd29bd6` |
| gate log 20260628-212017-external_acceptance.log | `20260628-212017-external_acceptance` | 812 | `118771b5cd4baba650343a00b9565de6232fc3898a2949bc265bb8193ebd116b` |
| gate log 20260628-212017-external_readiness.log | `20260628-212017-external_readiness` | 708 | `46f96964a2d7fc66faa98b1674b49b5d15069cdd52b63d9535d84e4ea4d8b815` |
| gate log 20260628-212017-npm_build.log | `20260628-212017-npm_build` | 824 | `451316688e13753a23bccf37809f471820f0c3e1da382a7f38c04f35e2778f48` |
| gate log 20260628-212017-secret_scan.log | `20260628-212017-secret_scan` | 576 | `e8323c1cbce07a11d64f09866b3ba49afc9fb3ad021e07a3cadc9d4610d60d94` |
| gate log 20260628-212017-tauri_build.log | `20260628-212017-tauri_build` | 1706 | `1406050407167d4ba24ffd6162efbc325ce7b95a7d5111aa8aaa7943a086d95f` |
| gate log 20260628-212017-tauri_desktop_e2e.log | `20260628-212017-tauri_desktop_e2e` | 636 | `91fbe1aa7210a79b2d69ec2963d52ddf496610af39793f568f6d402e0d99901d` |
| gate log 20260628-212017-ui_contract.log | `20260628-212017-ui_contract` | 51804 | `e35ec88797073ae732a00fc66a0488868d235d7e4457de5d7a6f175e1364fe0b` |
| gate log 20260628-212017-verifactu_xsd_fixture.log | `20260628-212017-verifactu_xsd_fixture` | 668 | `dc8c0276acd305e8aadd32bf81689cef585c2a10096ea893ffc59c525b19defe` |
