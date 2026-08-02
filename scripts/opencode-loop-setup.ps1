<#
.SYNOPSIS
  Setup Loop Command for OpenCode

.DESCRIPTION
  Installs the loop command as a wrapper around 'opencode loop' functionality.
  After running this script, you can use 'opencode loop' directly.

.EXAMPLE
  opencode-loop-setup
#>

param(
  [switch]$Force
)

$ErrorActionPreference = "Stop"

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $colors = @{ "INFO" = "White"; "SUCCESS" = "Green"; "WARN" = "Yellow"; "ERROR" = "Red" }
    Write-Host "[$Level] $Message" -ForegroundColor $colors[$Level]
}

Write-Log "=== OpenCode Loop Command Setup ===" "INFO"
Write-Log ""

$RuntimeRoot = if ($env:OPENCODE_CONFIG_DIR) { $env:OPENCODE_CONFIG_DIR } else { Join-Path $env:USERPROFILE ".config\opencode" }
$ScriptsDir = Join-Path $RuntimeRoot "scripts"
$CliPath = Join-Path $RuntimeRoot "bin\orchestration\loop-cli.mjs"

# Verify OpenCode is installed
Write-Log "Checking OpenCode installation..." "INFO"
$opencodeCheck = Get-Command opencode -ErrorAction SilentlyContinue
if (-not $opencodeCheck) {
    Write-Log "ERROR: OpenCode is not installed or not in PATH" "ERROR"
    exit 1
}
Write-Log "OpenCode found: $($opencodeCheck.Source)" "SUCCESS"

# Ensure directories exist
if (-not (Test-Path $ScriptsDir)) {
    New-Item -ItemType Directory -Path $ScriptsDir -Force | Out-Null
}
if (-not (Test-Path (Split-Path $CliPath -Parent))) {
    New-Item -ItemType Directory -Path (Split-Path $CliPath -Parent) -Force | Out-Null
}

# Check if loop-cli.mjs exists
$sourceLoopCli = "C:\OpenCode\opencode-global-src\bin\orchestration\loop-cli.mjs"
if (-not (Test-Path $sourceLoopCli)) {
    $sourceLoopCli = Join-Path $PSScriptRoot "..\bin\orchestration\loop-cli.mjs"
}

if (Test-Path $sourceLoopCli) {
    Copy-Item $sourceLoopCli -Destination $CliPath -Force
    Write-Log "Installed loop-cli.mjs" "SUCCESS"
} else {
    Write-Log "WARNING: loop-cli.mjs not found in expected locations" "WARN"
}

# Copy scripts
$sourceScripts = @(
    "C:\OpenCode\opencode-global-src\scripts\loop.ps1"
    "C:\OpenCode\opencode-global-src\scripts\loop.bat"
)
foreach ($src in $sourceScripts) {
    if (Test-Path $src) {
        $dest = Join-Path $ScriptsDir (Split-Path $src -Leaf)
        Copy-Item $src -Destination $dest -Force
        Write-Log "Installed $(Split-Path $src -Leaf)" "SUCCESS"
    }
}

# Create 'opencode-loop' wrapper script
$wrapperPath = Join-Path $ScriptsDir "opencode-loop.ps1"
$wrapperContent = @'
# Wrapper script to enable 'opencode loop' command
# This script is called when running 'opencode loop'

$ErrorActionPreference = "Stop"

# Get arguments, removing 'loop' from the beginning
$args = $PSBoundVariables['RemainingArgs']
if (-not $args) {
    $args = @()
}

# Find the prompt (after --)
$promptIndex = -1
for ($i = 0; $i -lt $args.Count; $i++) {
    if ($args[$i] -eq '--') {
        $promptIndex = $i
        break
    }
}

# Build new argument list for loop-cli.mjs
$newArgs = @()
$foundDoubleDash = $false

foreach ($arg in $args) {
    if ($arg -eq '--') {
        $foundDoubleDash = $true
        continue
    }
    if ($foundDoubleDash) {
        # Everything after -- is the prompt
        if ($newArgs.Count -gt 0 -and $newArgs[-1] -eq '--') {
            # Combine remaining args as prompt
            $promptStart = $args.IndexOf($arg)
            $prompt = ($args[$promptStart..($args.Count-1)] -join ' ')
            $newArgs[-1] = $prompt
            break
        }
    }
    $newArgs += $arg
}

# Call loop-cli.mjs directly
$RuntimeRoot = if ($env:OPENCODE_CONFIG_DIR) { $env:OPENCODE_CONFIG_DIR } else { Join-Path $env:USERPROFILE ".config\opencode" }
$CliPath = Join-Path $RuntimeRoot "bin\orchestration\loop-cli.mjs"

if (-not (Test-Path $CliPath)) {
    Write-Error "Loop CLI not found. Run 'opencode-loop-setup' first."
    exit 1
}

& node $CliPath @newArgs
exit $LASTEXITCODE
'@

Set-Content -Path $wrapperPath -Value $wrapperContent -Force
Write-Log "Created opencode-loop.ps1 wrapper" "SUCCESS"

Write-Log ""
Write-Log "=== Setup Complete ===" "SUCCESS"
Write-Log ""
Write-Log "Usage:"
Write-Log "  opencode loop --max-iterations 20 --approve-loop -- 'your task'"
Write-Log ""
Write-Log "Or use the loop command directly:"
Write-Log "  node `"`$env:USERPROFILE\.config\opencode\bin\orchestration\loop-cli.mjs`" --approve-loop -- 'task'"
Write-Log ""
Write-Log "To update in the future, run: opencode-loop-setup"
