<#
.SYNOPSIS
  Loop Command for OpenCode

.DESCRIPTION
  Executes a task in continuous loop mode, avoiding step/query limits.

.PARAMETER Prompt
  The task/prompt to execute in loop (use -- to separate from flags)

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
  opencode loop -- "Implement feature X"
  opencode loop --mission my-feature --max-iterations 50 -- "Implement feature X"
  opencode loop --checkpoint-every 5 -- "Refactor codebase"
  opencode loop --approve-loop -- "Long-running task"
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $false)]
  [string]$Prompt,

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
  Write-Error "The loop command requires OpenCode 1.18.x or later."
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

# Append the prompt (everything after -- is treated as prompt)
if ($Prompt) {
  $nodeArgs += "--"; $nodeArgs += $Prompt
}

Write-Host "Executing loop with $($nodeArgs.Count) arguments..." -ForegroundColor Cyan

$cliOutput = & node $CliPath @nodeArgs 2>&1
$cliExit = $LASTEXITCODE

if ($cliOutput) {
  Write-Host $cliOutput
}

exit $cliExit
