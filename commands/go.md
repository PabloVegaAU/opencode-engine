---
description: Launch OpenCode with GO profile
agent: build
---

Launch OpenCode using the GO profile routing.

```powershell
& "$env:USERPROFILE\.config\opencode\scripts\opencode-launcher.ps1" -Profile go -TargetDir (Get-Location).Path
```