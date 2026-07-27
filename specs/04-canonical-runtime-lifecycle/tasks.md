# Tasks: Canonical Runtime Lifecycle

## Phase 1: Specification and inventory

- [x] T001 [US1] Define lifecycle requirements in specs/04-canonical-runtime-lifecycle/spec.md
- [x] T002 [P] [US1] Define canonical inventory in distribution/runtime-manifest.json
- [x] T003 [P] [US1] Define manifest contract in distribution/runtime-manifest.schema.json
- [x] T004 [US1] Implement inventory resolver in distribution/resolve-runtime-manifest.ps1

## Phase 2: Install and update

- [x] T005 [US1] Refactor installation around the canonical inventory in scripts/install-opencode-global.ps1
- [x] T006 [US2] Refactor update around the canonical inventory in scripts/update-opencode-global.ps1
- [x] T007 [US2] Add centralized managed backups in scripts/update-opencode-global.ps1
- [x] T008 [US2] Add SourceRoot validation and installed-updater fail-fast behavior in scripts/update-opencode-global.ps1
- [x] T009 [P] [US1] Exclude development-only scripts in distribution/runtime-manifest.json

## Phase 3: Bootstrap and launcher

- [x] T010 [US3] Correct neutral bootstrap boundaries in scripts/init-opencode-project.ps1
- [x] T011 [US3] Correct public initialization help in commands/init-ai-env.md
- [x] T012 [P] [US3] Correct doctor/update command help in commands/doctor-ai-env.md and commands/update-ai-env.md
- [x] T013 [US4] Validate allowed and conflicting modes in scripts/opencode-launcher.ps1
- [x] T014 [US4] Remove launcher runtime dependency on source node_modules in scripts/opencode-launcher.ps1
- [x] T015 [US4] Document official modes in global/protocols/AGENTS.global.md

## Phase 4: Reversible cleanup

- [x] T016 [US5] Implement dry-run-first quarantine in scripts/cleanup-runtime.ps1
- [x] T017 [US5] Protect user archives, credentials, state, dependencies, and optional runtime capabilities in scripts/cleanup-runtime.ps1
- [x] T018 [US5] Quarantine legacy repository contamination and adjacent backups in the real runtime (operator evidence recorded)

## Phase 5: Verification and documentation

- [x] T019 [P] [US1] Add manifest/install parity tests in tests/integration/sandbox-lifecycle.test.mjs
- [x] T020 [P] [US2] Add installed updater and centralized backup tests in tests/integration/sandbox-lifecycle.test.mjs
- [x] T021 [P] [US3] Add bootstrap option tests in tests/integration/sandbox-lifecycle.test.mjs
- [x] T022 [P] [US4] Add agent-mode regression tests in tests/integration/sandbox-lifecycle.test.mjs
- [x] T023 [P] [US5] Add cleanup protection and zero-write tests in tests/integration/sandbox-lifecycle.test.mjs
- [x] T024 [US1] Update lifecycle architecture in docs/ARCHITECTURE.md and docs/INSTALLATION.md
- [x] T025 [US1] Run full source validation and automated tests
- [x] T026 [US2] Synchronize and verify the installed runtime (operator evidence recorded)
- [x] T027 [US4] Validate launcher dry-run against representative project (operator evidence recorded)
- [x] T028 [US2] Run global doctor against representative project (operator evidence recorded)
- [x] T029 [US2] Run final global certification after all source changes are synchronized (operator evidence recorded)
- [x] T030 [US1] Review final Git diff against concurrent-session commits and prepare a commit boundary
- [x] T031 [US1] Add source-root, preflight, manifest-schema, backup-atomicity, cleanup-protection, and launcher parser regression coverage
- [x] T032 [US2] Capture installed-runtime/certification evidence using specs/04-canonical-runtime-lifecycle/evidence-template.md
- [x] T033 [US4] Capture representative-project dry-run/doctor evidence without proprietary content
- [x] T034 [US1] Add public command-contract behavioral tests for update-ai-env and cross-session forwarding

## Dependencies

- T002-T004 block T005-T009.
- T005-T009 block installed-runtime verification.
- T010-T017 can proceed after ownership boundaries are agreed.
- T019-T023 gate T025-T029.
- T029 and T030 are final release gates.

## MVP

Tasks T001-T015 and T019-T022 provide the minimum safe install/update/bootstrap/launcher lifecycle. Cleanup and final certification complete operational migration.
