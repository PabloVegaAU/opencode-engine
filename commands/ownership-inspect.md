---
description: Inspect AI environment ownership without writing
agent: build
---

Uses only the installed wrapper and performs classification without mutation:

```powershell
pwsh "$env:OPENCODE_CONFIG_DIR\scripts\ownership-update.ps1" inspect -AiEnvHome <absolute-path> -Policy <policy-json>
```
