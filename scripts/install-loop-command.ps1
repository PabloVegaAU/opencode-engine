<#
.SYNOPSIS
    Install Loop Command to OpenCode Runtime

.DESCRIPTION
    Copies loop command files to the OpenCode global runtime directory.
    This enables 'opencode loop' access via the global scripts.

.PARAMETER RuntimeRoot
    OpenCode runtime root (default: $env:USERPROFILE\.config\opencode)

.EXAMPLE
    .\install-loop-command.ps1
    .\install-loop-command.ps1 -RuntimeRoot "C:\CustomPath"
#>

param(
    [Parameter(Mandatory=$false)]
    [string]$RuntimeRoot = if ($env:OPENCODE_CONFIG_DIR) { $env:OPENCODE_CONFIG_DIR } else { Join-Path $env:USERPROFILE ".config\opencode" }
)

$ErrorActionPreference = "Stop"

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $colors = @{
        "INFO" = "White"
        "SUCCESS" = "Green"
        "WARN" = "Yellow"
        "ERROR" = "Red"
    }
    Write-Host "[$timestamp] [$Level] $Message" -ForegroundColor $colors[$Level]
}

Write-Log "Installing Loop Command to: $RuntimeRoot" "INFO"

# Verify runtime exists
if (-not (Test-Path $RuntimeRoot)) {
    Write-Log "Creating runtime directory: $RuntimeRoot" "WARN"
    New-Item -ItemType Directory -Path $RuntimeRoot -Force | Out-Null
}

# Create bin/orchestration directory
$binDir = Join-Path $RuntimeRoot "bin\orchestration"
if (-not (Test-Path $binDir)) {
    New-Item -ItemType Directory -Path $binDir -Force | Out-Null
}

# Create scripts directory
$scriptsDir = Join-Path $RuntimeRoot "scripts"
if (-not (Test-Path $scriptsDir)) {
    New-Item -ItemType Directory -Path $scriptsDir -Force | Out-Null
}

# Source files
$sourceRoot = "C:\OpenCode\opencode-global-src"
$files = @{
    "bin\orchestration\loop-cli.mjs" = $binDir
    "scripts\loop.ps1" = $scriptsDir
    "scripts\loop.bat" = $scriptsDir
}

# Copy files
foreach ($file in $files.Keys) {
    $source = Join-Path $sourceRoot $file
    $dest = Join-Path $files[$file] (Split-Path $file -Leaf)

    if (Test-Path $source) {
        Copy-Item $source -Destination $dest -Force
        Write-Log "Installed: $($file)" "SUCCESS"
    } else {
        Write-Log "Source not found: $source" "ERROR"
    }
}

Write-Log ""
Write-Log "=== Installation Complete ===" "SUCCESS"
Write-Log ""
Write-Log "Usage:"
Write-Log "  PowerShell: & '$scriptsDir\loop.ps1' -MaxIterations 20 --approve-loop -- 'task'"
Write-Log "  Batch:      loop.bat --max-iterations 20 --approve-loop -- task"
Write-Log ""
Write-Log "Or add to PATH and use: opencode loop ..."
