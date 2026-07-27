---
description: Diagnose AI environment health for this project
agent: build
---

Diagnose the health of this project's AI environment and configuration.

```powershell
pwsh "$env:USERPROFILE\.config\opencode\scripts\doctor-opencode-global.ps1" -ProjectPath (Get-Location).Path
```

This checks:
- Required configuration files exist
- JSON/JSONC syntax is valid
- Profiles are properly configured
- Routing matrix is present
- No hardcoded credentials or absolute paths
- Cross-session CLI availability (optional)
- Project-level retrieval policy (if -ProjectPath provided)
- Retrieval provider configuration

Run this after installation or when experiencing issues.
