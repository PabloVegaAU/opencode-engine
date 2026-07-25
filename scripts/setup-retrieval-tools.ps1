<#
.SYNOPSIS
  Checks or installs recommended retrieval tools for OpenCode Global

.DESCRIPTION
  This script checks for recommended retrieval tools and optionally installs
  them. It supports Windows (WinGet), macOS (Homebrew), and Linux (package manager).

  Modes:
    -Check                  : Check and report tool status only
    -InstallRecommended     : Install recommended tools with confirmation
    -WhatIf                : Show what would be installed without modifying system

.PARAMETER Check
  Only check and report tool status (default if no mode specified)

.PARAMETER InstallRecommended
  Install recommended tools after explicit confirmation

.PARAMETER WhatIf
  Show what would be installed without making changes

.EXAMPLE
  .\setup-retrieval-tools.ps1 -Check

.EXAMPLE
  .\setup-retrieval-tools.ps1 -InstallRecommended

.EXAMPLE
  .\setup-retrieval-tools.ps1 -InstallRecommended -WhatIf
#>
[CmdletBinding()]
param(
  [switch]$Check,
  [switch]$InstallRecommended,
  [switch]$WhatIf
)

$ErrorActionPreference = "Stop"

$UserHome = if ($HOME) {
  $HOME
} else {
  [Environment]::GetFolderPath([Environment+SpecialFolder]::UserProfile)
}

$ConfigBase = if ($env:XDG_CONFIG_HOME) {
  $env:XDG_CONFIG_HOME
} else {
  Join-Path $UserHome ".config"
}

$OpenCodeConfigDir = Join-Path $ConfigBase "opencode"

enum ToolStatus {
  Available
  Missing
  Unknown
}

enum InstallMethod {
  WinGet
  Homebrew
  Apt
  Yum
  Dnf
  Zypper
  Unknown
}

function Get-OsType {
  if ($IsWindows) { return "Windows" }
  if ($IsMacOS) { return "macOS" }
  if ($IsLinux) { return "Linux" }
  return "Unknown"
}

function Get-InstallMethod {
  param([string]$OsType)
  switch ($OsType) {
    "Windows" {
      $winget = Get-Command winget -ErrorAction SilentlyContinue
      if ($winget) { return [InstallMethod]::WinGet }
    }
    "macOS" {
      $brew = Get-Command brew -ErrorAction SilentlyContinue
      if ($brew) { return [InstallMethod]::Homebrew }
    }
    "Linux" {
      if (Get-Command apt-get -ErrorAction SilentlyContinue) { return [InstallMethod]::Apt }
      if (Get-Command yum -ErrorAction SilentlyContinue) { return [InstallMethod]::Yum }
      if (Get-Command dnf -ErrorAction SilentlyContinue) { return [InstallMethod]::Dnf }
      if (Get-Command zypper -ErrorAction SilentlyContinue) { return [InstallMethod]::Zypper }
    }
  }
  return [InstallMethod]::Unknown
}

function Test-ToolAvailable {
  param([string]$Command)
  try {
    $null = Get-Command $Command -ErrorAction SilentlyContinue
    return $true
  } catch {
    return $false
  }
}

function Get-ToolsStatus {
  $status = @{
    OsType = Get-OsType
    InstallMethod = Get-InstallMethod (Get-OsType)
    Git = @{
      Command = "git"
      Status = [ToolStatus]::Missing
      InstallCommand = $null
    }
    Ripgrep = @{
      Command = "rg"
      Status = [ToolStatus]::Missing
      InstallCommand = $null
    }
    Node = @{
      Command = "node"
      Status = [ToolStatus]::Missing
      InstallCommand = $null
    }
    PowerShell = @{
      Command = "pwsh"
      Status = [ToolStatus]::Missing
      InstallCommand = $null
    }
  }

  if (Test-ToolAvailable "git") { $status.Git.Status = [ToolStatus]::Available }
  if (Test-ToolAvailable "rg") { $status.Ripgrep.Status = [ToolStatus]::Available }
  if (Test-ToolAvailable "node") { $status.Node.Status = [ToolStatus]::Available }
  if (Test-ToolAvailable "pwsh") { $status.PowerShell.Status = [ToolStatus]::Available }

  switch ($status.OsType) {
    "Windows" {
      $status.Git.InstallCommand = "winget install --id Git.Git --exact --source winget"
      $status.Ripgrep.InstallCommand = "winget install --id BurntSushi.ripgrep.MSVC --exact"
      $status.Node.InstallCommand = "winget install OpenJS.NodeJS"
      $status.PowerShell.InstallCommand = "winget install Microsoft.PowerShell --exact"
    }
    "macOS" {
      $status.Git.InstallCommand = "brew install git"
      $status.Ripgrep.InstallCommand = "brew install ripgrep"
      $status.Node.InstallCommand = "brew install node"
      $status.PowerShell.InstallCommand = "brew install --cask powershell"
    }
    "Linux" {
      switch ($status.InstallMethod) {
        "Apt" {
          $status.Git.InstallCommand = "sudo apt-get install git"
          $status.Ripgrep.InstallCommand = "sudo apt-get install ripgrep"
          $status.Node.InstallCommand = "curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs"
          $status.PowerShell.InstallCommand = "sudo apt-get install powershell"
        }
        "Yum" {
          $status.Git.InstallCommand = "sudo yum install git"
          $status.Ripgrep.InstallCommand = "sudo yum install ripgrep"
          $status.Node.InstallCommand = "curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash - && sudo yum install -y nodejs"
          $status.PowerShell.InstallCommand = "sudo yum install powershell"
        }
        "Dnf" {
          $status.Git.InstallCommand = "sudo dnf install git"
          $status.Ripgrep.InstallCommand = "sudo dnf install ripgrep"
          $status.Node.InstallCommand = "curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash - && sudo dnf install -y nodejs"
          $status.PowerShell.InstallCommand = "sudo dnf install powershell"
        }
        "Zypper" {
          $status.Git.InstallCommand = "sudo zypper install git"
          $status.Ripgrep.InstallCommand = "sudo zypper install ripgrep"
          $status.Node.InstallCommand = "curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash - && sudo zypper install -y nodejs"
          $status.PowerShell.InstallCommand = "sudo zypper install powershell"
        }
        default {
          $status.Git.InstallCommand = "Install git via your distribution's package manager"
          $status.Ripgrep.InstallCommand = "Install ripgrep via your distribution's package manager"
          $status.Node.InstallCommand = "Install Node.js via your distribution's package manager or from nodejs.org"
          $status.PowerShell.InstallCommand = "Install PowerShell via your distribution's package manager"
        }
      }
    }
  }

  return $status
}

function Get-RetrievalTier {
  param([hashtable]$Status)
  if ($Status.Ripgrep.Status -eq [ToolStatus]::Available) {
    return "OPTIMAL"
  }
  if ($Status.Git.Status -eq [ToolStatus]::Available) {
    return "FUNCTIONAL"
  }
  return "INCOMPLETE"
}

function Write-ToolsReport {
  param([hashtable]$Status)
  $tier = Get-RetrievalTier -Status $Status

  Write-Host ""
  Write-Host "OpenCode Retrieval Tools Status"
  Write-Host "================================"
  Write-Host "OS: $($Status.OsType)"
  Write-Host "Install method: $($Status.InstallMethod)"
  Write-Host ""
  Write-Host "Retrieval tier: $tier"
  Write-Host ""

  $tools = @($Status.Git, $Status.Ripgrep, $Status.Node, $Status.PowerShell)
  foreach ($tool in $tools) {
    $symbol = switch ($tool.Status) {
      ([ToolStatus]::Available) { "[OK]" }
      ([ToolStatus]::Missing) { "[MISSING]" }
      default { "[?]" }
    }
    Write-Host "  $symbol $($tool.Command)"
  }

  Write-Host ""
  if ($tier -eq "INCOMPLETE") {
    Write-Host "[ISSUE] No exact retrieval provider available" -ForegroundColor Red
    Write-Host ""
    Write-Host "To enable retrieval:"
    Write-Host "  $($Status.Git.InstallCommand)"
    if ($Status.Ripgrep.Status -ne [ToolStatus]::Available) {
      Write-Host "  $($Status.Ripgrep.InstallCommand)"
    }
  } elseif ($tier -eq "FUNCTIONAL") {
    Write-Host "[INFO] ripgrep not installed; git grep fallback available" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "For optimal performance:"
    Write-Host "  $($Status.Ripgrep.InstallCommand)"
  } else {
    Write-Host "[OK] All recommended retrieval tools available" -ForegroundColor Green
  }

  return $tier
}

function Install-RecommendedTools {
  param(
    [hashtable]$Status,
    [switch]$WhatIf
  )
  $tools = @($Status.Ripgrep, $Status.Git, $Status.Node, $Status.PowerShell)
  $missingTools = $tools | Where-Object { $_.Status -ne [ToolStatus]::Available }

  if ($missingTools.Count -eq 0) {
    Write-Host "All recommended tools are already installed." -ForegroundColor Green
    return
  }

  Write-Host ""
  Write-Host "Would install the following tools:" -ForegroundColor Cyan
  foreach ($tool in $missingTools) {
    Write-Host "  $($tool.Command): $($tool.InstallCommand)"
  }

  if ($WhatIf) {
    Write-Host ""
    Write-Host "[WhatIf] No changes were made." -ForegroundColor Yellow
    return
  }

  Write-Host ""
  $confirmation = Read-Host "Proceed with installation? (y/N)"
  if ($confirmation -ne "y" -and $confirmation -ne "Y") {
    Write-Host "Installation cancelled." -ForegroundColor Yellow
    return
  }

  foreach ($tool in $missingTools) {
    Write-Host ""
    Write-Host "Installing $($tool.Command)..." -ForegroundColor Cyan
    try {
      $parts = $tool.InstallCommand -split ' ', 2
      $cmd = $parts[0]
      $args = if ($parts.Length -gt 1) { $parts[1] -split ' ' } else { @() }
      $result = & $cmd $args 2>&1
      if ($LASTEXITCODE -eq 0 -or $result) {
        Write-Host "  [OK] $($tool.Command) installed" -ForegroundColor Green
      } else {
        Write-Host "  [FAIL] $($tool.Command) installation failed" -ForegroundColor Red
        Write-Host "  Try manually: $($tool.InstallCommand)"
      }
    } catch {
      Write-Host "  [FAIL] $($tool.Command) installation failed: $($_.Exception.Message)" -ForegroundColor Red
      Write-Host "  Try manually: $($tool.InstallCommand)"
    }
  }
}

$status = Get-ToolsStatus
$tier = Write-ToolsReport -Status $status

if (-not $Check -and -not $InstallRecommended -and -not $WhatIf) {
  $Check = $true
}

if ($InstallRecommended) {
  Install-RecommendedTools -Status $status -WhatIf:$WhatIf
}

if ($tier -eq "INCOMPLETE" -and -not $InstallRecommended) {
  Write-Host ""
  Write-Host "To install recommended tools:"
  Write-Host "  .\setup-retrieval-tools.ps1 -InstallRecommended"
}

exit 0
