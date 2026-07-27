---
description: Apply an approved update plan to the project
agent: build
---

Apply an approved update plan by reading the plan ID, loading the plan from disk, and invoking the apply-executor to execute the plan operations atomically.

**Prerequisites:**
- An approved update plan must exist in `AI_ENV_HOME/plans/{plan_id}.json`
- The plan must have `requires_approval: true` and be in approved state

**Invocation:**

```powershell
pwsh "$env:USERPROFILE\.config\opencode\scripts\update-apply.ps1" `
  -PlanId <uuid> `
  -AiEnvHome <absolute>
```

**Arguments:**

- `-PlanId` — UUID of the approved plan to apply (required)
- `-AiEnvHome` — Absolute path to the AI environment home directory (required)

**Behavior:**

1. Reads the approved plan ID and validates it is a UUID
2. Loads the plan from `AI_ENV_HOME/plans/{plan_id}.json`
3. Creates a backup of artifacts to be modified via BackupManager
4. Invokes apply-executor with the plan, backup manifest, and run ID
5. Writes an update-run record to `AI_ENV_HOME/journal/update-runs/{run_id}.json`
6. Reports the result status

**Result reporting:**

The command outputs JSON with:
- `run_id` — UUID of the update run
- `plan_id` — UUID of the applied plan
- `status` — `in_progress`, `completed`, `failed`, or `rolled_back`
- `operations` — Array of per-operation results
- `error` — Error message if failed (null if successful)

**Error conditions:**

- Missing plan file → error with path
- Backup creation failure → rollback and error
- Any operation failure → rollback and error with details
