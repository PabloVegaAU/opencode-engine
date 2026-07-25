<#
.SYNOPSIS
  Initializes only the reusable OpenCode runtime shell for a project.

.DESCRIPTION
  The default operation creates a minimal opencode.json that inherits the
  global model and security defaults. Agents, prompts, technologies, MCP,
  skills, Speckit, README, AGENTS and node_modules are never copied.

  Optional switches add only generic intelligence contracts/artifacts or the
  three profile launcher commands. Existing files are skipped unless -Force is
  explicitly supplied.

.PARAMETER ProjectPath
  Target project directory path

.PARAMETER IncludeIntelligence
  Include neutral intelligence structure

.PARAMETER IncludeContracts
  Include contract schemas

.PARAMETER IncludeProfileCommands
  Include go, chatgpt, and mix commands

.PARAMETER IncludeBootstrapManifest
  Generate bootstrap manifest

.PARAMETER IncludeRetrievalPolicy
  Include neutral retrieval policy template in .ai-env/retrieval-policy.json

.PARAMETER Force
  Overwrite existing files

.EXAMPLE
  .\init-opencode-project.ps1 -ProjectPath C:\nuevo-proyecto
  .\init-opencode-project.ps1 C:\mi-proyecto -IncludeIntelligence -IncludeContracts
#>
[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = "Medium")]
param(
  [Parameter(Mandatory = $false, Position = 0)]
  [string]$ProjectPath = (Get-Location).Path,

  [switch]$IncludeIntelligence,
  [switch]$IncludeContracts,
  [switch]$IncludeProfileCommands,
  [switch]$IncludeBootstrapManifest,
  [switch]$IncludeRetrievalPolicy,
  [switch]$Force
)

$ErrorActionPreference = "Stop"
$GlobalRoot = Split-Path -Parent $PSScriptRoot
$TargetRoot = [System.IO.Path]::GetFullPath($ProjectPath)
$OpenCodeConfigDir = Join-Path $env:USERPROFILE ".config\opencode"
$BootstrapSchemaVersion = '2.0.0'
$BootstrapVersion = '1.0.0'

function ConvertTo-RelativeArtifactPath {
  param([string]$RelativePath)
  return ($RelativePath -replace '\\', '/')
}

function Get-FileSha256Lower {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $null }
  $sha = [System.Security.Cryptography.SHA256]::Create()
  $stream = [System.IO.File]::OpenRead($Path)
  try {
    return (-join ($sha.ComputeHash($stream) | ForEach-Object { $_.ToString('x2') }))
  }
  finally {
    $stream.Dispose()
    $sha.Dispose()
  }
}

function Write-ProjectFile {
  param(
    [string]$RelativePath,
    [string]$Content
  )

  $destination = Join-Path $TargetRoot $RelativePath
  if ((Test-Path -LiteralPath $destination) -and -not $Force) {
    Write-Host "[skip] $destination"
    return
  }

  if ($PSCmdlet.ShouldProcess($destination, "write neutral OpenCode artifact")) {
    $parent = Split-Path -Parent $destination
    if (-not (Test-Path -LiteralPath $parent)) {
      New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }
    [System.IO.File]::WriteAllText($destination, $Content, [System.Text.UTF8Encoding]::new($false))
    Write-Host "[write] $destination"
  }
}

function Copy-GenericFile {
  param(
    [string]$Source,
    [string]$RelativePath
  )

  $destination = Join-Path $TargetRoot $RelativePath
  if ((Test-Path -LiteralPath $destination) -and -not $Force) {
    Write-Host "[skip] $destination"
    return
  }

  if ($PSCmdlet.ShouldProcess($destination, "copy generic OpenCode artifact")) {
    $parent = Split-Path -Parent $destination
    if (-not (Test-Path -LiteralPath $parent)) {
      New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }
    Copy-Item -LiteralPath $Source -Destination $destination -Force
    Write-Host "[copy] $destination"
  }
}

Write-Host "OpenCode Project Initializer"
Write-Host "============================"
Write-Host ""
Write-Host "Global root: $GlobalRoot"
Write-Host "Target:       $TargetRoot"
Write-Host ""

$normalizedOpenCode = [System.IO.Path]::GetFullPath($OpenCodeConfigDir).TrimEnd('\', '/')
$normalizedTarget = $TargetRoot.TrimEnd('\', '/')
if ([string]::Equals($normalizedTarget, $normalizedOpenCode, [System.StringComparison]::OrdinalIgnoreCase)) {
  Write-Error "Cannot initialize the global OpenCode directory as a project."
}

if (-not (Test-Path -LiteralPath $TargetRoot -PathType Container)) {
  Write-Error "Target directory does not exist: $TargetRoot"
}

$isGitRoot = Test-Path (Join-Path $TargetRoot ".git")
Write-Host "Git repository: $(if ($isGitRoot) { 'yes' } else { 'no (will not create AGENTS.md)' })"
Write-Host ""

$managedArtifacts = [System.Collections.Generic.List[object]]::new()

$minimalConfig = [ordered]@{
  '$schema' = 'https://opencode.ai/config.json'
} | ConvertTo-Json -Depth 4
$minimalConfigPath = 'opencode.json'
$minimalConfigDestination = Join-Path $TargetRoot $minimalConfigPath
$opencodeJsonExisted = Test-Path -LiteralPath $minimalConfigDestination
$opencodeJsoncExisted = Test-Path -LiteralPath (Join-Path $TargetRoot 'opencode.jsonc')
if ($opencodeJsonExisted -or $opencodeJsoncExisted) {
  Write-Host "[skip] opencode.json (already exists or opencode.jsonc present)"
  $managedArtifacts.Add([ordered]@{
    relative_path = $minimalConfigPath
    artifact_type = 'config'
    source = 'generated:minimal-opencode-config'
    include_checksum = $false
    existed_before = $true
    expected_checksum = $null
    create_state = 'skipped'
  })
} else {
  Write-ProjectFile -RelativePath 'opencode.json' -Content ($minimalConfig + "`n")
  $managedArtifacts.Add([ordered]@{
    relative_path = $minimalConfigPath
    artifact_type = 'config'
    source = 'generated:minimal-opencode-config'
    include_checksum = $false
    existed_before = $false
    expected_checksum = $null
    create_state = 'created'
  })
}

if ($isGitRoot) {
  $agentsSource = Join-Path $GlobalRoot "templates\project-neutral\AGENTS.md"
  if (Test-Path -LiteralPath $agentsSource) {
    $agentsExisted = Test-Path -LiteralPath (Join-Path $TargetRoot "AGENTS.md")
    $agentsChecksum = if (-not $agentsExisted) { Get-FileSha256Lower -Path $agentsSource } else { $null }
    $managedArtifacts.Add([ordered]@{
      relative_path = 'AGENTS.md'
      artifact_type = 'manifest'
      source = 'global:AGENTS.md'
      include_checksum = $true
      existed_before = $agentsExisted
      expected_checksum = $agentsChecksum
      create_state = if ($agentsExisted) { 'skipped' } else { 'copied' }
    })
    Copy-GenericFile -Source $agentsSource -RelativePath 'AGENTS.md'
  }

  $bootstrapManifestSource = Join-Path $GlobalRoot "templates\project-neutral\.bootstrap\project-manifest.json"
  if (Test-Path -LiteralPath $bootstrapManifestSource) {
    $bootstrapManifestDest = Join-Path $TargetRoot ".bootstrap\project-manifest.json"
    $bootstrapManifestExisted = Test-Path -LiteralPath $bootstrapManifestDest
    $bootstrapManifestChecksum = if (-not $bootstrapManifestExisted) { Get-FileSha256Lower -Path $bootstrapManifestSource } else { $null }
    $managedArtifacts.Add([ordered]@{
      relative_path = '.bootstrap/project-manifest.json'
      artifact_type = 'manifest'
      source = 'global:project-manifest'
      include_checksum = $true
      existed_before = $bootstrapManifestExisted
      expected_checksum = $bootstrapManifestChecksum
      create_state = if ($bootstrapManifestExisted) { 'skipped' } else { 'copied' }
    })
    Copy-GenericFile -Source $bootstrapManifestSource -RelativePath '.bootstrap\project-manifest.json'
  }
}

if ($IncludeIntelligence) {
  $generatedAt = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ')
  $intelligenceRelativePaths = @('.intelligence\manifest.json', '.intelligence\index.json', '.intelligence\graph.jsonl')
  $intelligenceExistedBefore = @{}
  foreach ($relativePath in $intelligenceRelativePaths) {
    $intelligenceExistedBefore[$relativePath] = Test-Path -LiteralPath (Join-Path $TargetRoot $relativePath)
  }
  $manifest = [ordered]@{
    id = (Split-Path -Leaf $TargetRoot).ToLowerInvariant()
    schema_version = '1.0.0'
    routing_keywords = @('project')
    stack = [ordered]@{
      opencode = '>=1.17.0'
      runtime = 'project-defined'
    }
    runtime_opts = [ordered]@{
      OPENCODE_CONFIG_DIR_REL = '.opencode/'
    }
    mcp_allowlist = @()
    skill_allowlist = @()
    schema_versions = [ordered]@{
      manifest = '1.0.0'
      index = '1.0.0'
      graph_node = '1.0.0'
      session_event = '1.0.0'
    }
    generated_at = $generatedAt
  } | ConvertTo-Json -Depth 8

  $index = [ordered]@{
    generated_at = $generatedAt
    summary = 'New project intelligence index; no project-specific findings recorded.'
    counts = [ordered]@{
      nodes = 0
      edges = 0
      by_type = [ordered]@{
        entity = 0
        decision = 0
        pattern = 0
        convention = 0
        observation = 0
        experiment = 0
      }
    }
    recent = @()
  } | ConvertTo-Json -Depth 8

  Write-ProjectFile -RelativePath '.intelligence\manifest.json' -Content ($manifest + "`n")
  Write-ProjectFile -RelativePath '.intelligence\index.json' -Content ($index + "`n")
  Write-ProjectFile -RelativePath '.intelligence\graph.jsonl' -Content ''

  $intelligenceReadmeSource = Join-Path $GlobalRoot "templates\project-neutral\.intelligence\README.md"
  if (Test-Path -LiteralPath $intelligenceReadmeSource) {
    $intelligenceReadmeDest = Join-Path $TargetRoot ".intelligence\README.md"
    $intelligenceReadmeExisted = Test-Path -LiteralPath $intelligenceReadmeDest
    $intelligenceReadmeChecksum = if (-not $intelligenceReadmeExisted) { Get-FileSha256Lower -Path $intelligenceReadmeSource } else { $null }
    $managedArtifacts.Add([ordered]@{
      relative_path = '.intelligence/README.md'
      artifact_type = 'intelligence'
      source = 'global:intelligence-readme'
      include_checksum = $true
      existed_before = $intelligenceReadmeExisted
      expected_checksum = $intelligenceReadmeChecksum
      create_state = if ($intelligenceReadmeExisted) { 'skipped' } else { 'copied' }
    })
    Copy-GenericFile -Source $intelligenceReadmeSource -RelativePath '.intelligence\README.md'
  }

  foreach ($relativePath in $intelligenceRelativePaths) {
    $managedArtifacts.Add([ordered]@{
      relative_path = $relativePath
      artifact_type = 'intelligence'
      source = 'generated:neutral-intelligence'
      include_checksum = $false
      existed_before = [bool]$intelligenceExistedBefore[$relativePath]
      expected_checksum = $null
      create_state = 'created'
    })
  }
}

if ($IncludeContracts) {
  foreach ($name in @('manifest.schema.json', 'index.schema.json', 'graph.schema.json', 'session.schema.json', 'bootstrap-manifest.schema.json')) {
    $relativePath = "contracts\$name"
    $source = Join-Path $OpenCodeConfigDir "contracts\$name"
    if (-not (Test-Path -LiteralPath $source)) {
      $source = Join-Path $GlobalRoot "contracts\$name"
    }
    if (Test-Path -LiteralPath $source) {
      $managedArtifacts.Add([ordered]@{
        relative_path = $relativePath
        artifact_type = 'contract'
        source = "global-contract:$name"
        include_checksum = $true
        existed_before = (Test-Path -LiteralPath (Join-Path $TargetRoot $relativePath))
        expected_checksum = (Get-FileSha256Lower -Path $source)
        create_state = 'copied'
      })
      Copy-GenericFile -Source $source -RelativePath $relativePath
    }
  }
}

if ($IncludeProfileCommands) {
  foreach ($name in @('go.md', 'chatgpt-plus.md', 'mix.md', 'minimax-plus.md')) {
    $relativePath = ".opencode\commands\$name"
    $source = Join-Path $GlobalRoot "templates\project-neutral\.opencode\commands\$name"
    if (-not (Test-Path -LiteralPath $source)) {
      continue
    }
    $managedArtifacts.Add([ordered]@{
      relative_path = $relativePath
      artifact_type = 'command'
      source = "global-command:$name"
      include_checksum = $true
      existed_before = (Test-Path -LiteralPath (Join-Path $TargetRoot $relativePath))
      expected_checksum = (Get-FileSha256Lower -Path $source)
      create_state = 'copied'
    })
    Copy-GenericFile -Source $source -RelativePath $relativePath
  }
}

if ($IncludeRetrievalPolicy) {
  $retrievalPolicySource = Join-Path $GlobalRoot "templates\project-neutral\.ai-env\retrieval-policy.json"
  if (Test-Path -LiteralPath $retrievalPolicySource) {
    $retrievalPolicyRelativePath = ".ai-env\retrieval-policy.json"
    $retrievalPolicyDest = Join-Path $TargetRoot $retrievalPolicyRelativePath
    $retrievalPolicyExisted = Test-Path -LiteralPath $retrievalPolicyDest
    $retrievalPolicyChecksum = if (-not $retrievalPolicyExisted) { Get-FileSha256Lower -Path $retrievalPolicySource } else { $null }
    $managedArtifacts.Add([ordered]@{
      relative_path = $retrievalPolicyRelativePath
      artifact_type = 'config'
      source = 'global:retrieval-policy'
      include_checksum = $true
      existed_before = $retrievalPolicyExisted
      expected_checksum = $retrievalPolicyChecksum
      create_state = if ($retrievalPolicyExisted) { 'skipped' } else { 'copied' }
    })
    Copy-GenericFile -Source $retrievalPolicySource -RelativePath $retrievalPolicyRelativePath
  }
}

if ($IncludeBootstrapManifest) {
  $bootstrapManifestPath = '.opencode\bootstrap-manifest.json'
  $bootstrapManifestDest = Join-Path $TargetRoot $bootstrapManifestPath
  $bootstrapManifestExisted = Test-Path -LiteralPath $bootstrapManifestDest

  $nowUtc = [DateTime]::UtcNow
  $projectId = (Split-Path -Leaf $TargetRoot).ToLowerInvariant() -replace '[^a-z0-9._-]', '-'

  $artifactsList = @()
  foreach ($artifact in $managedArtifacts) {
    $artifactEntry = [ordered]@{
      path = $artifact.relative_path
      artifact_type = $artifact.artifact_type
      source = $artifact.source
      observed_state = $artifact.create_state
      ownership = 'project'
    }
    if ($artifact.include_checksum -and $artifact.expected_checksum) {
      $artifactEntry['checksum_sha256'] = $artifact.expected_checksum
    }
    $artifactsList += $artifactEntry
  }

  $bootstrapManifest = [ordered]@{
    schema_version = $BootstrapSchemaVersion
    bootstrap_version = $BootstrapVersion
    project_id = $projectId
    created_at = $nowUtc.ToString('yyyy-MM-ddTHH:mm:ssZ')
    updated_at = $nowUtc.ToString('yyyy-MM-ddTHH:mm:ssZ')
    initializer = 'init-opencode-project.ps1'
    options = [ordered]@{
      include_intelligence = [bool]$IncludeIntelligence
      include_contracts = [bool]$IncludeContracts
      include_profile_commands = [bool]$IncludeProfileCommands
      include_bootstrap_manifest = [bool]$IncludeBootstrapManifest
      include_retrieval_policy = [bool]$IncludeRetrievalPolicy
      force = [bool]$Force
    }
    ownership = 'project'
    artifacts = $artifactsList
  } | ConvertTo-Json -Depth 10

  if ($bootstrapManifestExisted -and -not $Force) {
    Write-Host "[skip] $bootstrapManifestDest"
  } else {
    if ($PSCmdlet.ShouldProcess($bootstrapManifestDest, "write bootstrap manifest")) {
      $parent = Split-Path -Parent $bootstrapManifestDest
      if (-not (Test-Path -LiteralPath $parent)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
      }
      [System.IO.File]::WriteAllText($bootstrapManifestDest, $bootstrapManifest + "`n", [System.Text.UTF8Encoding]::new($false))
      Write-Host "[write] $bootstrapManifestDest"
    }
  }
}

Write-Host ""
Write-Host "Initialization complete: $TargetRoot"
Write-Host ""
Write-Host "Next steps:"
if (-not $isGitRoot) {
  Write-Host "  1. Initialize git: git init"
}
Write-Host "  2. Use opencode-launcher.ps1 to start with a profile"
Write-Host "     .\opencode-launcher.ps1 -Profile go -TargetDir `"$TargetRoot`""
