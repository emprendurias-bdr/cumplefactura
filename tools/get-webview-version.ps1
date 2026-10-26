$ErrorActionPreference = 'SilentlyContinue'
# Read public runtime metadata only. Respect an explicit WebView2 runtime folder.
if ($env:WEBVIEW2_BROWSER_EXECUTABLE_FOLDER) {
    $exe = Join-Path $env:WEBVIEW2_BROWSER_EXECUTABLE_FOLDER 'msedgewebview2.exe'
    $version = (Get-Item $exe).VersionInfo.FileVersion
    if ($version -match '^\d+\.\d+\.\d+\.\d+$') { Write-Output $version; exit 0 }
}
$guid = '{F3017226-FE2A-4295-8BDF-00CDE69A3F23}'
$roots = @(
    "HKCU:\SOFTWARE\Microsoft\EdgeUpdate\Clients\$guid",
    "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\$guid",
    "HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\$guid"
)
foreach ($root in $roots) {
    $version = (Get-ItemProperty $root -Name pv).pv
    if ($version -match '^\d+\.\d+\.\d+\.\d+$' -and [version]$version -gt [version]'0.0.0.0') {
        Write-Output $version; exit 0
    }
}
$paths = @(
    "${env:ProgramFiles(x86)}\Microsoft\EdgeWebView\Application\*\msedgewebview2.exe",
    "$env:ProgramFiles\Microsoft\EdgeWebView\Application\*\msedgewebview2.exe",
    "$env:LOCALAPPDATA\Microsoft\EdgeWebView\Application\*\msedgewebview2.exe"
)
$versions = @(Get-Item $paths | ForEach-Object { $_.VersionInfo.FileVersion } | Where-Object { $_ -match '^\d+\.\d+\.\d+\.\d+$' } | Sort-Object { [version]$_ } -Descending)
if ($versions.Count -gt 0) { Write-Output $versions[0] }
