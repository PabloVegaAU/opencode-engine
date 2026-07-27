# Feature Specification: Canonical Runtime Lifecycle

**Feature Branch**: `04-canonical-runtime-lifecycle`  
**Created**: 2026-07-27  
**Status**: Implemented and certified against the attributed working-tree snapshot  
**Input**: Make the official source repository the single source of truth for installation, update, project initialization, launcher validation, and safe runtime cleanup.

## User Scenarios & Testing

### User Story 1 - Reproducible runtime installation (Priority: P1)

As an OpenCode user, I can install the global runtime from the official source repository and receive the same complete set of managed artifacts on every machine.

**Independent Test**: Install into an empty sandbox and compare every installed path with the canonical distribution inventory.

**Acceptance Scenarios**:

1. **Given** an empty runtime directory, **When** installation runs, **Then** all managed configuration, contracts, retrieval adapters, templates, commands, scripts, and distribution metadata are installed.
2. **Given** an existing runtime, **When** installation runs without force, **Then** existing files remain unchanged.
3. **Given** a dry run, **When** installation evaluates the inventory, **Then** it writes no files or directories.

---

### User Story 2 - Safe and deterministic updates (Priority: P1)

As an OpenCode user, I can update managed runtime files from an explicit official source without losing prior content or modifying local runtime state.

**Independent Test**: Modify a managed sandbox file, update from source, and verify both the canonical replacement and centralized backup.

**Acceptance Scenarios**:

1. **Given** a modified managed file, **When** update runs, **Then** the previous content is backed up centrally before replacement.
2. **Given** an installed updater without access to source, **When** it runs, **Then** it fails before writing and explains how to provide the source root.
3. **Given** a valid source root, **When** the installed updater runs in dry-run mode, **Then** it reports zero source errors and performs zero writes.

---

### User Story 3 - Correct project bootstrap boundaries (Priority: P1)

As a project owner, I can initialize neutral AI-environment artifacts without global tooling creating custom agents or project topology.

**Independent Test**: Initialize an empty sandbox project with different option combinations and inspect created paths.

**Acceptance Scenarios**:

1. **Given** a project, **When** default initialization runs, **Then** it creates only the minimal project configuration.
2. **Given** bootstrap-manifest inclusion, **When** initialization runs, **Then** it creates `.opencode/bootstrap-manifest.json`.
3. **Given** no explicit manifest option, **When** initialization runs, **Then** no bootstrap manifest is created.
4. **Given** project initialization, **When** it completes, **Then** it does not create `AGENTS.md` or custom agent files and directs the user to `/init`.

---

### User Story 4 - Early agent-mode validation (Priority: P1)

As a project owner, I receive a clear launcher error for invalid or conflicting agent modes before OpenCode startup.

**Independent Test**: Run launcher dry-run against projects containing valid, invalid, and conflicting agent modes.

**Acceptance Scenarios**:

1. **Given** modes `primary`, `subagent`, or `all`, **When** launcher discovery runs, **Then** validation succeeds.
2. **Given** mode `orchestrator`, **When** launcher discovery runs, **Then** it fails with the agent name, source, and valid values.
3. **Given** conflicting declarations, **When** launcher discovery runs, **Then** it fails before launch.

---

### User Story 5 - Reversible runtime cleanup (Priority: P2)

As an OpenCode user, I can remove known repository contamination and old adjacent backups from the active runtime without permanently deleting data or touching protected state.

**Independent Test**: Run cleanup against a contaminated sandbox and verify dry-run immutability, quarantine behavior, and protected paths.

**Acceptance Scenarios**:

1. **Given** no explicit apply flag, **When** cleanup runs, **Then** it only reports candidates.
2. **Given** explicit cleanup, **When** known legacy items exist, **Then** they move to one timestamped quarantine.
3. **Given** credentials, sessions, caches, node modules, runtime capabilities, or user archives, **When** cleanup runs, **Then** those paths remain untouched.

## Edge Cases

- Source and target paths are identical.
- Runtime scripts are invoked from the installed runtime rather than the source repository.
- JSONC contains URLs, comment-like text inside strings, escaped quotes, comments, and trailing commas.
- Agent declarations appear in both project config and Markdown files.
- Cleanup encounters nested backups inside protected archives.
- Concurrent sessions modify the source repository while validation is running.

## Requirements

### Functional Requirements

- **FR-001**: A single machine-readable inventory MUST define every managed source-to-runtime mapping.
- **FR-002**: Installation and update MUST consume the same inventory.
- **FR-003**: Development-only scripts MUST NOT be installed into runtime.
- **FR-004**: Updates MUST back up changed managed files before replacement.
- **FR-005**: Runtime updates MUST require an explicit valid source when source layout is unavailable.
- **FR-006**: Dry-run operations MUST perform zero writes.
- **FR-007**: Project initialization MUST NOT create `AGENTS.md` or custom agents.
- **FR-008**: Bootstrap manifest creation MUST be explicit and use `.opencode/bootstrap-manifest.json`.
- **FR-009**: Launcher validation MUST accept only `primary`, `subagent`, and `all`.
- **FR-010**: Cleanup MUST quarantine known legacy items and preserve unknown/protected state.
- **FR-011**: Public command help MUST match actual parameters, outputs, and ownership boundaries.
- **FR-012**: Source, sandbox, installed-runtime, and representative-project flows MUST be covered by automated or read-only acceptance tests.

## Success Criteria

- **SC-001**: The full automated test suite completes with zero failures.
- **SC-002**: A clean sandbox install contains 100% of inventory entries and no development-only scripts.
- **SC-003**: Source and installed updater dry runs report zero missing-source errors when configured correctly.
- **SC-004**: Invalid agent mode is rejected before OpenCode launch in every tested configuration source.
- **SC-005**: Cleanup dry-run changes zero files, and applied cleanup leaves all candidates recoverable from quarantine.
- **SC-006**: Doctor reports zero issues and zero warnings for the representative Quipusoft project.

## Assumptions

- The official source repository is locally available for global updates.
- `/init` remains the official OpenCode command for creating or improving project `AGENTS.md`.
- Runtime credentials, sessions, caches, and separately installed orchestration/environment capabilities are outside this feature's ownership.

## Traceability Matrix

| Requirement / success criterion | Tasks | Automated test or required evidence |
|---|---|---|
| FR-001, FR-002, FR-003; SC-002 | T002-T006, T009, T019, T031 | `sandbox-lifecycle.test.mjs` manifest, schema, inventory, and sandbox install tests |
| SC-001 | T025, T029 | Full source test validation; final certification evidence remains required |
| FR-004, FR-005, FR-006; SC-003 | T006-T008, T020, T031 | update backup, SourceRoot, preflight, and DryRun tests |
| FR-007, FR-008 | T010-T012, T021 | init sandbox tests and command documentation tests |
| FR-011 | T011-T012, T034 | explicit update-command and cross-session wrapper contract tests |
| FR-009; SC-004 | T013-T015, T022, T031 | launcher JSON/Markdown valid, invalid, conflict, and JSONC parsing tests |
| FR-010; SC-005 | T016-T017, T023, T031 | cleanup dry-run, applied quarantine, and protected-state tests |
| FR-012; SC-006 | T025-T030, T032-T033 | source CI tests; installed-runtime and representative-project evidence templates below |

### Representative-project evidence expectations

No proprietary project content is stored in this specification. After operator approval, record only command, timestamp, exit code, sanitized summary, and artifact paths for:

1. Installed updater dry run with an explicit source root.
2. Launcher dry run against the representative project.
3. Global doctor and final certification.

T029 is final certification, T030 is the final Git-diff/concurrent-work review, T032 records installed-runtime/certification evidence, and T033 records representative-project evidence. Their completed evidence is recorded in `evidence-2026-07-27.md` and attributed by base commit plus content fingerprints.
