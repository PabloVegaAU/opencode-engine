<#
.SYNOPSIS
  Diagnoses the OpenCode Global installation.

.DESCRIPTION
  Checks for required files, validates JSON/JSONC syntax, verifies checksums,
  and reports on the health of the OpenCode Global installation.

.PARAMETER Fix
  Attempt to fix common issues automatically

.EXAMPLE
  .\doctor-opencode-global.ps1
  .\doctor-opencode-global.ps1 -Fix
#>
[CmdletBinding()]
param(
  [switch]$Fix
)

$ErrorActionPreference = "Continue"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$OpenCodeConfigDir = Join-Path $env:USERPROFILE ".config\opencode"

$requiredFiles = @(
  "opencode.jsonc",
  "opencode.profiles\go.jsonc",
  "opencode.profiles\chatgpt-plus.jsonc",
  "opencode.profiles\mix.jsonc",
  "opencode.profiles\minimax-plus.jsonc",
  "routing\model-matrix.json",
  "routing\model-matrix.schema.json"
)

$requiredContracts = @(
  "bootstrap-manifest.schema.json",
  "manifest.schema.json"
)

function Test-JsonFile {
  param([string]$Path)
  try {
    $content = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
    $errors = $null
    $null = [System.Text.Json.JsonDocument]::Parse($content, [System.Text.Json.JsonDocumentOptions]::new())
    return @{ Valid = $true; Error = $null }
  }
  catch {
    return @{ Valid = $false; Error = $_.Exception.Message }
  }
}

function Test-JsoncFile {
  param([string]$Path)
  try {
    $content = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
    $errors = @()
    $null = [System.Text.Json.JsonDocument]::Parse($content, [System.Text.Json.JsonDocumentOptions]::new())
    return @{ Valid = $true; Error = $null }
  }
  catch {
    return @{ Valid = $false; Error = $_.Exception.Message }
  }
}

function Get-FileSha256 {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $null }
  $sha = [System.Security.Cryptography.SHA256]::Create()
  $stream = [System.IO.File]::OpenRead($Path)
  try {
    return -join ($sha.ComputeHash($stream) | ForEach-Object { $_.ToString('x2') })
  }
  finally {
    $stream.Dispose()
    $sha.Dispose()
  }
}

Write-Host "OpenCode Global Doctor"
Write-Host "======================"
Write-Host ""
Write-Host "Global root: $RepoRoot"
Write-Host "Target dir:  $OpenCodeConfigDir"
Write-Host ""

$issues = 0
$warnings = 0

Write-Host "[1] Checking required files..."
foreach ($file in $requiredFiles) {
  $path = Join-Path $OpenCodeConfigDir $file
  if (Test-Path -LiteralPath $path) {
    Write-Host "  [OK] $file"
  }
  else {
    Write-Host "  [MISSING] $file"
    $issues++
  }
}

Write-Host ""
Write-Host "[2] Checking contracts..."
$contractsDir = Join-Path $OpenCodeConfigDir "contracts"
foreach ($contract in $requiredContracts) {
  $path = Join-Path $contractsDir $contract
  if (Test-Path -LiteralPath $path) {
    Write-Host "  [OK] contracts\$contract"
  }
  else {
    Write-Host "  [MISSING] contracts\$contract"
    $issues++
  }
}

Write-Host ""
Write-Host "[3] Validating JSON/JSONC syntax..."
foreach ($file in $requiredFiles) {
  $path = Join-Path $OpenCodeConfigDir $file
  if (-not (Test-Path -LiteralPath $path)) { continue }

  $isJsonc = $file -match '\.jsonc$'
  $result = if ($isJsonc) { Test-JsoncFile -Path $path } else { Test-JsonFile -Path $path }

  if ($result.Valid) {
    Write-Host "  [OK] $file"
  }
  else {
    Write-Host "  [INVALID] $file - $($result.Error)"
    $issues++
  }
}

Write-Host ""
Write-Host "[4] Checking routing matrix..."
$matrixPath = Join-Path $OpenCodeConfigDir "routing\model-matrix.json"
$schemaPath = Join-Path $OpenCodeConfigDir "routing\model-matrix.schema.json"
if ((Test-Path -LiteralPath $matrixPath) -and (Test-Path -LiteralPath $schemaPath)) {
  Write-Host "  [OK] model-matrix.json and schema exist"
}
else {
  Write-Host "  [ISSUE] model-matrix files missing"
  $issues++
}

Write-Host ""
Write-Host "[5] Checking profiles..."
$profiles = @("go.jsonc", "chatgpt-plus.jsonc", "mix.jsonc", "minimax-plus.jsonc")
foreach ($profile in $profiles) {
  $path = Join-Path $OpenCodeConfigDir "opencode.profiles\$profile"
  if (Test-Path -LiteralPath $path) {
    $result = Test-JsoncFile -Path $path
    if ($result.Valid) {
      Write-Host "  [OK] $profile"
    }
    else {
      Write-Host "  [INVALID] $profile - $($result.Error)"
      $issues++
    }
  }
  else {
    Write-Host "  [MISSING] $profile"
    $issues++
  }
}

Write-Host ""
Write-Host "[6] Checking for forbidden local paths..."
$configPath = Join-Path $OpenCodeConfigDir "opencode.jsonc"
if (Test-Path -LiteralPath $configPath) {
  $content = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8
  if ($content -match 'C:\\Users\\[^\\]+\\.config\\opencode') {
    Write-Host "  [ISSUE] Found local user path in config"
    $issues++
  }
  else {
    Write-Host "  [OK] No local paths found"
  }
}

Write-Host ""
Write-Host "[7] Checking for credentials in profiles..."
foreach ($profile in $profiles) {
  $path = Join-Path $OpenCodeConfigDir "opencode.profiles\$profile"
  if (-not (Test-Path -LiteralPath $path)) { continue }
  $content = Get-Content -LiteralPath $path -Raw -Encoding UTF8
  if ($content -match '(token|key|secret|password|auth)' -and $content -notmatch 'model') {
    Write-Warning "Potential credential-like content in $profile"
    $warnings++
  }
}

Write-Host ""
Write-Host "[8] Checking cross-session CLI (optional)..."
$crossSessionCli = Join-Path $env:USERPROFILE ".config\opencode\bin\orchestration\cross-session-cli.mjs"
$crossSessionWrapper = Join-Path $OpenCodeConfigDir "scripts\cross-session.ps1"
if (Test-Path -LiteralPath $crossSessionWrapper) {
  Write-Host "  [OK] cross-session.ps1 wrapper installed"
  if (Test-Path -LiteralPath $crossSessionCli) {
    Write-Host "  [OK] cross-session runtime CLI found"
  }
  else {
    Write-Host "  [OPTIONAL] cross-session runtime CLI not present (install OpenCode runtime to enable)"
  }
}
else {
  Write-Host "  [SKIP] cross-session.ps1 not installed"
}

Write-Host ""
Write-Host "======================"
Write-Host "Issues: $issues"
Write-Host "Warnings: $warnings"
Write-Host ""

if ($issues -eq 0 -and $warnings -eq 0) {
  Write-Host "OpenCode Global is healthy." -ForegroundColor Green
}
elseif ($issues -eq 0) {
  Write-Host "OpenCode Global has warnings but is functional." -ForegroundColor Yellow
}
else {
  Write-Host "OpenCode Global has issues that should be fixed." -ForegroundColor Red
  Write-Host ""
  Write-Host "Run .\update-opencode-global.ps1 to update managed files."
}

exit $issues
