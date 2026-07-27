# v0.6.0 Ownership & Safe Project Update Engine

## Purpose

Enable safe, atomic, auditable updates of adopted AI environments without overwriting project customizations. The system classifies each artifact by ownership, applies deterministic update rules, maintains a backup and journal, and supports complete rollback on failure.

## Scope

**In Scope:**
- Ownership classification for every artifact in an adopted environment
- Deterministic update planning with explicit user approval gate
- Atomic apply with full rollback on intermediate failure
- Backup before any mutation
- Recovery journal for audit and replay
- Migration catalog for tracked schema/artifact migrations

**Out of Scope:**
- AI-driven conflict resolution (future phase)
- Three-way merge (future phase)
- Automatic dependency resolution
- Remote push/merge
- Scheduler or task queue

## Ownership Classification Model

Every artifact in an adopted environment MUST be classified into one of five ownership categories:

| Category | Description | Update Behavior |
|----------|-------------|-----------------|
| `global-managed` | Canonical artifact maintained by OpenCode Global | Update when no local divergence |
| `project-owned` | Custom artifact created and maintained by the project | Never overwrite; preserve always |
| `global-managed-local-override` | Global artifact modified locally with permitted override | Preserve and record divergence |
| `generated-runtime` | Generated during session (e.g., build artifacts, caches) | Skip unless explicit migration ID |
| `external` | Owned by third-party tooling or framework | Never modify |

### Ownership Resolution Rules (Deterministic)

1. **Global artifact, no local changes**: Apply update
2. **Project-owned artifact**: Preserve unconditionally; do not modify
3. **Global artifact with permitted local override**: Preserve and record in journal
4. **Global artifact divergent without policy**: Block update; require explicit migration ID
5. **New file**: Create atomically within transaction
6. **File deleted by migration**: Remove only with explicit `migration_id`
7. **Intermediate failure**: Complete rollback to pre-update state

## Update Pipeline

```
discover  → inspect  → classify  → plan  → approve  → backup  → apply  → doctor  → smoke  → record
                           ↑                                                                 ↓
                           ←←←←←←←←←←←← rollback on failure ←←←←←←←←←←←←←←←←←←
```

### Phase 1: Discover
- Scan adopted environment for all artifacts
- Identify Global-managed paths vs project paths
- Detect divergence from last known Global state

### Phase 2: Inspect
- Read current artifact content
- Compute checksums
- Extract metadata (mtime, ownership hints)

### Phase 3: Classify
- Apply ownership policy rules
- Produce classification map: `artifact → ownership_category`
- Flag unclassified artifacts for manual policy assignment

### Phase 4: Plan
- Generate `update-plan.schema.json`
- Enumerate: artifacts to update, preserve, block, create, delete
- Include migration IDs where required
- Mark blocked artifacts with `BLOCKED_NO_POLICY`

### Phase 5: Approve (User Gate)
- Present plan summary
- Require explicit human approval before any write
- Support `--approve-protected-ref` for protected refs (future)

### Phase 6: Backup
- Create point-in-time snapshot before mutation
- Produce `backup-manifest.schema.json`
- Store in `AI_ENV_HOME/backups/<timestamp>/`

### Phase 7: Apply
- Execute atomic updates per plan
- New files: create with atomic write (temp rename)
- Modified files: replace after successful write
- Track progress in `update-run.schema.json`
- On any failure: trigger complete rollback

### Phase 8: Doctor
- Verify post-update state
- Check schema validity
- Confirm no orphaned artifacts

### Phase 9: Smoke Test
- Run basic sanity checks
- Validate critical paths exist
- Confirm configuration consistency

### Phase 10: Record
- Write completion record to journal
- Update ownership classification cache
- Emit audit event with sanitized metrics

## Contracts

### migration-catalog.schema.json

```json
{
  "version": "1",
  "migrations": [
    {
      "migration_id": "string",
      "description": "string",
      "source_version": "string",
      "target_version": "string",
      "artifacts": ["path patterns"],
      "preconditions": ["conditions"],
      "rollback_id": "string | null"
    }
  ]
}
```

### update-plan.schema.json

```json
{
  "plan_id": "uuid",
  "created_at": "ISO8601",
  "source_version": "string",
  "target_version": "string",
  "classifications": {
    "artifact_path": "ownership_category"
  },
  "operations": [
    {
      "type": "update | preserve | block | create | delete",
      "path": "string",
      "migration_id": "string | null",
      "reason": "string"
    }
  ],
  "blocked_count": "number",
  "requires_approval": true
}
```

### update-run.schema.json

```json
{
  "run_id": "uuid",
  "plan_id": "uuid",
  "started_at": "ISO8601",
  "completed_at": "ISO8601 | null",
  "status": "in_progress | completed | rolled_back | failed",
  "operations": [
    {
      "type": "string",
      "path": "string",
      "status": "pending | success | failed | rolled_back",
      "error": "string | null"
    }
  ],
  "backup_manifest_path": "string",
  "journal_entry_id": "uuid"
}
```

### backup-manifest.schema.json

```json
{
  "backup_id": "uuid",
  "created_at": "ISO8601",
  "plan_id": "uuid",
  "artifacts": [
    {
      "path": "string",
      "sha256": "string",
      "size": "number",
      "mtime": "ISO8601"
    }
  ],
  "storage_path": "string"
}
```

### rollback-plan.schema.json

```json
{
  "rollback_id": "uuid",
  "triggered_by_run_id": "uuid",
  "created_at": "ISO8601",
  "operations": [
    {
      "type": "restore | remove",
      "path": "string",
      "backup_ref": "string"
    }
  ]
}
```

### ownership-policy.schema.json

```json
{
  "version": "1",
  "rules": [
    {
      "path_pattern": "string (glob)",
      "category": "ownership_category",
      "allow_override": "boolean",
      "migration_id_required": "boolean"
    }
  ],
  "default_category": "project-owned",
  "blocked_categories": ["external"]
}
```

## Functional Requirements

| ID | Requirement | Domain |
|----|-------------|--------|
| FR1 | System MUST classify every artifact into exactly one ownership category | Classification |
| FR2 | System MUST preserve project-owned artifacts unconditionally | Preservation |
| FR3 | System MUST block updates when divergent global artifact has no policy | Safety |
| FR4 | System MUST create backup before any mutation | Safety |
| FR5 | System MUST rollback completely on any apply failure | Safety |
| FR6 | System MUST require explicit user approval before apply | Governance |
| FR7 | System MUST record every operation in recovery journal | Audit |
| FR8 | System MUST support idempotent apply (re-run produces same state) | Idempotence |
| FR9 | System MUST skip generated-runtime artifacts unless migration ID provided | Filtering |
| FR10 | System MUST support migration catalog for schema evolution | Migrations |

## Non-Functional Requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR1 | Update apply MUST be atomic (all-or-nothing) | Correctness |
| NFR2 | Rollback MUST complete within 2x apply time | Performance |
| NFR3 | Backup overhead SHOULD be < 5 seconds for typical environment | Performance |
| NFR4 | Plan generation MUST be read-only (zero writes) | Safety |
| NFR5 | Journal entries MUST be sanitized (no secrets, no absolute paths) | Security |

## Constraints

1. **No AI-driven conflict resolution**: Apply deterministic rules only
2. **No three-way merge**: Replace or preserve; no intelligent merge
3. **No remote mutation**: No push, fetch, merge to remote
4. **No scheduler**: Human-in-the-loop for every apply
5. **No auto-dependency resolution**: Explicit migration ordering
6. **No rollback of rollback**: Rollback is final for the affected run

## Directory Layout

```
AI_ENV_HOME/
  backups/
    <timestamp>/
      backup-manifest.json
      artifacts/          # compressed snapshots
  journal/
    update-runs/          # update-run.schema.json records
    rollbacks/            # rollback-plan.schema.json records
  migration-catalog.json  # approved migrations
  ownership-cache.json    # classification map (rebuildable)
```

## Key Entities

| Entity | Description |
|--------|-------------|
| OwnershipClassifier | Reads artifacts, applies policy, produces classification map |
| UpdatePlanner | Generates update plan from classification + catalog |
| BackupManager | Creates point-in-time snapshot, produces manifest |
| ApplyExecutor | Executes plan operations atomically, tracks progress |
| RollbackController | Detects failure, initiates complete rollback |
| JournalWriter | Appends sanitized audit records |
| MigrationCatalog | Stores approved migrations with rollback support |

## How to Verify

### Unit Tests
- Classifier: given artifact path, returns correct category
- Planner: given classification map + catalog, produces valid plan
- Backup: given set of paths, creates valid manifest + snapshots
- Rollback: given failed run, restores exact pre-state

### Integration Tests
- Full pipeline with sandbox environment
- Simulated failure mid-apply → complete rollback
- Idempotency: apply same plan twice → same result
- Blocked artifact without policy → plan rejected

### Manual Verification
1. Create sandbox environment with mixed ownership artifacts
2. Run discover + inspect + classify
3. Verify classification matches expected categories
4. Approve plan and verify atomic apply
5. Verify backup manifest is valid
6. Introduce failure and verify rollback
7. Check journal for sanitized entries

## Success Criteria

1. **Safety**: Zero data loss; project-owned artifacts never overwritten
2. **Auditability**: Every mutation has corresponding journal entry
3. **Determinism**: Same inputs produce same outputs across runs
4. **Transparency**: User can inspect plan before approval
5. **Recoverability**: Any failed apply can be completely rolled back
