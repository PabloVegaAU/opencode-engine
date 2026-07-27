---
description: Diagnose or plan AI environment updates (read-only)
agent: build
---

Diagnose project AI environment health or generate an update plan. This tool is **STRICTLY READ-ONLY**.

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

Plan mode returns a deterministic read-only report of conceptual actions, reasons, and ownership. It does not implement apply, rollback, or run identifiers.

This command is doctor/plan only: it never writes, backs up, or modifies project files.
