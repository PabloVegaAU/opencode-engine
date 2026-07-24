<#
.SYNOPSIS
  Cleanup legacy files from OpenCode Global runtime

.DESCRIPTION
  This script removes known legacy files from the runtime that are no longer
  part of the canonical distribution. It uses an allowlist approach to ensure
  only known legacy files are removed.

.PARAMETER DryRun
  Show what would be deleted without actually deleting

.PARAMETER Force
  Actually perform the deletion

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
$OpenCodeConfigDir = Join-Path $env:USERPROFILE ".config\opencode"

$legacyFiles = @(
  "commands\chatgpt.md",
  "commands\minimax.md",
  "commands\orchestrate.md",
  "commands\init-orchestration.md",
  "commands\doctor-orchestration.md",
  "commands\update-orchestration.md",
  "scripts\switch-opencode-profile.ps1"
)

$legacyDirs = @(
  "opencode-global"
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

if ($DryRun) {
  Write-Host "[DRY RUN] No files will be deleted."
  Write-Host ""
}

$deletedCount = 0
$skippedCount = 0

foreach ($file in $legacyFiles) {
  $fullPath = Join-Path $OpenCodeConfigDir $file
  if (Test-Path -LiteralPath $fullPath) {
    if ($DryRun -or $Force) {
      if ($Force) {
        Remove-Item -LiteralPath $fullPath -Force
        Write-Host "[DELETED] $file"
      } else {
        Write-Host "[WOULD DELETE] $file"
      }
      $deletedCount++
    }
  } else {
    Write-Host "[SKIP] $file (not found)"
    $skippedCount++
  }
}

foreach ($dir in $legacyDirs) {
  $fullPath = Join-Path $OpenCodeConfigDir $dir
  if (Test-Path -LiteralPath $fullPath) {
    if ($DryRun -or $Force) {
      if ($Force) {
        Remove-Item -LiteralPath $fullPath -Recurse -Force
        Write-Host "[DELETED] $dir\ (directory)"
      } else {
        Write-Host "[WOULD DELETE] $dir\ (directory)"
      }
      $deletedCount++
    }
  } else {
    Write-Host "[SKIP] $dir\ (not found)"
    $skippedCount++
  }
}

Write-Host ""
Write-Host "================================"
Write-Host "Files found: $($deletedCount + $skippedCount)"
Write-Host "Would delete/Deleted: $deletedCount"
Write-Host "Skipped (not found): $skippedCount"
Write-Host ""

if ($DryRun) {
  Write-Host "Run with -Force to actually delete."
} else {
  Write-Host "Cleanup complete."
}
