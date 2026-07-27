---
description: Initialize a new AI environment for a project
agent: build
---

Initialize the AI environment structure for this project using the official project initializer.

**IMPORTANT:** This script does NOT create AGENTS.md or custom agents. Use `/init` (the official OpenCode command) for AGENTS.md creation.

```powershell
pwsh "$env:USERPROFILE\.config\opencode\scripts\init-opencode-project.ps1" -ProjectPath (Get-Location).Path -IncludeIntelligence -IncludeContracts -IncludeBootstrapManifest
```

This creates:
- `opencode.json` - minimal config inheriting global defaults
- `.intelligence/` - neutral intelligence structure (manifest, index, graph) [if -IncludeIntelligence]
- `contracts/` - contract schemas for validation [if -IncludeContracts]
- `.opencode/bootstrap-manifest.json` - bootstrap manifest recording initialization [if -IncludeBootstrapManifest]

The initializer is **idempotent** - it will not overwrite existing files unless -Force is passed.

**AGENTS.md is NOT created by this script.** Use `/init` separately for AGENTS.md creation, which is the official OpenCode mechanism for agent definitions.

Profile commands (go, chatgpt-plus, mix, minimax-plus) can be added with `-IncludeProfileCommands`.

Retrieval policy can be added with `-IncludeRetrievalPolicy` for adopted projects.
