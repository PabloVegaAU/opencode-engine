<#
.SYNOPSIS
  Updates the OpenCode Global installation without touching local state.

.DESCRIPTION
  Compares checksums and updates only the managed global files from the
  canonical source manifest. Does not modify project configurations,
  credentials, sessions, or cache.

  Backs up existing files to runtime/backups/managed/<timestamp>/<relative path>
  before updating. This is a centralized backup location, not adjacent .bak files.

  IMPORTANT: When run from the installed runtime (not source), you must provide
  -SourceRoot pointing to the original source repository, or set OPENCODE_SOURCE_ROOT.

.PARAMETER SourceRoot
  Path to the source repository root (contains distribution/, global/, scripts/, etc.)
  Required when running from installed runtime. Defaults to parent of script directory
  if running from source repository.

.PARAMETER Force
  Update even unchanged files

.PARAMETER DryRun
  Show what would be updated without making changes

.PARAMETER SkipDoctor
  Skip post-update doctor verification

.PARAMETER SkipCertify
  Skip post-update certify verification

.PARAMETER Quick
  Skip all post-update verification (equivalent to -SkipDoctor -SkipCertify)

.EXAMPLE
  # From source repository - full update with doctor and certify
  .\update-opencode-global.ps1

  # Quick update - files only, no verification
  .\update-opencode-global.ps1 -Quick

  # From installed runtime - must specify source root
  ~/.config/opencode/scripts/update-opencode-global.ps1 -SourceRoot C:\OpenCode\opencode-global-src
  ~/.config/opencode/scripts/update-opencode-global.ps1 -SourceRoot C:\OpenCode\opencode-global-src -DryRun -Confirm:`$false
#>
[CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact="Medium")]
param(
  [Parameter(Mandatory=$false)]
  [string]$SourceRoot,
  [switch]$Force,
  [switch]$DryRun,
  [switch]$SkipDoctor,
  [switch]$SkipCertify,
  [switch]$Quick
)

$ErrorActionPreference = "Stop"
$ScriptRootDir = $PSScriptRoot

# Determine SourceRoot
if ($SourceRoot) {
  $RepoRoot = $SourceRoot
} elseif ($env:OPENCODE_SOURCE_ROOT) {
  $RepoRoot = $env:OPENCODE_SOURCE_ROOT
} else {
  $RepoRoot = Split-Path -Parent $ScriptRootDir
}

$RepoRoot = [System.IO.Path]::GetFullPath($RepoRoot)
$ManifestDir = Join-Path $RepoRoot "distribution"

if ($env:OPENCODE_CONFIG_DIR) { $OpenCodeConfigDir = $env:OPENCODE_CONFIG_DIR } else { $OpenCodeConfigDir = Join-Path $env:USERPROFILE ".config\opencode" }
$OpenCodeConfigDir = [System.IO.Path]::GetFullPath($OpenCodeConfigDir)
if ([string]::Equals($RepoRoot, $OpenCodeConfigDir, [StringComparison]::OrdinalIgnoreCase)) {
  Write-Error "SourceRoot cannot be the same as the target OpenCodeConfigDir ('$OpenCodeConfigDir'). This would corrupt the source repository."
}

# Validate source root contains required source layout
function Test-SourceLayout {
  param([string]$Path)
  $requiredPaths = @(
    (Join-Path $Path "distribution/runtime-manifest.json"),
    (Join-Path $Path "distribution/resolve-runtime-manifest.ps1"),
    (Join-Path $Path "global/opencode.jsonc"),
    (Join-Path $Path "scripts/install-opencode-global.ps1")
  )
  foreach ($reqPath in $requiredPaths) {
    if (-not (Test-Path -LiteralPath $reqPath -PathType Leaf)) {
      return $reqPath
    }
  }
  return $null
}

# Check if we're running from installed runtime (source layout missing)
$layoutValidation = Test-SourceLayout -Path $RepoRoot
if ($layoutValidation) {
  $relativePath = $layoutValidation.Substring($RepoRoot.Length + 1)
  Write-Error @"
Source layout validation failed. The path '$RepoRoot' does not contain the expected source structure.

Missing or invalid: $relativePath

When running from the installed runtime (not from source repository), you must specify the source root:

  -SourceRoot C:\OpenCode\opencode-global-src

Or set the environment variable:

  `$env:OPENCODE_SOURCE_ROOT = 'C:\OpenCode\opencode-global-src'

For installed runtime updates, use update-opencode-global.ps1 instead.
"@
}

# Support OPENCODE_CONFIG_DIR for sandbox isolation

# Load manifest resolver functions
$ResolverPath = Join-Path $ManifestDir "resolve-runtime-manifest.ps1"
if (-not (Test-Path -LiteralPath $ResolverPath)) {
  Write-Error "Manifest resolver not found: $ResolverPath"
}
. $ResolverPath

# Read the manifest
$ManifestPath = Join-Path $ManifestDir "runtime-manifest.json"
$manifest = Get-Content -Path $ManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json

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

function Backup-ToCentralLocation {
  param(
    [string]$FilePath,
    [string]$RelativePath
  )

  $backupRoot = Join-Path $OpenCodeConfigDir "runtime\backups\managed"
  $backupDir = Join-Path $backupRoot $BackupTimestamp
  if (-not $script:BackupRootCreated) {
    if (-not (Test-Path -LiteralPath $backupRoot)) { New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null }
    if (Test-Path -LiteralPath $backupDir) { throw "Backup operation directory already exists: $backupDir" }
    New-Item -ItemType Directory -Path $backupDir -ErrorAction Stop | Out-Null
    $script:BackupRootCreated = $true
  }
  $backupPath = Join-Path $backupDir $RelativePath

  $parent = Split-Path -Parent $backupPath
  if (-not (Test-Path -LiteralPath $parent)) {
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
  }

  Copy-Item -LiteralPath $FilePath -Destination $backupPath -Force
  Write-Host "      [backup] $RelativePath -> runtime/backups/managed/$BackupTimestamp/"
}

function New-BackupOperationId {
  $backupRoot = Join-Path $OpenCodeConfigDir "runtime\backups\managed"
  for ($attempt = 0; $attempt -lt 5; $attempt++) {
    $candidate = "$(Get-Date -AsUTC -Format 'yyyyMMddTHHmmssfffZ')-$([guid]::NewGuid().ToString('N'))"
    if (-not (Test-Path -LiteralPath (Join-Path $backupRoot $candidate))) { return $candidate }
  }
  throw "Unable to allocate a collision-free managed backup operation ID."
}

function Test-DistributionPreflight {
  param([object[]]$Inventory, [object]$Manifest)

  $failures = @()
  if ($Inventory.Count -eq 0) { $failures += "Resolved inventory is empty." }
  foreach ($entry in $Inventory) {
    $sourcePath = Assert-SafeSourcePath -SourceRelativePath $entry.source
    $null = Assert-SafeRuntimePath -TargetRoot $OpenCodeConfigDir -RuntimeRelativePath $entry.runtime
    if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
      $failures += "Missing inventory source: $($entry.source)"
    }
  }
  foreach ($categoryProperty in $Manifest.categories.PSObject.Properties) {
    $category = $categoryProperty.Value
    if ($category.recursive_trees) {
      foreach ($tree in $category.recursive_trees) {
        if (-not (Test-Path -LiteralPath (Resolve-ContainedManifestPath -Root $RepoRoot -RelativePath $tree.source -AllowTrailingSeparator) -PathType Container)) {
          $failures += "Missing recursive source root: $($tree.source)"
        }
      }
    }
    if ($category.recursive -and -not (Test-Path -LiteralPath (Resolve-ContainedManifestPath -Root $RepoRoot -RelativePath $category.source_prefix -AllowTrailingSeparator) -PathType Container)) {
      $failures += "Missing recursive source root: $($category.source_prefix)"
    }
  }
  foreach ($required in $Manifest.install_requires) {
    if (-not (Test-Path -LiteralPath (Assert-SafeSourcePath -SourceRelativePath $required) -PathType Leaf)) {
      $failures += "Missing required source: $required"
    }
  }
  $duplicates = @($Inventory | Group-Object { $_.runtime } | Where-Object Count -gt 1)
  foreach ($duplicate in $duplicates) { $failures += "Duplicate runtime destination: $($duplicate.Name)" }
  foreach ($critical in @('global_config', 'commands', 'runtime_scripts', 'contracts', 'bin_retrieval')) {
    if (@($Inventory | Where-Object category_key -eq $critical).Count -eq 0) {
      $failures += "Critical category resolved no files: $critical"
    }
  }
  if ($failures.Count -gt 0) {
    throw "Distribution preflight failed before any runtime write:`n - " + ($failures -join "`n - ")
  }
  # Capture every source exactly once before any target write (64 MiB aggregate cap).
  $script:SourceSnapshot = New-ImmutableSourceSnapshot -Inventory $Inventory -MaximumBytes 67108864
}

function Write-SnapshotFile {
  param([string]$Destination, [byte[]]$Bytes)
  $parent = Split-Path -Parent $Destination
  if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
  $temporary = Join-Path $parent (".opencode-stage-" + [guid]::NewGuid().ToString("N") + ".tmp")
  try {
    [System.IO.File]::WriteAllBytes($temporary, $Bytes)
    [System.IO.File]::Move($temporary, $Destination, $true)
  } finally {
    if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force }
  }
}

Write-Host "OpenCode Global Updater"
Write-Host "======================="
Write-Host ""
Write-Host "Source root: $RepoRoot"
Write-Host "Target dir:  $OpenCodeConfigDir"
Write-Host ""

if (-not (Test-Path -LiteralPath $OpenCodeConfigDir)) {
  Write-Error "OpenCode Global is not installed. Run install-opencode-global.ps1 first."
}

# Resolve and validate the complete source distribution before any runtime write.
$inventory = @(Get-RuntimeManifestInventory)
Test-DistributionPreflight -Inventory $inventory -Manifest $manifest

$changes = 0
$unchanged = 0
$errors = 0
$wouldChange = 0
$BackupTimestamp = New-BackupOperationId
$BackupRootCreated = $false

# Group inventory by category_key for organized output
$byCategory = @{}
foreach ($entry in $inventory) {
  $catKey = if ($null -ne $entry.category_key) { $entry.category_key } else { $entry.category }
  if (-not $catKey) { $catKey = "unknown" }
  if (-not $byCategory.ContainsKey($catKey)) {
    $byCategory[$catKey] = @()
  }
  $byCategory[$catKey] += $entry
}

foreach ($category in $byCategory.Keys) {
  Write-Host "[$($category)]"

  foreach ($entry in $byCategory[$category]) {
    $destPath = Assert-SafeRuntimePath -TargetRoot $OpenCodeConfigDir -RuntimeRelativePath $entry.runtime

    $snapshot = $SourceSnapshot[$entry.source]
    if ($null -eq $snapshot) { throw "Missing immutable source snapshot: $($entry.source)" }

    $sourceHash = $snapshot.Sha256
    $destHash = if (Test-Path -LiteralPath $destPath) { Get-FileSha256 -Path $destPath } else { $null }

    if ($sourceHash -eq $destHash -and -not $Force) {
      Write-Host "  [unchanged] $($entry.runtime)"
      $unchanged++
      continue
    }

    if ($DryRun) {
      Write-Host "  [update] $($entry.runtime) (would update)"
      $wouldChange++
      continue
    }

    # Backup and replacement are one approval boundary: a declined operation writes nothing.
    if ($PSCmdlet.ShouldProcess($destPath, "Backup then replace managed file from $($entry.source)")) {
      if (Test-Path -LiteralPath $destPath) {
        Backup-ToCentralLocation -FilePath $destPath -RelativePath $entry.runtime
      }
      Write-SnapshotFile -Destination $destPath -Bytes $snapshot.Bytes
      Write-Host "  [updated] $($entry.runtime)"
      $changes++
    }
  }
  Write-Host ""
}

Write-Host "[summary]"
Write-Host "Unchanged: $unchanged"
Write-Host "Updated:   $changes"
Write-Host "Errors:    $errors"
Write-Host ""

if ($DryRun) {
  Write-Host "Dry run complete. $wouldChange file(s) would be updated."
  return
}

if ($changes -gt 0) {
  Write-Host "Update complete. $changes file(s) updated."
  Write-Host ""
  Write-Host "Backups saved to: runtime/backups/managed/<timestamp>/"
}

# Quick mode skips all post-update verification
if ($Quick) {
  Write-Host ""
  Write-Host "Quick mode - post-update verification skipped."
  Write-Host "Run .\doctor-opencode-global.ps1 or .\certify-opencode-global.ps1 manually."
  return
}

# Post-update verification: doctor
$doctorFailed = $false
if (-not $SkipDoctor) {
  Write-Host ""
  Write-Host "[doctor] Running post-update verification..."
  $doctorScript = Join-Path $ScriptRootDir "doctor-opencode-global.ps1"
  if (Test-Path -LiteralPath $doctorScript -PathType Leaf) {
    $doctorResult = & $doctorScript 2>&1
    $doctorExit = $LASTEXITCODE
    if ($doctorExit -ne 0) {
      Write-Host "[doctor] FAILED - exit code $doctorExit" -ForegroundColor Red
      Write-Host $doctorResult | Select-Object -Last 20
      $doctorFailed = $true
    } else {
      Write-Host "[doctor] PASSED" -ForegroundColor Green
    }
  } else {
    Write-Host "[doctor] Script not found at $doctorScript" -ForegroundColor Yellow
  }
}

# Post-update verification: certify
$certifyFailed = $false
if (-not $SkipCertify) {
  Write-Host ""
  Write-Host "[certify] Running certification..."
  $certifyScript = Join-Path $ScriptRootDir "certify-opencode-global.ps1"
  if (Test-Path -LiteralPath $certifyScript -PathType Leaf) {
    $certifyResult = & $certifyScript 2>&1
    $certifyExit = $LASTEXITCODE
    if ($certifyExit -ne 0) {
      Write-Host "[certify] FAILED - exit code $certifyExit" -ForegroundColor Red
      Write-Host $certifyResult | Select-Object -Last 20
      $certifyFailed = $true
    } else {
      Write-Host "[certify] PASSED" -ForegroundColor Green
    }
  } else {
    Write-Host "[certify] Script not found at $certifyScript" -ForegroundColor Yellow
  }
}

# Final status and exit code
Write-Host ""
if ($doctorFailed) {
  Write-Host "UPDATE_FAILED: Doctor verification failed. Run .\doctor-opencode-global.ps1 for details." -ForegroundColor Red
  exit 1
}
if ($certifyFailed) {
  Write-Host "UPDATE_FAILED: Certify verification failed. Run .\certify-opencode-global.ps1 for details." -ForegroundColor Red
  exit 2
}
if (-not $SkipDoctor -and -not $SkipCertify) {
  Write-Host "OpenCode Global update certified successfully." -ForegroundColor Green
} else {
  Write-Host "OpenCode Global update complete." -ForegroundColor Green
}
