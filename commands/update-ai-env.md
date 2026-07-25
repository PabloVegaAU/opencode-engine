---
description: Diagnose or plan AI environment updates (read-only in v0.4.0)
agent: build
---

Diagnose project AI environment health or generate an update plan. v0.4.0 is STRICTLY READ-ONLY.

**Doctor mode (default):**
```powershell
pwsh "$env:USERPROFILE\.config\opencode\scripts\update-opencode-project.ps1" -ProjectPath (Get-Location).Path -Doctor
```

**Plan mode (JSON):**
```powershell
pwsh "$env:USERPROFILE\.config\opencode\scripts\update-opencode-project.ps1" -ProjectPath (Get-Location).Path -Plan
```

Doctor mode inspects:
- Bootstrap manifest existence and parsing
- Retrieval policy state (PROJECT_NOT_ADOPTED, ADOPTED, MISSING_AFTER_ADOPTION)
- Checksums of managed artifacts
- Contracts, intelligence structure, and profile commands

Plan mode returns deterministic JSON with:
- `apply_supported: false`
- `rollback_supported: false`
- Conceptual actions with reasons and ownership
- No files are ever modified

**v0.4.0 does NOT support apply or rollback.** Those operations belong to the future Project Update Engine.

This tool NEVER writes, backs up, or modifies any project files.
