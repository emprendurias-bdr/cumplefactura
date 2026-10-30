# Core E2E: exercises Rust fiscal/invoice paths and writes evidence JSON.
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$OutputEncoding = [System.Text.UTF8Encoding]::new()

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$EvidenceDir = Join-Path $Root "tests\regulatory\evidence"
New-Item -ItemType Directory -Force -Path $EvidenceDir | Out-Null

$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
$previous = $env:CUMPLEFACTURA_WRITE_CORE_E2E_EVIDENCE
$env:CUMPLEFACTURA_WRITE_CORE_E2E_EVIDENCE = "1"

Push-Location (Join-Path $Root "src-tauri")
try {
    cargo test real_sqlite_verifactu_core_workflow_generates_evidence -- --nocapture
}
finally {
    if ($null -eq $previous) {
        Remove-Item Env:\CUMPLEFACTURA_WRITE_CORE_E2E_EVIDENCE -ErrorAction SilentlyContinue
    } else {
        $env:CUMPLEFACTURA_WRITE_CORE_E2E_EVIDENCE = $previous
    }
    Pop-Location
}

$Json = Join-Path $EvidenceDir "latest-core-e2e.json"
$Xml = Join-Path $EvidenceDir "latest-core-e2e-verifactu.xml"
$Pdf = Join-Path $EvidenceDir "latest-core-e2e-invoice.pdf"

foreach ($Path in @($Json, $Xml, $Pdf)) {
    if (-not (Test-Path $Path)) {
        throw "Core E2E evidence missing: $Path"
    }
}

Write-Host "CumpleFactura core E2E OK"
Write-Host $Json
Write-Host $Xml
Write-Host $Pdf
