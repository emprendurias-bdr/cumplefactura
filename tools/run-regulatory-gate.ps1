# Regulatory gate orchestrator: runs validators and writes tests/regulatory/evidence.
param(
    [switch]$SkipTauriBuild
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$OutputEncoding = [System.Text.UTF8Encoding]::new()

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$EvidenceDir = Join-Path $Root "tests\regulatory\evidence"
$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$Results = @()
$Failed = $false

New-Item -ItemType Directory -Force -Path $EvidenceDir | Out-Null
$env:CUMPLEFACTURA_GATE_RUN_ID = $Timestamp

function Get-CommandPath {
    param([string]$Name)
    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if (-not $command) {
        throw "Command not found: $Name"
    }
    return $command.Source
}

function Invoke-GateStep {
    param(
        [string]$Name,
        [string]$WorkingDirectory,
        [string]$Command,
        [string[]]$Arguments
    )

    $started = Get-Date
    $logPath = Join-Path $EvidenceDir "$Timestamp-$Name.log"
    $exitCode = 0

    Push-Location $WorkingDirectory
    try {
        Write-Host "==> $Name"
        $previousErrorActionPreference = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        $output = & $Command @Arguments 2>&1 | ForEach-Object { $_.ToString() }
        $exitCode = $LASTEXITCODE
        $ErrorActionPreference = $previousErrorActionPreference
        if ($null -eq $exitCode) {
            $exitCode = 0
        }
        $output | Tee-Object -FilePath $logPath
    }
    catch {
        $ErrorActionPreference = "Stop"
        $_ | Out-File -FilePath $logPath -Append -Encoding utf8
        $exitCode = 1
    }
    finally {
        Pop-Location
    }

    $ended = Get-Date
    $status = if ($exitCode -eq 0) { "passed" } else { "failed" }
    if ($exitCode -ne 0) {
        $script:Failed = $true
    }

    $script:Results += [pscustomobject]@{
        name = $Name
        status = $status
        exit_code = $exitCode
        started_at = $started.ToString("o")
        ended_at = $ended.ToString("o")
        duration_seconds = [math]::Round(($ended - $started).TotalSeconds, 3)
        working_directory = $WorkingDirectory
        command = "$Command $($Arguments -join ' ')"
        log_path = $logPath
    }
}

$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
$Cargo = Get-CommandPath "cargo.exe"
$Npm = Get-CommandPath "npm.cmd"

Invoke-GateStep `
    -Name "cargo_fmt_check" `
    -WorkingDirectory (Join-Path $Root "src-tauri") `
    -Command $Cargo `
    -Arguments @("fmt", "--verbose", "--all", "--check")

Invoke-GateStep `
    -Name "cargo_test" `
    -WorkingDirectory (Join-Path $Root "src-tauri") `
    -Command $Cargo `
    -Arguments @("test")

Invoke-GateStep `
    -Name "npm_build" `
    -WorkingDirectory $Root `
    -Command $Npm `
    -Arguments @("run", "build")

Invoke-GateStep `
    -Name "ui_contract" `
    -WorkingDirectory $Root `
    -Command $Npm `
    -Arguments @("run", "validate:ui-contract")

Invoke-GateStep `
    -Name "core_e2e" `
    -WorkingDirectory $Root `
    -Command $Npm `
    -Arguments @("run", "validate:core-e2e")

Invoke-GateStep `
    -Name "browser_smoke" `
    -WorkingDirectory $Root `
    -Command $Npm `
    -Arguments @("run", "validate:browser-smoke")

Invoke-GateStep `
    -Name "secret_scan" `
    -WorkingDirectory $Root `
    -Command $Npm `
    -Arguments @("run", "validate:secret-scan")

Invoke-GateStep `
    -Name "external_acceptance" `
    -WorkingDirectory $Root `
    -Command $Npm `
    -Arguments @("run", "validate:external-acceptance")

Invoke-GateStep `
    -Name "contapro_sidecar_import" `
    -WorkingDirectory $Root `
    -Command $Npm `
    -Arguments @("run", "validate:contapro-sidecar-import")

Invoke-GateStep `
    -Name "evidence_matrix" `
    -WorkingDirectory $Root `
    -Command $Npm `
    -Arguments @("run", "validate:evidence-matrix")

Invoke-GateStep `
    -Name "verifactu_xsd_fixture" `
    -WorkingDirectory $Root `
    -Command $Npm `
    -Arguments @("run", "validate:verifactu:xsd")

if (-not $SkipTauriBuild) {
    Invoke-GateStep `
        -Name "tauri_build" `
        -WorkingDirectory $Root `
        -Command $Npm `
        -Arguments @("run", "tauri:build")

    $previousDesktopE2EReal = $env:CUMPLEFACTURA_TAURI_DESKTOP_E2E_REAL
    $env:CUMPLEFACTURA_TAURI_DESKTOP_E2E_REAL = "1"
    try {
        Invoke-GateStep `
            -Name "tauri_desktop_e2e" `
            -WorkingDirectory $Root `
            -Command $Npm `
            -Arguments @("run", "validate:tauri-desktop-e2e")
    }
    finally {
        $env:CUMPLEFACTURA_TAURI_DESKTOP_E2E_REAL = $previousDesktopE2EReal
    }
}

Invoke-GateStep `
    -Name "external_readiness" `
    -WorkingDirectory $Root `
    -Command $Npm `
    -Arguments @("run", "validate:external-readiness")

Invoke-GateStep `
    -Name "evidence_ledger" `
    -WorkingDirectory $Root `
    -Command $Npm `
    -Arguments @("run", "validate:evidence-ledger")

$summary = [pscustomobject]@{
    app = "CumpleFactura"
    generated_at = (Get-Date).ToString("o")
    source_workspace = "C:\03 LEGISLACION"
    app_workspace = $Root
    gate_status = if ($Failed) { "failed" } else { "passed" }
    steps = $Results
    live_limits = @(
        "XAdES signature generation is available only through local sidecar /verifactu/sign-xml with HMAC, explicit CumpleFactura flag and sidecar real-XAdES mode.",
        "Gate validates the CumpleFactura HTTP boundary with a local fake sidecar; certificate-backed real XAdES remains covered by the sidecar gate and runtime preflight.",
        "No AEAT network transmission is performed by the gate.",
        "XAdES sidecar preflight checks exact XML hash, local /verifactu/sign-xml endpoint, vault ref and runtime flag before signing.",
        "AEAT transport preflight checks WSDL endpoint allowlist, XML hash, XAdES status and runtime flag only.",
        "VERI*FACTU submit sidecar preflight checks local /verifactu/submit-preflight with HMAC, WSDL, vault and flags; it sends no raw XML and performs no SOAP call.",
        "VERI*FACTU invoke-submit boundary sends signed XML only to local /verifactu/invoke-submit; gate uses a fake sidecar and does not prove AEAT acceptance.",
        "Core E2E gate exercises real Rust domain/db/services with in-memory SQLite, XSD-valid XML, PDF and prepared export; it does not use certificates or external AEAT.",
        "Evidence matrix gate checks that each product promise has source, executable evidence and a live limit; it does not prove legal sufficiency.",
        "Evidence ledger hashes local normative sources, repo artifacts, generated evidence and gate logs; it is traceability evidence, not certification.",
        "Secret scan runs locally before ledger and records only redacted rule/path findings.",
        "External acceptance evidence intake validates a supplied redacted manifest and hashes referenced artifacts; by default it records not_provided.",
        "ContaPro sidecar import reads local redacted readiness evidence for VERI*FACTU, SII, FACe and TicketBAI without importing secrets or performing network calls.",
        "External readiness audit checks desktop E2E prerequisites and reports blockers for missing vault, certificate flags and acceptance evidence; blocked is safe and expected until supplied.",
        "Browser smoke gate uses a local Tauri invoke mock; it proves rendered workflow and visible limits, not Rust command execution or AEAT acceptance.",
        "Tauri desktop E2E verifier records preflight mode by default; the regulatory gate enables real WebDriver mode with CUMPLEFACTURA_TAURI_DESKTOP_E2E_REAL=1.",
        "R1-R5/I-S assistant maps declared scenarios only; it is not legal advice."
    )
}

$jsonPath = Join-Path $EvidenceDir "latest-regulatory-gate.json"
$mdPath = Join-Path $EvidenceDir "latest-regulatory-gate.md"
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText($jsonPath, ($summary | ConvertTo-Json -Depth 6), $utf8NoBom)

$md = @()
$md += "# CumpleFactura regulatory gate"
$md += ""
$md += "- Generated: $($summary.generated_at)"
$md += "- Status: $($summary.gate_status)"
$md += "- App: ``$Root``"
$md += "- Source workspace: ``C:\03 LEGISLACION``"
$md += ""
$md += "## Steps"
$md += ""
$md += "| Step | Status | Seconds | Log |"
$md += "|---|---:|---:|---|"
foreach ($step in $Results) {
    $stepName = $step.name
    $stepLog = $step.log_path
    $md += "| ``$stepName`` | $($step.status) | $($step.duration_seconds) | ``$stepLog`` |"
}
$md += ""
$md += "## Live limits"
$md += ""
foreach ($limit in $summary.live_limits) {
    $md += "- $limit"
}
[System.IO.File]::WriteAllText($mdPath, ($md -join [Environment]::NewLine), $utf8NoBom)

Write-Host "Regulatory gate evidence:"
Write-Host $jsonPath
Write-Host $mdPath

if ($Failed) {
    exit 1
}
