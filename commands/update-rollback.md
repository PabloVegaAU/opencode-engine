---
description: Roll back an ownership update run
agent: build
---

```powershell
pwsh "$env:OPENCODE_CONFIG_DIR\scripts\ownership-update.ps1" rollback -AiEnvHome <absolute-path> -RunId <uuid>
```
