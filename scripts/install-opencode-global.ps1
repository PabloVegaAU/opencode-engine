<#
.SYNOPSIS
  Installs OpenCode Global configuration to the runtime directory.

.DESCRIPTION
  Installs the canonical OpenCode Global runtime from source. Copies neutral
  global configuration, profiles, routing, contracts, retrieval tools, templates,
  commands, and runtime scripts to the user's OpenCode runtime directory.

  This script is idempotent and will not overwrite existing files unless -Force
  is used. Does not install OpenCode itself (use npm install -g opencode-ai) or
  authenticate (use opencode auth login).

  The install consumes the canonical runtime-manifest.json for its inventory.

  IMPORTANT: When run from the installed runtime (not source), you must provide
  -SourceRoot pointing to the original source repository, or set OPENCODE_SOURCE_ROOT.

.PARAMETER SourceRoot
  Path to the source repository root (contains distribution/, global/, scripts/, etc.)
  Required when running from installed runtime. Defaults to parent of script directory
  if running from source repository.

.PARAMETER Force
  Overwrite existing files in the target directory

.PARAMETER DryRun
  Show what would be installed without making changes

.PARAMETER SkipDoctor
  Skip post-install doctor verification

.PARAMETER SkipCertify
  Skip post-install certify verification

.PARAMETER Quick
  Skip all post-install verification (equivalent to -SkipDoctor -SkipCertify)

.EXAMPLE
  # From source repository - full install with doctor and certify
  .\install-opencode-global.ps1

  # Quick install - files only, no verification
  .\install-opencode-global.ps1 -Quick

  # From installed runtime - must specify source root
  ~/.config/opencode/scripts/install-opencode-global.ps1 -SourceRoot C:\OpenCode\opencode-global-src
  ~/.config/opencode/scripts/install-opencode-global.ps1 -SourceRoot C:\OpenCode\opencode-global-src -DryRun
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

  $env:OPENCODE_SOURCE_ROOT = 'C:\OpenCode\opencode-global-src'

For installed runtime updates, use update-opencode-global.ps1 instead.
"@
}

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
  foreach ($duplicate in @($Inventory | Group-Object { $_.runtime } | Where-Object Count -gt 1)) {
    $failures += "Duplicate runtime destination: $($duplicate.Name)"
  }
   foreach ($critical in @('global_config', 'commands', 'runtime_scripts', 'contracts', 'bin_retrieval', 'bin_updates')) {
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

Write-Host "OpenCode Global Installer"
Write-Host "========================="
Write-Host ""
Write-Host "Source root: $RepoRoot"
Write-Host "Target dir:  $OpenCodeConfigDir"
Write-Host ""

# Resolve and validate the complete source distribution before creating the target.
$inventory = @(Get-RuntimeManifestInventory)
Test-DistributionPreflight -Inventory $inventory -Manifest $manifest

if (-not (Test-Path -LiteralPath $OpenCodeConfigDir)) {
  if (-not $DryRun) {
    New-Item -ItemType Directory -Path $OpenCodeConfigDir -Force | Out-Null
    Write-Host "[create] $OpenCodeConfigDir"
  } else {
    Write-Host "[would create] $OpenCodeConfigDir"
  }
}

$installedCount = 0
$wouldInstallCount = 0
$skippedCount = 0
$errorCount = 0

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

    if ((Test-Path -LiteralPath $destPath) -and -not $Force) {
      Write-Host "  [skip] $($entry.runtime) (exists)"
      $skippedCount++
      continue
    }

    if ($DryRun) {
      Write-Host "  [would install] $($entry.runtime)"
      $wouldInstallCount++
    } elseif ($PSCmdlet.ShouldProcess($destPath, "Install managed file from $($entry.source)")) {
      Write-SnapshotFile -Destination $destPath -Bytes $snapshot.Bytes
      Write-Host "  [install] $($entry.runtime)"
      $installedCount++
    } else {
      Write-Host "  [whatif] $($entry.runtime)"
      $wouldInstallCount++
    }
  }
  Write-Host ""
}

Write-Host ""
if ($DryRun) {
  Write-Host "Dry run complete. $wouldInstallCount file(s) would be installed."
  return
}

if ($errorCount -gt 0) {
  Write-Host "Installation completed with $errorCount error(s)."
} else {
  Write-Host "Installation complete. $installedCount file(s) installed."
}

# Quick mode skips all post-install verification
if ($Quick) {
  Write-Host ""
  Write-Host "Quick mode - post-install verification skipped."
  Write-Host "Run .\doctor-opencode-global.ps1 or .\certify-opencode-global.ps1 manually."
  return
}

# Post-install verification: doctor
$doctorFailed = $false
if (-not $SkipDoctor) {
  Write-Host ""
  Write-Host "[doctor] Running post-install verification..."
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

# Post-install verification: certify
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
  Write-Host "INSTALL_FAILED: Doctor verification failed. Run .\doctor-opencode-global.ps1 for details." -ForegroundColor Red
  exit 1
}
if ($certifyFailed) {
  Write-Host "INSTALL_FAILED: Certify verification failed. Run .\certify-opencode-global.ps1 for details." -ForegroundColor Red
  exit 2
}
if (-not $SkipDoctor -and -not $SkipCertify) {
  Write-Host "OpenCode Global installation certified successfully." -ForegroundColor Green
} else {
  Write-Host "OpenCode Global installation complete." -ForegroundColor Green
}
Write-Host ""
Write-Host "Optional: cross-session.ps1 is installed as a convenience wrapper."
Write-Host "  It requires the OpenCode runtime CLI at:"
Write-Host "  $env:USERPROFILE\.config\opencode\bin\orchestration\cross-session-cli.mjs"
