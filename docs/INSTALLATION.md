# Installation Guide

## Prerequisites

- Git
- PowerShell 7+
- Node.js / pnpm
- OpenCode (`npm install -g opencode-ai`)

## Install OpenCode Global

```powershell
git clone <repo>/opencode-global.git C:\OpenCode\opencode-global-src
cd C:\OpenCode\opencode-global-src
pwsh .\scripts\install-opencode-global.ps1
opencode providers login
pwsh .\scripts\doctor-opencode-global.ps1
pwsh .\scripts\certify-opencode-global.ps1
```

## Update

```powershell
cd C:\OpenCode\opencode-global-src
git pull
pwsh .\scripts\update-opencode-global.ps1
```

## Source Root Requirement

When running install/update **from the source repository** (where you cloned the repo), the scripts automatically detect the source root.

When running install/update **from the installed runtime** (`~/.config/opencode/scripts/`), you must specify the source root:

```powershell
# Using -SourceRoot parameter
~/.config/opencode/scripts/update-opencode-global.ps1 -SourceRoot C:\OpenCode\opencode-global-src

# Or using environment variable
$env:OPENCODE_SOURCE_ROOT = 'C:\OpenCode\opencode-global-src'
~/.config/opencode/scripts/update-opencode-global.ps1
```

This is required because the installed scripts cannot auto-detect the source repository location. The source root must contain:
- `distribution/runtime-manifest.json`
- `distribution/resolve-runtime-manifest.ps1`
- `global/opencode.jsonc`
- `scripts/install-opencode-global.ps1`

## Idempotent Installation

The install script is idempotent. Running it multiple times is safe:

```powershell
# First run - installs all files
pwsh .\scripts\install-opencode-global.ps1

# Second run - skips existing files (unless -Force)
pwsh .\scripts\install-opencode-global.ps1

# Force overwrite all files
pwsh .\scripts\install-opencode-global.ps1 -Force
```

## DryRun Mode

Both install and update scripts support DryRun to preview changes without writing:

```powershell
# Preview what would be installed
pwsh .\scripts\install-opencode-global.ps1 -DryRun

# Preview what would be updated
pwsh .\scripts\update-opencode-global.ps1 -DryRun
```

## Sandbox Isolation with OPENCODE_CONFIG_DIR

For testing or isolated environments, use OPENCODE_CONFIG_DIR:

```powershell
$env:OPENCODE_CONFIG_DIR = "C:\my-test-config"
pwsh .\scripts\install-opencode-global.ps1
```

## Centralized Backups

When update changes managed files, backups go to:

```
~/.config/opencode/runtime/backups/managed/<timestamp>/
```

Not adjacent .bak files.

## Cleanup Legacy Items

The cleanup script quarantines legacy contamination:

```powershell
# Preview what would be quarantined (default DryRun)
pwsh .\scripts\cleanup-runtime.ps1

# Actually quarantine legacy items
pwsh .\scripts\cleanup-runtime.ps1 -Force
```

Quarantined items go to: `runtime/backups/legacy-runtime-<timestamp>/`

## Initialize a Project

```powershell
# Minimal init (opencode.json only)
pwsh "$env:USERPROFILE\.config\opencode\scripts\init-opencode-project.ps1" -ProjectPath "C:\my-project"

# Full init with intelligence, contracts, and bootstrap manifest
pwsh "$env:USERPROFILE\.config\opencode\scripts\init-opencode-project.ps1" `
  -ProjectPath "C:\my-project" `
  -IncludeIntelligence `
  -IncludeContracts `
  -IncludeBootstrapManifest
```

**Note**: AGENTS.md is NOT created by init-opencode-project.ps1. Use `/init` (the official OpenCode command) for AGENTS.md creation.

## Install Inventory

The install consumes `distribution/runtime-manifest.json` as the single source of truth for what gets installed.

### What IS Installed
- Global config, profiles, routing, AGENTS.md
- retrieval/default-policy.json
- ALL contracts/*.schema.json
- bin/retrieval/* (including adapters/)
- templates/project-neutral/* (recursive)
- 8 commands: go.md, chatgpt-plus.md, mix.md, minimax-plus.md, cross-session.md, init-ai-env.md, doctor-ai-env.md, update-ai-env.md
- Runtime scripts (install, update, cleanup, init, doctor, certify, launcher, cross-session, retrieval-router, setup-retrieval-tools)

### What is NOT Installed
- Development-only scripts: generate-retrieval-validators.mjs, validate.mjs, discover-real-query-set.mjs, run-retrieval-real-pilot.mjs
- Source development tools are NOT installed merely because they exist in source
