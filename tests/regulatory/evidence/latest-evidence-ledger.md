# CumpleFactura evidence ledger

- Generated: 2026-11-25T23:08:37.706Z
- Status: failed
- Matrix rows: 36
- Gate run id: 20261126-010543

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
| normative source cumplefactura_technical_matrix | `cumplefactura_technical_matrix` | 5134 | `3df28ca08e5e677625256cf61a68a451d44b0bf9ca52b262acffe07e1a93f90a` |
| normative source verifactu_hash_detail_pdf | `verifactu_hash_detail_pdf` | 1174110 | `f4334c254bb875b417247b54315199f89d75a8c4814dfd1e86efec562653d7de` |
| normative source verifactu_signature_pdf | `verifactu_signature_pdf` | 1497921 | `60953acd5d437a745db9076377739d8ef3f05c31967c1424cd4f6a8ac04af481` |
| normative source verifactu_wsdl | `verifactu_wsdl` | 8780 | `05919120708ff7650612fa6683c9336eaf919335d9a4db10e86759190af48602` |
| normative source verifactu_suministro_lr_xsd | `verifactu_suministro_lr_xsd` | 1598 | `d85dfde01497c67e429145189e572c25ce338683f10935cf0d38018ff0eb970e` |
| normative source verifactu_suministro_informacion_xsd | `verifactu_suministro_informacion_xsd` | 50930 | `fb5a31c12a9ba30cdc2decd6dd4cd044b22ccda16cfe809619ae9f3acbc2151b` |
| repo artifact matrix | `matrix` | 17683 | `6b5c9a495db7f0cb82771722996be5ef681acdee8e4b192b0c8f2016c2918682` |
| repo artifact module_contract | `module_contract` | 24281 | `072f6d3ca6b30bbabd0c44c1784c953bb991a5c23fe3d8092f7cb117762c711b` |
| repo artifact test_plan | `test_plan` | 7035 | `4be1e07310486f39bea5d7fae51d519261a2a33355e9dbdeba98e853dc8df5f7` |
| repo artifact package_scripts | `package_scripts` | 2139 | `60858ce805a02e83fd01a424e090c5e22bdcf9514a5a2337e8a4d8fdbca02b6f` |
| repo artifact regulatory_gate | `regulatory_gate` | 9204 | `1a7d8cba589099bb895556b44e7efc56a3f54f88444ef506c56de37caa6dc710` |
| repo artifact matrix_verifier | `matrix_verifier` | 2846 | `75e334f07bd26aaf425bac97414f8eb9cdec491f4592329d374bd9ea80a7e6d0` |
| repo artifact core_e2e_verifier | `core_e2e_verifier` | 1407 | `e28ef11c2ac06f1a423cb960e34f2ca4a18dd7780f5753fcced2024d4e1cf802` |
| repo artifact browser_smoke_verifier | `browser_smoke_verifier` | 19227 | `70151f32cf4ced91edd15b61e5f393389f016fdf4cfb49bfb6ad8b95db523eae` |
| repo artifact secret_scan_verifier | `secret_scan_verifier` | 3819 | `e5a4ebc7ecd40db1e0efe1144653e5d512b3526cb9334eda4393ed78642bb985` |
| repo artifact tauri_desktop_e2e_verifier | `tauri_desktop_e2e_verifier` | 12419 | `1d3e950399b9424882fec118b08e97f87e0d1b64ecc196fb6355cb8ee32d2674` |
| repo artifact ledger_verifier | `ledger_verifier` | 14477 | `a60081545bbd148822fb1007494954cdc0643220cb118f72ddeeb690ab3ff461` |
| repo artifact sidecar_smoke_verifier | `sidecar_smoke_verifier` | 5876 | `dc85e78d56132516d4794f10ea9b0c56eb890bf2ac2e1ee3603f9f65fedfc005` |
| repo artifact sidecar_bundle_tool | `sidecar_bundle_tool` | 1530 | `16e01a433529b944c602d7a85f2664ff397868a6a0ae60fe89aa97be42e2d329` |
| repo artifact tools_lib | `tools_lib` | 4745 | `4aa615caec430119a41732ddde6f6ac3da763e410bfe1cf872402fc3fa066ac6` |
| repo artifact fiscal_contract_lib | `fiscal_contract_lib` | 5893 | `d028c746e1b5cdad3894068e38bea21c09e18d6157cbdfcbd87a832e3aeabb6d` |
| repo artifact sidecar_architecture | `sidecar_architecture` | 20415 | `a154dc454407f7f3fb58747997801ec28007b3afc745bd41b58fc0eb23d967a4` |
| repo artifact external_acceptance_verifier | `external_acceptance_verifier` | 12335 | `e159fc2d4f2752043454b9cc20a5bb273fcbae15e4ec9c365441e9ae3b27ad48` |
| repo artifact external_readiness_verifier | `external_readiness_verifier` | 8671 | `30b729012fe86a85192bc377cd461e381eef9bcf65f15feb707bd11fe943dcfc` |
| repo artifact core_e2e_test | `core_e2e_test` | 12459 | `19447478ff711ff779e5076f78eb06fd472f37a1326b855e8dea06944a39b2a5` |
| repo artifact verifactu_fixture | `verifactu_fixture` | 2961 | `d962e0d09e3833cda035aa0a7029084e0fc42976990dc654cfb080ee5a0f6bd6` |
| repo artifact external_acceptance_manifest_fixture | `external_acceptance_manifest_fixture` | 1401 | `4a4feca4f346ca96a0fe2f90799b6f675adad3784ebda3ac9a07165e09684104` |
| repo artifact next_mvp_plan | `next_mvp_plan` | 2842 | `efe443f6fa054642b0131826c5fbabe220e3871793183305e370c044c655f835` |
| evidence artifact latest_core_e2e_json | `latest_core_e2e_json` | 2141 | `6d39cce746c1af8881438db94edb1145dc9cf12c1a17af071f10b5a3b04cbcd1` |
| evidence artifact latest_core_e2e_xml | `latest_core_e2e_xml` | 2916 | `be1ad8413aa57a958d29736a05fe4bc2d99278c276803a74249fb4ab34bdd672` |
| evidence artifact latest_core_e2e_pdf | `latest_core_e2e_pdf` | 34731 | `da1acbc58cc7ad8f750a4ad18a5a284dd513d0dc624a15dc09fdff5f2a3aec02` |
| evidence artifact latest_core_e2e_invoice_json | `latest_core_e2e_invoice_json` | 1409 | `54727f593d9225f1ef26828243d5bb4ad2220885ddf7e20dc087dea8401cb73a` |
| evidence artifact latest_core_e2e_invoices_csv | `latest_core_e2e_invoices_csv` | 608 | `ca53a0df29c29d6990a99236329ccbbe82133e8377e694d3a10e6445c44fdd7b` |
| evidence artifact latest_core_e2e_audit_json | `latest_core_e2e_audit_json` | 2974 | `ebe9ef0118f21a97980c60efb27a21bb8c19f9867b1bed43832daf1ce6145f23` |
| evidence artifact latest_browser_smoke_json | `latest_browser_smoke_json` | 1926 | `2863b8e093b1eaafa63653751a75a06a4ffea1cab5aef5e834953792e444bb54` |
| evidence artifact latest_browser_smoke_png | `latest_browser_smoke_png` | 237325 | `ba5ce524a3b37d6245cb520ab80763dcb50d0a12f46e498672a4cc0c2dfa7ae8` |
| evidence artifact latest_secret_scan_json | `latest_secret_scan_json` | 463 | `b44a5d4611284ba8701087f5a2d6a8b7223a209be2a393a544db7797d1a44ba2` |
| evidence artifact latest_secret_scan_md | `latest_secret_scan_md` | 421 | `f7c902ff837df80f22f3835936fa29602b23e10aad90801e3350877e26b97106` |
| evidence artifact latest_tauri_desktop_e2e_json | `latest_tauri_desktop_e2e_json` | 1634 | `419343b4e3bc1bd96398eb5551935633e61672359aedfbe3a66863cd4bc82b89` |
| evidence artifact latest_tauri_desktop_e2e_md | `latest_tauri_desktop_e2e_md` | 528 | `7f1e65362a02ca70e1a2c7edfcaca2f9bb058751e1772d3a35b88018d424071c` |
| evidence artifact latest_external_acceptance_json | `latest_external_acceptance_json` | 1011 | `aa1d1b6b61b46e995dced91b7bb176c7f86af2ac61a1b2f07abf07f0b6850a20` |
| evidence artifact latest_external_acceptance_md | `latest_external_acceptance_md` | 638 | `d326f6829af726a2b36d3dd15b1ba256430b7ec334e79d31696da580d05b091d` |
| evidence artifact latest_sidecar_smoke_json | `latest_sidecar_smoke_json` | 917 | `fc249ed09317ec48c3b271c52674daccbb8080b708c33b88d1bdd542469822b9` |
| evidence artifact latest_sidecar_smoke_md | `latest_sidecar_smoke_md` | 766 | `a4bfa1161147d78ce132a23621642b68131a3c1d4cbfd3bfcb3d17e4f1c23933` |
| evidence artifact latest_external_readiness_json | `latest_external_readiness_json` | 8162 | `e4b4898fdf3f076338aa2eae0d06ee1198a06a2fa8a575269adc145670ffa9d7` |
| evidence artifact latest_external_readiness_md | `latest_external_readiness_md` | 1766 | `602e4c802fd0e87d4dd06136debe93d234a06ad58502d2b09bf48792b0230a2d` |
| gate log 20261126-010543-browser_smoke.log | `20261126-010543-browser_smoke` | 698 | `57320ad6f095235dc0d7429940190e6913751fe78c596fe5d43794912b8908e7` |
| gate log 20261126-010543-cargo_test.log | `20261126-010543-cargo_test` | 28878 | `6ae365b2e40b96aec367f8436826e109025fa706a91d71fb1f21d7a1edf9f284` |
| gate log 20261126-010543-core_e2e.log | `20261126-010543-core_e2e` | 2412 | `8ea05542ef50b86a51dea916ba302eb575f1257c18ec41d22f33c7b8697b8ac6` |
| gate log 20261126-010543-evidence_matrix.log | `20261126-010543-evidence_matrix` | 336 | `7f3114b8b134feb78aaf3e54938b6cc40cc6c227e7923b27dcabda93539aedcf` |
| gate log 20261126-010543-external_acceptance.log | `20261126-010543-external_acceptance` | 868 | `5a9f73586679ec6dcc8ca89249de04e3e3089e2068821d8ad5be9739ae92e9cc` |
| gate log 20261126-010543-external_readiness.log | `20261126-010543-external_readiness` | 762 | `285181ef91b0ca45c20b1516807c78f41fbe3a6ef0816fcf50dad54cfb1235a8` |
| gate log 20261126-010543-npm_build.log | `20261126-010543-npm_build` | 2904 | `ae27ae5729898e5d85e2dd6eb36fd8d76984bf03195b12cf9e8a9fe8bbe08ac6` |
| gate log 20261126-010543-secret_scan.log | `20261126-010543-secret_scan` | 632 | `ec61e8f76a4931e770095130a833d570e95c0fad5e474105f58aaed605d0d325` |
| gate log 20261126-010543-sidecar_build.log | `20261126-010543-sidecar_build` | 558 | `d8393844ba120519e16ac4d0481540f0c961b6f8d4462ddee8d2a90a5359c787` |
| gate log 20261126-010543-sidecar_smoke.log | `20261126-010543-sidecar_smoke` | 652 | `1e6c7beac5adcf9f8a7ce900a72c410837dc7a51be19af5a4167ce7ab838f351` |
| gate log 20261126-010543-tauri_build.log | `20261126-010543-tauri_build` | 4268 | `bd30368c9a6fc385fd87766eebcf47f4302a6536b7ea57602b774351b59eaebf` |
| gate log 20261126-010543-tauri_desktop_e2e.log | `20261126-010543-tauri_desktop_e2e` | 490 | `c9728ccdcbd37a2db1fc5a7a1712384ad2a2af42b785cf1e4553f9081cc7455c` |
| gate log 20261126-010543-ui_contract.log | `20261126-010543-ui_contract` | 52408 | `6ad9efb69f5ca576add6329f14e0b8037c283c457b120190b853a351a28cc950` |
| gate log 20261126-010543-verifactu_xsd_fixture.log | `20261126-010543-verifactu_xsd_fixture` | 696 | `ad9dc9c966494b3f986243827710296b62928561c1607161cc61a84684d82408` |
