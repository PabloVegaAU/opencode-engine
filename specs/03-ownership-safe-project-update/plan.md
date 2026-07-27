# Plan: v0.6.0 Ownership & Safe Project Update Engine

## Strategy

Build the update engine in three iterations:

1. **Iteration A (Foundation)**: Schemas + Classifier + Planner
   - Stable contracts first
   - Read-only planning to validate classification logic
   - No mutations yet

2. **Iteration B (Apply)**: Backup + Apply + Journal
   - Atomic mutation with rollback
   - Audit trail
   - Fail-safe by design

3. **Iteration C (Integration)**: CLI + Commands + Docs
   - Human-in-the-loop gates
   - End-to-end workflow
   - Documentation

## Iteration A: Foundation (Schemas + Classifier + Planner)

### Week 1: Schema Contracts

| Day | Work |
|-----|------|
| 1 | Design `ownership-policy.schema.json` with path glob patterns |
| 2 | Design `migration-catalog.schema.json` with rollback support |
| 3 | Design `update-plan.schema.json` with operation types |
| 4 | Design `update-run.schema.json` with status tracking |
| 5 | Design `backup-manifest.schema.json` and `rollback-plan.schema.json` |
| 6 | Review and finalize all schemas |
| 7 | Write validators for each schema |

### Week 2: Core Logic (Read-Only)

| Day | Work |
|-----|------|
| 1 | Implement `OwnershipClassifier` - path scanning |
| 2 | Implement `OwnershipClassifier` - policy rule application |
| 3 | Implement `UpdatePlanner` - plan generation |
| 4 | Implement `UpdatePlanner` - blocked artifact detection |
| 5 | Unit tests for classifier |
| 6 | Unit tests for planner |
| 7 | Integration test - classification + planning |

### Iteration A Verification
- [ ] All schemas validate correctly
- [ ] Classifier produces correct categories for known patterns
- [ ] Classifier falls back to default for unknown patterns
- [ ] Planner produces valid update plan
- [ ] Planner correctly identifies blocked artifacts
- [ ] Zero writes during classification and planning

## Iteration B: Apply (Backup + Apply + Rollback)

### Week 3: Backup + Apply

| Day | Work |
|-----|------|
| 1 | Implement `BackupManager` - snapshot creation |
| 2 | Implement `BackupManager` - manifest generation |
| 3 | Implement `ApplyExecutor` - atomic file operations |
| 4 | Implement `ApplyExecutor` - operation tracking |
| 5 | Unit tests for backup manager |
| 6 | Unit tests for apply executor |
| 7 | Integration test - apply with successful completion |

### Week 4: Rollback + Journal

| Day | Work |
|-----|------|
| 1 | Implement `RollbackController` - failure detection |
| 2 | Implement `RollbackController` - restoration logic |
| 3 | Implement `JournalWriter` - sanitized audit entries |
| 4 | Unit tests for rollback controller |
| 5 | Integration test - apply with simulated failure |
| 6 | Integration test - complete rollback verification |
| 7 | Integration test - journal sanitization check |

### Iteration B Verification
- [ ] Backup creates valid manifest with correct checksums
- [ ] Apply executes all operations atomically
- [ ] Failed apply triggers complete rollback
- [ ] Rollback restores exact pre-state
- [ ] Journal entries contain no secrets, no absolute paths
- [ ] Idempotency: re-running plan produces same state

## Iteration C: Integration (CLI + Commands + Docs)

### Week 5: CLI + Commands

| Day | Work |
|-----|------|
| 1 | Create `commands/update-apply.md` with approval gate |
| 2 | Create `commands/update-rollback.md` |
| 3 | Create `commands/ownership-inspect.md` |
| 4 | Update `commands/update-ai-env.md` with apply/rollback modes |
| 5 | Update `commands/doctor-ai-env.md` to include ownership health |
| 6 | Manual testing of command surface |
| 7 | Fix any command invocation issues |

### Week 6: Documentation

| Day | Work |
|-----|------|
| 1 | Create `docs/OWNERSHIP_UPDATE_ENGINE_V1.md` |
| 2 | Update `docs/AI_ENVIRONMENT_EVOLUTION.ARCHIVED.md` |
| 3 | Update `AGENTS.md` with v0.6.0 capabilities |
| 4 | Create worked example in `docs/` |
| 5 | Review all documentation for consistency |
| 6 | Run full test suite |
| 7 | Final validation and sign-off |

### Iteration C Verification
- [ ] All commands use correct agent and script invocations
- [ ] Apply requires explicit approval before mutation
- [ ] Rollback accepts run ID and completes successfully
- [ ] Documentation matches implementation
- [ ] Full test suite passes
- [ ] git diff --check passes

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Incorrect ownership classification | Extensive unit tests with known path patterns |
| Incomplete rollback | Integration tests with simulated failures |
| Secret leakage in journal | Mandatory sanitization verification tests |
| Blocking valid updates | Clear error messages with migration ID guidance |
| Schema evolution | Versioned schemas with migration paths |

## Dependencies

- OpenCode 1.18.3+ (per GLOBAL_RELEASE_DESCRIPTOR compatibility)
- Node.js ESM runtime
- PowerShell 7.6+ for Windows scripts
- SQLite via registry.sqlite for journal storage
- No external services required

## Success Metrics

| Metric | Target |
|--------|--------|
| Classification accuracy | 100% for known patterns |
| Rollback completeness | 100% restoration on failure |
| Zero secret leakage | Journal sanitization test 100% pass |
| Zero data loss | Project-owned artifacts never modified |
| Documentation coverage | All public APIs documented |
