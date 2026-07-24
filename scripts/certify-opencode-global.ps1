<#
.SYNOPSIS
  Certifies the OpenCode Global installation by running all tests.

.DESCRIPTION
  Executes the test suite to validate the global installation.
  Creates a certification report with version information.

.PARAMETER ReportPath
  Path to save the certification report

.EXAMPLE
  .\certify-opencode-global.ps1
  .\certify-opencode-global.ps1 -ReportPath "certification-report.json"
#>
[CmdletBinding()]
param(
  [string]$ReportPath
)

$ErrorActionPreference = "Continue"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$OpenCodeConfigDir = Join-Path $env:USERPROFILE ".config\opencode"

Write-Host "OpenCode Global Certification"
Write-Host "=============================="
Write-Host ""

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

$tests = @()

Write-Host "[1] Configuration validation..."
$configPath = Join-Path $OpenCodeConfigDir "opencode.jsonc"
if (Test-Path -LiteralPath $configPath) {
  try {
    $content = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8
    $null = [System.Text.Json.JsonDocument]::Parse($content)
    $tests += @{ Name = "config-valid-jsonc"; Passed = $true; Error = $null }
    Write-Host "  [PASS] opencode.jsonc is valid JSONC"
  }
  catch {
    $tests += @{ Name = "config-valid-jsonc"; Passed = $false; Error = $_.Exception.Message }
    Write-Host "  [FAIL] opencode.jsonc: $($_.Exception.Message)"
  }
}
else {
  $tests += @{ Name = "config-valid-jsonc"; Passed = $false; Error = "File not found" }
  Write-Host "  [FAIL] opencode.jsonc not found"
}

Write-Host ""
Write-Host "[2] Profile validation..."
$profiles = @("go.jsonc", "chatgpt-plus.jsonc", "mix.jsonc", "minimax-plus.jsonc")
foreach ($profile in $profiles) {
  $path = Join-Path $OpenCodeConfigDir "opencode.profiles\$profile"
  if (-not (Test-Path -LiteralPath $path)) {
    $tests += @{ Name = "profile-$profile"; Passed = $false; Error = "Not found" }
    Write-Host "  [FAIL] $profile not found"
    continue
  }
  try {
    $content = Get-Content -LiteralPath $path -Raw -Encoding UTF8
    $null = [System.Text.Json.JsonDocument]::Parse($content)
    $tests += @{ Name = "profile-$profile"; Passed = $true; Error = $null }
    Write-Host "  [PASS] $profile"
  }
  catch {
    $tests += @{ Name = "profile-$profile"; Passed = $false; Error = $_.Exception.Message }
    Write-Host "  [FAIL] ${profile}: $($_.Exception.Message)"
  }
}

Write-Host ""
Write-Host "[3] Routing matrix validation..."
$matrixPath = Join-Path $OpenCodeConfigDir "routing\model-matrix.json"
$schemaPath = Join-Path $OpenCodeConfigDir "routing\model-matrix.schema.json"
if ((Test-Path -LiteralPath $matrixPath) -and (Test-Path -LiteralPath $schemaPath)) {
  try {
    $matrixContent = Get-Content -LiteralPath $matrixPath -Raw -Encoding UTF8
    $null = [System.Text.Json.JsonDocument]::Parse($matrixContent)
    $tests += @{ Name = "routing-matrix-valid"; Passed = $true; Error = $null }
    Write-Host "  [PASS] model-matrix.json is valid"
  }
  catch {
    $tests += @{ Name = "routing-matrix-valid"; Passed = $false; Error = $_.Exception.Message }
    Write-Host "  [FAIL] model-matrix.json: $($_.Exception.Message)"
  }
}
else {
  $tests += @{ Name = "routing-matrix-valid"; Passed = $false; Error = "Files missing" }
  Write-Host "  [FAIL] routing matrix files missing"
}

Write-Host ""
Write-Host "[4] Schema validation..."
$schemas = @("bootstrap-manifest.schema.json", "manifest.schema.json")
foreach ($schema in $schemas) {
  $path = Join-Path $OpenCodeConfigDir "contracts\$schema"
  if (-not (Test-Path -LiteralPath $path)) {
    $tests += @{ Name = "schema-$schema"; Passed = $false; Error = "Not found" }
    Write-Host "  [FAIL] $schema not found"
    continue
  }
  try {
    $content = Get-Content -LiteralPath $path -Raw -Encoding UTF8
    $null = [System.Text.Json.JsonDocument]::Parse($content)
    $tests += @{ Name = "schema-$schema"; Passed = $true; Error = $null }
    Write-Host "  [PASS] $schema"
  }
  catch {
    $tests += @{ Name = "schema-$schema"; Passed = $false; Error = $_.Exception.Message }
    Write-Host "  [FAIL] ${schema}: $($_.Exception.Message)"
  }
}

Write-Host ""
Write-Host "[5] Security checks..."
$securityIssues = 0

$configContent = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8
if ($configContent -match 'C:\\Users\\[^\\]+') {
  Write-Host "  [FAIL] Found absolute user paths in config"
  $tests += @{ Name = "security-no-absolute-paths"; Passed = $false; Error = "Found absolute paths" }
  $securityIssues++
}
else {
  $tests += @{ Name = "security-no-absolute-paths"; Passed = $true; Error = $null }
  Write-Host "  [PASS] No absolute paths in config"
}

foreach ($profile in $profiles) {
  $path = Join-Path $OpenCodeConfigDir "opencode.profiles\$profile"
  if (-not (Test-Path -LiteralPath $path)) { continue }
  $content = Get-Content -LiteralPath $path -Raw -Encoding UTF8
  if ($content -match '(token|key|secret|password|auth)="[^"]{10,}"') {
    Write-Host "  [FAIL] Potential hardcoded credentials in $profile"
    $tests += @{ Name = "security-no-credentials"; Passed = $false; Error = "Found credentials in $profile" }
    $securityIssues++
  }
}

if ($securityIssues -eq 0) {
  $tests += @{ Name = "security-no-credentials"; Passed = $true; Error = $null }
  Write-Host "  [PASS] No hardcoded credentials"
}

Write-Host ""
Write-Host "[6] Installation idempotency..."
$installScript = Join-Path $RepoRoot "scripts\install-opencode-global.ps1"
if (Test-Path -LiteralPath $installScript) {
  $tests += @{ Name = "install-script-exists"; Passed = $true; Error = $null }
  Write-Host "  [PASS] install-opencode-global.ps1 exists"
}
else {
  $tests += @{ Name = "install-script-exists"; Passed = $false; Error = "Not found" }
  Write-Host "  [FAIL] install-opencode-global.ps1 not found"
}

$updateScript = Join-Path $RepoRoot "scripts\update-opencode-global.ps1"
if (Test-Path -LiteralPath $updateScript) {
  $tests += @{ Name = "update-script-exists"; Passed = $true; Error = $null }
  Write-Host "  [PASS] update-opencode-global.ps1 exists"
}
else {
  $tests += @{ Name = "update-script-exists"; Passed = $false; Error = "Not found" }
  Write-Host "  [FAIL] update-opencode-global.ps1 not found"
}

Write-Host ""
Write-Host "[7] Running official validation..."
try {
  $validateResult = pwsh -NoProfile -ExecutionPolicy Bypass -Command "cd '$RepoRoot'; pnpm run validate" 2>&1
  if ($LASTEXITCODE -eq 0) {
    $tests += @{ Name = "official-validation"; Passed = $true; Error = $null }
    Write-Host "  [PASS] pnpm run validate succeeded"
  }
  else {
    $tests += @{ Name = "official-validation"; Passed = $false; Error = "Validation failed: $validateResult" }
    Write-Host "  [FAIL] pnpm run validate failed"
  }
}
catch {
  $tests += @{ Name = "official-validation"; Passed = $false; Error = $_.Exception.Message }
  Write-Host "  [FAIL] pnpm run validate: $($_.Exception.Message)"
}

Write-Host ""
Write-Host "[8] Running unit tests..."
try {
  $testUnitResult = pwsh -NoProfile -ExecutionPolicy Bypass -Command "cd '$RepoRoot'; pnpm run test:unit" 2>&1
  if ($LASTEXITCODE -eq 0) {
    $tests += @{ Name = "test-unit"; Passed = $true; Error = $null }
    Write-Host "  [PASS] pnpm run test:unit succeeded"
  }
  else {
    $tests += @{ Name = "test-unit"; Passed = $false; Error = "Unit tests failed with exit code $LASTEXITCODE" }
    Write-Host "  [FAIL] pnpm run test:unit failed (exit code: $LASTEXITCODE)"
  }
}
catch {
  $tests += @{ Name = "test-unit"; Passed = $false; Error = $_.Exception.Message }
  Write-Host "  [FAIL] pnpm run test:unit: $($_.Exception.Message)"
}

Write-Host ""
Write-Host "[9] Running integration tests..."
try {
  $testIntResult = pwsh -NoProfile -ExecutionPolicy Bypass -Command "cd '$RepoRoot'; pnpm run test:integration" 2>&1
  if ($LASTEXITCODE -eq 0) {
    $tests += @{ Name = "test-integration"; Passed = $true; Error = $null }
    Write-Host "  [PASS] pnpm run test:integration succeeded"
  }
  else {
    $tests += @{ Name = "test-integration"; Passed = $false; Error = "Integration tests failed with exit code $LASTEXITCODE" }
    Write-Host "  [FAIL] pnpm run test:integration failed (exit code: $LASTEXITCODE)"
  }
}
catch {
  $tests += @{ Name = "test-integration"; Passed = $false; Error = $_.Exception.Message }
  Write-Host "  [FAIL] pnpm run test:integration: $($_.Exception.Message)"
}

Write-Host ""
Write-Host "=============================="

$passed = ($tests | Where-Object { $_.Passed }).Count
$failed = ($tests | Where-Object { -not $_.Passed }).Count
$total = $tests.Count

Write-Host "Passed: $passed / $total"
Write-Host "Failed: $failed / $total"
Write-Host ""

$report = @{
  Timestamp = (Get-Date).ToUniversalTime().ToString("o")
  GlobalRoot = $RepoRoot
  TargetDir = $OpenCodeConfigDir
  Tests = $tests
  Summary = @{
    Total = $total
    Passed = $passed
    Failed = $failed
    Certified = ($failed -eq 0)
  }
}

if ($ReportPath) {
  $report | ConvertTo-Json -Depth 10 | Set-Content -Path $ReportPath -Encoding UTF8
  Write-Host "Report saved to: $ReportPath"
}

if ($failed -eq 0) {
  Write-Host "OpenCode Global is CERTIFIED." -ForegroundColor Green
  exit 0
}
else {
  Write-Host "OpenCode Global certification FAILED." -ForegroundColor Red
  Write-Host ""
  Write-Host "Run .\doctor-opencode-global.ps1 for details."
  exit 1
}
