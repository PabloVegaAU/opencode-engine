<#
.SYNOPSIS
  Retrieval Router and Execution wrapper for OpenCode Global v0.5.0

.DESCRIPTION
  Provides plan-only v0.4.0 compatible retrieval planning, plus opt-in
  execution and batch modes via -Mode execute or -Execute alias.
  Uses ProcessStartInfo with ArgumentList for secure argument handling.

.PARAMETER Query
  The query string to classify (plan/execute mode)

.PARAMETER ProjectRoot
  The project root directory

.PARAMETER Intent
  Explicit intent: exact, symbol, architecture, semantic, knowledge, or auto (default)

.PARAMETER PolicyPath
  Optional path to retrieval-policy.json

.PARAMETER Mode
  Execution mode: plan (default) or execute

.PARAMETER Execute
  Switch alias for -Mode execute

.PARAMETER BatchInput
  JSON file path or '-' for stdin containing batch request

.PARAMETER MaxFallbacks
  Number of reserved fallback calls (0 or 1, default 1)

.PARAMETER ProgressiveDisclosure
  Enable progressive disclosure for focused reads

.PARAMETER TracePath
  Path to write trace output (restricted to trusted trace dir)

.PARAMETER WriteTrace
  Alias for -TracePath

.PARAMETER WriteMetrics
  Path to write metrics output (restricted to trusted trace dir)

.EXAMPLE
  # Plan-only (v0.4.0 compatible)
  .\retrieval-router.ps1 -Query "NotaService.listar" -ProjectRoot "C:\Projects\myproject"

.EXAMPLE
  # Execute single query
  .\retrieval-router.ps1 -Query "Sell" -ProjectRoot "C:\Projects\myproject" -Execute

.EXAMPLE
  # Batch via stdin
  .\retrieval-router.ps1 -BatchInput - -ProjectRoot "C:\Projects\myproject" < batch.json

.EXAMPLE
  # Batch via file
  .\retrieval-router.ps1 -BatchInput "batch.json" -ProjectRoot "C:\Projects\myproject"
#>
[CmdletBinding(DefaultParameterSetName = 'Plan')]
param(
  [Parameter(ParameterSetName = 'Plan', Mandatory = $true)]
  [Parameter(ParameterSetName = 'Execute', Mandatory = $true)]
  [string]$Query,

  [Parameter(ParameterSetName = 'Plan', Mandatory = $true)]
  [Parameter(ParameterSetName = 'Execute', Mandatory = $true)]
  [Parameter(ParameterSetName = 'Batch', Mandatory = $false)]
  [string]$ProjectRoot,

  [Parameter(ParameterSetName = 'Plan')]
  [Parameter(ParameterSetName = 'Execute')]
  [ValidateSet('exact', 'symbol', 'architecture', 'semantic', 'knowledge', 'auto')]
  [string]$Intent = 'auto',

  [Parameter(ParameterSetName = 'Plan')]
  [Parameter(ParameterSetName = 'Execute')]
  [string]$PolicyPath,

  [Parameter(ParameterSetName = 'Plan')]
  [Parameter(ParameterSetName = 'Execute')]
  [ValidateSet('plan', 'execute', 'batch')]
  [string]$Mode = 'plan',

  [Parameter(ParameterSetName = 'Execute')]
  [switch]$Execute,

  [Parameter(ParameterSetName = 'Batch', Mandatory = $true)]
  [string]$BatchInput,

  [Parameter(ParameterSetName = 'Plan')]
  [Parameter(ParameterSetName = 'Execute')]
  [ValidateSet(0, 1)]
  [int]$MaxFallbacks = 1,

  [Parameter(ParameterSetName = 'Plan')]
  [Parameter(ParameterSetName = 'Execute')]
  [switch]$ProgressiveDisclosure,

  [Parameter(ParameterSetName = 'Plan')]
  [Parameter(ParameterSetName = 'Execute')]
  [string]$TracePath,

  [Parameter(ParameterSetName = 'Plan')]
  [Parameter(ParameterSetName = 'Execute')]
  [string]$WriteTrace,

  [Parameter(ParameterSetName = 'Plan')]
  [Parameter(ParameterSetName = 'Execute')]
  [string]$WriteMetrics
)

$ErrorActionPreference = "Continue"

function Get-RuntimeDir {
  if ($env:OPENCODE_CONFIG_DIR) {
    return $env:OPENCODE_CONFIG_DIR
  }
  if ($env:XDG_CONFIG_HOME) {
    return Join-Path $env:XDG_CONFIG_HOME "opencode"
  }
  return Join-Path $HOME ".config" "opencode"
}

function Get-TrustedTraceDir {
  return Join-Path (Get-RuntimeDir) "retrieval"
}

function Test-ValidTracePath {
  param(
    [string]$Path,
    [string]$ProjectRoot
  )

  $trustedDir = Get-TrustedTraceDir
  $trustedDirResolved = [System.IO.Path]::GetFullPath($trustedDir)
  $pathResolved = [System.IO.Path]::GetFullPath($Path)
  $projectResolved = [System.IO.Path]::GetFullPath($ProjectRoot)

  $relToTrusted = [System.IO.Path]::GetRelativePath($trustedDirResolved, $pathResolved)
  if ($relToTrusted.StartsWith("..") -or $pathResolved -eq $trustedDirResolved) {
    return $false, "Path outside trusted trace dir"
  }

  $relToProject = [System.IO.Path]::GetRelativePath($projectResolved, $pathResolved)
  if (-not $relToProject.StartsWith("..") -and -not $pathResolved.StartsWith($projectResolved)) {
    return $false, "Path inside project root"
  }

  if ($Path -match '\.\.') {
    return $false, "Path contains traversal"
  }

  return $true, ""
}

function Find-NodePath {
  $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
  if (-not $nodeCmd) {
    throw "Node.js not found"
  }
  return $nodeCmd.Source
}

function Find-RetrievalEntryScript {
  $installedScript = Join-Path $PSScriptRoot "..\bin\retrieval\retrieval-entry.mjs"
  $userConfigScript = Join-Path (Get-RuntimeDir) "bin\retrieval\retrieval-entry.mjs"

  if (Test-Path -LiteralPath $installedScript) {
    return $installedScript
  }
  if (Test-Path -LiteralPath $userConfigScript) {
    return $userConfigScript
  }
  throw "retrieval-entry.mjs not found in runtime or global bin"
}

function Find-RouterScript {
  $installedRouterScript = Join-Path $PSScriptRoot "..\bin\retrieval\retrieval-router.mjs"
  $userConfigRouterScript = Join-Path (Get-RuntimeDir) "bin\retrieval\retrieval-router.mjs"

  if (Test-Path -LiteralPath $installedRouterScript) {
    return $installedRouterScript
  }
  if (Test-Path -LiteralPath $userConfigRouterScript) {
    return $userConfigRouterScript
  }
  throw "retrieval-router.mjs not found in runtime or global bin"
}

function Build-CliEnvelope {
  param(
    [string]$Mode,
    [hashtable]$InputData,
    [hashtable]$Options
  )

  return @{
    cli_version = "1.0"
    mode = $Mode
    input = $InputData
    options = $Options
  }
}

function Invoke-RetrievalCli {
  param(
    [string]$ScriptPath,
    [string]$InputJson
  )

  $nodePath = Find-NodePath

  $tempDir = [System.IO.Path]::GetTempPath()
  $tempInputFile = [System.IO.Path]::Combine($tempDir, [System.Guid]::NewGuid().ToString() + ".json")
  try {
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($tempInputFile, $InputJson, $utf8NoBom)

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $nodePath
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.StandardOutputEncoding = [System.Text.Encoding]::UTF8
    $psi.StandardErrorEncoding = [System.Text.Encoding]::UTF8
    $psi.ArgumentList.Add($ScriptPath)
    $psi.ArgumentList.Add("--cli-input-json")
    $psi.ArgumentList.Add($tempInputFile)

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $psi

    $null = $process.Start()

    if (-not $process.HasExited) {
      $stdout = $process.StandardOutput.ReadToEnd()
      $stderr = $process.StandardError.ReadToEnd()
      $process.WaitForExit()
    }
    else {
      $stdout = ""
      $stderr = ""
    }

    $exitCode = $process.ExitCode

    return @{
      ExitCode = $exitCode
      Stdout = $stdout
      Stderr = $stderr
    }
  }
  finally {
    if ($process -and -not $process.HasExited) {
      $process.Kill()
    }
    if ($process) {
      $process.Dispose()
    }
    if ($tempInputFile -and (Test-Path $tempInputFile)) {
      Remove-Item $tempInputFile -Force -ErrorAction SilentlyContinue
    }
  }
}

function Invoke-RouterCli {
  param(
    [string]$RouterScript,
    [string]$Query,
    [string]$ProjectRoot,
    [string]$Intent,
    [string]$PolicyPath
  )

  $nodePath = Find-NodePath

  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $nodePath
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.StandardOutputEncoding = [System.Text.Encoding]::UTF8
  $psi.StandardErrorEncoding = [System.Text.Encoding]::UTF8

  $psi.ArgumentList.Add($RouterScript)
  $psi.ArgumentList.Add("--query")
  $psi.ArgumentList.Add($Query)
  $psi.ArgumentList.Add("--project-root")
  $psi.ArgumentList.Add($ProjectRoot)
  $psi.ArgumentList.Add("--intent")
  $psi.ArgumentList.Add($Intent)

  if ($PolicyPath) {
    $psi.ArgumentList.Add("--policy")
    $psi.ArgumentList.Add($PolicyPath)
  }

  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $psi

  try {
    $null = $process.Start()

    $timeout = 60000
    $completed = $process.WaitForExit($timeout)

    if (-not $completed) {
      $process.Kill()
      throw "Process timed out after $timeout ms"
    }

    $exitCode = $process.ExitCode

    if ($process.StandardOutput) {
      $stdout = $process.StandardOutput.ReadToEnd()
    }
    else {
      $stdout = ""
    }

    if ($process.StandardError) {
      $stderr = $process.StandardError.ReadToEnd()
    }
    else {
      $stderr = ""
    }

    return @{
      ExitCode = $exitCode
      Stdout = $stdout
      Stderr = $stderr
    }
  }
  finally {
    if (-not $process.HasExited) {
      $process.Kill()
    }
    $process.Dispose()
  }
}

$Mode = if ($Execute) { "execute" } else { $Mode }

if ($Mode -eq "execute" -or $BatchInput) {
  if ($Mode -eq "plan" -and $BatchInput) {
    $Mode = "batch"
  }

  if (-not $ProjectRoot) {
    Write-Error "ProjectRoot is required for execute and batch modes"
    exit 1
  }

  $entryScript = Find-RetrievalEntryScript

  $options = @{
    max_fallbacks = $MaxFallbacks
    progressive_disclosure = if ($ProgressiveDisclosure) { $true } else { $false }
  }

  if ($TracePath -or $WriteTrace) {
    $tracePath = if ($TracePath) { $TracePath } else { $WriteTrace }
    $traceValid, $traceError = Test-ValidTracePath -Path $tracePath -ProjectRoot $ProjectRoot
    if (-not $traceValid) {
      Write-Error "Invalid trace path: $traceError"
      exit 1
    }
    $options.trace_path = $tracePath
  }

  if ($WriteMetrics) {
    $metricsValid, $metricsError = Test-ValidTracePath -Path $WriteMetrics -ProjectRoot $ProjectRoot
    if (-not $metricsValid) {
      Write-Error "Invalid metrics path: $metricsError"
      exit 1
    }
    $options.write_metrics = $WriteMetrics
  }

  $inputJson = ""
  if ($Mode -eq "execute") {
    $inputHash = @{
      query = $Query
      project_root = $ProjectRoot
      intent = $Intent
    }
    $inputObj = Build-CliEnvelope "execute" $inputHash $options
    $inputJson = $inputObj | ConvertTo-Json -Depth 10 -Compress
  }
  else {
    $batchContent = ""
    if ($BatchInput -eq "-") {
      $batchContent = [Console]::In.ReadToEnd()
    }
    elseif (Test-Path -LiteralPath $BatchInput) {
      $batchContent = Get-Content -LiteralPath $BatchInput -Raw -Encoding UTF8
    }
    else {
      Write-Error "BatchInput file not found: $BatchInput"
      exit 1
    }

    if ([string]::IsNullOrWhiteSpace($batchContent)) {
      Write-Error "Empty batch input"
      exit 1
    }

    try {
      $batchData = $batchContent | ConvertFrom-Json
    }
    catch {
      Write-Error "Invalid JSON in batch input"
      exit 1
    }

    if ($batchData -is [System.Array]) {
      Write-Error "Batch input must be an object with plans array, not an array"
      exit 1
    }

    if (-not $batchData.plans -or -not ($batchData.plans -is [System.Array])) {
      Write-Error "Batch input must have a plans array"
      exit 1
    }

    if ($batchData.plans.Count -eq 0) {
      Write-Error "Batch input plans array cannot be empty"
      exit 1
    }

    $plansArray = @($batchData.plans)
    $plansWithProjectRoot = $plansArray | ForEach-Object {
      $plan = $_
      if (-not $plan.project_root) {
        $plan | Add-Member -NotePropertyName "project_root" -NotePropertyValue $ProjectRoot -PassThru
      } else {
        $plan
      }
    }

    $inputObj = Build-CliEnvelope -Mode "batch" -Input @{
      plans = $plansWithProjectRoot
    } -Options $options
    $inputJson = $inputObj | ConvertTo-Json -Depth 10 -Compress
  }

  $result = Invoke-RetrievalCli -ScriptPath $entryScript -InputJson $inputJson

  if ($result.ExitCode -ne 0) {
    if ($result.Stderr) {
      [Console]::Error.WriteLine($result.Stderr)
    }
  }

  if ($result.Stdout) {
    Write-Output $result.Stdout
  }

  exit $result.ExitCode
}
else {
  $routerScript = Find-RouterScript

  $result = Invoke-RouterCli -RouterScript $routerScript -Query $Query -ProjectRoot $ProjectRoot -Intent $Intent -PolicyPath $PolicyPath

  if ($result.ExitCode -ne 0) {
    if ($result.Stderr) {
      [Console]::Error.WriteLine($result.Stderr)
    }
  }

  if ($result.Stdout) {
    Write-Output $result.Stdout
  }

  exit $result.ExitCode
}
