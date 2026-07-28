<#
.SYNOPSIS
  Wrapper for OpenCode cross-session CLI

.DESCRIPTION
  This wrapper delegates to the cross-session CLI from the OpenCode runtime.
  The actual CLI is at the configured runtime's bin/orchestration/cross-session-cli.mjs.
  AI_ENV_HOME supplies the default -AiEnvHome value; doctor requires all manifest/spec paths.

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
  .\cross-session.ps1 -Subcommand doctor -AiEnvHome $env:AI_ENV_HOME -ProjectRoot (Get-Location).Path ...
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("doctor", "mission-create", "mission-status", "task-plan", "task-run",
               "integration-preflight", "integration-apply", "recovery-plan", "recovery-apply", "mission-run")]
  [string]$Subcommand,

  [Parameter(Mandatory = $false)]
  [string]$AiEnvHome = $env:AI_ENV_HOME,

  [Parameter(Mandatory = $false)]
  [string]$ProjectRoot = (Get-Location).Path,

  [Parameter(Mandatory = $false)]
  [string]$EnvironmentManifest,

  [Parameter(Mandatory = $false)]
  [string]$ProjectManifest,

  [Parameter(Mandatory = $false)]
  [string]$Spec,

  [Parameter(Mandatory = $false)]
  [string]$OperationId,

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
  [switch]$ApproveLocalIntegration
)

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

$args = @($Subcommand)

if ($AiEnvHome) { $args += "--ai-env-home"; $args += $AiEnvHome }
if ($ProjectRoot) { $args += "--project-root"; $args += $ProjectRoot }
if ($EnvironmentManifest) { $args += "--environment-manifest"; $args += $EnvironmentManifest }
if ($ProjectManifest) { $args += "--project-manifest"; $args += $ProjectManifest }
if ($Spec) { $args += "--spec"; $args += $Spec }
if ($OperationId) { $args += "--operation-id"; $args += $OperationId }
if ($At) { $args += "--at"; $args += $At }
if ($TaskKey) { $args += "--task-key"; $args += $TaskKey }
if ($TargetRepositoryId) { $args += "--target-repository-id"; $args += $TargetRepositoryId }
if ($TargetRef) { $args += "--target-ref"; $args += $TargetRef }
if ($ExpectedTargetCommit) { $args += "--expected-target-commit"; $args += $ExpectedTargetCommit }
if ($ApproveLocalIntegration) { $args += "--approve-local-integration" }

$cliOutput = & node $CliPath @args 2>&1
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

exit 0
