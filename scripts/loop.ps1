<#
.SYNOPSIS
  Loop Command for OpenCode

.DESCRIPTION
  Executes a task in continuous loop mode, avoiding step/query limits.
  This script is invoked by 'opencode loop' wrapper.

.PARAMETER Prompt
  The task/prompt to execute in loop

.PARAMETER Mission
  Link loop to mission for state tracking

.PARAMETER MaxIterations
  Maximum iterations (default: 20)

.PARAMETER MinIterations
  Minimum iterations before convergence check (default: 3)

.PARAMETER Timeout
  Maximum seconds (default: 300)

.PARAMETER CheckpointEvery
  Pause every N iterations (0 = disabled)

.PARAMETER ApproveLoop
  Bypass doom_loop security check

.PARAMETER Agent
  Agent to use (default: general)

.PARAMETER Model
  Model to use

.PARAMETER ProjectRoot
  Project root directory

.EXAMPLE
  opencode loop --max-iterations 10 --approve-loop -- "Implement feature X"
  loop --mission my-task --max-iterations 50 -- "Long task"
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $false, ValueFromRemainingArguments = $true)]
  [string[]]$RemainingArgs,

  [Parameter(Mandatory = $false)]
  [string]$Mission,

  [Parameter(Mandatory = $false)]
  [int]$MaxIterations = 20,

  [Parameter(Mandatory = $false)]
  [int]$MinIterations = 3,

  [Parameter(Mandatory = $false)]
  [int]$Timeout = 300,

  [Parameter(Mandatory = $false)]
  [int]$CheckpointEvery = 0,

  [switch]$ApproveLoop,

  [Parameter(Mandatory = $false)]
  [string]$Agent = "general",

  [Parameter(Mandatory = $false)]
  [string]$Model,

  [Parameter(Mandatory = $false)]
  [string]$ProjectRoot = $PWD
)

$ErrorActionPreference = "Stop"

$RuntimeRoot = if ($env:OPENCODE_CONFIG_DIR) { $env:OPENCODE_CONFIG_DIR } else { Join-Path $env:USERPROFILE ".config\opencode" }
$CliPath = Join-Path $RuntimeRoot "bin\orchestration\loop-cli.mjs"

if (-not (Test-Path -LiteralPath $CliPath)) {
  Write-Error "Loop CLI not found at: $CliPath"
  Write-Error "Run 'opencode-loop-setup' to install the loop command."
  exit 1
}

# Build arguments
$nodeArgs = @()

if ($Mission) {
  $nodeArgs += "--mission"; $nodeArgs += $Mission
}

$nodeArgs += "--max-iterations"; $nodeArgs += $MaxIterations.ToString()
$nodeArgs += "--min-iterations"; $nodeArgs += $MinIterations.ToString()
$nodeArgs += "--timeout"; $nodeArgs += $Timeout.ToString()

if ($CheckpointEvery -gt 0) {
  $nodeArgs += "--checkpoint-every"; $nodeArgs += $CheckpointEvery.ToString()
}

if ($ApproveLoop) {
  $nodeArgs += "--approve-loop"
}

if ($Agent -and $Agent -ne "general") {
  $nodeArgs += "--agent"; $nodeArgs += $Agent
}

if ($Model) {
  $nodeArgs += "--model"; $nodeArgs += $Model
}

$nodeArgs += "--project-root"; $nodeArgs += $ProjectRoot

# Append the prompt from remaining args (everything after --)
if ($RemainingArgs -and $RemainingArgs.Count -gt 0) {
  # Filter out any empty args and join
  $prompt = ($RemainingArgs | Where-Object { $_ -and $_ -ne '--' -and $_ -ne '' }) -join ' '
  if ($prompt) {
    $nodeArgs += "--"; $nodeArgs += $prompt
  }
}

Write-Host "[LOOP] Executing with $($nodeArgs.Count) arguments..." -ForegroundColor Cyan

$cliOutput = & node $CliPath @nodeArgs 2>&1
$cliExit = $LASTEXITCODE

if ($cliOutput) {
  Write-Host $cliOutput
}

exit $cliExit
