---
description: Apply an explicitly approved ownership update plan
agent: build
---

```powershell
pwsh "$env:OPENCODE_CONFIG_DIR\scripts\ownership-update.ps1" apply -AiEnvHome <absolute-path> -PlanId <uuid> -ApprovePlanId <same-uuid>
```

Apply rejects blocked, invalid, non-global-managed, missing-content, or unapproved plans before backup or mutation.
