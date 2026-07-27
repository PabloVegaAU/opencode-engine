[CmdletBinding()]
param(
  [Parameter(Mandatory=$true,Position=0)][ValidateSet('inspect','plan','apply','rollback')][string]$Command,
  [Parameter(Mandatory=$true)][string]$AiEnvHome,
  [string]$PlanId,[string]$ApprovePlanId,[string]$RunId,[string]$Policy,[string]$Catalog,[string]$SourceVersion,[string]$TargetVersion,[string]$Desired
)
$ErrorActionPreference='Stop'
$root=if($env:OPENCODE_CONFIG_DIR){$env:OPENCODE_CONFIG_DIR}else{Split-Path -Parent $PSScriptRoot}
$cli=Join-Path $root 'bin/updates/update-cli.mjs'
if(-not(Test-Path -LiteralPath $cli -PathType Leaf)){throw "Ownership update CLI not found: $cli"}
$arguments=[System.Collections.Generic.List[string]]::new();$arguments.Add($cli);$arguments.Add($Command);$arguments.Add('--ai-env-home');$arguments.Add($AiEnvHome)
foreach($pair in @(@('plan-id',$PlanId),@('approve-plan-id',$ApprovePlanId),@('run-id',$RunId),@('policy',$Policy),@('catalog',$Catalog),@('source-version',$SourceVersion),@('target-version',$TargetVersion),@('desired',$Desired))){if($pair[1]){$arguments.Add("--$($pair[0])");$arguments.Add($pair[1])}}
& node $arguments.ToArray(); exit $LASTEXITCODE
