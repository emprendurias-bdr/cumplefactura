# Validates an XML file against local VERI*FACTU XSD (System.Xml.Schema).
param(
    [Parameter(Mandatory = $true)]
    [string]$XmlPath,

    [string]$SchemaDir = "",

    [string]$RootSchema = "SuministroLR.xsd"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if ([string]::IsNullOrWhiteSpace($SchemaDir)) {
    $SchemaDir = Join-Path $scriptDir "..\src-tauri\resources\xsd\verifactu"
}

function Resolve-RequiredPath([string]$Path, [string]$Label) {
    $item = Get-Item -LiteralPath $Path -ErrorAction SilentlyContinue
    if (-not $item) {
        throw "$Label not found: $Path"
    }
    $fullPath = if ([string]::IsNullOrWhiteSpace($item.FullName)) { $Path } else { $item.FullName }
    if ($fullPath.StartsWith("\\?\")) {
        $fullPath = $fullPath.Substring(4)
    }
    return $fullPath
}

$xmlFullPath = Resolve-RequiredPath $XmlPath "XML"
$schemaDirFullPath = Resolve-RequiredPath $SchemaDir "Schema directory"
$schemaFullPath = Resolve-RequiredPath (Join-Path $schemaDirFullPath $RootSchema) "Root schema"

$messages = [System.Collections.Generic.List[string]]::new()
$handler = [System.Xml.Schema.ValidationEventHandler]{
    param($sender, $eventArgs)
    $ex = $eventArgs.Exception
    $messages.Add(("{0}: line {1}, pos {2}: {3}" -f $eventArgs.Severity, $ex.LineNumber, $ex.LinePosition, $eventArgs.Message))
}

$schemaReaderSettings = [System.Xml.XmlReaderSettings]::new()
$schemaReaderSettings.DtdProcessing = [System.Xml.DtdProcessing]::Prohibit
$schemaReaderSettings.XmlResolver = [System.Xml.XmlUrlResolver]::new()

$schemas = [System.Xml.Schema.XmlSchemaSet]::new()
$schemas.XmlResolver = [System.Xml.XmlUrlResolver]::new()
$schemas.Add("https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR.xsd", [System.Xml.XmlReader]::Create($schemaFullPath, $schemaReaderSettings)) | Out-Null
$schemas.add_ValidationEventHandler($handler)
$schemas.Compile()

$readerSettings = [System.Xml.XmlReaderSettings]::new()
$readerSettings.ValidationType = [System.Xml.ValidationType]::Schema
$readerSettings.Schemas = $schemas
$readerSettings.DtdProcessing = [System.Xml.DtdProcessing]::Prohibit
$readerSettings.ValidationFlags = [System.Xml.Schema.XmlSchemaValidationFlags]::ReportValidationWarnings
$readerSettings.add_ValidationEventHandler($handler)

$reader = $null
try {
    $reader = [System.Xml.XmlReader]::Create($xmlFullPath, $readerSettings)
    while ($reader.Read()) { }
}
finally {
    if ($reader) {
        $reader.Close()
    }
}

if ($messages.Count -gt 0) {
    Write-Host "VERIFACTU XSD validation failed" -ForegroundColor Red
    foreach ($message in $messages) {
        Write-Host "- $message" -ForegroundColor Red
    }
    exit 1
}

Write-Host "VERIFACTU XSD validation OK: $xmlFullPath"




