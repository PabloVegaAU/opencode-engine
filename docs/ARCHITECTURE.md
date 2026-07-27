# OpenCode Global Architecture

## Four-Layer Model

| Layer | Location | Responsibility |
|-------|----------|----------------|
| Distribution | GitHub `opencode-global` | Reusable, versioned source |
| Runtime Global | `~/.config/opencode` | Active installation per PC |
| Project | Projects | Project-specific agents, MCP, skills |
| Local State | User Profile | Credentials, sessions, caches |

## Source → Runtime → Project

```
Source (Git clone)
    │
    │  install/update scripts consume
    │  distribution/runtime-manifest.json
    ▼
Runtime (~/.config/opencode or OPENCODE_CONFIG_DIR)
    │
    │  init-opencode-project.ps1 initializes
    ▼
Project (your code repository)
```

### Source Layer (C:\OpenCode\opencode-global-src)
- **Is**: The canonical distribution truth
- **Contains**: All runtime artifacts plus development-only scripts
- **Never installed as-is**: Development tools (generate-retrieval-validators.mjs, validate.mjs, discover-real-query-set.mjs, run-retrieval-real-pilot.mjs) are NOT installed to runtime

### Runtime Layer (~/.config/opencode)
- **Is**: The installed state derived from source
- **Created by**: install-opencode-global.ps1 and update-opencode-global.ps1
- **Inventory source**: distribution/runtime-manifest.json (single source of truth)
- **Contains**:
  - opencode.jsonc - Global configuration
  - AGENTS.md - Global instructions
  - opencode.profiles/* - Model profiles
  - routing/* - Model routing matrix
  - retrieval/* - Default retrieval policy
  - contracts/*.schema.json - Validation schemas
  - bin/retrieval/* - Retrieval execution engine and adapters
  - templates/project-neutral/* - Project templates
  - commands/*.md - 8 public commands
  - scripts/*.ps1 - Lifecycle scripts (runtime-safe only)

### Project Layer (your repository)
- **Created by**: init-opencode-project.ps1
- **Contains**: Project-specific files only
- **Bootstrap manifest**: .opencode/bootstrap-manifest.json (optional, created with -IncludeBootstrapManifest)

## Managed vs Local State

### Managed (by install/update scripts)
Files are mapped **from source-relative paths to runtime-relative destinations** by runtime-manifest.json. Updates back up changed destinations to runtime/backups/managed/<timestamp>/ before replacement.

Install and update preflight validate path containment, reparse-point safety, complete inventory sources, and capture an immutable SHA-256 byte snapshot (capped at 64 MiB) before approval. Destination writes use only those captured bytes; source mutation after preflight cannot change the installed source set. Destination rollback remains non-transactional if a later I/O failure occurs.

### Local State (never touched by install/update)
- Credentials and sessions
- Cache directories
- .opencode/node_modules
- Root node_modules
- bin/orchestration (separate OpenCode runtime)
- bin/environment
- registry.sqlite
- opencode.backups (user archive - requires separate manual decision)

## Development-Only vs Runtime Scripts

### Runtime Scripts (installed)
- install-opencode-global.ps1
- update-opencode-global.ps1
- cleanup-runtime.ps1
- init-opencode-project.ps1
- update-opencode-project.ps1
- doctor-opencode-global.ps1
- certify-opencode-global.ps1
- opencode-launcher.ps1
- cross-session.ps1
- retrieval-router.ps1
- setup-retrieval-tools.ps1

### Development-Only (NOT installed)
- generate-retrieval-validators.mjs
- validate.mjs
- discover-real-query-set.mjs
- run-retrieval-real-pilot.mjs

## Cleanup Quarantine

cleanup-runtime.ps1 uses a **quarantine approach** instead of deletion:

1. Default is DryRun - no files are moved without explicit -Force
2. Legacy items are moved to: runtime/backups/legacy-runtime-<timestamp>/
3. Adjacent .bak files are also quarantined
4. opencode.backups is reported but NOT touched automatically

### Legacy Items Quarantined
- Repository contamination: .git, docs, specs, tests, working
- Obsolete root files: README.md, HANDOVER.md, estructura-proyecto.txt
- Legacy commands: chatgpt.md, minimax.md, orchestrate.md, init-orchestration.md, etc.
- Legacy scripts: switch-opencode-profile.ps1, old bin scripts

## Lifecycle Commands

### /init vs /init-ai-env

| Command | Purpose | Creates AGENTS.md? |
|---------|---------|-------------------|
| /init | Official OpenCode command for AGENTS.md creation | YES |
| /init-ai-env | Initialize project runtime shell | NO |

### Lifecycle Help Commands

```powershell
# Get help for any lifecycle script
pwsh "$env:USERPROFILE\.config\opencode\scripts\install-opencode-global.ps1" -?

# Project initialization
pwsh "$env:USERPROFILE\.config\opencode\scripts\init-opencode-project.ps1" -?

# Update global runtime
pwsh "$env:USERPROFILE\.config\opencode\scripts\update-opencode-global.ps1" -?

# Cleanup legacy runtime items
pwsh "$env:USERPROFILE\.config\opencode\scripts\cleanup-runtime.ps1" -?

# Diagnose installation
pwsh "$env:USERPROFILE\.config\opencode\scripts\doctor-opencode-global.ps1" -?

# Project diagnostics (read-only)
pwsh "$env:USERPROFILE\.config\opencode\scripts\update-opencode-project.ps1" -Doctor -?
```

## Principles

- Global never contains project-specific content
- Projects never contain credentials or secrets
- Installation is idempotent and non-destructive
- Updates only affect managed global files
- Updates use centralized backup: runtime/backups/managed/<timestamp>/
- Cleanup uses quarantine: runtime/backups/legacy-runtime-<timestamp>/
- AGENTS.md is created by /init, not by init-opencode-project.ps1
- Source is the sole distribution truth; runtime is derived
