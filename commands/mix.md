---
description: Launch OpenCode with MIX profile
agent: build
---

Launch OpenCode using the MIX profile routing.

```powershell
& "$env:USERPROFILE\.config\opencode\scripts\opencode-launcher.ps1" -Profile mix -TargetDir (Get-Location).Path
```