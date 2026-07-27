<#
.SYNOPSIS
  Cleanup legacy files from OpenCode Global runtime.

.DESCRIPTION
  This script identifies and quarantines known legacy files from the runtime
  that are no longer part of the canonical distribution. It uses an allowlist
  approach to ensure only known legacy items are removed.

  **SAFETY FEATURES:**
  - Defaults to DryRun behavior (no files are deleted without explicit -Force)
  - Quarantines files to runtime/backups/legacy-runtime-<timestamp>/ instead of deleting
  - Never removes credentials, sessions, cache, node_modules, or active config
  - Reports opencode.backups as user archive requiring separate decision

  **REPOSITORY CONTAMINATION CANDIDATES:**
  - Runtime .git directory (should not exist in installed runtime)
  - docs/, specs/, tests/, working/ directories
  - Obsolete source-only root files: README.md, HANDOVER.md, estructura-proyecto.txt
  - Old source/build scripts under bin/ that are not canonical bin/retrieval

  **PRESERVED (NOT removed):**
  - Credentials, sessions, cache directories
  - .opencode/node_modules, root node_modules
  - bin/orchestration, bin/environment (may belong to separately installed OpenCode)
  - registry.sqlite
  - Active config/profiles (opencode.jsonc, opencode.profiles/)
  - opencode.backups (reported as user archive requiring separate decision)
  - Unknown files (never removed automatically)

.PARAMETER DryRun
  Show what would be quarantined without actually moving files (default behavior)

.PARAMETER Force
  Actually perform the quarantine operation (moves files to backup location)

.EXAMPLE
  .\cleanup-runtime.ps1 -DryRun
  .\cleanup-runtime.ps1 -Force
#>
[CmdletBinding()]
param(
  [switch]$DryRun,
  [switch]$Force
)

$ErrorActionPreference = "Stop"

# Support OPENCODE_CONFIG_DIR for sandbox isolation
if ($env:OPENCODE_CONFIG_DIR) {
  $OpenCodeConfigDir = $env:OPENCODE_CONFIG_DIR
} else {
  $OpenCodeConfigDir = Join-Path $env:USERPROFILE ".config\opencode"
}

# Legacy files that are known repository contamination from old source installations
$legacyFiles = @(
  "commands\chatgpt.md",
  "commands\minimax.md",
  "commands\orchestrate.md",
  "commands\init-orchestration.md",
  "commands\doctor-orchestration.md",
  "commands\update-orchestration.md",
  "scripts\switch-opencode-profile.ps1"
)

# Legacy directories that are known repository contamination
$legacyDirs = @(
  "opencode-global",
  ".git",
  "docs",
  "specs",
  "tests",
  "working"
)

# Legacy root files that should not exist in runtime
$legacyRootFiles = @(
  "README.md",
  "HANDOVER.md",
  "estructura-proyecto.txt"
)

# Old bin scripts that are not canonical bin/retrieval
$legacyBinScripts = @(
  "bin\setup-opencode.ps1",
  "bin\install-opencode.ps1",
  "bin\update-opencode.ps1",
  "bin\init-project.ps1"
)

# Patterns for adjacent .bak files created by old update scripts
$bakPatterns = @("*.bak", "*.bak-*")

# Historical adjacent backups that predate the manifest and are safe to quarantine.
$legacyAdjacentBackupAllowlist = @(
  "commands/chatgpt.md", "commands/minimax.md", "commands/orchestrate.md",
  "scripts/switch-opencode-profile.ps1"
)

if (-not (Test-Path -LiteralPath $OpenCodeConfigDir)) {
  Write-Host "OpenCode config directory not found: $OpenCodeConfigDir"
  Write-Host "Nothing to clean up."
  exit 0
}

Write-Host "OpenCode Global Runtime Cleanup"
Write-Host "================================"
Write-Host ""
Write-Host "Config directory: $OpenCodeConfigDir"
Write-Host ""

# Check if opencode.backups exists and report it
$backupsPath = Join-Path $OpenCodeConfigDir "opencode.backups"
if (Test-Path -LiteralPath $backupsPath) {
  Write-Host "[INFO] opencode.backups directory found at:"
  Write-Host "       $backupsPath"
  Write-Host "       This is a user archive and is NOT automatically cleaned."
  Write-Host "       Review and remove manually if no longer needed."
  Write-Host ""
}

# Determine actual DryRun state
$isDryRun = -not $Force
if ($isDryRun) {
  Write-Host "[DRY RUN] No files will be quarantined. Use -Force to apply changes."
  Write-Host ""
}

# Generate quarantine timestamp
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$quarantineRoot = Join-Path $OpenCodeConfigDir "runtime\backups\legacy-runtime-$timestamp"

$foundCount = 0
$quarantinedCount = 0
$wouldQuarantineCount = 0
$skippedCount = 0

$script:managedRuntimeFiles = @{}
$script:managedRuntimePrefixes = @()
function Initialize-ManagedRuntimeInventory {
  $manifestPath = Join-Path $OpenCodeConfigDir "distribution\runtime-manifest.json"
  if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { return }
  try {
    $resolverPath = Join-Path $OpenCodeConfigDir "distribution\resolve-runtime-manifest.ps1"
    if (Test-Path -LiteralPath $resolverPath -PathType Leaf) { . $resolverPath }
    $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($categoryProperty in $manifest.categories.PSObject.Properties) {
      $category = $categoryProperty.Value
      foreach ($entry in @($category.entries)) {
        if ($entry.runtime) { $script:managedRuntimeFiles[($entry.runtime -replace '\\', '/')] = $true }
      }
      foreach ($tree in @($category.recursive_trees)) {
        if ($tree.runtime) { $script:managedRuntimePrefixes += ($tree.runtime -replace '\\', '/') }
      }
      if ($category.recursive -and $category.runtime_prefix) { $script:managedRuntimePrefixes += ($category.runtime_prefix -replace '\\', '/') }
    }
  } catch {
    Write-Host "[INFO] Runtime manifest unavailable for backup classification; unknown adjacent backups will be preserved."
  }
}

function Test-ManagedOrLegacyBackupOriginal {
  param([string]$RelativePath)
  $normalized = $RelativePath -replace '\\', '/'
  if ($script:managedRuntimeFiles.ContainsKey($normalized) -or $legacyAdjacentBackupAllowlist -contains $normalized) { return $true }
  foreach ($prefix in $script:managedRuntimePrefixes) {
    if ($normalized.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) { return $true }
  }
  return $false
}

Initialize-ManagedRuntimeInventory

function Test-ProtectedRuntimePath {
  param([string]$RelativePath)
  $normalized = ($RelativePath -replace '\\', '/').TrimStart('/')
  return $normalized -match '^(?:credentials?|sessions?|caches?|logs?|node_modules|\.opencode/(?:credentials?|sessions?|caches?|logs?|node_modules)|opencode\.backups|runtime/backups|bin/(?:orchestration|environment))(?:/|$)'
}

function Get-RuntimeRelativePath {
  param([string]$FullPath)
  return [System.IO.Path]::GetRelativePath($OpenCodeConfigDir, $FullPath).TrimStart('\', '/')
}

function Quarantine-Item {
  param(
    [string]$FullPath,
    [string]$RelativePath,
    [string]$ItemType
  )

  if (Test-ProtectedRuntimePath -RelativePath $RelativePath) {
    Write-Host "[SKIP] $RelativePath (protected runtime state)"
    return "skipped"
  }
  $item = Get-Item -LiteralPath $FullPath -Force
  if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
    Write-Host "[SKIP] $RelativePath (reparse point is never followed or quarantined)"
    return "skipped"
  }
  if ($isDryRun) {
    Write-Host "[WOULD QUARANTINE] $RelativePath ($ItemType)"
    return "would_quarantine"
  } else {
    $quarantinePath = Join-Path $quarantineRoot $RelativePath
    $parent = Split-Path -Parent $quarantinePath
    if (-not (Test-Path -LiteralPath $parent)) {
      New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }
    if (Test-Path -LiteralPath $quarantinePath) {
      # Item already exists in quarantine (shouldn't happen, but handle it)
      $base = [System.IO.Path]::GetFileName($quarantinePath)
      $ext = [System.IO.Path]::GetExtension($quarantinePath)
      $name = [System.IO.Path]::GetFileNameWithoutExtension($quarantinePath)
      $newName = "$name-$timestamp$ext"
      $quarantinePath = Join-Path $parent "$newName"
    }
    Move-Item -LiteralPath $FullPath -Destination $quarantinePath -Force
    Write-Host "[QUARANTINED] $RelativePath -> runtime/backups/legacy-runtime-$timestamp/"
    return "quarantined"
  }
}

function Skip-Item {
  param([string]$Reason, [string]$RelativePath)
  Write-Host "[SKIP] $RelativePath ($Reason)"
  return "skipped"
}

function Get-SafeAdjacentBackupFiles {
  param([string]$Root)
  $results = @()
  $pending = @($Root)
  while ($pending.Count -gt 0) {
    $directory = $pending[-1]
    if ($pending.Count -eq 1) { $pending = @() } else { $pending = @($pending[0..($pending.Count - 2)]) }
    $relativeDirectory = [System.IO.Path]::GetRelativePath($Root, $directory).TrimStart('\', '/')
    if ($relativeDirectory -and (Test-ProtectedRuntimePath -RelativePath $relativeDirectory)) { continue }
    $directoryItem = Get-Item -LiteralPath $directory -Force
    if (($directoryItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
      Write-Host "[SKIP] $relativeDirectory (reparse-point directory not traversed)"
      continue
    }
    foreach ($child in Get-ChildItem -LiteralPath $directory -Force) {
      $relativePath = [System.IO.Path]::GetRelativePath($Root, $child.FullName).TrimStart('\', '/')
      if (Test-ProtectedRuntimePath -RelativePath $relativePath) { continue }
      if ($child.PSIsContainer) {
        if (($child.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
          Write-Host "[SKIP] $relativePath (reparse-point directory not traversed)"
        } else {
          $pending += $child.FullName
        }
        continue
      }
      if (($child.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        Write-Host "[SKIP] $relativePath (reparse-point file not traversed)"
        continue
      }
      if ($child.Name -like '*.bak' -or $child.Name -like '*.bak-*') { $results += $child }
    }
  }
  return $results
}

Write-Host "[Legacy Files]"
foreach ($file in $legacyFiles) {
  $fullPath = Join-Path $OpenCodeConfigDir $file
  $relativePath = $file
  if (Test-Path -LiteralPath $fullPath) {
    $foundCount++
    $result = Quarantine-Item -FullPath $fullPath -RelativePath $relativePath -ItemType "file"
    if ($result -eq "quarantined") { $quarantinedCount++ }
    if ($result -eq "would_quarantine") { $wouldQuarantineCount++ }
  } else {
    $skippedCount++
  }
}

Write-Host ""
Write-Host "[Legacy Directories]"
foreach ($dir in $legacyDirs) {
  $fullPath = Join-Path $OpenCodeConfigDir $dir
  $relativePath = $dir + "\"
  if (Test-Path -LiteralPath $fullPath) {
    # Extra safety: check this isn't a protected path
    if ($dir -eq ".git" -or $dir -eq "docs" -or $dir -eq "specs" -or $dir -eq "tests" -or $dir -eq "working") {
      # These are repository contamination - quarantine
      $foundCount++
      $result = Quarantine-Item -FullPath $fullPath -RelativePath $relativePath -ItemType "directory"
      if ($result -eq "quarantined") { $quarantinedCount++ }
      if ($result -eq "would_quarantine") { $wouldQuarantineCount++ }
    } else {
      $foundCount++
      $result = Quarantine-Item -FullPath $fullPath -RelativePath $relativePath -ItemType "directory"
      if ($result -eq "quarantined") { $quarantinedCount++ }
      if ($result -eq "would_quarantine") { $wouldQuarantineCount++ }
    }
  } else {
    $skippedCount++
  }
}

Write-Host ""
Write-Host "[Legacy Root Files]"
foreach ($file in $legacyRootFiles) {
  $fullPath = Join-Path $OpenCodeConfigDir $file
  $relativePath = $file
  if (Test-Path -LiteralPath $fullPath) {
    $foundCount++
    $result = Quarantine-Item -FullPath $fullPath -RelativePath $relativePath -ItemType "root file"
    if ($result -eq "quarantined") { $quarantinedCount++ }
    if ($result -eq "would_quarantine") { $wouldQuarantineCount++ }
  } else {
    $skippedCount++
  }
}

Write-Host ""
Write-Host "[Legacy Bin Scripts]"
foreach ($script in $legacyBinScripts) {
  $fullPath = Join-Path $OpenCodeConfigDir $script
  $relativePath = $script
  if (Test-Path -LiteralPath $fullPath) {
    $foundCount++
    $result = Quarantine-Item -FullPath $fullPath -RelativePath $relativePath -ItemType "bin script"
    if ($result -eq "quarantined") { $quarantinedCount++ }
    if ($result -eq "would_quarantine") { $wouldQuarantineCount++ }
  } else {
    $skippedCount++
  }
}

Write-Host ""
Write-Host "[Adjacent .bak Files]"
# Find all .bak files adjacent to managed files (created by old update scripts)
$bakFiles = @()
foreach ($candidate in @(Get-SafeAdjacentBackupFiles -Root $OpenCodeConfigDir)) {
  $relativePath = Get-RuntimeRelativePath -FullPath $candidate.FullName
  $normalizedRelativePath = $relativePath -replace '\\', '/'
  if (Test-ProtectedRuntimePath -RelativePath $normalizedRelativePath) {
    continue
  }

  # Only quarantine old adjacent backups, never files inside protected archives/state.
  # Check if there's a corresponding non-.bak file nearby
  $parentDir = Split-Path -Parent $candidate.FullName
  $bakName = $candidate.Name
  $originalName = $bakName -replace '\.bak(?:-\d{8}(?:-\d{6})?)?$', ''
  $potentialOriginal = Join-Path $parentDir $originalName
  $originalRelative = Get-RuntimeRelativePath -FullPath $potentialOriginal
  # Unknown user-owned backups are deliberately preserved, even when timestamped.
  $isManagedBackup = Test-ManagedOrLegacyBackupOriginal -RelativePath $originalRelative
  if ($isManagedBackup) { $bakFiles += $candidate }
}
foreach ($bak in $bakFiles) {
  $relativePath = Get-RuntimeRelativePath -FullPath $bak.FullName
  $foundCount++
  $result = Quarantine-Item -FullPath $bak.FullName -RelativePath $relativePath -ItemType ".bak file"
  if ($result -eq "quarantined") { $quarantinedCount++ }
  if ($result -eq "would_quarantine") { $wouldQuarantineCount++ }
}
if ($bakFiles.Count -eq 0) {
  Write-Host "[none found]"
  $skippedCount++
}

Write-Host ""
Write-Host "[Protected Items - Not Scanned]"
Write-Host "  - Credentials, sessions, cache directories (always preserved)"
Write-Host "  - .opencode/node_modules, root node_modules (never removed)"
Write-Host "  - bin/orchestration, bin/environment (separate OpenCode installation)"
Write-Host "  - registry.sqlite (never removed)"
Write-Host "  - Active config/profiles (opencode.jsonc, opencode.profiles/)"
Write-Host "  - opencode.backups (user archive - see above)"
Write-Host ""

Write-Host "================================"
Write-Host "Items found: $($foundCount + $skippedCount)"
Write-Host "Quarantined: $quarantinedCount"
Write-Host "Would quarantine: $wouldQuarantineCount"
Write-Host "Skipped (not found): $skippedCount"
Write-Host ""

if ($isDryRun) {
  Write-Host "Run with -Force to actually quarantine these items."
} else {
  if ($quarantinedCount -gt 0) {
    Write-Host "Quarantine complete. Items moved to:"
    Write-Host "  $quarantineRoot"
  } else {
    Write-Host "No items needed quarantine."
  }
}
