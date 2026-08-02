<#
.SYNOPSIS
    Initialize a repository with Loop Mode support

.DESCRIPTION
    Sets up a new or existing repository with the loop command infrastructure,
    including mission templates and permission configuration.

.PARAMETER RepoRoot
    Repository root directory (default: current directory)

.PARAMETER MissionName
    Default mission name for loop operations

.EXAMPLE
    .\init-loop-repository.ps1 -RepoRoot "C:\MyProject" -MissionName "main-dev"
#>

param(
    [Parameter(Mandatory=$false)]
    [string]$RepoRoot = $PWD,

    [Parameter(Mandatory=$false)]
    [string]$MissionName = "loop-default"
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

Write-Log "Initializing Loop Mode support for repository: $RepoRoot" "INFO"

# Create .opencode directory structure
$opencodeDir = Join-Path $RepoRoot ".opencode"
$missionsDir = Join-Path $opencodeDir "missions"
$scriptsDir = Join-Path $opencodeDir "scripts"

@($opencodeDir, $missionsDir, $scriptsDir) | ForEach-Object {
    if (-not (Test-Path $_)) {
        New-Item -ItemType Directory -Path $_ -Force | Out-Null
        Write-Log "Created: $_" "SUCCESS"
    }
}

# Create default mission
$missionFile = Join-Path $missionsDir "$MissionName.json"
$missionTemplate = @"
{
  "version": 1,
  "operation_id": "$MissionName",
  "repository_id": "$([System.IO.Path]::GetFileName($RepoRoot))",
  "title": "Loop Mode Mission",
  "status": "created",
  "created_at": "$(Get-Date -Format "yyyy-MM-ddTHH:mm:ss.000Z")",
  "tasks": []
}
"@

if (-not (Test-Path $missionFile)) {
    Set-Content -Path $missionFile -Value $missionTemplate
    Write-Log "Created mission: $missionFile" "SUCCESS"
} else {
    Write-Log "Mission already exists: $missionFile" "WARN"
}

# Copy loop scripts
$loopScripts = @(
    "$env:USERPROFILE\.config\opencode\scripts\loop.ps1"
    "$env:USERPROFILE\.config\opencode\scripts\loop.bat"
)

foreach ($script in $loopScripts) {
    if (Test-Path $script) {
        $dest = Join-Path $scriptsDir (Split-Path $script -Leaf)
        Copy-Item $script -Destination $dest -Force
        Write-Log "Copied: $(Split-Path $script -Leaf)" "SUCCESS"
    }
}

# Create opencode.jsonc with doom_loop permission
$configFile = Join-Path $opencodeDir "opencode.jsonc"
if (-not (Test-Path $configFile)) {
    $configTemplate = @"
{
  // Loop Mode Configuration
  "permission": {
    "doom_loop": "warn"  // Options: deny, warn, allow
  },
  // Compaction settings for long-running sessions
  "compaction": {
    "auto": true,
    "prune": true,
    "tail_turns": 10
  }
}
"@
    Set-Content -Path $configFile -Value $configTemplate
    Write-Log "Created config: $configFile" "SUCCESS"
    Write-Log "Note: doom_loop is set to 'warn'. Use 'allow' to enable loop without --approve-loop" "WARN"
}

Write-Log "=== Loop Mode Initialization Complete ===" "SUCCESS"
Write-Log ""
Write-Log "Next steps:"
Write-Log "  1. Review .opencode/opencode.jsonc permissions"
Write-Log "  2. Create missions in .opencode/missions/"
Write-Log "  3. Run: opencode loop --approve-loop -- 'your task'"
