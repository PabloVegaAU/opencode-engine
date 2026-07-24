<#
.SYNOPSIS
  Updates project OpenCode artifacts to latest global configuration.

.DESCRIPTION
  Updates managed OpenCode artifacts in a project by comparing checksums and
  only modifying files that differ from the global source. Creates backups
  before overwriting. Does NOT modify project-specific configuration.

.PARAMETER ProjectPath
  Target project directory path

.PARAMETER Force
  Overwrite even unchanged files

.PARAMETER DryRun
  Show what would be updated without making changes

.EXAMPLE
  .\update-opencode-project.ps1 -ProjectPath C:\my-project
  .\update-opencode-project.ps1 C:\my-project -DryRun
  .\update-opencode-project.ps1 C:\my-project -Force
#>
[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = "Medium")]
param(
  [Parameter(Mandatory = $false, Position = 0)]
  [string]$ProjectPath = (Get-Location).Path,

  [switch]$Force,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$GlobalRoot = Split-Path -Parent $PSScriptRoot
$TargetRoot = [System.IO.Path]::GetFullPath($ProjectPath)
$OpenCodeConfigDir = Join-Path $env:USERPROFILE ".config\opencode"
$BackupSuffix = ".bak"

function ConvertTo-RelativeArtifactPath {
  param([string]$RelativePath)
  return ($RelativePath -replace '\\', '/')
}

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

function Write-ProjectFile {
  param(
    [string]$RelativePath,
    [string]$Content
  )

  $destination = Join-Path $TargetRoot $RelativePath
  $parent = Split-Path -Parent $destination

  if ($PSCmdlet.ShouldProcess($destination, "write updated OpenCode artifact")) {
    if (-not (Test-Path -LiteralPath $parent)) {
      New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }
    [System.IO.File]::WriteAllText($destination, $Content, [System.Text.UTF8Encoding]::new($false))
    Write-Host "[update] $destination"
  }
}

function Copy-GenericFile {
  param(
    [string]$Source,
    [string]$RelativePath
  )

  $destination = Join-Path $TargetRoot $RelativePath
  $parent = Split-Path -Parent $destination

  if ($PSCmdlet.ShouldProcess($destination, "copy updated OpenCode artifact")) {
    if (-not (Test-Path -LiteralPath $parent)) {
      New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }
    Copy-Item -LiteralPath $Source -Destination $destination -Force
    Write-Host "[update] $destination"
  }
}

function Backup-ExistingFile {
  param([string]$Path)
  if (Test-Path -LiteralPath $Path) {
    $backupPath = $Path + $BackupSuffix
    Copy-Item -LiteralPath $Path -Destination $backupPath -Force
    Write-Host "[backup] $backupPath"
  }
}

Write-Host "OpenCode Project Updater"
Write-Host "========================"
Write-Host ""
Write-Host "Global root: $GlobalRoot"
Write-Host "Target:       $TargetRoot"
Write-Host ""

$normalizedOpenCode = [System.IO.Path]::GetFullPath($OpenCodeConfigDir).TrimEnd('\', '/')
$normalizedTarget = $TargetRoot.TrimEnd('\', '/')
if ([string]::Equals($normalizedTarget, $normalizedOpenCode, [System.StringComparison]::OrdinalIgnoreCase)) {
  Write-Error "Cannot update the global OpenCode directory as a project."
}

if (-not (Test-Path -LiteralPath $TargetRoot -PathType Container)) {
  Write-Error "Target directory does not exist: $TargetRoot"
}

$updatedCount = 0
$skippedCount = 0
$backupCount = 0

$minimalConfig = [ordered]@{
  '$schema' = 'https://opencode.ai/config.json'
} | ConvertTo-Json -Depth 4
$minimalConfigPath = 'opencode.json'
$minimalConfigDestination = Join-Path $TargetRoot $minimalConfigPath
if ((Test-Path -LiteralPath $minimalConfigDestination) -or (Test-Path -LiteralPath (Join-Path $TargetRoot 'opencode.jsonc'))) {
  Write-Host "[skip] opencode.json (exists or opencode.jsonc present)"
  $skippedCount++
}

$agentsSource = Join-Path $GlobalRoot "templates\project-neutral\AGENTS.md"
if ((Test-Path -LiteralPath $agentsSource) -and (Test-Path -LiteralPath (Join-Path $TargetRoot "AGENTS.md"))) {
  $sourceChecksum = Get-FileSha256Lower -Path $agentsSource
  $destChecksum = Get-FileSha256Lower -Path (Join-Path $TargetRoot "AGENTS.md")
  if ($sourceChecksum -ne $destChecksum -or $Force) {
    Backup-ExistingFile -Path (Join-Path $TargetRoot "AGENTS.md")
    Copy-GenericFile -Source $agentsSource -RelativePath 'AGENTS.md'
    $updatedCount++
    $backupCount++
  } else {
    Write-Host "[skip] AGENTS.md (unchanged)"
    $skippedCount++
  }
}

$bootstrapManifestSource = Join-Path $GlobalRoot "templates\project-neutral\.bootstrap\project-manifest.json"
$bootstrapManifestDest = Join-Path $TargetRoot ".bootstrap\project-manifest.json"
if ((Test-Path -LiteralPath $bootstrapManifestSource) -and (Test-Path -LiteralPath $bootstrapManifestDest)) {
  $sourceChecksum = Get-FileSha256Lower -Path $bootstrapManifestSource
  $destChecksum = Get-FileSha256Lower -Path $bootstrapManifestDest
  if ($sourceChecksum -ne $destChecksum -or $Force) {
    Backup-ExistingFile -Path $bootstrapManifestDest
    Copy-GenericFile -Source $bootstrapManifestSource -RelativePath '.bootstrap\project-manifest.json'
    $updatedCount++
    $backupCount++
  } else {
    Write-Host "[skip] .bootstrap/project-manifest.json (unchanged)"
    $skippedCount++
  }
}

$intelligenceRelativePaths = @('.intelligence\manifest.json', '.intelligence\index.json', '.intelligence\graph.jsonl')
$intelligenceReadmeSource = Join-Path $GlobalRoot "templates\project-neutral\.intelligence\README.md"
foreach ($relativePath in $intelligenceRelativePaths) {
  $sourcePath = Join-Path $GlobalRoot "templates\project-neutral\$relativePath"
  if (Test-Path -LiteralPath $sourcePath) {
    $destPath = Join-Path $TargetRoot $relativePath
    if (Test-Path -LiteralPath $destPath) {
      $sourceChecksum = Get-FileSha256Lower -Path $sourcePath
      $destChecksum = Get-FileSha256Lower -Path $destPath
      if ($sourceChecksum -ne $destChecksum -or $Force) {
        Backup-ExistingFile -Path $destPath
        Copy-GenericFile -Source $sourcePath -RelativePath $relativePath
        $updatedCount++
        $backupCount++
      } else {
        Write-Host "[skip] $relativePath (unchanged)"
        $skippedCount++
      }
    }
  }
}
if (Test-Path -LiteralPath $intelligenceReadmeSource) {
  $destPath = Join-Path $TargetRoot ".intelligence\README.md"
  if (Test-Path -LiteralPath $destPath) {
    $sourceChecksum = Get-FileSha256Lower -Path $intelligenceReadmeSource
    $destChecksum = Get-FileSha256Lower -Path $destPath
    if ($sourceChecksum -ne $destChecksum -or $Force) {
      Backup-ExistingFile -Path $destPath
      Copy-GenericFile -Source $intelligenceReadmeSource -RelativePath '.intelligence\README.md'
      $updatedCount++
      $backupCount++
    } else {
      Write-Host "[skip] .intelligence/README.md (unchanged)"
      $skippedCount++
    }
  }
}

$contractNames = @('manifest.schema.json', 'index.schema.json', 'graph.schema.json', 'session.schema.json', 'bootstrap-manifest.schema.json')
foreach ($name in $contractNames) {
  $sourcePath = Join-Path $OpenCodeConfigDir "contracts\$name"
  if (-not (Test-Path -LiteralPath $sourcePath)) {
    $sourcePath = Join-Path $GlobalRoot "contracts\$name"
  }
  if (Test-Path -LiteralPath $sourcePath) {
    $relativePath = "contracts\$name"
    $destPath = Join-Path $TargetRoot $relativePath
    if (Test-Path -LiteralPath $destPath) {
      $sourceChecksum = Get-FileSha256Lower -Path $sourcePath
      $destChecksum = Get-FileSha256Lower -Path $destPath
      if ($sourceChecksum -ne $destChecksum -or $Force) {
        Backup-ExistingFile -Path $destPath
        Copy-GenericFile -Source $sourcePath -RelativePath $relativePath
        $updatedCount++
        $backupCount++
      } else {
        Write-Host "[skip] contracts\$name (unchanged)"
        $skippedCount++
      }
    }
  }
}

$profileCommandNames = @('go.md', 'chatgpt-plus.md', 'mix.md', 'minimax-plus.md')
foreach ($name in $profileCommandNames) {
  $sourcePath = Join-Path $GlobalRoot "templates\project-neutral\.opencode\commands\$name"
  if (Test-Path -LiteralPath $sourcePath) {
    $relativePath = ".opencode\commands\$name"
    $destPath = Join-Path $TargetRoot $relativePath
    if (Test-Path -LiteralPath $destPath) {
      $sourceChecksum = Get-FileSha256Lower -Path $sourcePath
      $destChecksum = Get-FileSha256Lower -Path $destPath
      if ($sourceChecksum -ne $destChecksum -or $Force) {
        Backup-ExistingFile -Path $destPath
        Copy-GenericFile -Source $sourcePath -RelativePath $relativePath
        $updatedCount++
        $backupCount++
      } else {
        Write-Host "[skip] .opencode/commands/$name (unchanged)"
        $skippedCount++
      }
    }
  }
}

Write-Host ""
Write-Host "Update complete: $TargetRoot"
Write-Host "Updated: $updatedCount"
Write-Host "Skipped: $skippedCount"
Write-Host "Backups: $backupCount"
Write-Host ""
if ($DryRun) {
  Write-Host "This was a DRY RUN. No files were modified."
}
