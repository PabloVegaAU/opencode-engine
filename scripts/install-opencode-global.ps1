<#
.SYNOPSIS
  Installs OpenCode Global configuration to ~/.config/opencode

.DESCRIPTION
  Copies the neutral global configuration to the user's OpenCode runtime directory.
  This script is idempotent and will not overwrite existing files unless -Force is used.
  Does not install OpenCode itself (use npm install -g opencode-ai) or authenticate
  (use opencode auth login).

.PARAMETER Force
  Overwrite existing files in the target directory

.PARAMETER DryRun
  Show what would be installed without making changes

.EXAMPLE
  .\install-opencode-global.ps1
  .\install-opencode-global.ps1 -Force
  .\install-opencode-global.ps1 -DryRun
#>
[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = "Medium")]
param(
  [switch]$Force,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$OpenCodeConfigDir = Join-Path $env:USERPROFILE ".config\opencode"

$filesToInstall = @(
  @{ Source = "global\opencode.jsonc"; Dest = "opencode.jsonc" },
  @{ Source = "global\opencode.profiles\go.jsonc"; Dest = "opencode.profiles\go.jsonc" },
  @{ Source = "global\opencode.profiles\chatgpt-plus.jsonc"; Dest = "opencode.profiles\chatgpt-plus.jsonc" },
  @{ Source = "global\opencode.profiles\mix.jsonc"; Dest = "opencode.profiles\mix.jsonc" },
  @{ Source = "global\opencode.profiles\minimax-plus.jsonc"; Dest = "opencode.profiles\minimax-plus.jsonc" },
  @{ Source = "global\opencode.profiles\model-matrix.json"; Dest = "routing\model-matrix.json" },
  @{ Source = "global\opencode.profiles\model-matrix.schema.json"; Dest = "routing\model-matrix.schema.json" },
  @{ Source = "global\protocols\AGENTS.global.md"; Dest = "AGENTS.md" }
)

$contracts = @(
  "bootstrap-manifest.schema.json",
  "manifest.schema.json",
  "session.schema.json",
  "index.schema.json",
  "graph.schema.json"
)

$scriptsToInstall = @(
  "install-opencode-global.ps1",
  "update-opencode-global.ps1",
  "doctor-opencode-global.ps1",
  "certify-opencode-global.ps1",
  "init-opencode-project.ps1",
  "update-opencode-project.ps1",
  "opencode-launcher.ps1",
  "cross-session.ps1",
  "cleanup-runtime.ps1"
)

$commandsToInstall = @(
  "go.md",
  "chatgpt-plus.md",
  "mix.md",
  "minimax-plus.md",
  "cross-session.md",
  "init-ai-env.md",
  "doctor-ai-env.md",
  "update-ai-env.md"
)

function Install-GlobalFile {
  param(
    [string]$SourcePath,
    [string]$RelativeDest,
    [bool]$Force
  )

  $destPath = Join-Path $OpenCodeConfigDir $RelativeDest
  if ((Test-Path -LiteralPath $destPath) -and -not $Force) {
    Write-Host "[skip] $RelativeDest (exists)"
    return
  }

  if ($PSCmdlet.ShouldProcess($destPath, "install")) {
    $parent = Split-Path -Parent $destPath
    if (-not (Test-Path -LiteralPath $parent)) {
      New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }
    Copy-Item -LiteralPath $SourcePath -Destination $destPath -Force
    Write-Host "[install] $RelativeDest"
  }
}

Write-Host "OpenCode Global Installer"
Write-Host "========================="
Write-Host ""

if (-not (Test-Path -LiteralPath $OpenCodeConfigDir)) {
  if ($PSCmdlet.ShouldProcess($OpenCodeConfigDir, "create directory")) {
    New-Item -ItemType Directory -Path $OpenCodeConfigDir -Force | Out-Null
    Write-Host "[create] $OpenCodeConfigDir"
  }
}

foreach ($file in $filesToInstall) {
  $sourcePath = Join-Path $RepoRoot $file.Source
  if (-not (Test-Path -LiteralPath $sourcePath)) {
    Write-Warning "Source file not found: $($file.Source)"
    continue
  }
  if ($DryRun) {
    Write-Host "  [would install] $($file.Dest)"
  } else {
    Install-GlobalFile -SourcePath $sourcePath -RelativeDest $file.Dest -Force $Force
  }
}

$contractsSourceDir = Join-Path $RepoRoot "contracts"
if (Test-Path -LiteralPath $contractsSourceDir) {
  foreach ($contract in $contracts) {
    $sourcePath = Join-Path $contractsSourceDir $contract
    if (Test-Path -LiteralPath $sourcePath) {
      if ($DryRun) {
        Write-Host "  [would install] contracts\$contract"
      } else {
        Install-GlobalFile -SourcePath $sourcePath -RelativeDest "contracts\$contract" -Force $Force
      }
    }
  }
}

$scriptsDestDir = Join-Path $OpenCodeConfigDir "scripts"
foreach ($script in $scriptsToInstall) {
  $sourcePath = Join-Path $RepoRoot "scripts\$script"
  if (Test-Path -LiteralPath $sourcePath) {
    if ($DryRun) {
      Write-Host "  [would install] scripts\$script"
    } else {
      Install-GlobalFile -SourcePath $sourcePath -RelativeDest "scripts\$script" -Force $Force
    }
  }
}

$commandsDestDir = Join-Path $OpenCodeConfigDir "commands"
foreach ($cmd in $commandsToInstall) {
  $sourcePath = Join-Path $RepoRoot "commands\$cmd"
  if (Test-Path -LiteralPath $sourcePath) {
    if ($DryRun) {
      Write-Host "  [would install] commands\$cmd"
    } else {
      Install-GlobalFile -SourcePath $sourcePath -RelativeDest "commands\$cmd" -Force $Force
    }
  }
}

Write-Host ""
if ($DryRun) {
  Write-Host "Dry run complete."
} else {
  Write-Host "Installation complete."
  Write-Host ""
  Write-Host "Next steps:"
  Write-Host "  1. Install OpenCode: npm install -g opencode-ai"
  Write-Host "  2. Authenticate: opencode auth login"
  Write-Host "  3. Run diagnostics: .\doctor-opencode-global.ps1"
  Write-Host "  4. Certify installation: .\certify-opencode-global.ps1"
  Write-Host ""
  Write-Host "Optional: cross-session.ps1 is installed as a convenience wrapper."
  Write-Host "  It requires the OpenCode runtime CLI at:"
  Write-Host "  $env:USERPROFILE\.config\opencode\bin\orchestration\cross-session-cli.mjs"
}
