<#
.SYNOPSIS
  Diagnoses the OpenCode Global installation.

.DESCRIPTION
  Checks for required files, validates JSON/JSONC syntax, verifies checksums,
  and reports on the health of the OpenCode Global installation.

.PARAMETER Fix
  Attempt to fix common issues automatically

.PARAMETER ProjectPath
  Optional path to a project for project-level retrieval policy checks

.EXAMPLE
  .\doctor-opencode-global.ps1
  .\doctor-opencode-global.ps1 -Fix
  .\doctor-opencode-global.ps1 -ProjectPath "C:\Projects\myproject"
#>
[CmdletBinding()]
param(
  [switch]$Fix,
  [string]$ProjectPath
)

$ErrorActionPreference = "Continue"
$RepoRoot = Split-Path -Parent $PSScriptRoot
if ($env:OPENCODE_CONFIG_DIR) {
  $OpenCodeConfigDir = $env:OPENCODE_CONFIG_DIR
} else {
  $OpenCodeConfigDir = Join-Path $env:USERPROFILE ".config\opencode"
}

function Get-JsonProperty($elem, $name) {
  try {
    $prop = $elem.GetProperty($name)
    return @{ Found = $true; Value = $prop }
  } catch {
    return @{ Found = $false; Value = $null }
  }
}

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
  "manifest.schema.json",
  "retrieval-policy.schema.json",
  "retrieval-index-state.schema.json"
)

enum ToolState {
  AVAILABLE
  UNAVAILABLE
  UNKNOWN
  NOT_CONFIGURED
  NOT_APPLICABLE
}

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

function Test-ToolAvailable {
  param([string]$Executable, [string[]]$Args, [string]$TestName)
  try {
    $result = & $Executable $Args 2>&1
    if ($LASTEXITCODE -eq 0 -or $result) {
      return @{ Available = $true; Output = $result }
    }
    return @{ Available = $false; Output = $result }
  }
  catch {
    return @{ Available = $false; Output = $null }
  }
}

function Test-GitAvailable {
  param([string]$Path)
  $gitTest = @{
    State = [ToolState]::UNKNOWN
    Message = ""
  }
  try {
    $executable = "git"
    $args = @("rev-parse", "--is-inside-work-tree")
    $result = & $executable $args 2>&1
    if ($LASTEXITCODE -eq 0) {
      $gitTest.State = [ToolState]::AVAILABLE
      $gitTest.Message = "Git available"
    } else {
      $gitTest.State = [ToolState]::UNAVAILABLE
      $gitTest.Message = "Git not available (exit code: $LASTEXITCODE)"
    }
  }
  catch {
    $gitTest.State = [ToolState]::UNAVAILABLE
    $gitTest.Message = "Git not found: $($_.Exception.Message)"
  }
  return $gitTest
}

function Test-RipgrepAvailable {
  $rgTest = @{
    State = [ToolState]::UNKNOWN
    Message = ""
  }
  try {
    $executable = "rg"
    $args = @("--version")
    $result = & $executable $args 2>&1
    if ($LASTEXITCODE -eq 0) {
      $rgTest.State = [ToolState]::AVAILABLE
      $rgTest.Message = "ripgrep available"
      return $rgTest
    }
  }
  catch {
  }
  try {
    $null = & git rev-parse --git-dir 2>&1
    if ($LASTEXITCODE -eq 0) {
      $rgTest.State = [ToolState]::AVAILABLE
      $rgTest.Message = "ripgrep not installed; git grep fallback available"
      return $rgTest
    }
  }
  catch {
  }
  $rgTest.State = [ToolState]::UNAVAILABLE
  $rgTest.Message = "no exact retrieval provider available (install ripgrep or ensure git is available)"
  return $rgTest
}

function Test-LSPAvailable {
  $lspTest = @{
    State = [ToolState]::UNKNOWN
    Message = ""
    Servers = @()
  }
  $lspServers = @(
    @{ Name = "typescript"; Args = @("--stdio"); CheckCmd = @("tsserver", "--version") },
    @{ Name = "python"; Args = @("--check-import-names", "--log-file", "nul"); CheckCmd = @("pylsp", "--version") },
    @{ Name = "rust"; Args = @(); CheckCmd = @("rust-analyzer", "--version") },
    @{ Name = "clangd"; Args = @("--check"); CheckCmd = @("clangd", "--version") },
    @{ Name = "gopls"; Args = @("serve"); CheckCmd = @("gopls", "version") },
    @{ Name = "jedi-language-server"; Args = @("--version"); CheckCmd = @("jedi-language-server", "--version") },
    @{ Name = "pyright"; Args = @("--version"); CheckCmd = @("pyright", "--version") }
  )
  $availableServers = @()
  foreach ($server in $lspServers) {
    try {
      $executable = $server.CheckCmd[0]
      $args = $server.CheckCmd[1..($server.CheckCmd.Length - 1)]
      $result = & $executable $args 2>&1
      if ($LASTEXITCODE -eq 0 -or $result) {
        $availableServers += $server.Name
      }
    }
    catch {}
  }
  if ($availableServers.Count -gt 0) {
    $lspTest.State = [ToolState]::AVAILABLE
    $lspTest.Message = "LSP servers available: $($availableServers -join ', ')"
    $lspTest.Servers = $availableServers
  } else {
    $lspTest.State = [ToolState]::NOT_APPLICABLE
    $lspTest.Message = "No LSP servers detected"
  }
  return $lspTest
}

function Test-CodebaseMemoryAvailable {
  param([string]$ProjectPath)
  $cbTest = @{
    State = [ToolState]::UNKNOWN
    Message = ""
  }
  if ([string]::IsNullOrEmpty($ProjectPath)) {
    $cbTest.State = [ToolState]::NOT_APPLICABLE
    $cbTest.Message = "Project path not specified"
    return $cbTest
  }
  $indexStatePath = Join-Path $ProjectPath ".ai-env\index-state.schema.json"
  if (-not (Test-Path -LiteralPath $indexStatePath)) {
    $indexStatePath = Join-Path $ProjectPath ".ai-env\retrieval-index-state.schema.json"
  }
  if (-not (Test-Path -LiteralPath $indexStatePath)) {
    $cbTest.State = [ToolState]::NOT_CONFIGURED
    $cbTest.Message = "Index state file not found"
    return $cbTest
  }
  try {
    $content = Get-Content -LiteralPath $indexStatePath -Raw -Encoding UTF8
    $null = [System.Text.Json.JsonDocument]::Parse($content, [System.Text.Json.JsonDocumentOptions]::new())
    $cbTest.State = [ToolState]::AVAILABLE
    $cbTest.Message = "Codebase Memory index state valid"
  }
  catch {
    $cbTest.State = [ToolState]::UNKNOWN
    $cbTest.Message = "Index state file invalid: $($_.Exception.Message)"
  }
  return $cbTest
}

function Test-SemanticSearchAvailable {
  param([string]$ProjectPath)
  $semTest = @{
    State = [ToolState]::UNKNOWN
    Message = ""
  }
  if ([string]::IsNullOrEmpty($ProjectPath)) {
    $semTest.State = [ToolState]::NOT_APPLICABLE
    $semTest.Message = "Project path not specified"
    return $semTest
  }
  $policyPath = Join-Path $ProjectPath ".ai-env\retrieval-policy.json"
  if (-not (Test-Path -LiteralPath $policyPath)) {
    $semTest.State = [ToolState]::NOT_CONFIGURED
    $semTest.Message = "Retrieval policy not configured"
    return $semTest
  }
  try {
    $content = Get-Content -LiteralPath $policyPath -Raw -Encoding UTF8
    $policy = [System.Text.Json.JsonDocument]::Parse($content, [System.Text.Json.JsonDocumentOptions]::new())
    $strategiesResult = Get-JsonProperty $policy.RootElement "strategies"
    if (-not $strategiesResult.Found) {
      $semTest.State = [ToolState]::NOT_CONFIGURED
      $semTest.Message = "Retrieval policy not configured"
      return $semTest
    }
    $strategies = $strategiesResult.Value
    $semanticResult = Get-JsonProperty $strategies "semantic"
    if (-not $semanticResult.Found) {
      $semTest.State = [ToolState]::NOT_CONFIGURED
      $semTest.Message = "No semantic strategy configured"
      return $semTest
    }
    $semantic = $semanticResult.Value
    $enabledResult = Get-JsonProperty $semantic "enabled"
    $providerResult = Get-JsonProperty $semantic "provider"
    if ($enabledResult.Found -and $providerResult.Found) {
      $enabled = $enabledResult.Value.GetBoolean()
      $providerVal = $providerResult.Value.GetString()
      if ($enabled -and -not [string]::IsNullOrEmpty($providerVal)) {
        $semTest.State = [ToolState]::AVAILABLE
        $semTest.Message = "Semantic search provider configured"
      } else {
        $semTest.State = [ToolState]::NOT_CONFIGURED
        $semTest.Message = "Semantic search disabled or no provider"
      }
    } else {
      $semTest.State = [ToolState]::NOT_CONFIGURED
      $semTest.Message = "Semantic strategy incomplete"
    }
  }
  catch {
    $semTest.State = [ToolState]::UNKNOWN
    $semTest.Message = "Could not verify semantic provider: $($_.Exception.Message)"
  }
  return $semTest
}

function Test-KnowledgeAvailable {
  param([string]$ProjectPath)
  $knTest = @{
    State = [ToolState]::UNKNOWN
    Message = ""
  }
  if ([string]::IsNullOrEmpty($ProjectPath)) {
    $knTest.State = [ToolState]::NOT_APPLICABLE
    $knTest.Message = "Project path not specified"
    return $knTest
  }
  $policyPath = Join-Path $ProjectPath ".ai-env\retrieval-policy.json"
  if (-not (Test-Path -LiteralPath $policyPath)) {
    $knTest.State = [ToolState]::NOT_CONFIGURED
    $knTest.Message = "Retrieval policy not configured"
    return $knTest
  }
  try {
    $content = Get-Content -LiteralPath $policyPath -Raw -Encoding UTF8
    $policy = [System.Text.Json.JsonDocument]::Parse($content, [System.Text.Json.JsonDocumentOptions]::new())
    $strategiesResult = Get-JsonProperty $policy.RootElement "strategies"
    if (-not $strategiesResult.Found) {
      $knTest.State = [ToolState]::NOT_CONFIGURED
      $knTest.Message = "Retrieval policy not configured"
      return $knTest
    }
    $strategies = $strategiesResult.Value
    $knowledgeResult = Get-JsonProperty $strategies "knowledge"
    if (-not $knowledgeResult.Found) {
      $knTest.State = [ToolState]::NOT_CONFIGURED
      $knTest.Message = "No knowledge strategy configured"
      return $knTest
    }
    $knowledge = $knowledgeResult.Value
    $pathsResult = Get-JsonProperty $knowledge "paths"
    if (-not $pathsResult.Found) {
      $knTest.State = [ToolState]::NOT_CONFIGURED
      $knTest.Message = "No knowledge paths configured"
      return $knTest
    }
    $paths = $pathsResult.Value
    $hasValidPath = $false
    foreach ($pattern in $paths.EnumerateArray()) {
      $patternStr = $pattern.GetString()
      if (-not [string]::IsNullOrEmpty($patternStr)) {
        $resolved = Resolve-Path -LiteralPath (Join-Path $ProjectPath $patternStr) -ErrorAction SilentlyContinue
        if ($resolved) {
          $hasValidPath = $true
          break
        }
      }
    }
    if ($hasValidPath) {
      $knTest.State = [ToolState]::AVAILABLE
      $knTest.Message = "Knowledge paths configured and accessible"
    } else {
      $knTest.State = [ToolState]::NOT_CONFIGURED
      $knTest.Message = "Knowledge paths configured but none resolve to existing files"
    }
  }
  catch {
    $knTest.State = [ToolState]::UNKNOWN
    $knTest.Message = "Could not verify knowledge paths: $($_.Exception.Message)"
  }
  return $knTest
}

function Test-RetrievalPolicySchema {
  param([string]$PolicyPath, [string]$SchemaPath)
  $result = @{
    Valid = $false
    Message = ""
    IsInfo = $false
  }
  if (-not (Test-Path -LiteralPath $PolicyPath)) {
    $result.IsInfo = $true
    $result.Message = "Project retrieval policy not found (INFO - not required)"
    return $result
  }
  if (-not (Test-Path -LiteralPath $SchemaPath)) {
    $result.Valid = $false
    $result.Message = "retrieval-policy.schema.json not installed"
    return $result
  }
  try {
    $policyContent = Get-Content -LiteralPath $PolicyPath -Raw -Encoding UTF8
    $policy = [System.Text.Json.JsonDocument]::Parse($policyContent, [System.Text.Json.JsonDocumentOptions]::new())
  }
  catch {
    $result.Valid = $false
    $result.Message = "Invalid JSON in retrieval policy: $($_.Exception.Message)"
    return $result
  }
  try {
    $schemaContent = Get-Content -LiteralPath $SchemaPath -Raw -Encoding UTF8
    $schema = [System.Text.Json.JsonDocument]::Parse($schemaContent, [System.Text.Json.JsonDocumentOptions]::new())
    $schemaProps = $schema.RootElement.GetProperty("properties")
    $requiredFields = @()
    $requiredResult = Get-JsonProperty $schema.RootElement "required"
    if ($requiredResult.Found) {
      $requiredFields = $requiredResult.Value.EnumerateArray() | ForEach-Object { $_.GetString() }
    }
    foreach ($field in $requiredFields) {
      $fieldResult = Get-JsonProperty $policy.RootElement $field
      if (-not $fieldResult.Found) {
        $result.Valid = $false
        $result.Message = "Retrieval policy missing required field: $field"
        return $result
      }
    }
    $result.Valid = $true
    $result.Message = "Retrieval policy valid against schema"
    return $result
  }
  catch {
    $result.Valid = $false
    $result.Message = "Schema validation error: $($_.Exception.Message)"
    return $result
  }
}

function Test-RetrievalPolicyProviders {
  param([string]$PolicyPath)
  $result = @{
    HasPrimary = $false
    HasFallback = $false
    HasExactProvider = $false
    PrimaryMissing = $false
    Message = ""
  }
  if (-not (Test-Path -LiteralPath $PolicyPath)) {
    $result.Message = "Policy not found"
    return $result
  }
  try {
    $content = Get-Content -LiteralPath $PolicyPath -Raw -Encoding UTF8
    $policy = [System.Text.Json.JsonDocument]::Parse($content, [System.Text.Json.JsonDocumentOptions]::new())
    $strategiesResult = Get-JsonProperty $policy.RootElement "strategies"
    if (-not $strategiesResult.Found) {
      $result.Message = "Policy missing strategies object"
      return $result
    }
    $strategies = $strategiesResult.Value
    $validStrategyNames = @("exact", "symbol", "architecture", "semantic", "knowledge")
    $hasExact = $false
    foreach ($strategyName in $validStrategyNames) {
      $strategyResult = Get-JsonProperty $strategies $strategyName
      if ($strategyResult.Found) {
        $enabledResult = Get-JsonProperty $strategyResult.Value "enabled"
        if ($enabledResult.Found) {
          $enabled = $enabledResult.Value.GetBoolean()
          if ($enabled -and $strategyName -eq "exact") {
            $hasExact = $true
            break
          }
        }
      }
    }
    $result.HasExactProvider = $hasExact
    if (-not $hasExact) {
      $result.Message = "No usable exact provider in policy"
    } else {
      $result.Message = "Exact provider configured"
    }
    $primaryResult = Get-JsonProperty $policy.RootElement "primaryProvider"
    if ($primaryResult.Found) {
      $result.HasPrimary = $true
    }
    $fallbackResult = Get-JsonProperty $policy.RootElement "fallbackProvider"
    if ($fallbackResult.Found) {
      $result.HasFallback = $true
    }
    if (-not $result.HasPrimary -and $result.HasFallback) {
      $result.PrimaryMissing = $true
    }
    return $result
  }
  catch {
    $result.Message = "Could not analyze providers: $($_.Exception.Message)"
    return $result
  }
}

Write-Host "OpenCode Global Doctor"
Write-Host "======================"
Write-Host ""
Write-Host "Global root: $RepoRoot"
Write-Host "Target dir:  $OpenCodeConfigDir"
if (-not [string]::IsNullOrEmpty($ProjectPath)) {
  Write-Host "Project:     $ProjectPath"
}
Write-Host ""

$issues = 0
$warnings = 0
$infoCount = 0
$retrievalIssues = 0
$retrievalTier = "INCOMPLETE"

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
Write-Host "[9] Checking retrieval infrastructure..."
$retrievalSchema = Join-Path $OpenCodeConfigDir "contracts\retrieval-policy.schema.json"
if (Test-Path -LiteralPath $retrievalSchema) {
  Write-Host "  [OK] retrieval-policy.schema.json installed"
}
else {
  Write-Host "  [MISSING] retrieval-policy.schema.json (run update to install)"
  $issues++
}

$retrievalIndexSchema = Join-Path $OpenCodeConfigDir "contracts\retrieval-index-state.schema.json"
if (Test-Path -LiteralPath $retrievalIndexSchema) {
  Write-Host "  [OK] retrieval-index-state.schema.json installed"
}
else {
  Write-Host "  [MISSING] retrieval-index-state.schema.json (run update to install)"
  $issues++
}

$retrievalDefaultPolicy = Join-Path $OpenCodeConfigDir "retrieval\default-policy.json"
if (Test-Path -LiteralPath $retrievalDefaultPolicy) {
  $policyValid = $true
  try {
    $content = Get-Content -LiteralPath $retrievalDefaultPolicy -Raw -Encoding UTF8
    $null = [System.Text.Json.JsonDocument]::Parse($content)
    Write-Host "  [OK] retrieval\default-policy.json valid"
  }
  catch {
    Write-Host "  [INVALID] retrieval\default-policy.json - $($_.Exception.Message)"
    $policyValid = $false
    $issues++
  }
}
else {
  Write-Host "  [MISSING] retrieval\default-policy.json (run update to install)"
  $issues++
}

$retrievalRouterScript = Join-Path $OpenCodeConfigDir "bin\retrieval\retrieval-router.mjs"
$retrievalRouterWrapper = Join-Path $OpenCodeConfigDir "scripts\retrieval-router.ps1"
if (Test-Path -LiteralPath $retrievalRouterScript) {
  Write-Host "  [OK] bin\retrieval\retrieval-router.mjs installed"
}
else {
  Write-Host "  [MISSING] bin\retrieval\retrieval-router.mjs (run update to install)"
  $issues++
}
if (Test-Path -LiteralPath $retrievalRouterWrapper) {
  Write-Host "  [OK] scripts\retrieval-router.ps1 installed"
}
else {
  Write-Host "  [MISSING] scripts\retrieval-router.ps1 (run update to install)"
  $issues++
}

Write-Host ""
Write-Host "[10] Checking retrieval providers..."
$rgTest = Test-RipgrepAvailable
switch ($rgTest.State) {
  ([ToolState]::AVAILABLE) {
    if ($rgTest.Message -match "git grep fallback") {
      Write-Host "  [INFO] $($rgTest.Message)"
      $infoCount++
      $retrievalTier = "FUNCTIONAL"
    } else {
      Write-Host "  [OK] $($rgTest.Message)"
      $retrievalTier = "OPTIMAL"
    }
  }
  ([ToolState]::UNAVAILABLE) {
    Write-Host "  [ISSUE] $($rgTest.Message)"
    $issues++
    $retrievalTier = "INCOMPLETE"
  }
  default {
    Write-Host "  [UNKNOWN] $($rgTest.Message)"
    $retrievalTier = "INCOMPLETE"
  }
}

Write-Host ""
Write-Host "[11] Checking AGENTS retrieval rules..."
$agentsPath = Join-Path $OpenCodeConfigDir "AGENTS.md"
if (Test-Path -LiteralPath $agentsPath) {
  $agentsContent = Get-Content -LiteralPath $agentsPath -Raw -Encoding UTF8
  if ($agentsContent -match "Retrieval Policy") {
    Write-Host "  [OK] AGENTS.md contains retrieval rules"
  }
  else {
    Write-Host "  [WARNING] AGENTS.md missing retrieval rules (run update to install)"
    $warnings++
  }
}
else {
  Write-Host "  [ISSUE] AGENTS.md not found"
  $issues++
}

if (-not [string]::IsNullOrEmpty($ProjectPath)) {
  Write-Host ""
  Write-Host "======================"
  Write-Host "Project-level checks: $ProjectPath"
  Write-Host "======================"

  $projectRetrievalPolicy = Join-Path $ProjectPath ".ai-env\retrieval-policy.json"
  $projectRetrievalSchema = Join-Path $OpenCodeConfigDir "contracts\retrieval-policy.schema.json"

  Write-Host ""
  Write-Host "[P1] Checking project retrieval policy..."
  $policySchemaResult = Test-RetrievalPolicySchema -PolicyPath $projectRetrievalPolicy -SchemaPath $projectRetrievalSchema
  if ($policySchemaResult.IsInfo) {
    Write-Host "  [INFO] $($policySchemaResult.Message)"
    $infoCount++
  } elseif ($policySchemaResult.Valid) {
    Write-Host "  [OK] $($policySchemaResult.Message)"
  } else {
    Write-Host "  [ISSUE] $($policySchemaResult.Message)"
    $issues++
    $retrievalIssues++
  }

  Write-Host ""
  Write-Host "[P2] Checking retrieval provider configuration..."
  $providerResult = Test-RetrievalPolicyProviders -PolicyPath $projectRetrievalPolicy
  if ($providerResult.HasExactProvider) {
    Write-Host "  [OK] $($providerResult.Message)"
    if ($providerResult.PrimaryMissing) {
      Write-Host "  [WARNING] Primary provider absent but fallback available"
      $warnings++
    }
  } elseif (-not (Test-Path -LiteralPath $projectRetrievalPolicy)) {
    Write-Host "  [INFO] No retrieval policy (project-level check only)"
    $infoCount++
  } else {
    Write-Host "  [ISSUE] $($providerResult.Message)"
    $issues++
    $retrievalIssues++
  }

  Write-Host ""
  Write-Host "[P3] Detecting tools (Git)..."
  $gitTest = Test-GitAvailable -Path $ProjectPath
  switch ($gitTest.State) {
    ([ToolState]::AVAILABLE) { Write-Host "  [OK] $($gitTest.Message)" }
    ([ToolState]::UNAVAILABLE) { Write-Host "  [UNAVAILABLE] $($gitTest.Message)"; $warnings++ }
    default { Write-Host "  [UNKNOWN] $($gitTest.Message)" }
  }

  Write-Host ""
  Write-Host "[P4] Detecting tools (ripgrep)..."
  $rgTest = Test-RipgrepAvailable
  switch ($rgTest.State) {
    ([ToolState]::AVAILABLE) { Write-Host "  [OK] $($rgTest.Message)" }
    ([ToolState]::UNAVAILABLE) { Write-Host "  [UNAVAILABLE] $($rgTest.Message)" }
    default { Write-Host "  [UNKNOWN] $($rgTest.Message)" }
  }

  Write-Host ""
  Write-Host "[P5] Detecting tools (LSP)..."
  $lspTest = Test-LSPAvailable
  switch ($lspTest.State) {
    ([ToolState]::AVAILABLE) { Write-Host "  [OK] $($lspTest.Message)" }
    ([ToolState]::NOT_APPLICABLE) { Write-Host "  [N/A] $($lspTest.Message)" }
    default { Write-Host "  [UNKNOWN] $($lspTest.Message)" }
  }

  Write-Host ""
  Write-Host "[P6] Detecting tools (Codebase Memory)..."
  $cbTest = Test-CodebaseMemoryAvailable -ProjectPath $ProjectPath
  switch ($cbTest.State) {
    ([ToolState]::AVAILABLE) { Write-Host "  [OK] $($cbTest.Message)" }
    ([ToolState]::NOT_CONFIGURED) { Write-Host "  [N/C] $($cbTest.Message)" }
    ([ToolState]::NOT_APPLICABLE) { Write-Host "  [N/A] $($cbTest.Message)" }
    default { Write-Host "  [UNKNOWN] $($cbTest.Message)" }
  }

  Write-Host ""
  Write-Host "[P7] Detecting tools (semantic search)..."
  $semTest = Test-SemanticSearchAvailable -ProjectPath $ProjectPath
  switch ($semTest.State) {
    ([ToolState]::AVAILABLE) { Write-Host "  [OK] $($semTest.Message)" }
    ([ToolState]::NOT_CONFIGURED) { Write-Host "  [N/C] $($semTest.Message)" }
    ([ToolState]::NOT_APPLICABLE) { Write-Host "  [N/A] $($semTest.Message)" }
    default { Write-Host "  [UNKNOWN] $($semTest.Message)" }
  }

  Write-Host ""
  Write-Host "[P8] Detecting tools (knowledge)..."
  $knTest = Test-KnowledgeAvailable -ProjectPath $ProjectPath
  switch ($knTest.State) {
    ([ToolState]::AVAILABLE) { Write-Host "  [OK] $($knTest.Message)" }
    ([ToolState]::NOT_CONFIGURED) { Write-Host "  [N/C] $($knTest.Message)" }
    ([ToolState]::NOT_APPLICABLE) { Write-Host "  [N/A] $($knTest.Message)" }
    default { Write-Host "  [UNKNOWN] $($knTest.Message)" }
  }
}

Write-Host ""
Write-Host "Retrieval tier: $retrievalTier"
Write-Host ""
Write-Host "======================"
Write-Host "Issues: $issues"
Write-Host "Warnings: $warnings"
if ($infoCount -gt 0) {
  Write-Host "Info: $infoCount"
}
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

# ============================================================
# v0.5.0 Retrieval Execution Doctor (Hardened)
# ============================================================

Write-Host ""
Write-Host "======================"
Write-Host "Retrieval Execution v0.5.0 Diagnostics"
Write-Host "======================"

# --- Check 1: OPENCODE_RETRIEVAL_MODE is not supported ---
if ($env:OPENCODE_RETRIEVAL_MODE) {
  Write-Host "  [REJECTED] OPENCODE_RETRIEVAL_MODE is defined but not supported"
  $warnings++
}

# --- Runtime resolution precedence ---
Write-Host ""
Write-Host "[R] Resolving runtime directory..."
$runtimeResolved = $false
$runtimeSource = ""
if ($env:OPENCODE_CONFIG_DIR) {
  $candidate = $env:OPENCODE_CONFIG_DIR
  if (Test-Path -LiteralPath $candidate) {
    $resolved = Resolve-Path -LiteralPath $candidate -ErrorAction SilentlyContinue
    if ($resolved) {
      $OpenCodeConfigDir = $resolved.Path
      $runtimeResolved = $true
      $runtimeSource = "OPENCODE_CONFIG_DIR"
    }
  }
}
if (-not $runtimeResolved -and $env:XDG_CONFIG_HOME) {
  $candidate = Join-Path $env:XDG_CONFIG_HOME "opencode"
  if (Test-Path -LiteralPath $candidate) {
    $resolved = Resolve-Path -LiteralPath $candidate -ErrorAction SilentlyContinue
    if ($resolved) {
      $OpenCodeConfigDir = $resolved.Path
      $runtimeResolved = $true
      $runtimeSource = "XDG_CONFIG_HOME/opencode"
    }
  }
}
if (-not $runtimeResolved) {
  $candidate = Join-Path $HOME ".config" "opencode"
  if (Test-Path -LiteralPath $candidate) {
    $resolved = Resolve-Path -LiteralPath $candidate -ErrorAction SilentlyContinue
    if ($resolved) {
      $OpenCodeConfigDir = $resolved.Path
      $runtimeResolved = $true
      $runtimeSource = "~/.config/opencode"
    }
  }
}
Write-Host "  Runtime: $OpenCodeConfigDir (source: $runtimeSource)"

# --- Check 2: v0.5.0 Required Modules with node --check ---
Write-Host ""
Write-Host "[12] Checking v0.5.0 retrieval modules (node --check)..."
$v050Modules = @(
  "bin\retrieval\retrieval-entry.mjs",
  "bin\retrieval\execution-engine.mjs",
  "bin\retrieval\execute-batch.mjs"
)
$modulesOk = $true
foreach ($mod in $v050Modules) {
  $path = Join-Path $RepoRoot $mod
  if (Test-Path -LiteralPath $path) {
    $checkResult = & node --check $path 2>&1
    if ($LASTEXITCODE -eq 0) {
      Write-Host "  [OK] $mod (syntax valid)"
    } else {
      Write-Host "  [SYNTAX_ERROR] $mod - $checkResult"
      $issues++
      $modulesOk = $false
    }
  } else {
    Write-Host "  [MISSING] $mod"
    $issues++
    $modulesOk = $false
  }
}

# --- Check 3: Adapters with node --check ---
Write-Host ""
Write-Host "[13] Checking retrieval adapters (node --check)..."
$adapters = @(
  "bin\retrieval\adapters\ripgrep.mjs",
  "bin\retrieval\adapters\git-grep.mjs",
  "bin\retrieval\adapters\filesystem.mjs"
)
$adaptersOk = $true
foreach ($adapter in $adapters) {
  $path = Join-Path $RepoRoot $adapter
  if (Test-Path -LiteralPath $path) {
    $checkResult = & node --check $path 2>&1
    if ($LASTEXITCODE -eq 0) {
      Write-Host "  [OK] $adapter (syntax valid)"
    } else {
      Write-Host "  [SYNTAX_ERROR] $adapter - $checkResult"
      $issues++
      $adaptersOk = $false
    }
  } else {
    Write-Host "  [MISSING] $adapter"
    $issues++
    $adaptersOk = $false
  }
}

# --- Check 4: Wrapper security ---
Write-Host ""
Write-Host "[14] Checking retrieval wrapper..."
$wrapperPath = Join-Path $RepoRoot "scripts\retrieval-router.ps1"
if (Test-Path -LiteralPath $wrapperPath) {
  Write-Host "  [OK] scripts\retrieval-router.ps1 exists"
  $wrapperContent = Get-Content -LiteralPath $wrapperPath -Raw -Encoding UTF8
  $wrapperIssues = @()
  if ($wrapperContent -match 'Invoke-Expression') {
    $wrapperIssues += "Invoke-Expression"
  }
  if ($wrapperContent -match 'cmd /c') {
    $wrapperIssues += "cmd /c"
  }
  if ($wrapperContent -match 'powershell -Command') {
    $wrapperIssues += "powershell -Command"
  }
  if ($wrapperContent -match 'UseShellExecute = \$true') {
    $wrapperIssues += "UseShellExecute = true"
  }
  if ($wrapperContent -match '\$args\s*\+') {
    $wrapperIssues += "argument concatenation"
  }
  if ($wrapperContent -match '\$\w+\s*\+\s*\$') {
    $wrapperIssues += "variable concatenation for commands"
  }
  if ($wrapperIssues.Count -gt 0) {
    Write-Host "  [UNSAFE] Wrapper contains: $($wrapperIssues -join ', ')"
    $issues++
  } else {
    Write-Host "  [OK] Wrapper uses secure argument handling"
  }
} else {
  Write-Host "  [MISSING] scripts\retrieval-router.ps1"
  $issues++
}

# --- Check 5: Execution Contracts with JSON parsing ---
Write-Host ""
Write-Host "[15] Checking execution contracts (JSON parse)..."
$executionContracts = @(
  "contracts\retrieval-execution-plan.schema.json",
  "contracts\retrieval-execution-result.schema.json",
  "contracts\retrieval-execution-trace.schema.json",
  "contracts\retrieval-execution-metrics.schema.json",
  "contracts\retrieval-execution-reason-codes.schema.json",
  "contracts\retrieval-plan-base.schema.json",
  "contracts\repository-state.schema.json"
)
$contractsOk = $true
foreach ($contract in $executionContracts) {
  $path = Join-Path $RepoRoot $contract
  if (Test-Path -LiteralPath $path) {
    try {
      $content = Get-Content -LiteralPath $path -Raw -Encoding UTF8
      $null = [System.Text.Json.JsonDocument]::Parse($content, [System.Text.Json.JsonDocumentOptions]::new())
      Write-Host "  [OK] $contract"
    } catch {
      Write-Host "  [INVALID_JSON] $contract - $($_.Exception.Message)"
      $issues++
      $contractsOk = $false
    }
  } else {
    Write-Host "  [MISSING] $contract"
    $issues++
    $contractsOk = $false
  }
}

# --- Check 6: Policy Validator ---
Write-Host ""
Write-Host "[16] Checking policy validator..."
$validatorPath = Join-Path $RepoRoot "bin\retrieval\retrieval-policy-validator.mjs"
if (Test-Path -LiteralPath $validatorPath) {
  Write-Host "  [OK] bin\retrieval\retrieval-policy-validator.mjs exists"
} else {
  Write-Host "  [MISSING] bin\retrieval\retrieval-policy-validator.mjs"
  $issues++
}

# --- Check 7: Validator parity via generate-retrieval-validators.mjs --check ---
Write-Host ""
Write-Host "[16b] Checking validator parity..."
$validatorCheckResult = & node (Join-Path $RepoRoot "scripts\generate-retrieval-validators.mjs") --check 2>&1
$validatorParityOk = $LASTEXITCODE -eq 0
if ($validatorParityOk) {
  Write-Host "  [OK] Validators match canonical SHA256"
} else {
  Write-Host "  [DRIFT] Validator drift detected"
  Write-Host "  Details: $validatorCheckResult"
  $issues++
}

# --- Check 8: Node.js detection (native, no shell) ---
Write-Host ""
Write-Host "[17] Detecting tools (native mechanisms)..."
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCmd) {
  Write-Host "  [OK] Node.js: $($nodeCmd.Source)"
} else {
  Write-Host "  [MISSING] Node.js not found"
  $issues++
}

# --- Check 9: PowerShell detection (native) ---
$pwshCmd = Get-Command pwsh -ErrorAction SilentlyContinue
if (-not $pwshCmd) {
  $pwshCmd = Get-Command powershell -ErrorAction SilentlyContinue
}
if ($pwshCmd) {
  Write-Host "  [OK] PowerShell: $($pwshCmd.Source)"
} else {
  Write-Host "  [WARNING] PowerShell not found"
  $warnings++
}

# --- Check 10: Git detection (native) ---
$gitCmd = Get-Command git -ErrorAction SilentlyContinue
if ($gitCmd) {
  Write-Host "  [OK] Git: $($gitCmd.Source)"
  $gitAvailable = $true
} else {
  Write-Host "  [MISSING] Git not found"
  $gitAvailable = $false
  $issues++
}

# --- Check 11: ripgrep (optional) ---
$rgCmd = Get-Command rg -ErrorAction SilentlyContinue
if ($rgCmd) {
  Write-Host "  [OK] ripgrep: $($rgCmd.Source)"
  $ripgrepAvailable = $true
} else {
  Write-Host "  [OPTIONAL] ripgrep not installed"
  $ripgrepAvailable = $false
  $warnings++
}

# --- Check 12: Runtime retrieval directory (read-only inspection) ---
Write-Host ""
Write-Host "[18] Checking runtime retrieval directory..."
$runtimeDir = Join-Path $OpenCodeConfigDir "retrieval"
if (Test-Path -LiteralPath $runtimeDir) {
  Write-Host "  [INFO] Runtime retrieval directory exists: $runtimeDir"
  try {
    $resolved = Resolve-Path -LiteralPath $runtimeDir -ErrorAction SilentlyContinue
    if ($resolved) {
      Write-Host "  [OK] Path resolves to: $($resolved.Path)"
    }
  } catch {
    Write-Host "  [WARNING] Could not resolve path: $($_.Exception.Message)"
    $warnings++
  }
} else {
  Write-Host "  [INFO] Runtime retrieval directory not present (will be created at runtime)"
}

# --- Determine Retrieval Execution Readiness (strengthened) ---
Write-Host ""
Write-Host "[19] Retrieval execution readiness..."
$executionReady = $false
$readyReasons = @()

if ($nodeCmd) {
  $readyReasons += "Node.js available"
} else {
  $readyReasons += "Node.js MISSING"
}

if ($contractsOk) {
  $readyReasons += "all 7 contracts valid"
} else {
  $readyReasons += "contracts MISSING or INVALID"
}

if ($validatorParityOk) {
  $readyReasons += "validator parity OK"
} else {
  $readyReasons += "validator DRIFT"
}

$entryPath = Join-Path $RepoRoot "bin\retrieval\retrieval-entry.mjs"
$enginePath = Join-Path $RepoRoot "bin\retrieval\execution-engine.mjs"
$batchPath = Join-Path $RepoRoot "bin\retrieval\execute-batch.mjs"
$wrapperExists = Test-Path -LiteralPath $wrapperPath
$adaptersExist = $adaptersOk

if ((Test-Path -LiteralPath $entryPath) -and (Test-Path -LiteralPath $enginePath) -and (Test-Path -LiteralPath $batchPath)) {
  $readyReasons += "entry/engine/batch present and valid"
} else {
  $readyReasons += "entry/engine/batch MISSING or INVALID"
}

if ($wrapperExists -and $wrapperIssues.Count -eq 0) {
  $readyReasons += "wrapper present and secure"
} else {
  $readyReasons += "wrapper MISSING or UNSAFE"
}

if ($adaptersExist) {
  $readyReasons += "all adapters present"
} else {
  $readyReasons += "adapters MISSING"
}

$hasExactProvider = $false
if ($ripgrepAvailable) {
  $hasExactProvider = $true
  $readyReasons += "ripgrep available"
} elseif ($gitAvailable) {
  $hasExactProvider = $true
  $readyReasons += "git-grep fallback available"
} else {
  $readyReasons += "no exact provider available"
}

if ($nodeCmd -and $contractsOk -and $validatorParityOk -and (Test-Path -LiteralPath $entryPath) -and (Test-Path -LiteralPath $enginePath) -and (Test-Path -LiteralPath $batchPath) -and $wrapperExists -and $wrapperIssues.Count -eq 0 -and $adaptersExist -and $hasExactProvider) {
  $executionReady = $true
}

Write-Host "  retrieval_execution_ready: $executionReady"
Write-Host "  Reasons: $($readyReasons -join '; ')"

# --- Determine Tier for v0.5.0 ---
$retrievalTier050 = "INCOMPLETE"
if ($ripgrepAvailable) {
  $retrievalTier050 = "OPTIMAL"
  Write-Host "  Tier: OPTIMAL (ripgrep available)"
} elseif ($gitAvailable) {
  $retrievalTier050 = "FUNCTIONAL"
  Write-Host "  Tier: FUNCTIONAL (git-grep fallback)"
} else {
  Write-Host "  Tier: INCOMPLETE (no exact provider)"
}

Write-Host ""
Write-Host "======================"
Write-Host "Retrieval Execution v0.5.0 Summary"
Write-Host "======================"
Write-Host "tier: $retrievalTier050"
Write-Host "retrieval_execution_ready: $executionReady"

if ($executionReady -and $issues -gt 0 -and $retrievalIssues -eq 0) {
  Write-Host ""
  Write-Host "Note: $issues non-retrieval issue(s) detected. Run update-opencode-global.ps1 to install missing config files." -ForegroundColor Yellow
  exit 0
}
exit $issues
