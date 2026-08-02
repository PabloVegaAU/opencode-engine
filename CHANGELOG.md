# Changelog

## [Unreleased]

### Cross-Session CLI Fixes

- **Fix `isValidOpId` regex:** Changed `{1,62}` → `{0,62}` so 1-char IDs like `a` pass validation
- **Add `--mission` alias:** CLI `parseArgs` now maps `--mission` → `--operation-id`
- **Add `-Mission` parameter:** Wrapper accepts `-Mission` as alias for `-OperationId`
- **Fix silent output:** Wrapper now prints JSON response on success (was previously swallowed)
- **Add `cross-session.bat`:** Batch launcher that translates Unix-style `--flag value` to PowerShell `-Flag value`, enabling familiar CLI syntax
- **Add `mission-loop` subcommand:** Runs `mission-run` repeatedly until all tasks complete or limits reached. Supports `--max-iterations`, `--poll-interval`, `--timeout`
- **Tests:** All 6 unit tests pass (`node --test tests/cross-session-cli.test.mjs`)

### Documentation Updates

- **Updated:** `commands/cross-session.md` — added three entry points, usage examples, file locations
- **Updated:** `AGENTS.md` — Public Cross-Session Commands section reflects new distribution model
- **Updated:** `docs/ORCHESTRATION.md` — entry points table, file locations, updated paths
- **Updated:** `docs/TECHNOLOGY_INVENTORY.md` — scripts count 16→17, cross-session.bat documented, entry points clarified
- **Updated:** `PROGRESS.md` — post-v0.6.0 bug fixes section added

## [0.6.0] - 2026-07-27

### Ownership Engine Phase 1 (COMPLETED)

This release implements the Ownership Engine for safe, atomic, auditable updates of adopted AI environments.

**Implemented:**
- Ownership classification for every artifact (global-managed, project-owned, global-managed-local-override, generated-runtime, external)
- Deterministic update planning with explicit user approval gate
- Atomic apply with full rollback on intermediate failure
- Backup before any mutation
- Recovery journal for audit and replay
- Migration catalog for tracked schema/artifact migrations

**Schemas:** ownership-policy, migration-catalog, update-plan, update-run, backup-manifest, rollback-plan
**Core:** OwnershipClassifier, UpdatePlanner, BackupManager, ApplyExecutor, RollbackController, JournalWriter
**CLI:** ownership-inspect, update-apply, update-rollback commands

**This release does NOT implement:**
- AI-driven conflict resolution (future phase)
- Three-way merge (future phase)

## [0.5.1] - 2026-07-27

### Stabilization & Release Governance

This release focuses on stabilization, governance, provenance, recovery, security, performance, and documentation improvements.

**This release does NOT implement:**
- Ownership Engine
- Three-way merge
- Capability routing
- OpenCode V2
- Any v0.6.0 features

### Changes
- Updated VERSION and package.json to 0.5.1
- Added distribution manifest for source→runtime distribution
- Updated lifecycle scripts (install, update, doctor, certify)
- Improved .gitignore
- All v0.5.1 gates pass (doctor: 0 issues, certify: phases 1-7 pass)

## [0.5.0] - 2026-07-26

### Phase 7 — Real-Pilot Gates (COMPLETED)

All gates PASS against real Quipusoft content. Deterministic query discovery produced 3 unique real queries (LoginRequest exact, class Constants symbol, Agent Orchestrator knowledge) each repeated twice. Pilot achieves 50% reduction in calls, chars, and tokens.

Gate results: `manifest_valid:true`, `policy_valid:true`, `batch_logical_calls_le_3:true (3 calls)`, `call_reduction_ge_50:true (50%)`, `char_reduction_ge_40:true (50.01%)`, `token_reduction_ge_40:true (50%)`, `fallback_provided:true (count=1, providers=[ripgrep,git_grep])`, `disclosure_focused_reads:true`, `baseline_metrics_envelope_valid:true`, `batch_metrics_envelope_valid:true`.

### Phase 0–6 — Contracts, Adapters, Engine, Router, Wrapper, Doctor, Certify (COMPLETED)

- 7 execution contracts (plan-base, execution-plan, execution-result, execution-trace, execution-metrics, reason-codes, repository-state) with AJV validation
- 3 first-party adapters (ripgrep, git_grep, filesystem) with deny-globs, path restriction, envelope contract
- Execution engine with preflight checks, call budgets, equivalence cache, progressive disclosure, fallback chain, normalized deduplication
- Router opt-in (plan-only default; execute and batch via `-Execute` or `-BatchInput`)
- Batch execution with per-plan routing, shared cache, deterministic ordering
- In-process equivalence cache (disabled on dirty worktree)
- Provider fallback chain (ripgrep → git_grep for exact strategy)
- Progressive disclosure with focused reads within batch context
- Session-level metrics envelope validated by canonical AJV
- PowerShell wrapper with secure `ArgumentList`, restricted `Resolve-Path`
- Doctor (21 checks, tier OPTIMAL, `retrieval_execution_ready`)
- Certify (8 v0.5.0 gates, sandbox-clean)
- Zero-write guarantee: pre/post byte-identical snapshots across all repositories
- Architecture intent produces plan-only response (0 adapter processes)

### Phase 6 State (completed)

- Status: `V0.5.0_PHASE6_CERTIFY_READY_FOR_REAL_PILOT`
- Scope: Phase 1 adapters + Phase 2 engine + Phase 3 router wiring + Phase 4 wrapper + Phase 5 doctor + Phase 6 certify hardened. Real piloto and release NOT implemented.
- Release target: 0.5.0 (release-candidate wave begins after all phases complete).
- Phase 6 approval: explicit user approval received for Phase 0 + Phase 1 + Phase 2 + Phase 3 + Phase 4 + Phase 5 + Phase 6 execution.

Phase 6 gate results (real numbers):

- `pnpm install --frozen-lockfile` exit 0
- `pnpm run validate` exit 0
- `node scripts/generate-retrieval-validators.mjs --check` exit 0 (`VALIDATORS_OK`)
- `node --test tests/retrieval-doctor.test.mjs` 76/76 pass (23 suites, 0 fail)
- `pnpm test:unit` 375/375 pass (95 suites)
- `pnpm test:integration` 162/162 pass (49 suites)
- `pnpm test:all` 162/162 pass (49 suites)
- `pwsh -NoProfile -File scripts/doctor-opencode-global.ps1` 0 issues, tier OPTIMAL, `retrieval_execution_ready: True`
- `pwsh -NoProfile -File scripts/certify-opencode-global.ps1` 8 v0.5.0 gates pass, CERTIFICATION PASSED, sandbox deleted by `finally`
- PowerShell parser on certify: 0 errors
- `git diff --check`: 0 errors
- Residual `opencode-certify-*` and `opencode-validator-check-*` temp dirs: 0
- `VERSION` and `package.json` version: unchanged at 0.4.0

Files modified by this prompt:

- `scripts/certify-opencode-global.ps1` (8 v0.5.0 gates, LF line endings)
- `scripts/doctor-opencode-global.ps1` (`retrieval_execution_ready` now explicitly requires `$batchPath`)
- `scripts/generate-retrieval-validators.mjs` (`--check` uses `process.exitCode`, not `process.exit()`)
- `bin/retrieval/retrieval-doctor.mjs` (`checkModuleEsmImport` uses `pathToFileURL` absolute URL, `checkModuleImportsWithoutExecution` runs real ESM import)
- `tests/retrieval-doctor.test.mjs` (added 23 deterministic scenarios covering sandbox injection, OPENCODE_CONFIG_DIR precedence, OPENCODE_RETRIEVAL_MODE rejection, zero-writes via strict path+size+SHA-256 comparison; 76/76 pass)
- `PROGRESS.md` (Phase 6 acceptance marked COMPLETED with real gate results)
- `CHANGELOG.md` (this entry)

### Phase 5 State (completed)

- Status: `V0.5.0_PHASE5_DOCTOR_READY_FOR_CERTIFY`
- Scope: Phase 1 adapters + Phase 2 engine + Phase 3 router wiring + Phase 4 wrapper + Phase 5 doctor implemented. Certify, piloto, and release NOT implemented.
- Release target: 0.5.0 (release-candidate wave begins after all phases complete).
- Phase 5 approval: explicit user approval received for Phase 0 + Phase 1 + Phase 2 + Phase 3 + Phase 4 + Phase 5 execution.

### Phase 4 State (completed)

- Status: `V0.5.0_PHASE4_WRAPPER_READY_FOR_DOCTOR`
- Scope: Phase 1 adapters + Phase 2 engine + Phase 3 router wiring + Phase 4 wrapper implemented. Doctor, certify, piloto, and release NOT implemented.
- Release target: 0.5.0 (release-candidate wave begins after all phases complete).
- Phase 4 approval: explicit user approval received for Phase 0 + Phase 1 + Phase 2 + Phase 3 + Phase 4 execution.

### Phase 3 State (completed)

- Status: `V0.5.0_PHASE3_ROUTER_WIRING_READY_FOR_WRAPPER`
- Scope: Phase 1 adapters + Phase 2 engine + Phase 3 router wiring implemented. Wrapper, doctor, certify, piloto, and release NOT implemented.
- Release target: 0.5.0 (release-candidate wave begins after all phases complete).
- Phase 3 approval: explicit user approval received for Phase 0 + Phase 1 + Phase 2 + Phase 3 execution.

### Phase 2 State (completed)

- Status: `V0.5.0_PHASE2_ENGINE_CORRECTED_VERIFIED_READY_FOR_ROUTER_WIRING`
- Scope: Phase 1 adapters + Phase 2 engine implemented and corrected. Router wiring, wrapper, doctor, certify, piloto, and release NOT implemented.
- Release target: 0.5.0 (release-candidate wave begins after all phases complete).
- Phase 2 approval: explicit user approval received for Phase 0 + Phase 1 + Phase 2 execution.

### Phase 1 State (completed)

- Status: `V0.5.0_PHASE1_ADAPTERS_READY_FOR_ENGINE`
- Scope: Phase 1 adapters implemented. Engine, batch, router wiring, wrapper, doctor, certify, piloto, and release NOT implemented.
- Phase 1 approval: explicit user approval received for Phase 0 + Phase 1 execution.

### Planning State (pre-Phase 1)

- Status: `V0.5.0_RETRIEVAL_EXECUTION_FINAL_PLANNING_APPROVAL_READY`
- Scope: spec + contracts + ownership + tests + benchmark. No implementation, no VERSION bump, no commit/push.
- Release target: 0.5.0 (release-candidate wave begins after implementation phase).
- See `docs/V0.5.0_PLANNING_CORRECTION_REPORT.md` for the FINAL CONTRACT CLOSURE section.

### Final contract closure (this pass)

#### Contracts are now strict

- `retrieval-execution-plan.schema.json` is a **strict** v0.5.0 contract:
  - Required: `schema_version`, `mode` (const `"execute"`), `execution`,
    `adapter_signature`.
  - `execution` requires `estimated_calls`, `budget_enforcement`,
    `progressive_disclosure`, `preflight`, `repositories_searched`.
  - `additionalProperties: false`.
- `retrieval-plan-base.schema.json` is the **separate** v0.4.0 contract.
  v0.4.0 plan output validates against this only. v0.4.0 plans do NOT
  validate against the strict execution-plan.
- The result's `plan` field is a `$ref` to the strict execution-plan.
- The `repository-state` contract carries `scope_fingerprint` (composite),
  NOT `adapter_signature`. The `adapter_signature` is computed in the
  execution-plan as `sha256(scope_fingerprint + strategy + provider + normalized_query)`.
- Each repository entry **requires** `fingerprint` (per-repo, sha256 of
  `commit + branch + dirty_worktree + index_status`).
- `repository_id`s must be unique and ordered ascending (runtime invariant).
- `path` is POSIX-relative (no leading `/`, no `\\`, no `..`).

#### Logical vs process invocations

The hard cap of 3 applies to **logical** adapter calls, not to
internal processes. A single logical call over the multi-repo scope
spawns one process per repo. The contracts use:

- `logical_adapter_calls` (renamed from `call_count`).
- `provider_process_invocations` (new total).
- `focused_read_calls` (new, for progressive disclosure expansions).
- `focused_read_chars` (new).
- `fallback_count` (renamed from `fallback_count` interpretation).

Invariants:
- `logical_adapter_calls <= call_budget` (max 3).
- `fallback_count <= logical_adapter_calls`.
- `provider_process_invocations >= logical_adapter_calls`.

The old `call_count + fallback_count` sum rule is removed.

#### Reason codes (extended)

The frozen catalogue now includes:
- `CACHE_DISABLED_DIRTY_WORKTREE` — emitted when any repo is dirty.
- `FOCUSED_READ_INVOKED`, `PROGRESSIVE_DISCLOSURE_EXPANDED`.
- `BATCH_EXECUTED`, `BATCH_ENTRY_DECLINED`.
- `TRACE_PATH_REJECTED`, `METRICS_PATH_REJECTED`.
- `CROSS_PROCESS_CACHE_HIT_DISALLOWED`.
- `READ_OUTSIDE_PROJECT`, `INVALID_PATH`, `NO_PROJECT_MANIFEST`.
- `TOKEN_ESTIMATOR_VERSION`, `ESTIMATED_TOKENS_EMITTED`.

#### executeBatch + batch entry

A new `executeBatch(plans, options)` runs multiple queries in one
process so the in-process equivalence cache can dedupe. The CLI
surface is `-BatchInput <json>` or stdin JSON. No new public command
is introduced.

#### Statless progressive disclosure

Progressive disclosure is stateless. The `preview_token` is the
continuation key. Expansion revalidates `scope_fingerprint`,
`allowed_root_check`, and `deny_glob_check`. Always counted as
`focused_read_calls` and `focused_read_chars`, never free.

#### Equivalence cache

The cache is disabled when any repository has `dirty_worktree=true`.
Independent wrapper invocations do NOT share the cache. Cache hits
are only counted within the same batch.

#### Trace / metrics path restriction

`-TracePath`, `-WriteTrace`, `-WriteMetrics` must be validated via
`Resolve-Path` against the global runtime's `retrieval/` directory
(`TRUSTED_TRACE_DIR`). Paths inside the project are rejected.

#### Token estimator

The deterministic token estimator is versioned. The result and
metrics contracts require `token_estimator_version`. The same version
is used for baseline and result.

#### Exact fallback (default)

By default, execute mode reserves 1 primary call + 1 fallback call
within the hard cap of 3. The user can override with
`--MaxFallbacks 0` to reduce to a single call. The project-owned
policy is not modified.

### Added (final contract artefacts)

- `docs/RETRIEVAL_EXECUTION.md` — full final spec.
- `docs/V0.5.0_PLANNING_CORRECTION_REPORT.md` — FINAL CONTRACT CLOSURE section.
- `contracts/retrieval-plan-base.schema.json` — v0.4.0 base (separate).
- `contracts/retrieval-execution-reason-codes.schema.json` — frozen catalogue.
- `contracts/retrieval-execution-plan.schema.json` — strict v0.5.0 plan.
- `contracts/repository-state.schema.json` — multi-repo with `scope_fingerprint`.
- `contracts/retrieval-execution-result.schema.json` — strict result.
- `contracts/retrieval-execution-trace.schema.json` — strict trace.
- `contracts/retrieval-execution-metrics.schema.json` — strict metrics.
- `tests/retrieval-execution-contracts.test.mjs` — 73 contract gates.
- `tests/fixtures/qs-sell/` — synthetic Sell-flow fixture.
- `tests/integration/benchmark-qs-sell.test.mjs` — contract/fixture test.

### Files NOT changed (still)

- `VERSION` — still `0.4.0`.
- `AGENTS.md` (source root).
- `bin/retrieval/retrieval-router.mjs`.
- `scripts/retrieval-router.ps1`.
- `global/retrieval/default-policy.json`.
- `templates/project-neutral/.ai-env/retrieval-policy.json`.
- `contracts/retrieval-policy.schema.json`.
- `contracts/retrieval-index-state.schema.json`.
- All v0.4.0 tests.
- `.ai-env/` in any adopted project.

### Acceptance

Phase 0 (final contract closure) is complete when the criteria in
`docs/RETRIEVAL_EXECUTION.md` §24 are met. Implementation begins only
after explicit approval.

## [0.4.0] - 2026-07-25

### Added
- **Retrieval Foundation v0.4.0** - Deterministic retrieval plan builder
- **Router:** `bin/retrieval/retrieval-router.mjs` - Plan-only retrieval routing
- **Five Intents:** exact, symbol, architecture, semantic, knowledge
- **Budgets:** per-strategy max_tool_calls (10-50) and max_chars (2400-24000)
- **Providers:** ripgrep (OPTIMAL), git-grep (FUNCTIONAL fallback), lsp, codebase-memory, filesystem
- **Policy Adoption:** Project-level retrieval policy via `init-opencode-project.ps1 -IncludeRetrievalPolicy`
- **Bootstrap Ledger:** `.opencode/bootstrap-manifest.json` tracks all managed artifacts
- **Index State Publisher:** `indexed_commit`, `index_generation`, `indexed_at` published
- **Retrieval Tiers:** OPTIMAL (ripgrep), FUNCTIONAL (git grep fallback), INCOMPLETE (no exact)
- **Setup Tools:** `scripts/setup-retrieval-tools.ps1` - Cross-platform ripgrep installer
- **Template Distribution:** Complete `templates/project-neutral/` deployed to runtime
- **Idempotent Adoption:** Already-adopted projects skip without overwriting
- **Project States:** PROJECT_NOT_ADOPTED, ADOPTED, MISSING_AFTER_ADOPTION, NOT_INDEXED, STALE_INDEX, FRESH
- **Runtime Autonomous:** Independent of source after installation

### Changed
- Project updater read-only (Doctor/Plan modes only, apply/rollback NOT_IMPLEMENTED)
- Bootstrap manifest location: `.opencode/bootstrap-manifest.json` (v0.4.0 canonical)
- Legacy support: `.bootstrap/project-manifest.json` still recognized as fallback
- Get-RetrievalPolicyState returns exact state values (no UNKNOWN in normal operation)

### Fixed
- Template `.ai-env/retrieval-policy.json` now distributed to runtime
- Init resolves templates from runtime `$OpenCodeConfigDir`, not source `$GlobalRoot`
- Idempotent `-IncludeRetrievalPolicy` on already-adopted projects (no overwrite)
- PS type conversion: `[hashtable]` → `[object[]]` for ArtifactsLedger parameter

### Security
- Zero writes from doctor/plan modes
- No source dependencies in installed runtime
- No absolute paths, credentials, or secrets in configuration

### Tests
- 106 unit tests PASS
- 147 integration tests PASS
- 253 total tests PASS

## [0.3.1] - 2026-07-24

### Added
- Initial release of opencode-global source repository
- Canonical directory structure: scripts/, tests/, commands/, templates/ at root level
- Four profiles: GO, CHATGPT-PLUS, MIX, MINIMAX-PLUS
- Routing matrix for per-role model assignment
- Lifecycle scripts: install, update, doctor, certify, init-project, launcher, cross-session wrapper
- Project initialization templates
- 12 contract schemas for validation
- 46 unit tests + 14 integration tests (60 total)
- GitHub Actions validation workflow
- Public commands: /init-ai-env, /doctor-ai-env, /update-ai-env

### Changed
- Restructured from nested `opencode-global/` container to flat canonical structure
- Renamed `chatgpt.md` to `chatgpt-plus.md`
- Removed alias `chatgpt` from launcher (only `chatgpt-plus` valid)
- Added `ajv-formats` dependency for schema validation
- Updated certify script to run validation, unit tests, and integration tests as gates

### Removed
- `opencode-global/` container directory (content moved to root)
- `commands/orchestrate.md` (redundant with cross-session.md)
- `commands/chatgpt.md` (replaced by chatgpt-plus.md)
- Legacy orchestration commands (init-orchestration, doctor-orchestration, update-orchestration)
- `scripts/switch-opencode-profile.ps1`
- `package-lock.json` (conflicts with pnpm-lock.yaml)

### Security
- No absolute paths in configuration
- No credentials or secrets in repository
- Security boundary enforcement
- Comprehensive .gitignore excludes registry.sqlite, sessions, logs, cache

### Fixed
- JSONC parser correctly handles URLs containing //
- Integration tests use correct GLOBAL_ROOT path resolution
- Profile routing tests use dynamic USERPROFILE path
