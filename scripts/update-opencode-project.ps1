<#
.SYNOPSIS
  Read-only project diagnostics and planning for OpenCode Global.

.DESCRIPTION
  v0.4.0 - STRICTLY READ-ONLY

  This script provides two read-only modes for project diagnostics:

  -Doctor  : Inspect project state, manifests, ledger, retrieval policy,
              checksums, and adoption status. Produces human-readable output.

  -Plan    : Returns a deterministic JSON plan with conceptual actions,
              reasons, ownership, and support flags. No files are modified.

  v0.4.0 does NOT support apply or rollback. Those operations belong
  to the future Project Update Engine.

  This script NEVER writes, backs up, or modifies any project files.

.PARAMETER ProjectPath
  Target project directory path

.PARAMETER Doctor
  Run diagnostic inspection (default mode)

.PARAMETER Plan
  Return JSON plan with actions and support flags

.EXAMPLE
  .\update-opencode-project.ps1 -ProjectPath C:\my-project -Doctor
  .\update-opencode-project.ps1 C:\my-project -Plan
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $false, Position = 0)]
  [string]$ProjectPath = (Get-Location).Path,

  [switch]$Doctor,
  [switch]$Plan
)

$ErrorActionPreference = 'Stop'
$GlobalRoot = Split-Path -Parent $PSScriptRoot
$TargetRoot = [System.IO.Path]::GetFullPath($ProjectPath)
$OpenCodeConfigDir = Join-Path $env:USERPROFILE '.config\opencode'

function Get-FileSha256Lower {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $null }
  $sha = [System.Security.Cryptography.SHA256]::Create()
  $stream = [System.IO.File]::OpenRead($Path)
  try {
    return (-join ($sha.ComputeHash($stream) | ForEach-Object { $_.ToString('x2') }))
  }
  finally {
    $stream.Dispose()
    $sha.Dispose()
  }
}

function Get-RetrievalPolicyState {
  param([string]$ProjectRoot, [object[]]$ArtifactsLedger)

  $policyPath = Join-Path $ProjectRoot '.ai-env\retrieval-policy.json'
  $hasPolicyFile = Test-Path $policyPath

  $hasLedgerEntry = $false
  foreach ($artifact in $ArtifactsLedger) {
    if ($artifact.path -eq '.ai-env/retrieval-policy.json' -and $artifact.artifact_type -eq 'config') {
      $hasLedgerEntry = $true
      break
    }
  }

  if (-not $hasLedgerEntry -and -not $hasPolicyFile) {
    return @{
      state = 'PROJECT_NOT_ADOPTED'
      has_policy_file = $false
      has_ledger_entry = $false
    }
  }

  if ($hasLedgerEntry -and $hasPolicyFile) {
    return @{
      state = 'ADOPTED'
      has_policy_file = $true
      has_ledger_entry = $true
    }
  }

  if ($hasLedgerEntry -and -not $hasPolicyFile) {
    return @{
      state = 'MISSING_AFTER_ADOPTION'
      has_policy_file = $false
      has_ledger_entry = $true
    }
  }

  return @{
    state = 'UNKNOWN'
    has_policy_file = $hasPolicyFile
    has_ledger_entry = $hasLedgerEntry
  }
}

function Invoke-DoctorMode {
  param([string]$ProjectRoot)

  Write-Host 'OpenCode Project Doctor'
  Write-Host '========================'
  Write-Host ''
  Write-Host "Project: $ProjectRoot"
  Write-Host ''
  Write-Host '[1] Checking bootstrap manifest...'

  $bootstrapPathCanonical = Join-Path $ProjectRoot '.opencode\bootstrap-manifest.json'
  $bootstrapPathLegacy = Join-Path $ProjectRoot '.bootstrap\project-manifest.json'
  $bootstrapPath = $null
  $bootstrapLocation = $null

  if (Test-Path $bootstrapPathCanonical) {
    $bootstrapPath = $bootstrapPathCanonical
    $bootstrapLocation = '.opencode/bootstrap-manifest.json'
  } elseif (Test-Path $bootstrapPathLegacy) {
    $bootstrapPath = $bootstrapPathLegacy
    $bootstrapLocation = '.bootstrap/project-manifest.json (legacy)'
  }

  if ($bootstrapPath) {
    Write-Host "  [OK] Found at: $bootstrapLocation"
    try {
      $manifest = Get-Content $bootstrapPath -Raw | ConvertFrom-Json
      Write-Host "  Project ID: $($manifest.project_id)"
      Write-Host "  Bootstrap Version: $($manifest.bootstrap_version)"
      Write-Host "  Schema Version: $($manifest.schema_version)"
      Write-Host "  Artifacts tracked: $($manifest.artifacts.Count)"
    } catch {
      Write-Host '  [WARN] Could not parse bootstrap manifest'
    }
  } else {
    Write-Host '  [WARN] No bootstrap manifest found'
  }

  Write-Host ''
  Write-Host '[2] Checking retrieval policy state...'
  $artifactsLedger = if ($manifest) { $manifest.artifacts } else { @() }
  $policyState = Get-RetrievalPolicyState -ProjectRoot $ProjectRoot -ArtifactsLedger $artifactsLedger
  Write-Host "  State: $($policyState.state)"
  Write-Host "  Policy file: $($policyState.has_policy_file)"
  Write-Host "  Ledger entry: $($policyState.has_ledger_entry)"

  $policyPath = Join-Path $ProjectRoot '.ai-env\retrieval-policy.json'
  if (Test-Path $policyPath) {
    try {
      $policy = Get-Content $policyPath -Raw | ConvertFrom-Json
      Write-Host "  Policy schema: $($policy.schema_version)"
      Write-Host "  Policy enabled: $($policy.enabled)"
    } catch {
      Write-Host '  [WARN] Could not parse retrieval policy'
    }
  }

  Write-Host ''
  Write-Host '[3] Checking managed artifacts...'
  $checksumMismatches = 0
  $checksumMatches = 0
  foreach ($artifact in $artifactsLedger) {
    $artifactPath = Join-Path $ProjectRoot $artifact.path.Replace('/', '\')
    if (Test-Path $artifactPath) {
      $currentChecksum = Get-FileSha256Lower -Path $artifactPath
      if ($currentChecksum -eq $artifact.checksum_sha256) {
        $checksumMatches++
        Write-Host "  [OK] $($artifact.path)"
      } else {
        $checksumMismatches++
        Write-Host "  [WARN] $($artifact.path) (checksum mismatch)"
      }
    } else {
      Write-Host "  [MISSING] $($artifact.path)"
    }
  }
  if ($checksumMatches -eq 0 -and $checksumMismatches -eq 0) {
    Write-Host '  [INFO] No artifacts tracked in ledger'
  }

  Write-Host ''
  Write-Host '[4] Checking contracts...'
  $contractNames = @('manifest.schema.json', 'index.schema.json', 'graph.schema.json', 'session.schema.json', 'bootstrap-manifest.schema.json')
  foreach ($name in $contractNames) {
    $contractPath = Join-Path $ProjectRoot "contracts\$name"
    if (Test-Path $contractPath) {
      Write-Host "  [OK] contracts\$name"
    } else {
      Write-Host "  [MISSING] contracts\$name"
    }
  }

  Write-Host ''
  Write-Host '[5] Checking intelligence structure...'
  $intelligenceFiles = @('.intelligence\manifest.json', '.intelligence\index.json', '.intelligence\graph.jsonl')
  foreach ($f in $intelligenceFiles) {
    $intPath = Join-Path $ProjectRoot $f
    if (Test-Path $intPath) {
      Write-Host "  [OK] $f"
    } else {
      Write-Host "  [MISSING] $f"
    }
  }

  Write-Host ''
  Write-Host '[6] Checking profile commands...'
  $profileCommands = @('go.md', 'chatgpt-plus.md', 'mix.md', 'minimax-plus.md')
  foreach ($cmd in $profileCommands) {
    $cmdPath = Join-Path $ProjectRoot ".opencode\commands\$cmd"
    if (Test-Path $cmdPath) {
      Write-Host "  [OK] .opencode/commands/$cmd"
    } else {
      Write-Host "  [MISSING] .opencode/commands/$cmd"
    }
  }

  Write-Host ''
  Write-Host '======================'
  Write-Host "Retrieval Policy State: $($policyState.state)"
  Write-Host "Checksum matches: $checksumMatches"
  Write-Host "Checksum mismatches: $checksumMismatches"
  Write-Host ''
  Write-Host 'Doctor complete. No files were modified.'
}

function Invoke-PlanMode {
  param([string]$ProjectRoot)

  $bootstrapPathCanonical = Join-Path $ProjectRoot '.opencode\bootstrap-manifest.json'
  $bootstrapPathLegacy = Join-Path $ProjectRoot '.bootstrap\project-manifest.json'
  $bootstrapPath = $null

  if (Test-Path $bootstrapPathCanonical) {
    $bootstrapPath = $bootstrapPathCanonical
  } elseif (Test-Path $bootstrapPathLegacy) {
    $bootstrapPath = $bootstrapPathLegacy
  }

  $manifest = $null
  $artifactsLedger = @()

  if ($bootstrapPath) {
    try {
      $manifest = Get-Content $bootstrapPath -Raw | ConvertFrom-Json
      $artifactsLedger = $manifest.artifacts
    } catch {}
  }

  $policyState = Get-RetrievalPolicyState -ProjectRoot $ProjectRoot -ArtifactsLedger $artifactsLedger

  $checksumMismatches = @()
  $checksumMatches = @()
  $missingFiles = @()

  foreach ($artifact in $artifactsLedger) {
    $artifactPath = Join-Path $ProjectRoot $artifact.path.Replace('/', '\')
    if (Test-Path $artifactPath) {
      $currentChecksum = Get-FileSha256Lower -Path $artifactPath
      if ($currentChecksum -eq $artifact.checksum_sha256) {
        $checksumMatches += @{
          path = $artifact.path
          status = 'current'
        }
      } else {
        $checksumMismatches += @{
          path = $artifact.path
          expected_checksum = $artifact.checksum_sha256
          actual_checksum = $currentChecksum
          status = 'diverged'
        }
      }
    } else {
      $missingFiles += @{
        path = $artifact.path
        status = 'missing'
      }
    }
  }

  $plan = @{
    schema_version = '1.0'
    project = $TargetRoot
    generated_at = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ')
    retrieval_policy_state = $policyState.state
    artifacts = @{
      tracked = $artifactsLedger.Count
      current = $checksumMatches.Count
      diverged = $checksumMismatches.Count
      missing = $missingFiles.Count
    }
    checksums = @{
      matches = $checksumMatches
      mismatches = $checksumMismatches
      missing = $missingFiles
    }
    actions = @()
    apply_supported = $false
    rollback_supported = $false
    notes = @(
      'v0.4.0 project updater is strictly read-only',
      'apply and rollback belong to future Project Update Engine',
      'No files were or will be modified by this tool'
    )
  }

  if ($policyState.state -eq 'PROJECT_NOT_ADOPTED') {
    $plan.actions += @{
      type = 'adopt_retrieval'
      description = 'Project has not adopted Retrieval Foundation'
      path = '.ai-env/retrieval-policy.json'
      recommended = $true
    }
  } elseif ($policyState.state -eq 'MISSING_AFTER_ADOPTION') {
    $plan.actions += @{
      type = 'restore_retrieval_policy'
      description = 'Retrieval policy was adopted but file is missing'
      path = '.ai-env/retrieval-policy.json'
      recommended = $true
    }
  }

  if ($checksumMismatches.Count -gt 0) {
    $plan.actions += @{
      type = 'review_diverged_artifacts'
      description = 'Some tracked artifacts have diverged from expected checksums'
      count = $checksumMismatches.Count
      recommended = $false
    }
  }

  if ($missingFiles.Count -gt 0) {
    $plan.actions += @{
      type = 'restore_missing_artifacts'
      description = 'Some tracked artifacts are missing from project'
      count = $missingFiles.Count
      recommended = $true
    }
  }

  return $plan | ConvertTo-Json -Depth 10
}

if (-not $Doctor -and -not $Plan) {
  $Doctor = $true
}

$normalizedOpenCode = [System.IO.Path]::GetFullPath($OpenCodeConfigDir).TrimEnd('\', '/')
$normalizedTarget = $TargetRoot.TrimEnd('\', '/')
if ([string]::Equals($normalizedTarget, $normalizedOpenCode, [System.StringComparison]::OrdinalIgnoreCase)) {
  Write-Error 'Cannot run diagnostics on the global OpenCode directory.'
}

if (-not (Test-Path -LiteralPath $TargetRoot -PathType Container)) {
  Write-Error "Target directory does not exist: $TargetRoot"
}

if ($Doctor) {
  Invoke-DoctorMode -ProjectRoot $TargetRoot
}

if ($Plan) {
  $planJson = Invoke-PlanMode -ProjectRoot $TargetRoot
  Write-Output $planJson
}
