<#
.SYNOPSIS
  Wrapper for OpenCode cross-session CLI

.DESCRIPTION
  This wrapper delegates to the cross-session CLI from the OpenCode runtime.
  The actual CLI is at the configured runtime's bin/orchestration/cross-session-cli.mjs.
  AI_ENV_HOME supplies the default -AiEnvHome value; doctor requires all manifest/spec paths.

  Supports PowerShell style (-Subcommand, -Mission, -ApproveLocalIntegration).
  For Unix-style (--mission, --approve-local-integration), use cross-session.bat instead.

.PARAMETER Subcommand
  The cross-session subcommand to run

.PARAMETER AiEnvHome
  AI Environment home directory

.PARAMETER ProjectRoot
  Project root directory

.PARAMETER EnvironmentManifest
  Environment manifest path

.PARAMETER ProjectManifest
  Project manifest path

.PARAMETER Spec
  Spec file path

.PARAMETER OperationId
  Operation ID

.PARAMETER Mission
  Alias for -OperationId

.PARAMETER At
  UTC timestamp

.PARAMETER TaskKey
  Task key

.PARAMETER TargetRepositoryId
  Target repository ID

.PARAMETER TargetRef
  Target git ref

.PARAMETER ExpectedTargetCommit
  Expected target commit OID

.PARAMETER ApproveLocalIntegration
  Approve local integration. `-ApproveProtectedRef` is a deprecated alias.

.EXAMPLE
  & "$env:USERPROFILE\.config\opencode\scripts\cross-session.ps1" -Subcommand mission-status -ProjectRoot 'C:\whatsapp-sales-kit-ai-env' -Mission ses-7004a784
.EXAMPLE
  & "$env:USERPROFILE\.config\opencode\scripts\cross-session.ps1" -Subcommand mission-run -ProjectRoot 'C:\whatsapp-sales-kit-ai-env' -Mission ses-7004a784 -ApproveLocalIntegration
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $false)]
  [ValidateSet("doctor", "mission-create", "mission-status", "task-plan", "task-run",
               "integration-preflight", "integration-apply", "recovery-plan", "recovery-apply",
               "mission-run", "mission-loop")]
  [string]$Subcommand,

  [Parameter(Mandatory = $false)]
  [string]$AiEnvHome = $env:AI_ENV_HOME,

  [Parameter(Mandatory = $false)]
  [string]$ProjectRoot = $PWD,

  [Parameter(Mandatory = $false)]
  [string]$EnvironmentManifest,

  [Parameter(Mandatory = $false)]
  [string]$ProjectManifest,

  [Parameter(Mandatory = $false)]
  [string]$Spec,

  [Parameter(Mandatory = $false)]
  [string]$OperationId,

  [Parameter(Mandatory = $false)]
  [string]$Mission,

  [Parameter(Mandatory = $false)]
  [string]$At,

  [Parameter(Mandatory = $false)]
  [string]$TaskKey,

  [Parameter(Mandatory = $false)]
  [string]$TargetRepositoryId,

  [Parameter(Mandatory = $false)]
  [string]$TargetRef,

  [Parameter(Mandatory = $false)]
  [string]$ExpectedTargetCommit,

  [Alias("ApproveProtectedRef")]
  [switch]$ApproveLocalIntegration,

  [Parameter(Mandatory = $false)]
  [int]$MaxIterations = 10,

  [Parameter(Mandatory = $false)]
  [int]$PollInterval = 5,

  [Parameter(Mandatory = $false)]
  [int]$Timeout = 300
)

# Handle -Mission alias for -OperationId
if ($Mission -and -not $OperationId) {
  $OperationId = $Mission
}

$ErrorActionPreference = "Stop"

$RuntimeRoot = if ($env:OPENCODE_CONFIG_DIR) { $env:OPENCODE_CONFIG_DIR } else { Join-Path $env:USERPROFILE ".config\opencode" }
$CliPath = Join-Path $RuntimeRoot "bin\orchestration\cross-session-cli.mjs"

if (-not (Test-Path -LiteralPath $CliPath)) {
  Write-Warning "Cross-session CLI not found at: $CliPath"
  Write-Warning "This is an OPTIONAL capability. Cross-session commands are disabled."
  exit 0
}

if ($Subcommand -eq "doctor") {
  $missing = @()
  if (-not $AiEnvHome) { $missing += "AiEnvHome (or AI_ENV_HOME)" }
  if (-not $ProjectRoot) { $missing += "ProjectRoot" }
  if (-not $EnvironmentManifest) { $missing += "EnvironmentManifest" }
  if (-not $ProjectManifest) { $missing += "ProjectManifest" }
  if (-not $Spec) { $missing += "Spec" }
  if ($missing.Count -gt 0) { throw "doctor requires: $($missing -join ', ')" }
}

$nodeArgs = @($Subcommand)

if ($AiEnvHome) { $nodeArgs += "--ai-env-home"; $nodeArgs += $AiEnvHome }
if ($ProjectRoot) { $nodeArgs += "--project-root"; $nodeArgs += $ProjectRoot }
if ($EnvironmentManifest) { $nodeArgs += "--environment-manifest"; $nodeArgs += $EnvironmentManifest }
if ($ProjectManifest) { $nodeArgs += "--project-manifest"; $nodeArgs += $ProjectManifest }
if ($Spec) { $nodeArgs += "--spec"; $nodeArgs += $Spec }
if ($OperationId) { $nodeArgs += "--operation-id"; $nodeArgs += $OperationId }
if ($Mission -and -not $OperationId) { $nodeArgs += "--mission"; $nodeArgs += $Mission }
if ($At) { $nodeArgs += "--at"; $nodeArgs += $At }
if ($TaskKey) { $nodeArgs += "--task-key"; $nodeArgs += $TaskKey }
if ($TargetRepositoryId) { $nodeArgs += "--target-repository-id"; $nodeArgs += $TargetRepositoryId }
if ($TargetRef) { $nodeArgs += "--target-ref"; $nodeArgs += $TargetRef }
if ($ExpectedTargetCommit) { $nodeArgs += "--expected-target-commit"; $nodeArgs += $ExpectedTargetCommit }
if ($ApproveLocalIntegration) { $nodeArgs += "--approve-local-integration" }

# Loop-specific parameters (only passed when using mission-loop)
if ($Subcommand -eq "mission-loop") {
  if ($MaxIterations -ne 10) { $nodeArgs += "--max-iterations"; $nodeArgs += $MaxIterations.ToString() }
  if ($PollInterval -ne 5) { $nodeArgs += "--poll-interval"; $nodeArgs += $PollInterval.ToString() }
  if ($Timeout -ne 300) { $nodeArgs += "--timeout"; $nodeArgs += $Timeout.ToString() }
}

$cliOutput = & node $CliPath @nodeArgs 2>&1
$cliExit = $LASTEXITCODE

# Check if CLI indicates cross-session is not implemented
if ($cliOutput -match "NOT IMPLEMENTED") {
  Write-Host "Cross-session command '$Subcommand' is not yet implemented."
  Write-Host "This feature is planned for a future release."
  Write-Host "No changes were made to any repositories."
  exit 0
}

if ($cliExit -ne 0) {
  Write-Error "Cross-session CLI failed with exit code: $cliExit"
  if ($cliOutput) { Write-Error $cliOutput }
  exit $cliExit
}

# Print CLI output (already captured JSON on success)
if ($cliOutput) { Write-Host $cliOutput }
exit 0
