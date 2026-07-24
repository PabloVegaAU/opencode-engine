---
description: Launch OpenCode with CHATGPT-PLUS profile
agent: build
---

Launch OpenCode using the CHATGPT-PLUS profile routing.

```powershell
& "$env:USERPROFILE\.config\opencode\scripts\opencode-launcher.ps1" -Profile chatgpt-plus -TargetDir (Get-Location).Path
```