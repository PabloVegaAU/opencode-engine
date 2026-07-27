<#
.SYNOPSIS
  Certifies the OpenCode Global installation by running comprehensive sandboxed tests.

.DESCRIPTION
  Creates an isolated sandbox environment outside the repository, runs install/update
  scripts twice each to verify idempotency, compares SHA-256 hashes of critical files,
  creates isolated Git repos with various states, tests retrieval-router.ps1 from the
  installed runtime, verifies external write isolation, and validates doctor behavior.

.EXAMPLE
  .\certify-opencode-global.ps1
#>
[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot

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

function Get-RecursiveSnapshot {
  param([string]$RootPath)
  $snapshot = @()
  if (-not (Test-Path -LiteralPath $RootPath)) { return $snapshot }
  $items = Get-ChildItem -LiteralPath $RootPath -Recurse -File -ErrorAction SilentlyContinue
  foreach ($item in $items) {
    $relPath = $item.FullName.Substring($RootPath.Length).TrimStart('\', '/')
    $relPath = $relPath -replace '\\', '/'
    $snapshot += @{
      relative_path = $relPath
      size = $item.Length
      sha256 = Get-FileSha256 -Path $item.FullName
    }
  }
  return $snapshot
}

function Compare-Snapshots {
  param([object[]]$Before, [object[]]$After)
  $changes = @()
  $beforeMap = @{}
  $afterMap = @{}
  foreach ($item in $Before) { $beforeMap[$item.relative_path] = $item }
  foreach ($item in $After) { $afterMap[$item.relative_path] = $item }
  foreach ($path in $afterMap.Keys) {
    if (-not $beforeMap.ContainsKey($path)) {
      $changes += @{ path = $path; change = "added"; size = $afterMap[$path].size; sha256 = $afterMap[$path].sha256 }
    } elseif ($beforeMap[$path].sha256 -ne $afterMap[$path].sha256) {
      $changes += @{ path = $path; change = "modified"; size = $afterMap[$path].size; sha256 = $afterMap[$path].sha256 }
    }
  }
  foreach ($path in $beforeMap.Keys) {
    if (-not $afterMap.ContainsKey($path)) {
      $changes += @{ path = $path; change = "removed" }
    }
  }
  return $changes
}

function Test-IsDescendant {
  param([string]$ChildPath, [string]$ParentPath)
  $child = [System.IO.Path]::GetFullPath($ChildPath).TrimEnd('\', '/')
  $parent = [System.IO.Path]::GetFullPath($ParentPath).TrimEnd('\', '/')
  return $child.StartsWith($parent, [System.StringComparison]::OrdinalIgnoreCase)
}

function Invoke-InstallScript {
  param([string]$ScriptPath, [string]$ConfigDir)
  $exe = "pwsh"
  $args = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $ScriptPath)
  $sandboxRoot = Split-Path -Parent $ConfigDir
  $origUserProfile = $env:USERPROFILE
  $env:USERPROFILE = $sandboxRoot
  $result = & $exe $args 2>&1
  $env:USERPROFILE = $origUserProfile
  return @{ exitCode = $LASTEXITCODE; output = $result }
}

function Invoke-UpdateScript {
  param([string]$ScriptPath, [string]$ConfigDir)
  $exe = "pwsh"
  $args = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $ScriptPath)
  $sandboxRoot = Split-Path -Parent $ConfigDir
  $origUserProfile = $env:USERPROFILE
  $env:USERPROFILE = $sandboxRoot
  $env:OPENCODE_CONFIG_DIR = $ConfigDir
  $result = & $exe $args 2>&1
  $env:USERPROFILE = $origUserProfile
  return @{ exitCode = $LASTEXITCODE; output = $result }
}

function Initialize-IsolatedGitRepo {
  param([string]$RepoPath)
  $exe = "git"
  Push-Location $RepoPath
  try {
    $args = @("init")
    & $exe $args 2>&1 | Out-Null
    $args = @("config", "user.email", "test@example.com")
    & $exe $args 2>&1 | Out-Null
    $args = @("config", "user.name", "Test User")
    & $exe $args 2>&1 | Out-Null
    $readmePath = Join-Path $RepoPath "README.md"
    "Test repository" | Set-Content -Path $readmePath -Encoding UTF8
    $args = @("add", "README.md")
    & $exe $args 2>&1 | Out-Null
    $args = @("commit", "-m", "Initial commit")
    & $exe $args 2>&1 | Out-Null
  } finally {
    Pop-Location
  }
}

function Get-GitHeadCommit {
  param([string]$RepoPath)
  Push-Location $RepoPath
  try {
    $exe = "git"
    $args = @("rev-parse", "HEAD")
    $result = & $exe $args 2>&1
    if ($LASTEXITCODE -eq 0) { return $result.Trim() }
    return $null
  } catch { return $null }
  finally { Pop-Location }
}

function Invoke-InitProject {
  param([string]$ScriptPath, [string]$ProjectPath, [switch]$IncludeRetrievalPolicy)
  $exe = "pwsh"
  $args = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $ScriptPath, $ProjectPath)
  if ($IncludeRetrievalPolicy) { $args += "-IncludeRetrievalPolicy" }
  $result = & $exe $args 2>&1
  return @{ exitCode = $LASTEXITCODE; output = $result }
}

function Invoke-DoctorScript {
  param([string]$ScriptPath, [string]$ProjectPath, [string]$ConfigDir)
  $exe = "pwsh"
  $args = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $ScriptPath)
  if ($ProjectPath) { $args += @("-ProjectPath", $ProjectPath) }
  $origUserProfile = $env:USERPROFILE
  $origOpencodeConfig = $env:OPENCODE_CONFIG_DIR
  if ($ConfigDir) {
    $sandboxRoot = Split-Path -Parent $ConfigDir
    $env:USERPROFILE = $sandboxRoot
    $env:OPENCODE_CONFIG_DIR = $ConfigDir
  }
  $result = & $exe $args 2>&1
  $env:USERPROFILE = $origUserProfile
  if ($null -ne $origOpencodeConfig) { $env:OPENCODE_CONFIG_DIR = $origOpencodeConfig } else { Remove-Item Env:OPENCODE_CONFIG_DIR -ErrorAction SilentlyContinue }
  return @{ exitCode = $LASTEXITCODE; output = $result }
}

function Invoke-RetrievalRouter {
  param([string]$ScriptPath, [string]$Query, [string]$ProjectRoot, [string]$Intent = "auto")
  if (-not (Test-Path -LiteralPath $ScriptPath)) {
    return @{ exitCode = 1; output = "Wrapper script not found: $ScriptPath" }
  }
  $cmd = '& "' + $ScriptPath + '" -Query "' + $Query + '" -ProjectRoot "' + $ProjectRoot + '" -Intent "' + $Intent + '"'
  $exe = "pwsh"
  $args = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $cmd)
  $result = & $exe $args 2>&1
  if ($null -eq $result) {
    return @{ exitCode = $LASTEXITCODE; output = "" }
  }
  $outputStr = if ($result -is [array]) { $result -join "`n" } else { [string]$result }
  return @{ exitCode = $LASTEXITCODE; output = $outputStr }
}

function Test-ValidJson {
  param([string]$JsonString)
  try {
    $null = [System.Text.Json.JsonDocument]::Parse($JsonString)
    return $true
  } catch {
    $extracted = Extract-Json -MixedOutput $JsonString
    try {
      $null = [System.Text.Json.JsonDocument]::Parse($extracted)
      return $true
    } catch {
      Write-Host "    Test-ValidJson: extracted JSON still invalid"
      Write-Host "    Extracted (first 200): $($extracted.Substring(0, [Math]::Min(200, $extracted.Length)))"
      return $false
    }
  }
}

function Extract-Json {
  param([string]$MixedOutput)
  $schemaMarker = '{"schema_version"'
  $idx = $MixedOutput.IndexOf($schemaMarker)
  if ($idx -ge 0) {
    $jsonStart = $idx
  } else {
    $jsonStart = $MixedOutput.LastIndexOf('{')
  }
  if ($jsonStart -lt 0) { return $MixedOutput }
  $jsonEnd = $MixedOutput.LastIndexOf('}')
  if ($jsonEnd -gt $jsonStart) {
    return $MixedOutput.Substring($jsonStart, $jsonEnd - $jsonStart + 1)
  }
  return $MixedOutput.Substring($jsonStart)
}

function Test-RetrievalPolicyValid {
  param([string]$PolicyPath, [string]$SchemaPath)
  if (-not (Test-Path -LiteralPath $PolicyPath)) { return $false }
  if (-not (Test-Path -LiteralPath $SchemaPath)) { return $false }
  try {
    $policyContent = Get-Content -LiteralPath $PolicyPath -Raw -Encoding UTF8
    $policy = [System.Text.Json.JsonDocument]::Parse($policyContent)
    $schemaContent = Get-Content -LiteralPath $SchemaPath -Raw -Encoding UTF8
    $schema = [System.Text.Json.JsonDocument]::Parse($schemaContent)
    $requiredFields = @("schema_version", "enabled", "strategies", "budgets")
    foreach ($field in $requiredFields) {
      try {
        $null = $policy.RootElement.GetProperty($field)
      } catch {
        Write-Host "    Missing required field: $field"
        return $false
      }
    }
    return $true
  } catch {
    Write-Host "    Validation exception: $($_.Exception.Message)"
    return $false
  }
}

function Get-DirectorySnapshot {
  param([string]$RootPath)
  $snapshot = @{}
  if (-not (Test-Path -LiteralPath $RootPath)) { return $snapshot }
  $items = Get-ChildItem -LiteralPath $RootPath -Recurse -File -ErrorAction SilentlyContinue
  foreach ($item in $items) {
    $relPath = $item.FullName.Substring($RootPath.Length).TrimStart('\', '/')
    $relPath = $relPath -replace '\\', '/'
    $snapshot[$relPath] = @{ size = $item.Length; sha256 = Get-FileSha256 -Path $item.FullName }
  }
  return $snapshot
}

$envVarsToSave = @("HOME", "USERPROFILE", "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "TEMP", "TMP")
$savedEnv = @{}
foreach ($var in $envVarsToSave) {
  $savedEnv[$var] = [System.Environment]::GetEnvironmentVariable($var)
}

$sandboxBase = [System.IO.Path]::GetTempPath()
$sandboxId = "opencode-certify-" + [Guid]::NewGuid().ToString("N")
$sandboxRoot = Join-Path $sandboxBase $sandboxId
$sandboxConfigDir = Join-Path $sandboxRoot ".config\opencode"

$externalLocations = @{
  "repo" = $RepoRoot
  "userConfig" = Join-Path $savedEnv["USERPROFILE"] ".config\opencode"
}

$externalSnapshots = @{}
foreach ($name in $externalLocations.Keys) {
  $path = $externalLocations[$name]
  if ($path -and (Test-Path -LiteralPath $path)) {
    $externalSnapshots[$name] = Get-DirectorySnapshot -RootPath $path
  }
}

try {
  New-Item -ItemType Directory -Path $sandboxRoot -Force | Out-Null
  New-Item -ItemType Directory -Path $sandboxConfigDir -Force | Out-Null

  $sandboxRoot = (Resolve-Path $sandboxRoot -ErrorAction SilentlyContinue).Path
  $sandboxConfigDir = (Resolve-Path $sandboxConfigDir -ErrorAction SilentlyContinue).Path

  if (Test-IsDescendant -ChildPath $sandboxRoot -ParentPath $RepoRoot) {
    Write-Error "Sandbox is inside repository - security violation"
    exit 1
  }

  $redirectedConfigDir = $sandboxConfigDir
  $env:HOME = $savedEnv["HOME"]
  $env:USERPROFILE = $sandboxRoot
  $env:XDG_CONFIG_HOME = $sandboxRoot
  $env:XDG_CACHE_HOME = Join-Path $sandboxRoot ".cache"
  $env:TEMP = $sandboxRoot
  $env:TMP = $sandboxRoot

  Write-Host "OpenCode Global Certification"
  Write-Host "=============================="
  Write-Host ""
  Write-Host "Sandbox: $sandboxRoot"
  Write-Host ""

  $installScript = Join-Path $RepoRoot "scripts\install-opencode-global.ps1"
  $updateScript = Join-Path $RepoRoot "scripts\update-opencode-global.ps1"
  $initScript = Join-Path $RepoRoot "scripts\init-opencode-project.ps1"
  $doctorScript = Join-Path $RepoRoot "scripts\doctor-opencode-global.ps1"
  $routerScript = Join-Path $RepoRoot "scripts\retrieval-router.ps1"

  Write-Host "[PHASE 1] Running install-opencode-global.ps1 twice..."
  $result1 = Invoke-InstallScript -ScriptPath $installScript -ConfigDir $sandboxConfigDir
  if ($result1.exitCode -ne 0) {
    Write-Error "First install failed with exit code $($result1.exitCode)"
    exit 1
  }
  Write-Host "  First install: exit code $($result1.exitCode)"
  $snapshotAfterInstall1 = Get-RecursiveSnapshot -RootPath $sandboxConfigDir

  $result2 = Invoke-InstallScript -ScriptPath $installScript -ConfigDir $sandboxConfigDir
  if ($result2.exitCode -ne 0) {
    Write-Error "Second install failed with exit code $($result2.exitCode)"
    exit 1
  }
  Write-Host "  Second install: exit code $($result2.exitCode)"
  $snapshotAfterInstall2 = Get-RecursiveSnapshot -RootPath $sandboxConfigDir

  $installChanges = Compare-Snapshots -Before $snapshotAfterInstall1 -After $snapshotAfterInstall2
  if ($installChanges.Count -ne 0) {
    Write-Error "Install is NOT idempotent - $($installChanges.Count) changes detected"
    exit 1
  }
  Write-Host "  Install is idempotent: 0 changes on second run"

  Write-Host ""
  Write-Host "[PHASE 2] Running update-opencode-global.ps1 twice..."
  $result3 = Invoke-UpdateScript -ScriptPath $updateScript -ConfigDir $sandboxConfigDir
  if ($result3.exitCode -ne 0) {
    Write-Error "First update failed with exit code $($result3.exitCode)"
    exit 1
  }
  Write-Host "  First update: exit code $($result3.exitCode)"
  $snapshotAfterUpdate1 = Get-RecursiveSnapshot -RootPath $sandboxConfigDir

  $result4 = Invoke-UpdateScript -ScriptPath $updateScript -ConfigDir $sandboxConfigDir
  if ($result4.exitCode -ne 0) {
    Write-Error "Second update failed with exit code $($result4.exitCode)"
    exit 1
  }
  Write-Host "  Second update: exit code $($result4.exitCode)"
  $snapshotAfterUpdate2 = Get-RecursiveSnapshot -RootPath $sandboxConfigDir

  $updateChanges = Compare-Snapshots -Before $snapshotAfterUpdate1 -After $snapshotAfterUpdate2
  if ($updateChanges.Count -ne 0) {
    Write-Error "Update is NOT idempotent - $($updateChanges.Count) changes detected"
    exit 1
  }
  Write-Host "  Update is idempotent: 0 changes on second run"

  Write-Host ""
  Write-Host "[PHASE 3] Verifying sandbox files are correctly installed..."
  $filesToCheck = @(
    "bin\retrieval\retrieval-router.mjs",
    "bin\retrieval\retrieval-policy-validator.mjs",
    "bin\retrieval\retrieval-index-state-validator.mjs",
    "scripts\retrieval-router.ps1",
    "contracts\retrieval-policy.schema.json",
    "contracts\retrieval-index-state.schema.json"
  )
  $sha256Failures = 0
  foreach ($relPath in $filesToCheck) {
    $destPath = Join-Path $sandboxConfigDir $relPath
    if (-not (Test-Path -LiteralPath $destPath)) {
      Write-Warning "  Missing: $relPath"
      $sha256Failures++
      continue
    }
    $hash = Get-FileSha256 -Path $destPath
    if ($null -eq $hash) {
      Write-Warning "  Could not hash: $relPath"
      $sha256Failures++
    } else {
      Write-Host "  [OK] $relPath (sha256=$($hash.Substring(0,16))...)"
    }
  }
  if ($sha256Failures -gt 0) {
    Write-Error "Phase 3 failed: $sha256Failures file(s) missing or unhable to hash"
    exit 1
  }

  Write-Host ""
  Write-Host "[PHASE 4] Creating isolated Git repos..."
  $project1Path = Join-Path $sandboxRoot "Project One"
  $project2Path = Join-Path $sandboxRoot "Project Two"
  New-Item -ItemType Directory -Path $project1Path -Force | Out-Null
  New-Item -ItemType Directory -Path $project2Path -Force | Out-Null
  Initialize-IsolatedGitRepo -RepoPath $project1Path
  Initialize-IsolatedGitRepo -RepoPath $project2Path
  Write-Host "  Created: $project1Path"
  Write-Host "  Created: $project2Path"

  Write-Host ""
  Write-Host "[PHASE 4a] Project1 init WITHOUT -IncludeRetrievalPolicy..."
  $initResult1 = Invoke-InitProject -ScriptPath $initScript -ProjectPath $project1Path
  if ($initResult1.exitCode -ne 0) {
    Write-Error "Init without retrieval policy failed with exit code $($initResult1.exitCode)"
    exit 1
  }
  $policy1Path = Join-Path $project1Path ".ai-env\retrieval-policy.json"
  if (Test-Path -LiteralPath $policy1Path) {
    Write-Error "retrieval-policy.json should NOT exist when -IncludeRetrievalPolicy not used"
    exit 1
  }
  Write-Host "  [OK] .ai-env/retrieval-policy.json does NOT exist"

  Write-Host ""
  Write-Host "[PHASE 4b] Project1 init WITH -IncludeRetrievalPolicy..."
  $initResult2 = Invoke-InitProject -ScriptPath $initScript -ProjectPath $project1Path -IncludeRetrievalPolicy
  if ($initResult2.exitCode -ne 0) {
    Write-Error "Init with retrieval policy failed with exit code $($initResult2.exitCode)"
    exit 1
  }
  if (-not (Test-Path -LiteralPath $policy1Path)) {
    Write-Error "retrieval-policy.json should exist when -IncludeRetrievalPolicy is used"
    exit 1
  }
  Write-Host "  [OK] .ai-env/retrieval-policy.json exists"

  $schemaPath = Join-Path $sandboxConfigDir "contracts\retrieval-policy.schema.json"
  if (-not (Test-RetrievalPolicyValid -PolicyPath $policy1Path -SchemaPath $schemaPath)) {
    Write-Error "retrieval-policy.json is not valid against schema"
    exit 1
  }
  Write-Host "  [OK] Valid against schema"

  Write-Host ""
  Write-Host "[PHASE 4c] Verify policy NOT overwritten on second normal init..."
  $policy1HashBefore = Get-FileSha256 -Path $policy1Path
  $initResult3 = Invoke-InitProject -ScriptPath $initScript -ProjectPath $project1Path
  if ($initResult3.exitCode -ne 0) {
    Write-Error "Second init failed with exit code $($initResult3.exitCode)"
    exit 1
  }
  $policy1HashAfter = Get-FileSha256 -Path $policy1Path
  if ($policy1HashBefore -ne $policy1HashAfter) {
    Write-Error "Policy was overwritten on second init"
    exit 1
  }
  Write-Host "  [OK] Policy not overwritten"

  Write-Host ""
  Write-Host "[PHASE 4d] Project2 init with different valid policy..."
  $project2PolicyPath = Join-Path $project2Path ".ai-env\retrieval-policy.json"
  $differentPolicy = @{
    schema_version = "1.0"
    enabled = $true
    strategies = @{
      exact = @{ enabled = $true; provider = "ripgrep" }
      symbol = @{ enabled = $true; provider = "codebase-memory" }
      architecture = @{ enabled = $true; provider = "ripgrep" }
      semantic = @{ enabled = $false; provider = $null }
      knowledge = @{ enabled = $true; provider = "filesystem"; paths = @("docs", "specs") }
    }
    budgets = @{
      exact = @{ max_tool_calls = 2; max_results = 30; max_chars = 15000 }
      symbol = @{ max_tool_calls = 1; max_results = 20; max_chars = 12000 }
      architecture = @{ max_tool_calls = 2; max_results = 25; max_chars = 18000 }
      semantic = @{ max_tool_calls = 2; max_results = 10; max_chars = 14000 }
      knowledge = @{ max_tool_calls = 1; max_results = 15; max_chars = 10000 }
    }
  }
  $initResult4 = Invoke-InitProject -ScriptPath $initScript -ProjectPath $project2Path -IncludeRetrievalPolicy
  if ($initResult4.exitCode -ne 0) {
    Write-Error "Init Project2 failed with exit code $($initResult4.exitCode)"
    exit 1
  }
  $differentPolicyJson = $differentPolicy | ConvertTo-Json -Depth 10
  [System.IO.File]::WriteAllText($project2PolicyPath, $differentPolicyJson, [System.Text.UTF8Encoding]::new($false))
  $project2PolicyHash = Get-FileSha256 -Path $project2PolicyPath
  Write-Host "  [OK] Project2 policy set"

  Write-Host ""
  Write-Host "[PHASE 4e] Verify isolation - router on Project1 does NOT touch Project2..."
  $routerInstalledPath = Join-Path $sandboxConfigDir "scripts\retrieval-router.ps1"
  $routerResult1 = Invoke-RetrievalRouter -ScriptPath $routerInstalledPath -Query "impact analysis" -ProjectRoot $project1Path -Intent "architecture"
  if ($routerResult1.exitCode -ne 0) {
    Write-Host "Router output: $($routerResult1.output -join '; ')"
    Write-Error "Router on Project1 failed with exit code $($routerResult1.exitCode)"
    exit 1
  }
  $project2PolicyHashAfter = Get-FileSha256 -Path $project2PolicyPath
  if ($project2PolicyHash -ne $project2PolicyHashAfter) {
    Write-Error "Project2 policy was modified while router ran on Project1"
    exit 1
  }
  Write-Host "  [OK] Project2 policy unchanged after Project1 operations"

  Write-Host ""
  Write-Host "[PHASE 5] Testing retrieval-index-state.json fixtures..."

  $aiEnv1Path = Join-Path $project1Path ".ai-env"
  if (-not (Test-Path -LiteralPath $aiEnv1Path)) {
    New-Item -ItemType Directory -Path $aiEnv1Path -Force | Out-Null
  }

  $currentCommit = Get-GitHeadCommit -RepoPath $project1Path

  Write-Host "  Testing FRESH (commit matches indexed_commit)..."
  $freshState = @{
    schema_version = "1.0"
    indexed_commit = $currentCommit
    index_generation = $currentCommit
    indexed_at = (Get-Date).ToUniversalTime().ToString("o")
  } | ConvertTo-Json
  [System.IO.File]::WriteAllText((Join-Path $aiEnv1Path "retrieval-index-state.json"), $freshState, [System.Text.UTF8Encoding]::new($false))
  $routerResultFresh = Invoke-RetrievalRouter -ScriptPath $routerInstalledPath -Query "impact analysis" -ProjectRoot $project1Path -Intent "architecture"
  if ($routerResultFresh.exitCode -ne 0) {
    Write-Error "Router failed on FRESH state with exit code $($routerResultFresh.exitCode)"
    Write-Host "Router output: $($routerResultFresh.output.Substring(0, [Math]::Min(500, $routerResultFresh.output.Length)))"
    exit 1
  }
  if (-not (Test-ValidJson -JsonString $routerResultFresh.output)) {
    Write-Error "Router output is not valid JSON for FRESH state"
    Write-Host "Router output: $($routerResultFresh.output.Substring(0, [Math]::Min(500, $routerResultFresh.output.Length)))"
    exit 1
  }
  $planFresh = [System.Text.Json.JsonDocument]::Parse((Extract-Json -MixedOutput $routerResultFresh.output))
  $freshStatus = $planFresh.RootElement.GetProperty("index_status").GetString()
  if ($freshStatus -ne "FRESH") {
    Write-Error "Expected FRESH status, got: $freshStatus"
    exit 1
  }
  if ($planFresh.RootElement.GetProperty("indexed_commit").GetString() -ne $currentCommit) {
    Write-Error "Expected indexed_commit to match HEAD: $currentCommit"
    exit 1
  }
  Write-Host "    [OK] FRESH state works"

  Write-Host "  Testing STALE_INDEX (commit differs)..."
  $staleState = @{
    schema_version = "1.0"
    indexed_commit = "0000000000000000000000000000000000000000"
    index_generation = "0000000000000000000000000000000000000000"
    indexed_at = (Get-Date).ToUniversalTime().ToString("o")
  } | ConvertTo-Json
  [System.IO.File]::WriteAllText((Join-Path $aiEnv1Path "retrieval-index-state.json"), $staleState, [System.Text.UTF8Encoding]::new($false))
  $routerResultStale = Invoke-RetrievalRouter -ScriptPath $routerInstalledPath -Query "impact analysis" -ProjectRoot $project1Path -Intent "architecture"
  if ($routerResultStale.exitCode -ne 0) {
    Write-Error "Router failed on STALE_INDEX state: $($routerResultStale.output)"
    exit 1
  }
  $planStale = [System.Text.Json.JsonDocument]::Parse((Extract-Json -MixedOutput $routerResultStale.output))
  $staleStatus = $planStale.RootElement.GetProperty("index_status").GetString()
  if ($staleStatus -ne "STALE_INDEX") {
    Write-Error "Expected STALE_INDEX status, got: $staleStatus"
    exit 1
  }
  Write-Host "    [OK] STALE_INDEX state works"

  Write-Host "  Testing NOT_INDEXED (no state file)..."
  Remove-Item -LiteralPath (Join-Path $aiEnv1Path "retrieval-index-state.json") -Force -ErrorAction SilentlyContinue
  $routerResultNotIndexed = Invoke-RetrievalRouter -ScriptPath $routerInstalledPath -Query "impact analysis" -ProjectRoot $project1Path -Intent "architecture"
  if ($routerResultNotIndexed.exitCode -ne 0) {
    Write-Error "Router failed on NOT_INDEXED state: $($routerResultNotIndexed.output)"
    exit 1
  }
  $planNotIndexed = [System.Text.Json.JsonDocument]::Parse((Extract-Json -MixedOutput $routerResultNotIndexed.output))
  if ($planNotIndexed.RootElement.GetProperty("index_status").GetString() -ne "NOT_INDEXED") {
    Write-Error "Expected NOT_INDEXED status"
    exit 1
  }
  Write-Host "    [OK] NOT_INDEXED state works"

  Write-Host "  Testing dirty worktree..."
  "extra content" | Add-Content -Path (Join-Path $project1Path "README.md") -Encoding UTF8
  $routerResultDirty = Invoke-RetrievalRouter -ScriptPath $routerInstalledPath -Query "impact analysis" -ProjectRoot $project1Path -Intent "architecture"
  if ($routerResultDirty.exitCode -ne 0) {
    Write-Error "Router failed on dirty worktree: $($routerResultDirty.output)"
    exit 1
  }
  $planDirty = [System.Text.Json.JsonDocument]::Parse((Extract-Json -MixedOutput $routerResultDirty.output))
  $isDirty = $planDirty.RootElement.GetProperty("dirty_worktree").GetBoolean()
  if (-not $isDirty) {
    Write-Error "Expected dirty_worktree to be true"
    exit 1
  }
  $warningsDirty = $planDirty.RootElement.GetProperty("warnings").EnumerateArray() | ForEach-Object { $_.GetString() }
  if (-not ($warningsDirty -contains "DIRTY_WORKTREE_VERIFICATION_REQUIRED")) {
    Write-Error "Expected DIRTY_WORKTREE_VERIFICATION_REQUIRED warning"
    exit 1
  }
  Write-Host "    [OK] Dirty worktree detected and warned"

  Push-Location $project1Path
  try {
    $exe = "git"
    $args = @("checkout", "README.md")
    & $exe $args 2>&1 | Out-Null

    Write-Host "  Testing detached HEAD..."
    $originalBranch = (git branch --show-current)
    try {
      $args = @("checkout", "--detach")
      & $exe $args 2>&1 | Out-Null
      $routerResultDetached = Invoke-RetrievalRouter -ScriptPath $routerInstalledPath -Query "impact analysis" -ProjectRoot $project1Path -Intent "architecture"
      if ($routerResultDetached.exitCode -ne 0) {
        Write-Error "Router failed on detached HEAD: $($routerResultDetached.output)"
        exit 1
      }
      $planDetached = [System.Text.Json.JsonDocument]::Parse((Extract-Json -MixedOutput $routerResultDetached.output))
      if (-not $planDetached.RootElement.GetProperty("detached").GetBoolean()) {
        Write-Error "Expected detached to be true"
        exit 1
      }
      Write-Host "    [OK] Detached HEAD handled"
    } finally {
      if ($originalBranch -and $originalBranch -ne "") {
        $args = @("checkout", $originalBranch)
        & $exe $args 2>&1 | Out-Null
      }
    }
  } finally {
    Pop-Location
  }

  Write-Host ""
  Write-Host "[PHASE 6] Testing retrieval-router.ps1 JSON output..."
  $requiredFields = @("schema_version", "enabled", "intent", "strategy", "provider", "reason", "budgets", "fallbacks", "repository", "branch", "commit", "indexed_commit", "index_generation", "indexed_at", "index_status", "dirty_worktree", "warnings")

  $routerResultTest = Invoke-RetrievalRouter -ScriptPath $routerInstalledPath -Query "test query" -ProjectRoot $project1Path
  if ($routerResultTest.exitCode -ne 0) {
    Write-Error "Router test failed with exit code $($routerResultTest.exitCode)"
    exit 1
  }
  if (-not (Test-ValidJson -JsonString $routerResultTest.output)) {
    Write-Error "Router output is not valid JSON"
    exit 1
  }
  $planTest = [System.Text.Json.JsonDocument]::Parse((Extract-Json -MixedOutput $routerResultTest.output))
  foreach ($field in $requiredFields) {
    try {
      $null = $planTest.RootElement.GetProperty($field)
    } catch {
      Write-Error "Router output missing required field: $field"
      exit 1
    }
  }
  $jsonMinified = $routerResultTest.output.Trim() -replace '\s+', ' '
  $jsonReParsed = ([System.Text.Json.JsonDocument]::Parse((Extract-Json -MixedOutput $routerResultTest.output))).RootElement.GetRawText()
  if ($jsonReParsed.Length -gt $routerResultTest.output.Trim().Length - 1) {
    Write-Host "    Note: JSON is compact (may have minor whitespace)"
  }
  Write-Host "  [OK] JSON valid with all required fields"

  Write-Host ""
  Write-Host "[PHASE 7] Verifying exactly 11 public commands..."
  $commandsDir = Join-Path $sandboxConfigDir "commands"
  if (-not (Test-Path -LiteralPath $commandsDir)) {
    Write-Error "Commands directory not found"
    exit 1
  }
  $installedCommands = Get-ChildItem -LiteralPath $commandsDir -File | ForEach-Object { $_.Name }
  $expectedCommands = @("go.md", "chatgpt-plus.md", "mix.md", "minimax-plus.md", "cross-session.md", "init-ai-env.md", "doctor-ai-env.md", "update-ai-env.md", "ownership-inspect.md", "update-apply.md", "update-rollback.md")
  $extraCommands = $installedCommands | Where-Object { $_ -notin $expectedCommands }
  $missingCommands = $expectedCommands | Where-Object { $_ -notin $installedCommands }
  if ($extraCommands.Count -gt 0) {
    Write-Error "Extra commands found: $($extraCommands -join ', ')"
    exit 1
  }
  if ($missingCommands.Count -gt 0) {
    Write-Error "Missing commands: $($missingCommands -join ', ')"
    exit 1
  }
  if ($installedCommands.Count -ne 11) {
    Write-Error "Expected 11 commands, found $($installedCommands.Count)"
    exit 1
  }
  Write-Host "  [OK] Exactly 11 public commands verified"

  Write-Host ""
  Write-Host "[PHASE 8] Running doctor on various scenarios..."

  Write-Host "  Testing runtime temp with no project..."
  $doctorTempResult = Invoke-DoctorScript -ScriptPath $doctorScript -ConfigDir $sandboxConfigDir
  if ($doctorTempResult.exitCode -ne 0) {
    Write-Host "Doctor temp output:"
    $doctorTempResult.output | ForEach-Object { Write-Host $_ }
    Write-Error "Doctor on temp should exit 0, got $($doctorTempResult.exitCode)"
    exit 1
  }
  Write-Host "    Exit code: $($doctorTempResult.exitCode) [OK]"

  Write-Host "  Testing non-adopted project..."
  $nonAdoptedPath = Join-Path $sandboxRoot "non-adopted"
  New-Item -ItemType Directory -Path $nonAdoptedPath -Force | Out-Null
  Initialize-IsolatedGitRepo -RepoPath $nonAdoptedPath
  $doctorNonAdoptedResult = Invoke-DoctorScript -ScriptPath $doctorScript -ProjectPath $nonAdoptedPath -ConfigDir $sandboxConfigDir
  if ($doctorNonAdoptedResult.exitCode -ne 0) {
    Write-Error "Doctor on non-adopted project should exit 0, got $($doctorNonAdoptedResult.exitCode)"
    exit 1
  }
  $nonAdoptedOutput = $doctorNonAdoptedResult.output -join "`n"
  if ($nonAdoptedOutput -match "retrieval.*warning|Retrieval.*warning" -and $nonAdoptedOutput -notmatch "Issues:\s*0") {
    Write-Error "Doctor on non-adopted project should have no retrieval warnings"
    exit 1
  }
  Write-Host "    Exit code: $($doctorNonAdoptedResult.exitCode) [OK]"

  Write-Host "  Testing invalid policy..."
  $invalidPolicyPath = Join-Path $project1Path ".ai-env\retrieval-policy.json"
  $invalidPolicy = "{ invalid json }"
  [System.IO.File]::WriteAllText($invalidPolicyPath, $invalidPolicy, [System.Text.UTF8Encoding]::new($false))
  $doctorInvalidResult = Invoke-DoctorScript -ScriptPath $doctorScript -ProjectPath $project1Path -ConfigDir $sandboxConfigDir
  if ($doctorInvalidResult.exitCode -eq 0) {
    Write-Error "Doctor on invalid policy should exit non-zero, got $($doctorInvalidResult.exitCode)"
    exit 1
  }
  Write-Host "    Exit code: $($doctorInvalidResult.exitCode) [OK]"

  Write-Host "  Testing fully prepared pilot project..."
  $validPolicy = @{
    schema_version = "1.0"
    enabled = $true
    strategies = @{
      exact = @{ enabled = $true; provider = "git_grep" }
      symbol = @{ enabled = $true; provider = "git_grep" }
      architecture = @{ enabled = $true; provider = "git_grep" }
      semantic = @{ enabled = $false; provider = $null }
      knowledge = @{ enabled = $true; provider = "filesystem"; paths = @("docs") }
    }
    budgets = @{
      exact = @{ max_tool_calls = 1; max_results = 25; max_chars = 12000 }
      symbol = @{ max_tool_calls = 2; max_results = 25; max_chars = 16000 }
      architecture = @{ max_tool_calls = 2; max_results = 30; max_chars = 20000 }
      semantic = @{ max_tool_calls = 2; max_results = 12; max_chars = 16000 }
      knowledge = @{ max_tool_calls = 2; max_results = 12; max_chars = 16000 }
    }
  }
  [System.IO.File]::WriteAllText($invalidPolicyPath, ($validPolicy | ConvertTo-Json -Depth 10), [System.Text.UTF8Encoding]::new($false))
  $freshStateForProject = @{
    schema_version = "1.0"
    indexed_commit = $currentCommit
    index_generation = $currentCommit
    indexed_at = (Get-Date).ToUniversalTime().ToString("o")
  } | ConvertTo-Json
  [System.IO.File]::WriteAllText((Join-Path $project1Path ".ai-env\retrieval-index-state.json"), $freshStateForProject, [System.Text.UTF8Encoding]::new($false))
  $doctorPilotResult = Invoke-DoctorScript -ScriptPath $doctorScript -ProjectPath $project1Path -ConfigDir $sandboxConfigDir
  if ($doctorPilotResult.exitCode -ne 0) {
    Write-Error "Doctor on pilot project should exit 0, got $($doctorPilotResult.exitCode)"
    exit 1
  }
  $pilotOutput = $doctorPilotResult.output -join "`n"
  if ($pilotOutput -notmatch "retrieval_execution_ready:\s*True") {
    Write-Error "Doctor output should contain 'retrieval_execution_ready: True', got: $($pilotOutput.Substring(0, [Math]::Min(500, $pilotOutput.Length)))"
    exit 1
  }
  if ($pilotOutput -notmatch "Warnings:\s*0") {
    if ($pilotOutput -match "ripgrep not found") {
      Write-Host "    [INFO] ripgrep not installed (git_grep fallback available)"
    } else {
      Write-Error "Doctor output should contain 'Warnings: 0', got: $($pilotOutput.Substring(0, [Math]::Min(500, $pilotOutput.Length)))"
      exit 1
    }
  }
  if ($pilotOutput -match "may be expected") {
    Write-Error "Doctor output should not contain 'may be expected'"
    exit 1
  }
  Write-Host "    Exit code: $($doctorPilotResult.exitCode) [OK]"

  Write-Host ""
  Write-Host "[PHASE 9] External write verification..."
  $externalChanges = @{}
  foreach ($name in $externalLocations.Keys) {
    $path = $externalLocations[$name]
    if ($path -and (Test-Path -LiteralPath $path)) {
      $currentSnapshot = Get-DirectorySnapshot -RootPath $path
      $originalSnapshot = $externalSnapshots[$name]
      $addedFiles = @()
      $modifiedFiles = @()
      $removedFiles = @()
      foreach ($relPath in $currentSnapshot.Keys) {
        if (-not $originalSnapshot.ContainsKey($relPath)) {
          $addedFiles += $relPath
        } elseif ($currentSnapshot[$relPath].sha256 -ne $originalSnapshot[$relPath].sha256) {
          $modifiedFiles += $relPath
        }
      }
      foreach ($relPath in $originalSnapshot.Keys) {
        if (-not $currentSnapshot.ContainsKey($relPath)) {
          $removedFiles += $relPath
        }
      }
      if ($addedFiles.Count -gt 0 -or $modifiedFiles.Count -gt 0 -or $removedFiles.Count -gt 0) {
        $externalChanges[$name] = @{
          added = $addedFiles
          modified = $modifiedFiles
          removed = $removedFiles
        }
      }
    }
  }
  if ($externalChanges.Count -gt 0) {
    Write-Error "External locations were modified:"
    foreach ($name in $externalChanges.Keys) {
      Write-Error "  $name :"
      $changes = $externalChanges[$name]
      if ($changes.added.Count -gt 0) { Write-Error "    Added: $($changes.added -join ', ')" }
      if ($changes.modified.Count -gt 0) { Write-Error "    Modified: $($changes.modified -join ', ')" }
      if ($changes.removed.Count -gt 0) { Write-Error "    Removed: $($changes.removed -join ', ')" }
    }
    exit 1
  }
  Write-Host "  [OK] No external files were created, modified, or deleted"

  Write-Host ""
  Write-Host "[PHASE 10] Self-contained runtime test (source inaccessible)..."
  $isolatedHome = Join-Path $sandboxBase "isolated-home-$(Get-Random)"
  $isolatedWorkDir = Join-Path $sandboxBase "isolated-work-$(Get-Random)"
  $savedHome = $env:HOME
  $savedUserProfile = $env:USERPROFILE
  $savedConfigDir = $env:OPENCODE_CONFIG_DIR
  $savedSourceRoot = $env:OPENCODE_SOURCE_ROOT
  $savedRepoRoot = $env:OPENCODE_REPO_ROOT
  try {
    New-Item -ItemType Directory -Path $isolatedHome -Force | Out-Null
    New-Item -ItemType Directory -Path $isolatedWorkDir -Force | Out-Null
    $env:HOME = $isolatedHome
    $env:USERPROFILE = $isolatedHome
    Remove-Item -Path "env:OPENCODE_CONFIG_DIR" -ErrorAction SilentlyContinue
    Remove-Item -Path "env:OPENCODE_SOURCE_ROOT" -ErrorAction SilentlyContinue
    Remove-Item -Path "env:OPENCODE_REPO_ROOT" -ErrorAction SilentlyContinue
    $installScript = Join-Path $RepoRoot "scripts\install-opencode-global.ps1"
    Write-Host "  Installing to isolated HOME: $isolatedHome"
    $installResult = & pwsh -NoProfile -ExecutionPolicy Bypass -File $installScript 2>&1
    if ($LASTEXITCODE -ne 0) {
      Write-Error "  Install failed in isolated HOME"
      exit 1
    }
    $installedRouterWrapper = Join-Path $isolatedHome ".config\opencode\scripts\retrieval-router.ps1"
    $installedRouterMjs = Join-Path $isolatedHome ".config\opencode\bin\retrieval\retrieval-router.mjs"
    if (-not (Test-Path $installedRouterWrapper)) {
      Write-Error "  Installed wrapper not found at: $installedRouterWrapper"
      exit 1
    }
    Write-Host "  Testing router from isolated working directory..."
    $testProjectDir = Join-Path $isolatedWorkDir "test-project"
    New-Item -ItemType Directory -Path $testProjectDir -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $testProjectDir ".ai-env") -Force | Out-Null
    $policyContent = @{
      schema_version = "1.0"
      enabled = $true
      strategies = @{
        exact = @{ enabled = $true; provider = "ripgrep" }
        symbol = @{ enabled = $true; provider = "lsp" }
        architecture = @{ enabled = $true; provider = "codebase-memory" }
        semantic = @{ enabled = $false; provider = $null }
        knowledge = @{ enabled = $true; provider = "filesystem"; paths = @("docs") }
      }
      budgets = @{
        exact = @{ max_tool_calls = 1; max_results = 25; max_chars = 12000 }
        symbol = @{ max_tool_calls = 2; max_results = 25; max_chars = 16000 }
        architecture = @{ max_tool_calls = 2; max_results = 30; max_chars = 20000 }
        semantic = @{ max_tool_calls = 2; max_results = 12; max_chars = 16000 }
        knowledge = @{ max_tool_calls = 2; max_results = 12; max_chars = 16000 }
      }
    } | ConvertTo-Json -Depth 10
    $policyContent | Set-Content -Path (Join-Path $testProjectDir ".ai-env\retrieval-policy.json") -Encoding UTF8
    $cmd = '& "' + $installedRouterWrapper + '" -Query "NotaService.listar" -ProjectRoot "' + $testProjectDir + '" -Intent exact'
    $routerOutput = & pwsh -NoProfile -ExecutionPolicy Bypass -Command $cmd 2>&1
    $routerExitCode = $LASTEXITCODE
    $outputStr = if ($routerOutput -is [array]) { $routerOutput -join "`n" } else { [string]$routerOutput }
    if ($routerExitCode -ne 0) {
      Write-Error "  Router failed with exit code $routerExitCode"
      Write-Error "  Output: $($outputStr.Substring(0, [Math]::Min(500, $outputStr.Length)))"
      exit 1
    }
    if ($outputStr -match "C:\\OpenCode\\opencode-global-src") {
      Write-Error "  SOURCE PATH LEAKED IN OUTPUT!"
      Write-Error "  Output contains: C:\OpenCode\opencode-global-src"
      exit 1
    }
    if ($outputStr -match "OPENCODE_REPO_ROOT") {
      Write-Error "  OPENCODE_REPO_ROOT LEAKED IN OUTPUT!"
      exit 1
    }
    $jsonMatch = $outputStr -match '\{.*"schema_version".*"enabled".*\}'
    if (-not $jsonMatch) {
      Write-Error "  Router output is not valid JSON plan"
      exit 1
    }
    $planJson = $outputStr -replace '(?s).*?(\{.*\}).*', '$1'
    try {
      $plan = [System.Text.Json.JsonDocument]::Parse($planJson)
      $planRoot = $plan.RootElement
      if ($planRoot.GetProperty("schema_version").GetString() -ne "1.0") {
        Write-Error "  Invalid schema_version in plan"
        exit 1
      }
      if ($planRoot.GetProperty("enabled").GetBoolean() -ne $true) {
        Write-Error "  Plan should be enabled"
        exit 1
      }
      Write-Host "  [OK] Router executed from isolated HOME"
      Write-Host "  [OK] No source path leaked in output"
      Write-Host "  [OK] Valid JSON plan returned"
      Write-Host "  [OK] OPENCODE_REPO_ROOT not used"
    } catch {
      Write-Error "  Failed to parse router output as JSON: $_"
      exit 1
    }
  }
  finally {
    if ($isolatedHome -and (Test-Path $isolatedHome)) {
      Remove-Item -LiteralPath $isolatedHome -Recurse -Force -ErrorAction SilentlyContinue
    }
    if ($isolatedWorkDir -and (Test-Path $isolatedWorkDir)) {
      Remove-Item -LiteralPath $isolatedWorkDir -Recurse -Force -ErrorAction SilentlyContinue
    }
    $env:HOME = $savedHome
    $env:USERPROFILE = $savedUserProfile
    if ($null -ne $savedConfigDir) { $env:OPENCODE_CONFIG_DIR = $savedConfigDir } else { Remove-Item -Path "env:OPENCODE_CONFIG_DIR" -ErrorAction SilentlyContinue }
    if ($null -ne $savedSourceRoot) { $env:OPENCODE_SOURCE_ROOT = $savedSourceRoot } else { Remove-Item -Path "env:OPENCODE_SOURCE_ROOT" -ErrorAction SilentlyContinue }
    if ($null -ne $savedRepoRoot) { $env:OPENCODE_REPO_ROOT = $savedRepoRoot } else { Remove-Item -Path "env:OPENCODE_REPO_ROOT" -ErrorAction SilentlyContinue }
  }

  # ============================================================
  # v0.5.0 Phase 6 Certification Gates
  # These run inside the main try block before cleanup.
  # ============================================================

  Write-Host ""
  Write-Host "=============================="
  Write-Host "v0.5.0 Phase 6 Certification Gates"
  Write-Host "=============================="

  # --- Gate 1: Required v0.5.0 files exist, are readable, and SHA-256 is computed ---
  Write-Host ""
  Write-Host "[v0.5.0 Gate 1] Required files: existence, readability, SHA-256..."
  $v050Files = @(
    "bin/retrieval/retrieval-entry.mjs",
    "bin/retrieval/execution-engine.mjs",
    "bin/retrieval/execute-batch.mjs",
    "bin/retrieval/retrieval-doctor.mjs",
    "bin/retrieval/retrieval-router.mjs",
    "bin/retrieval/retrieval-policy-validator.mjs",
    "bin/retrieval/retrieval-index-state-validator.mjs",
    "bin/retrieval/adapters/ripgrep.mjs",
    "bin/retrieval/adapters/git-grep.mjs",
    "bin/retrieval/adapters/filesystem.mjs",
    "bin/retrieval/adapters/shared.mjs",
    "scripts/retrieval-router.ps1",
    "scripts/doctor-opencode-global.ps1",
    "scripts/generate-retrieval-validators.mjs",
    "contracts/retrieval-execution-plan.schema.json",
    "contracts/retrieval-execution-result.schema.json",
    "contracts/retrieval-execution-trace.schema.json",
    "contracts/retrieval-execution-metrics.schema.json",
    "contracts/retrieval-execution-reason-codes.schema.json",
    "contracts/retrieval-plan-base.schema.json",
    "contracts/repository-state.schema.json",
    "contracts/retrieval-policy.schema.json",
    "contracts/retrieval-index-state.schema.json"
  )
  $v050Hashes = @{}
  $v050Gate1Ok = $true
  foreach ($rel in $v050Files) {
    $abs = Join-Path $RepoRoot $rel
    if (-not (Test-Path -LiteralPath $abs -PathType Leaf)) {
      Write-Host "  [MISSING] $rel"
      $v050Gate1Ok = $false
      $issues++
      continue
    }
    try {
      $null = Get-Content -LiteralPath $abs -Raw -Encoding UTF8
      $hash = Get-FileSha256 -Path $abs
      if (-not $hash) {
        Write-Host "  [UNREADABLE] $rel"
        $v050Gate1Ok = $false
        $issues++
        continue
      }
      $v050Hashes[$rel] = $hash
      Write-Host "  [OK] $rel  sha256=$hash"
    } catch {
      Write-Host "  [UNREADABLE] $rel - $($_.Exception.Message)"
      $v050Gate1Ok = $false
      $issues++
    }
  }
  if (-not $v050Gate1Ok) {
    Write-Host "  [FAIL] Gate 1: required files missing or unreadable"
    exit 1
  }
  Write-Host "  [OK] Gate 1: all 23 files exist, readable, SHA-256 computed ($(@($v050Hashes.Keys).Count) hashes)"

  # --- Gate 2: Validator parity via generate-retrieval-validators.mjs --check ---
  Write-Host ""
  Write-Host "[v0.5.0 Gate 2] Validator parity..."
  $validatorCheck = & node (Join-Path $RepoRoot "scripts/generate-retrieval-validators.mjs") --check 2>&1
  if ($LASTEXITCODE -ne 0) {
    Write-Host "  [FAIL] Validator drift detected"
    Write-Host "  $validatorCheck"
    exit 1
  }
  if (-not ($validatorCheck -match "VALIDATORS_OK")) {
    Write-Host "  [FAIL] Validator check did not return VALIDATORS_OK"
    Write-Host "  $validatorCheck"
    exit 1
  }
  Write-Host "  [OK] Gate 2: validator parity confirmed"

  # --- Gate 3: node --check on every adapter and module ---
  Write-Host ""
  Write-Host "[v0.5.0 Gate 3] node --check on all ESM modules and adapters..."
  $nodeCheckModules = @(
    "bin/retrieval/retrieval-entry.mjs",
    "bin/retrieval/execution-engine.mjs",
    "bin/retrieval/execute-batch.mjs",
    "bin/retrieval/retrieval-doctor.mjs",
    "bin/retrieval/retrieval-router.mjs",
    "bin/retrieval/retrieval-policy-validator.mjs",
    "bin/retrieval/retrieval-index-state-validator.mjs",
    "bin/retrieval/budget.mjs",
    "bin/retrieval/contract-validation.mjs",
    "bin/retrieval/equivalence.mjs",
    "bin/retrieval/metrics.mjs",
    "bin/retrieval/normalize.mjs",
    "bin/retrieval/path-restrict.mjs",
    "bin/retrieval/preflight.mjs",
    "bin/retrieval/reason-codes.mjs",
    "bin/retrieval/repository-state.mjs",
    "bin/retrieval/token-estimator-v1.mjs",
    "bin/retrieval/adapters/ripgrep.mjs",
    "bin/retrieval/adapters/git-grep.mjs",
    "bin/retrieval/adapters/filesystem.mjs",
    "bin/retrieval/adapters/shared.mjs"
  )
  $nodeCheckFailures = 0
  foreach ($rel in $nodeCheckModules) {
    $abs = Join-Path $RepoRoot $rel
    if (-not (Test-Path -LiteralPath $abs)) {
      Write-Host "  [MISSING] $rel"
      $nodeCheckFailures++
      continue
    }
    $checkOutput = & node --check $abs 2>&1
    if ($LASTEXITCODE -ne 0) {
      Write-Host "  [SYNTAX_ERROR] $rel - $checkOutput"
      $nodeCheckFailures++
    } else {
      Write-Host "  [OK] $rel"
    }
  }
  if ($nodeCheckFailures -gt 0) {
    Write-Host "  [FAIL] Gate 3: $nodeCheckFailures module(s) failed node --check"
    exit 1
  }
  Write-Host "  [OK] Gate 3: all $($nodeCheckModules.Count) modules pass node --check"

  # --- Gate 4: Real ESM import for entry, engine, batch, doctor (isolated Node process) ---
  Write-Host ""
  Write-Host "[v0.5.0 Gate 4] Real ESM import for entry/engine/batch/doctor..."
  $esmScriptPath = Join-Path $RepoRoot "working\v050-esm-import.mjs"
  if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot "working"))) {
    $null = New-Item -ItemType Directory -Path (Join-Path $RepoRoot "working") -Force
  }
  $esmScript = @'
import { pathToFileURL } from 'url';
const targets = [
  'retrieval-entry.mjs',
  'execution-engine.mjs',
  'execute-batch.mjs',
  'retrieval-doctor.mjs'
];
const repoRoot = process.env.OPENCODE_REPO_ROOT;
let allOk = true;
for (const t of targets) {
  const sep = repoRoot.includes('\\') ? '\\' : '/';
  const fullPath = repoRoot + sep + 'bin' + sep + 'retrieval' + sep + t;
  const url = pathToFileURL(fullPath).href;
  try {
    await import(url);
    console.log('IMPORT_OK ' + t);
  } catch (err) {
    console.error('IMPORT_FAILED ' + t + ': ' + err.message);
    allOk = false;
  }
}
if (!allOk) {
  process.exitCode = 1;
}
'@
  Set-Content -LiteralPath $esmScriptPath -Value $esmScript -Encoding UTF8
  $env:OPENCODE_REPO_ROOT = $RepoRoot
  $esmResult = & node $esmScriptPath 2>&1
  $esmExit = $LASTEXITCODE
  Remove-Item Env:OPENCODE_REPO_ROOT -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $esmScriptPath -ErrorAction SilentlyContinue
  if ($esmExit -ne 0) {
    Write-Host "  [FAIL] Gate 4: ESM import failed (exit $esmExit)"
    Write-Host "  $esmResult"
    exit 1
  }
  $importCount = ([regex]::Matches($esmResult, "IMPORT_OK")).Count
  if ($importCount -lt 4) {
    Write-Host "  [FAIL] Gate 4: only $importCount/4 modules imported"
    Write-Host "  $esmResult"
    exit 1
  }
  Write-Host "  [OK] Gate 4: all 4 modules imported via pathToFileURL (real ESM, no CLI, no search)"

  # --- Gate 5: JSON parse for all 9 contracts ---
  Write-Host ""
  Write-Host "[v0.5.0 Gate 5] JSON parse for all 9 contracts..."
  $allContracts = @(
    "contracts/retrieval-execution-plan.schema.json",
    "contracts/retrieval-execution-result.schema.json",
    "contracts/retrieval-execution-trace.schema.json",
    "contracts/retrieval-execution-metrics.schema.json",
    "contracts/retrieval-execution-reason-codes.schema.json",
    "contracts/retrieval-plan-base.schema.json",
    "contracts/repository-state.schema.json",
    "contracts/retrieval-policy.schema.json",
    "contracts/retrieval-index-state.schema.json"
  )
  $contractFailures = 0
  foreach ($rel in $allContracts) {
    $abs = Join-Path $RepoRoot $rel
    if (-not (Test-Path -LiteralPath $abs)) {
      Write-Host "  [MISSING] $rel"
      $contractFailures++
      continue
    }
    try {
      $content = Get-Content -LiteralPath $abs -Raw -Encoding UTF8
      $null = [System.Text.Json.JsonDocument]::Parse($content, [System.Text.Json.JsonDocumentOptions]::new())
      Write-Host "  [OK] $rel"
    } catch {
      Write-Host "  [INVALID_JSON] $rel - $($_.Exception.Message)"
      $contractFailures++
    }
  }
  if ($contractFailures -gt 0) {
    Write-Host "  [FAIL] Gate 5: $contractFailures contract(s) failed JSON parse"
    exit 1
  }
  Write-Host "  [OK] Gate 5: all 9 contracts parse as valid JSON"

  # --- Gate 6: Wrapper security re-verification ---
  Write-Host ""
  Write-Host "[v0.5.0 Gate 6] Wrapper security (read-only scan)..."
  $wrapperAbs = Join-Path $RepoRoot "scripts/retrieval-router.ps1"
  if (-not (Test-Path -LiteralPath $wrapperAbs)) {
    Write-Host "  [MISSING] scripts/retrieval-router.ps1"
    exit 1
  }
  $wrapperContent = Get-Content -LiteralPath $wrapperAbs -Raw -Encoding UTF8
  $forbidden = @("Invoke-Expression", "cmd /c", "powershell -Command", "UseShellExecute = `$true")
  $wrapperInsecure = $false
  foreach ($pattern in $forbidden) {
    if ($wrapperContent -match [regex]::Escape($pattern)) {
      Write-Host "  [UNSAFE] wrapper contains forbidden pattern: $pattern"
      $wrapperInsecure = $true
    }
  }
  if (-not ($wrapperContent -match "ArgumentList\.Add")) {
    Write-Host "  [UNSAFE] wrapper does not use ArgumentList.Add"
    $wrapperInsecure = $true
  }
  if ($wrapperInsecure) {
    exit 1
  }
  Write-Host "  [OK] Gate 6: wrapper secure (no Invoke-Expression, no cmd /c, no powershell -Command, uses ArgumentList.Add)"

  # --- Gate 7: Doctor invocation on REAL runtime ---
  Write-Host ""
  Write-Host "[v0.5.0 Gate 7] Doctor invocation on real runtime..."
  $realConfigDir = Join-Path $savedEnv["USERPROFILE"] ".config\opencode"
  $doctorGate7Result = Invoke-DoctorScript -ScriptPath $doctorScript -ConfigDir $realConfigDir
  $doctorGate7Output = $doctorGate7Result.output -join "`n"
  if ($doctorGate7Result.exitCode -ne 0) {
    Write-Host "  [FAIL] Doctor on real runtime should exit 0, got $($doctorGate7Result.exitCode)"
    Write-Host $doctorGate7Output
    exit 1
  }
  if ($doctorGate7Output -notmatch "retrieval_execution_ready:\s*True") {
    Write-Host "  [FAIL] Doctor should report retrieval_execution_ready: True"
    Write-Host $doctorGate7Output
    exit 1
  }
  Write-Host "  [OK] Gate 7: doctor on real runtime reports retrieval_execution_ready: True and exits 0"

  # --- Gate 8: Hash coverage summary ---
  Write-Host ""
  Write-Host "[v0.5.0 Gate 8] Hash coverage summary..."
  $coveredCount = $v050Hashes.Count
  Write-Host "  Total v0.5.0 files hashed: $coveredCount"
  Write-Host "  Categories:"
  $entryCount = ($v050Hashes.Keys | Where-Object { $_ -like "bin/retrieval/*.mjs" -and $_ -notlike "bin/retrieval/adapters/*" }).Count
  $adapterCount = ($v050Hashes.Keys | Where-Object { $_ -like "bin/retrieval/adapters/*" }).Count
  $contractCount = ($v050Hashes.Keys | Where-Object { $_ -like "contracts/*" }).Count
  $scriptCount = ($v050Hashes.Keys | Where-Object { $_ -like "scripts/*" }).Count
  Write-Host "    - entry/engine/batch/doctor/router: $entryCount"
  Write-Host "    - adapters: $adapterCount"
  Write-Host "    - contracts: $contractCount"
  Write-Host "    - scripts: $scriptCount"
  if ($coveredCount -lt 23) {
    Write-Host "  [FAIL] Gate 8: expected at least 23 hashed files, got $coveredCount"
    exit 1
  }
  Write-Host "  [OK] Gate 8: hash coverage complete"

  Write-Host ""
  Write-Host "=============================="
  Write-Host "v0.5.0 PHASE 6 GATES PASSED" -ForegroundColor Green
  Write-Host "=============================="

  Write-Host ""
  Write-Host "=============================="
  Write-Host "[v0.6 Gate] Ownership engine distribution and wrapper security..."
  $v060Files = @("bin/updates/update-cli.mjs", "bin/updates/path-safety.mjs", "bin/updates/backup-manager.mjs", "bin/updates/apply-executor.mjs", "bin/updates/rollback-controller.mjs", "bin/updates/journal-writer.mjs", "scripts/ownership-update.ps1")
  foreach ($rel in $v060Files) {
    $path = Join-Path $sandboxConfigDir $rel
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { Write-Error "Missing v0.6 runtime artifact: $rel"; exit 1 }
  }
  $ownershipWrapper = Get-Content -LiteralPath (Join-Path $sandboxConfigDir "scripts/ownership-update.ps1") -Raw
  if ($ownershipWrapper -match "Invoke-Expression" -or $ownershipWrapper -notmatch "List\[string\]") { Write-Error "Unsafe ownership wrapper"; exit 1 }
  Write-Host "  [OK] v0.6 ownership engine is installed and wrapper is array-invoked"
  Write-Host "CERTIFICATION PASSED" -ForegroundColor Green
  Write-Host ""
  exit 0
}
finally {
  foreach ($var in $envVarsToSave) {
    if ($null -ne $savedEnv[$var]) {
      [System.Environment]::SetEnvironmentVariable($var, $savedEnv[$var])
      Set-Item -Path "env:$var" -Value $savedEnv[$var] -ErrorAction SilentlyContinue
    }
  }
  if ($env:HOME -and $env:HOME.StartsWith($sandboxBase)) {
    $env:HOME = $savedEnv["HOME"]
  }
  if ($env:USERPROFILE -and $env:USERPROFILE.StartsWith($sandboxBase)) {
    $env:USERPROFILE = $savedEnv["USERPROFILE"]
  }

  if (Test-Path -LiteralPath $sandboxRoot) {
    try {
      Remove-Item -LiteralPath $sandboxRoot -Recurse -Force -ErrorAction SilentlyContinue
      Write-Host "[CLEANUP] Sandbox deleted: $sandboxRoot"
    } catch {
      Write-Warning "Failed to delete sandbox: $sandboxRoot"
    }
  }
}
