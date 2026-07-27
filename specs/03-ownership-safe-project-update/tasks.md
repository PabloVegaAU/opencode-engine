# Tasks: v0.6.0 Ownership & Safe Project Update Engine

## Phase 1: Schema Contracts

- [ ] **T-001** Create `contracts/ownership-policy.schema.json`
  - Path pattern matching rules
  - Category enum: global-managed, project-owned, global-managed-local-override, generated-runtime, external

- [ ] **T-002** Create `contracts/migration-catalog.schema.json`
  - migration_id, description, source/target versions
  - Artifact patterns, preconditions, rollback_id

- [ ] **T-003** Create `contracts/update-plan.schema.json`
  - Plan ID, timestamps, versions
  - Classification map
  - Operations list with types

- [ ] **T-004** Create `contracts/update-run.schema.json`
  - Run ID linked to plan
  - Status tracking (in_progress, completed, rolled_back, failed)
  - Per-operation status

- [ ] **T-005** Create `contracts/backup-manifest.schema.json`
  - Backup ID, timestamp, plan reference
  - Artifact list with sha256, size, mtime
  - Storage path

- [ ] **T-006** Create `contracts/rollback-plan.schema.json`
  - Rollback ID, triggered by run ID
  - Operations list (restore, remove)
  - Backup references

## Phase 2: Core Modules

- [ ] **T-007** Implement `OwnershipClassifier` in `bin/updates/ownership-classifier.mjs`
  - Scan adopted environment
  - Apply policy rules
  - Produce classification map

- [ ] **T-008** Implement `UpdatePlanner` in `bin/updates/update-planner.mjs`
  - Generate update plan from classification
  - Identify blocked artifacts
  - Require migration IDs where needed

- [ ] **T-009** Implement `BackupManager` in `bin/updates/backup-manager.mjs`
  - Create point-in-time snapshots
  - Produce backup manifest
  - Store compressed artifacts

- [ ] **T-010** Implement `ApplyExecutor` in `bin/updates/apply-executor.mjs`
  - Execute plan operations atomically
  - Track progress in update-run
  - Detect and report failures

- [ ] **T-011** Implement `RollbackController` in `bin/updates/rollback-controller.mjs`
  - Detect apply failure
  - Execute complete rollback
  - Verify restoration

- [ ] **T-012** Implement `JournalWriter` in `bin/updates/journal-writer.mjs`
  - Append sanitized audit records
  - No secrets, no absolute paths
  - Structured JSON output

## Phase 3: CLI Integration

- [ ] **T-013** Create `commands/update-apply.md`
  - Agent: build
  - Invoke apply-executor with approved plan

- [ ] **T-014** Create `commands/update-rollback.md`
  - Agent: build
  - Invoke rollback-controller with run ID

- [ ] **T-015** Create `commands/ownership-inspect.md`
  - Agent: build
  - Run classifier and display classification map

- [ ] **T-016** Update `commands/update-ai-env.md`
  - Add `apply` mode after plan approval
  - Add `rollback` mode with run ID

## Phase 4: Testing

- [ ] **T-017** Write unit tests for OwnershipClassifier
  - Known path patterns → correct category
  - Unknown patterns → default category

- [ ] **T-018** Write unit tests for UpdatePlanner
  - Classification map + catalog → valid plan
  - Blocked artifacts flagged correctly

- [ ] **T-019** Write unit tests for BackupManager
  - Snapshot creation
  - Manifest validity

- [ ] **T-020** Write integration test for rollback
  - Simulated failure mid-apply
  - Complete restoration verification

- [ ] **T-021** Write idempotency test
  - Same plan applied twice
  - Same final state

## Phase 5: Documentation

- [ ] **T-022** Update `docs/AI_ENVIRONMENT_EVOLUTION.ARCHIVED.md`
  - Mark v0.6.0 capability as implemented

- [ ] **T-023** Create `docs/OWNERSHIP_UPDATE_ENGINE_V1.md`
  - Architecture overview
  - Ownership classification model
  - Update pipeline phases

- [ ] **T-024** Update `AGENTS.md`
  - Add v0.6.0 capabilities to skill allowlist
  - Document ownership classification behavior

## Phase 6: Validation

- [ ] **T-025** Run full test suite
- [ ] **T-026** Verify schema validation passes
- [ ] **T-027** Manual sandbox test with mixed ownership
- [ ] **T-028** Audit journal output for sanitization compliance
