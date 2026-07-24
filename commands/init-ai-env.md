---
description: Initialize a new AI environment for a project
agent: build
---

Initialize the AI environment structure for this project using the official project initializer.

```powershell
pwsh "$env:USERPROFILE\.config\opencode\scripts\init-opencode-project.ps1" -ProjectPath (Get-Location).Path -IncludeIntelligence -IncludeContracts
```

This creates:
- `opencode.json` - minimal config inheriting global defaults
- `AGENTS.md` - project-specific agent definitions
- `.intelligence/` - neutral intelligence structure (manifest, index, graph)
- `contracts/` - contract schemas for validation
- `.bootstrap/project-manifest.json` - bootstrap manifest

The initializer is idempotent and will not overwrite existing files.
