# Architecture Validation Checklist

## Schema Contracts

- [ ] `ownership-policy.schema.json` validates successfully
- [ ] `migration-catalog.schema.json` validates successfully
- [ ] `update-plan.schema.json` validates successfully
- [ ] `update-run.schema.json` validates successfully
- [ ] `backup-manifest.schema.json` validates successfully
- [ ] `rollback-plan.schema.json` validates successfully

## Core Modules

### OwnershipClassifier
- [ ] Correctly classifies `global-managed` paths
- [ ] Correctly classifies `project-owned` paths
- [ ] Correctly classifies `global-managed-local-override` paths
- [ ] Correctly classifies `generated-runtime` paths
- [ ] Correctly classifies `external` paths
- [ ] Falls back to default category for unknown patterns
- [ ] Produces complete classification map

### UpdatePlanner
- [ ] Generates valid `update-plan.schema.json`
- [ ] Flags blocked artifacts with `BLOCKED_NO_POLICY`
- [ ] Requires migration ID for delete operations
- [ ] Identifies artifacts to update vs preserve
- [ ] Plan is deterministic (same inputs → same outputs)

### BackupManager
- [ ] Creates point-in-time snapshot
- [ ] Produces valid `backup-manifest.schema.json`
- [ ] Computes correct SHA256 for each artifact
- [ ] Stores artifacts under `AI_ENV_HOME/backups/<timestamp>/`
- [ ] Handles large files without memory overflow

### ApplyExecutor
- [ ] Executes all operations atomically
- [ ] Updates status in `update-run.schema.json`
- [ ] Detects and reports failures immediately
- [ ] Creates new files atomically (temp rename)
- [ ] Does not leave partial artifacts on failure

### RollbackController
- [ ] Detects failed run
- [ ] Reads `backup-manifest.schema.json`
- [ ] Restores exact pre-state
- [ ] Removes created artifacts
- [ ] Marks run as `rolled_back`
- [ ] Does not re-throw original error

### JournalWriter
- [ ] Writes sanitized entries (no secrets)
- [ ] Writes sanitized entries (no absolute paths)
- [ ] Entries are valid JSON
- [ ] Entries contain required fields
- [ ] Append-only (no read-modify-write)

## Safety Invariants

- [ ] Zero writes during discover/inspect/classify/plan
- [ ] Project-owned artifacts never modified
- [ ] Backup created before any mutation
- [ ] Complete rollback on any failure
- [ ] Journal entries sanitized
- [ ] No remote mutations (push/fetch/merge)
