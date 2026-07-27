# Ownership Update Engine V1

## Overview

The Ownership Update Engine is a pipeline-based system that discovers, inspects, classifies, and updates files across the OpenCode runtime and project layers. It ensures safe file mutations through mandatory approval gates, automated backups, and rollback capabilities.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    OWNERSHIP UPDATE ENGINE                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  discover ──▶ inspect ──▶ classify ──▶ plan ──▶ approve        │
│       │                                                   │     │
│       ▼                                                   ▼     │
│  [file scan]                                          [user     │
│                                                         decision]│
│       │                                                   │     │
│       ▼                                                   ▼     │
│  backup ──▶ apply ──▶ doctor ──▶ smoke ──▶ record         │     │
│       │                                                   │     │
│       └──────────────────┬────────────────────────────────┘     │
│                          ▼                                       │
│                    [rollback on failure]                         │
└─────────────────────────────────────────────────────────────────┘
```

### Components

| Component | Responsibility |
|-----------|----------------|
| Discover | Scan directories for files requiring ownership review |
| Inspect | Read file metadata and content for classification |
| Classify | Assign ownership category based on rules |
| Plan | Generate update plan with impact assessment |
| Approve | User-gated decision point before mutations |
| Backup | Create timestamped backups before changes |
| Apply | Execute planned ownership updates |
| Doctor | Validate post-update consistency |
| Smoke | Run rapid sanity checks on affected files |
| Record | Commit update history to audit log |

## Ownership Classification Model

Five mutually exclusive categories classify every file:

| Category | Code | Description | Example Files |
|----------|------|-------------|---------------|
| **Global Managed** | `G` | Runtime-owned, versioned, update-managed | `opencode.jsonc`, `AGENTS.md`, `bin/*` |
| **Project Owned** | `P` | Project-specific, never touched by global updates | `.opencode/*`, `project-specific/*` |
| **User Local** | `L` | User-specific state, credentials, sessions | `credentials.json`, `sessions/*` |
| **Shared Contract** | `S` | Cross-layer契约 files requiring协调 | `contracts/*.schema.json` |
| **External** | `E` | Third-party or read-only files | `node_modules/*`, vendor/*` |

### Classification Rules (Priority Order)

1. **Path-based**: Explicit mappings in `ownership-rules.json`
2. **Location-based**: Directory-level inheritance
3. **Content-based**: File signature analysis
4. **Default**: Inherited from parent directory

## Update Pipeline Phases

### Phase 1: Discover

Scans target directories for files requiring ownership review.

```powershell
# Discover phase options
-IncludePatterns "src/**", "bin/**"
-ExcludePatterns "node_modules/**", "*.log"
-Depth 3
```

**Outputs**: List of discovered file paths with metadata

### Phase 2: Inspect

Reads and analyzes each discovered file.

```typescript
interface InspectedFile {
  path: string;
  size: number;
  modified: Date;
  category?: OwnershipCategory;
  signatures: FileSignature[];
}
```

### Phase 3: Classify

Applies classification rules to determine ownership.

```
Priority: Explicit > Location > Content > Default
```

### Phase 4: Plan

Generates update plan with categorization results.

```yaml
plan:
  total_files: 42
  by_category:
    G: 15
    P: 20
    L: 2
    S: 3
    E: 2
  updates:
    - path: bin/opencode.jsonc
      action: update
      category: G
      risk: low
    - path: .opencode/config.jsonc
      action: skip
      category: P
      reason: project_owned
```

### Phase 5: Approve (Gate)

**Mandatory human approval** before any mutations occur.

```
┌────────────────────────────────────────┐
│     UPDATE PLAN REVIEW                 │
├────────────────────────────────────────┤
│  Files to update:   15 (G), 3 (S)     │
│  Files to skip:     24 (P, L, E)      │
│  Estimated time:    ~30 seconds       │
├────────────────────────────────────────┤
│  [APPROVE]  [REJECT]  [MODIFY PLAN]    │
└────────────────────────────────────────┘
```

### Phase 6: Backup

Creates timestamped backup before any changes.

```
runtime/backups/ownership/<timestamp>/
├── bin/
│   └── opencode.jsonc
├── global/
│   └── routing.jsonc
└── manifest.json
```

### Phase 7: Apply

Executes planned updates to classified files.

**Atomicity**: All-or-nothing within category batch

### Phase 8: Doctor

Post-update consistency validation.

```powershell
# Doctor checks
- Schema validation
- Reference integrity
- Path consistency
- Syntax validation
```

### Phase 9: Smoke

Rapid sanity checks on affected files.

```powershell
# Smoke tests
- File readability
- Basic syntax validation
- Import/require resolution
```

### Phase 10: Record

Commits update to audit history.

```json
{
  "timestamp": "2026-07-27T10:30:00Z",
  "phase": "record",
  "result": "success",
  "files_updated": 18,
  "categories_modified": ["G", "S"],
  "backup_ref": "ownership/2026-07-27T10-29-55Z"
}
```

## Rollback on Failure

### Automatic Triggers

Rollback initiates when:
- `apply` phase fails for any file
- `doctor` phase detects inconsistencies
- `smoke` phase reports critical failures
- User rejects at approval gate (partial rollback)

### Rollback Procedure

```
1. Halt current pipeline
2. Query backup manifest for last good state
3. Restore files from backup archive
4. Run doctor on restored files
5. Confirm rollback success
6. Record rollback event to audit log
```

### Backup Pruning

- Retention: 10 most recent per installation
- Automatic cleanup of older backups
- Manual purge via `cleanup-backups.ps1`

## Directory Layout

```
opencode-global-src/
├── bin/
│   └── ownership/
│       ├── engine.mjs           # Main engine entry
│       ├── phases/
│       │   ├── discover.mjs
│       │   ├── inspect.mjs
│       │   ├── classify.mjs
│       │   ├── plan.mjs
│       │   ├── approve.mjs
│       │   ├── backup.mjs
│       │   ├── apply.mjs
│       │   ├── doctor.mjs
│       │   ├── smoke.mjs
│       │   └── record.mjs
│       └── rules/
│           └── ownership-rules.json
├── distribution/
│   └── runtime-manifest.json
├── docs/
│   └── OWNERSHIP_UPDATE_ENGINE_V1.md
└── scripts/
    └── ownership/
        └── run-ownership-update.ps1
```

### Runtime Layout (Post-Installation)

```
~/.config/opencode/
├── backups/
│   └── ownership/
│       └── <timestamp>/
├── ownership/
│   ├── engine.mjs
│   ├── phases/
│   └── rules/
└── logs/
    └── ownership/
```

## Usage Examples

### Basic Update Run

```powershell
pwsh "$env:USERPROFILE\.config\opencode\scripts\ownership\run-ownership-update.ps1"
```

### Dry Run (No Changes)

```powershell
pwsh "$env:USERPROFILE\.config\opencode\scripts\ownership\run-ownership-update.ps1" -DryRun
```

### Specific Categories Only

```powershell
pwsh "$env:USERPROFILE\.config\opencode\scripts\ownership\run-ownership-update.ps1" -Categories G, S
```

### With Verbose Output

```powershell
pwsh "$env:USERPROFILE\.config\opencode\scripts\ownership\run-ownership-update.ps1" -Verbose
```

### Programmatic (Node.js)

```javascript
import { OwnershipEngine } from './bin/ownership/engine.mjs';

const engine = new OwnershipEngine({
  categories: ['G', 'S'],
  dryRun: false,
  verbose: true
});

const result = await engine.run();
console.log(result.summary);
```

### Rollback Last Update

```powershell
pwsh "$env:USERPROFILE\.config\opencode\scripts\ownership\run-ownership-update.ps1" -Rollback
```

## Error Handling

| Error Code | Phase | Action |
|------------|-------|--------|
| `E_DISCVER_001` | Discover | Abort pipeline |
| `E_INSPECT_001` | Inspect | Skip file, log warning |
| `E_CLASSIFY_001` | Classify | Default to 'E' category |
| `E_PLAN_001` | Plan | Abort pipeline |
| `E_APPROVE_001` | Approve | Abort pipeline |
| `E_BACKUP_001` | Backup | Abort before apply |
| `E_APPLY_001` | Apply | Trigger rollback |
| `E_DOCTOR_001` | Doctor | Trigger rollback |
| `E_SMOKE_001` | Smoke | Trigger rollback |
| `E_RECORD_001` | Record | Log only, no rollback |

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-07-27 | Initial release with 10-phase pipeline |
