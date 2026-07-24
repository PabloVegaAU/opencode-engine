---
description: Update AI environment to latest global configuration
agent: build
---

Update this project's AI environment to the latest global configuration without touching local state.

```powershell
pwsh "$env:USERPROFILE\.config\opencode\scripts\update-opencode-global.ps1"
```

This:
- Compares checksums of managed files
- Updates only changed global files
- Backs up existing files before updating
- Does NOT modify project-specific configuration
- Does NOT touch credentials, sessions, or cache

Use `-Force` to update even unchanged files, or `-DryRun` to preview changes.
