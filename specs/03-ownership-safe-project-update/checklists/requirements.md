# Requirements Verification Checklist

## Functional Requirements

### FR1: Classification
- [ ] Every artifact gets exactly one ownership category
- [ ] Classification is deterministic
- [ ] Unknown patterns fall back to default
- [ ] External artifacts flagged for review

### FR2: Preservation
- [ ] Project-owned artifacts never overwritten
- [ ] Preservation works during apply
- [ ] Preservation works during rollback
- [ ] No code path can modify project-owned artifacts

### FR3: Blocking
- [ ] Divergent global artifact without policy is blocked
- [ ] Blocked plan is rejected before apply
- [ ] User receives clear error message
- [ ] Error includes guidance for resolution

### FR4: Backup
- [ ] Point-in-time snapshot created before mutation
- [ ] Manifest includes all artifact checksums
- [ ] Backup storage is independent of target
- [ ] Backup is restorable

### FR5: Rollback
- [ ] Any failure triggers complete rollback
- [ ] Rollback restores exact pre-state
- [ ] Rollback marks run appropriately
- [ ] Rollback is idempotent (safe to retry)

### FR6: Approval
- [ ] Apply requires explicit approval
- [ ] Approval is by plan ID
- [ ] No auto-apply without approval
- [ ] Approval is logged

### FR7: Audit
- [ ] Every operation recorded in journal
- [ ] Journal entries are append-only
- [ ] Journal entries are sanitized
- [ ] Journal entries include timestamps

### FR8: Idempotency
- [ ] Apply same plan twice → same result
- [ ] Apply after rollback → clean apply
- [ ] No duplicate artifacts
- [ ] No inconsistent state

### FR9: Filtering
- [ ] Generated-runtime artifacts skipped by default
- [ ] Migration ID enables processing
- [ ] Clear error when migration ID missing

### FR10: Migrations
- [ ] Catalog stores approved migrations
- [ ] Migration includes rollback ID
- [ ] Migration can be replayed

## Non-Functional Requirements

### NFR1: Atomicity
- [ ] All-or-nothing apply
- [ ] No partial state on failure
- [ ] Consistent journal entry

### NFR2: Rollback Performance
- [ ] Rollback completes within 2x apply time
- [ ] Rollback does not require network
- [ ] Rollback is deterministic

### NFR3: Backup Performance
- [ ] Backup overhead < 5 seconds typical
- [ ] Backup does not block operations
- [ ] Backup can be parallelized

### NFR4: Plan Read-Only
- [ ] Zero writes during planning
- [ ] Zero writes during classification
- [ ] Plan is purely declarative

### NFR5: Sanitization
- [ ] No secrets in journal
- [ ] No absolute paths in journal
- [ ] No file contents in journal
- [ ] No credentials in journal
