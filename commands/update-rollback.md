---
description: Execute rollback for a failed update run
agent: build
---

Execute complete rollback to pre-update state for a failed run by invoking the rollback-controller module.

**Requires:**
- A valid run ID from a failed update operation
- Rollback plan must exist at `journal/rollbacks/{runId}.json`
- Backup manifest from the original update run

Invoke the rollback-controller directly via node:

```powershell
node --input-type=module -e "
import {{ executeRollback }} from '$env:USERPROFILE\.config\opencode\opencode-global-src\bin\updates\rollback-controller.mjs';
import {{ readFileSync }} from 'node:fs';

const runId = '<run-id>';
const journalDir = 'journal';
const rollbackPlanPath = \`\${journalDir}/rollbacks/\${runId}.json\`;
const updateRunPath = \`\${journalDir}/update-runs/\${runId}.json\`;

const rollbackPlan = JSON.parse(readFileSync(rollbackPlanPath, 'utf8'));
const updateRun = JSON.parse(readFileSync(updateRunPath, 'utf8'));

const result = await executeRollback(runId, updateRun.backup_manifest, {{ journalDir }});
console.log(JSON.stringify(result, null, 2));
"
```

Parameters:
- `<run-id>` — The run ID that failed and requires rollback
- `journalDir` — Journal directory path (defaults to `./journal` relative to project)

Rollback will:
1. Load the rollback plan from `journal/rollbacks/{runId}.json`
2. Restore files from backup in reverse order (LIFO)
3. Remove files created during the failed apply
4. Verify SHA256 checksums of restored files
5. Update run status to `rolled_back`

On success, returns:
```json
{
  "success": true,
  "runId": "<run-id>",
  "rollbackId": "<rollback-uuid>",
  "restoredFiles": [...],
  "failedRestorations": [],
  "completedAt": "<ISO-8601-timestamp>"
}
```

On failure, returns:
```json
{
  "success": false,
  "error": "<error-message>",
  "runId": "<run-id>"
}
```
