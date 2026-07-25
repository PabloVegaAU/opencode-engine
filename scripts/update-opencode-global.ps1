<#
.SYNOPSIS
  Updates the OpenCode Global installation without touching local state.

.DESCRIPTION
  Compares checksums and updates only the managed global files.
  Does not modify project configurations, credentials, sessions, or cache.
  Backs up existing files before updating.

.PARAMETER Force
  Update even unchanged files

.PARAMETER DryRun
  Show what would be updated without making changes

.EXAMPLE
  .\update-opencode-global.ps1
  .\update-opencode-global.ps1 -DryRun
  .\update-opencode-global.ps1 -Force
#>
[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = "Medium")]
param(
  [switch]$Force,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$OpenCodeConfigDir = Join-Path $env:USERPROFILE ".config\opencode"

$managedFiles = @(
  "opencode.jsonc",
  "opencode.profiles\go.jsonc",
  "opencode.profiles\chatgpt-plus.jsonc",
  "opencode.profiles\mix.jsonc",
  "opencode.profiles\minimax-plus.jsonc",
  "routing\model-matrix.json",
  "routing\model-matrix.schema.json",
  "AGENTS.md",
  "retrieval\default-policy.json",
  "contracts\retrieval-index-state.schema.json"
)

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

function Backup-ExistingFile {
  param([string]$Path)
  $backupDir = [System.IO.Path]::GetDirectoryName($Path)
  $backupBase = [System.IO.Path]::GetFileName($Path)
  $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $backupPath = Join-Path $backupDir "$backupBase.bak-$timestamp"
  Copy-Item -LiteralPath $Path -Destination $backupPath -Force
  Write-Host "[backup] $backupPath"
}

Write-Host "OpenCode Global Updater"
Write-Host "======================="
Write-Host ""
Write-Host "Global root: $RepoRoot"
Write-Host "Target dir:  $OpenCodeConfigDir"
Write-Host ""

if (-not (Test-Path -LiteralPath $OpenCodeConfigDir)) {
  Write-Error "OpenCode Global is not installed. Run install-opencode-global.ps1 first."
}

$changes = 0
foreach ($relativePath in $managedFiles) {
  $sourcePath = Join-Path $RepoRoot "global\$relativePath"
  if ($relativePath -eq "AGENTS.md") {
    $sourcePath = Join-Path $RepoRoot "global\protocols\AGENTS.global.md"
  }
  $destPath = Join-Path $OpenCodeConfigDir $relativePath

  if (-not (Test-Path -LiteralPath $sourcePath)) {
    Write-Warning "Source not found: $sourcePath"
    continue
  }

  $sourceHash = Get-FileSha256 -Path $sourcePath
  $destHash = if (Test-Path -LiteralPath $destPath) { Get-FileSha256 -Path $destPath } else { $null }

  if ($sourceHash -eq $destHash -and -not $Force) {
    Write-Host "[unchanged] $relativePath"
    continue
  }

  if ($DryRun) {
    Write-Host "[update] $relativePath (would update)"
    $changes++
    continue
  }

  if (Test-Path -LiteralPath $destPath) {
    Backup-ExistingFile -Path $destPath
  }

  if ($PSCmdlet.ShouldProcess($destPath, "update")) {
    $parent = Split-Path -Parent $destPath
    if (-not (Test-Path -LiteralPath $parent)) {
      New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }
    Copy-Item -LiteralPath $sourcePath -Destination $destPath -Force
    Write-Host "[updated] $relativePath"
    $changes++
  }
}

$contractsSourceDir = Join-Path $RepoRoot "contracts"
if (Test-Path -LiteralPath $contractsSourceDir) {
  $contractsDestDir = Join-Path $OpenCodeConfigDir "contracts"
  foreach ($file in Get-ChildItem -LiteralPath $contractsSourceDir -Filter "*.json") {
    $sourcePath = $file.FullName
    $destPath = Join-Path $contractsDestDir $file.Name
    $sourceHash = Get-FileSha256 -Path $sourcePath
    $destHash = if (Test-Path -LiteralPath $destPath) { Get-FileSha256 -Path $destPath } else { $null }

    if ($sourceHash -eq $destHash -and -not $Force) {
      Write-Host "[unchanged] contracts\$($file.Name)"
      continue
    }

    if ($DryRun) {
      Write-Host "[update] contracts\$($file.Name) (would update)"
      $changes++
      continue
    }

    if (Test-Path -LiteralPath $destPath) {
      Backup-ExistingFile -Path $destPath
    }

    if ($PSCmdlet.ShouldProcess($destPath, "update")) {
      if (-not (Test-Path -LiteralPath $contractsDestDir)) {
        New-Item -ItemType Directory -Path $contractsDestDir -Force | Out-Null
      }
      Copy-Item -LiteralPath $sourcePath -Destination $destPath -Force
      Write-Host "[updated] contracts\$($file.Name)"
      $changes++
    }
  }
}

$scriptsToUpdate = @(
  "install-opencode-global.ps1",
  "update-opencode-global.ps1",
  "doctor-opencode-global.ps1",
  "certify-opencode-global.ps1",
  "init-opencode-project.ps1",
  "update-opencode-project.ps1",
  "opencode-launcher.ps1",
  "cross-session.ps1",
  "cleanup-runtime.ps1",
  "retrieval-router.ps1",
  "setup-retrieval-tools.ps1"
)

$scriptsDestDir = Join-Path $OpenCodeConfigDir "scripts"
foreach ($script in $scriptsToUpdate) {
  $sourcePath = Join-Path $RepoRoot "scripts\$script"
  $destPath = Join-Path $scriptsDestDir $script
  if (-not (Test-Path -LiteralPath $sourcePath)) {
    Write-Warning "Source script not found: scripts\$script"
    continue
  }
  $sourceHash = Get-FileSha256 -Path $sourcePath
  $destHash = if (Test-Path -LiteralPath $destPath) { Get-FileSha256 -Path $destPath } else { $null }
  if ($sourceHash -eq $destHash -and -not $Force) {
    Write-Host "[unchanged] scripts\$script"
    continue
  }
  if ($DryRun) {
    Write-Host "[update] scripts\$script (would update)"
    $changes++
    continue
  }
  if (Test-Path -LiteralPath $destPath) {
    Backup-ExistingFile -Path $destPath
  }
  if ($PSCmdlet.ShouldProcess($destPath, "update")) {
    if (-not (Test-Path -LiteralPath $scriptsDestDir)) {
      New-Item -ItemType Directory -Path $scriptsDestDir -Force | Out-Null
    }
    Copy-Item -LiteralPath $sourcePath -Destination $destPath -Force
    Write-Host "[updated] scripts\$script"
    $changes++
  }
}

$retrievalBinSourceDir = Join-Path $RepoRoot "bin\retrieval"
$retrievalBinDestDir = Join-Path $OpenCodeConfigDir "bin\retrieval"
if (Test-Path -LiteralPath $retrievalBinSourceDir) {
  foreach ($file in Get-ChildItem -LiteralPath $retrievalBinSourceDir -File) {
    $sourcePath = $file.FullName
    $destPath = Join-Path $retrievalBinDestDir $file.Name
    $sourceHash = Get-FileSha256 -Path $sourcePath
    $destHash = if (Test-Path -LiteralPath $destPath) { Get-FileSha256 -Path $destPath } else { $null }
    if ($sourceHash -eq $destHash -and -not $Force) {
      Write-Host "[unchanged] bin\retrieval\$($file.Name)"
      continue
    }
    if ($DryRun) {
      Write-Host "[update] bin\retrieval\$($file.Name) (would update)"
      $changes++
      continue
    }
    if (Test-Path -LiteralPath $destPath) {
      Backup-ExistingFile -Path $destPath
    }
    if ($PSCmdlet.ShouldProcess($destPath, "update")) {
      if (-not (Test-Path -LiteralPath $retrievalBinDestDir)) {
        New-Item -ItemType Directory -Path $retrievalBinDestDir -Force | Out-Null
      }
      Copy-Item -LiteralPath $sourcePath -Destination $destPath -Force
      Write-Host "[updated] bin\retrieval\$($file.Name)"
      $changes++
    }
  }
}

$commandsToUpdate = @(
  "go.md",
  "chatgpt-plus.md",
  "mix.md",
  "minimax-plus.md",
  "cross-session.md",
  "init-ai-env.md",
  "doctor-ai-env.md",
  "update-ai-env.md"
)

$commandsDestDir = Join-Path $OpenCodeConfigDir "commands"
foreach ($cmd in $commandsToUpdate) {
  $sourcePath = Join-Path $RepoRoot "commands\$cmd"
  $destPath = Join-Path $commandsDestDir $cmd
  if (-not (Test-Path -LiteralPath $sourcePath)) {
    Write-Warning "Source command not found: commands\$cmd"
    continue
  }
  $sourceHash = Get-FileSha256 -Path $sourcePath
  $destHash = if (Test-Path -LiteralPath $destPath) { Get-FileSha256 -Path $destPath } else { $null }
  if ($sourceHash -eq $destHash -and -not $Force) {
    Write-Host "[unchanged] commands\$cmd"
    continue
  }
  if ($DryRun) {
    Write-Host "[update] commands\$cmd (would update)"
    $changes++
    continue
  }
  if (Test-Path -LiteralPath $destPath) {
    Backup-ExistingFile -Path $destPath
  }
  if ($PSCmdlet.ShouldProcess($destPath, "update")) {
    if (-not (Test-Path -LiteralPath $commandsDestDir)) {
      New-Item -ItemType Directory -Path $commandsDestDir -Force | Out-Null
    }
    Copy-Item -LiteralPath $sourcePath -Destination $destPath -Force
    Write-Host "[updated] commands\$cmd"
    $changes++
  }
}

Write-Host ""
if ($DryRun) {
  Write-Host "Dry run complete. $changes file(s) would be updated."
} else {
  Write-Host "Update complete. $changes file(s) updated."
  Write-Host ""
  Write-Host "Run .\doctor-opencode-global.ps1 to verify the installation."
}
