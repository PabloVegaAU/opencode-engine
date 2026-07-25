<#
.SYNOPSIS
  Wrapper for retrieval-router.mjs

.DESCRIPTION
  Executes the retrieval router from the installed runtime.
  Returns a compact JSON plan without executing any tools.

.PARAMETER Query
  The query string to classify

.PARAMETER ProjectRoot
  The project root directory

.PARAMETER Intent
  Explicit intent: exact, symbol, architecture, semantic, knowledge, or auto (default)

.PARAMETER PolicyPath
  Optional path to retrieval-policy.json

.EXAMPLE
  .\retrieval-router.ps1 -Query "NotaService.listar" -ProjectRoot "C:\Projects\myproject"
  .\retrieval-router.ps1 -Query "impact analysis" -ProjectRoot "C:\Projects\myproject" -Intent architecture
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$Query,

  [Parameter(Mandatory = $true)]
  [string]$ProjectRoot,

  [ValidateSet('exact', 'symbol', 'architecture', 'semantic', 'knowledge', 'auto')]
  [string]$Intent = 'auto',

  [string]$PolicyPath
)

$ErrorActionPreference = "Stop"

$installedRouterScript = Join-Path $PSScriptRoot "..\bin\retrieval\retrieval-router.mjs"
$userConfigRouterScript = Join-Path $env:USERPROFILE ".config\opencode\bin\retrieval\retrieval-router.mjs"

$RouterScript = $installedRouterScript
if (-not (Test-Path -LiteralPath $RouterScript)) {
  $RouterScript = $userConfigRouterScript
}

if (-not (Test-Path -LiteralPath $RouterScript)) {
  Write-Error "retrieval-router.mjs not found in runtime or global bin"
}

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
  Write-Error "Node.js not found"
}
$nodePath = $nodeCmd.Source

$args = @(
  $RouterScript,
  "--query", $Query,
  "--project-root", $ProjectRoot,
  "--intent", $Intent
)

if ($PolicyPath) {
  $args += @("--policy", $PolicyPath)
}

& $nodePath $args
