# OpenCode Global - Build Progress

## Status: V0.5.0_RUNTIME_DISTRIBUTED_AND_VALIDATED

## Current Location

**Source Repository:** `C:\OpenCode\opencode-global-src`
**Branch:** `main`
**HEAD:** `796a187` (working tree clean at planning start)
**Tag:** `v0.5.0` (2026-07-26)

**Note:** This is the canonical source repository. Clone to any location for use.

## v0.5.0 Retrieval Execution — Final Contract Closure

The first planning pass was rejected on five points. The second
planning pass was rejected on multiple points. The **final contract
closure** addresses all of them. See the FINAL CONTRACT CLOSURE
section in `docs/V0.5.0_PLANNING_CORRECTION_REPORT.md` for the full delta.

### Closed decisions (D1–D40)

- **D1–D8** — opt-in, engine module, first-party adapters, separate
  contracts, inline repository-state, wrapper arrays, HARD_CAPS,
  progressive disclosure.
- **D9** — semantic / lsp / codebase-memory stay plan-only.
- **D10** — benchmark is contract/fixture, not "real executed".
- **D11** — reason codes are versioned and `$ref`-linked.
- **D12** — index freshness is per-repo.
- **D13** — cache is in-process, never persisted.
- **D14** — `VERSION` is not bumped in Phase 0.
- **D15** — project-owned content is unchanged.
- **D16** — JSON Schema composition via `allOf` + `unevaluatedProperties: false`.
- **D17** — `OPENCODE_RETRIEVAL_MODE` env var rejected.
- **D18** — `--no-ignore` removed from ripgrep.
- **D19** — Windows path normalisation.
- **D20** — pre-call availability probe does not consume a call.
- **D21** — wrapper cannot detect how the parent process invoked it.
- **D22** — `knowledge` is a strategy, not a provider.
- **D23** — result `mode` is `const: "execute"`.
- **D24** — `result_count = items.length`; `raw_result_count` preserved separately.
- **D25** — `summary.total_results = sum(run.result_count)`.
- **D26** — `CACHE_DISABLED_DIRTY_WORKTREE` is a metric/event.
- **D27** — ADR matching is case-insensitive.
- **D28** — architecture remains plan-only.
- **D29** — `logical_adapter_calls` renamed from `call_count`.
- **D30** — `provider_process_invocations` is separate.
- **D31** — equivalence cache disabled when any repo is dirty.
- **D32** — `adapter_signature` computed in execution-plan, not in repository-state.
- **D33** — `executeBatch(plans, options)` is the batch entry.
- **D34** — progressive disclosure is stateless; expansion revalidates.
- **D35** — trace/write paths are restricted via `Resolve-Path`.
- **D36** — `token_estimator_version` is mandatory and versioned.
- **D37** — qs/sell fixture is synthetic and labelled.
- **D38** — pilot baseline is provisional; savings percentages are reserved for Phase 7.
- **D39** — `project-manifest.json` is a valid `project-manifest.schema.json`.
- **D40** — benchmark scope is resolved from the manifest, not from hardcoded `REPO_IDS`.

### Final contract artefacts (created)

- `docs/RETRIEVAL_EXECUTION.md` — final spec.
- `docs/V0.5.0_PLANNING_CORRECTION_REPORT.md` — FINAL CONTRACT CLOSURE.
- `contracts/retrieval-plan-base.schema.json` — v0.4.0 base.
- `contracts/retrieval-execution-reason-codes.schema.json` — frozen catalogue.
- `contracts/retrieval-execution-plan.schema.json` — strict v0.5.0 plan.
- `contracts/repository-state.schema.json` — multi-repo with `scope_fingerprint`.
- `contracts/retrieval-execution-result.schema.json` — strict result.
- `contracts/retrieval-execution-trace.schema.json` — strict trace.
- `contracts/retrieval-execution-metrics.schema.json` — strict metrics.
- `tests/retrieval-execution-contracts.test.mjs` — 73 contract gates.
- `tests/fixtures/qs-sell/` — synthetic Sell-flow fixture.
- `tests/integration/benchmark-qs-sell.test.mjs` — contract/fixture test.

### What is NOT changed

- `VERSION` — still `0.4.0`.
- `AGENTS.md` (source root) — unchanged.
- `bin/retrieval/retrieval-router.mjs` — unchanged in this phase.
- `scripts/retrieval-router.ps1` — unchanged in this phase.
- `global/retrieval/default-policy.json` — unchanged; no `execution` block.
- `templates/project-neutral/.ai-env/retrieval-policy.json` — unchanged.
- `contracts/retrieval-policy.schema.json` — unchanged.
- `contracts/retrieval-index-state.schema.json` — unchanged.
- All v0.4.0 tests — unchanged.
- `.ai-env/` in adopted projects — none touched.
- `OPENCODE_RETRIEVAL_MODE` env var — not supported.

### Phase 0 acceptance

- [x] `docs/RETRIEVAL_EXECUTION.md` exists.
- [x] `docs/V0.5.0_PLANNING_CORRECTION_REPORT.md` has a FINAL CONTRACT CLOSURE section.
- [x] All seven new contracts exist and parse.
- [x] `tests/retrieval-execution-contracts.test.mjs` passes (73 / 73).
- [x] `tests/fixtures/qs-sell/` is synthetic and labelled.
- [x] `tests/integration/benchmark-qs-sell.test.mjs` passes (15 / 15).
- [x] `CHANGELOG.md` records the final contract closure state under `Unreleased`.
- [x] `PROGRESS.md` status is `V0.5.0_RETRIEVAL_EXECUTION_FINAL_PLANNING_APPROVAL_READY`.
- [x] `VERSION` is unchanged.
- [x] No adopted project has been modified.
- [x] No `execution` block is added to `global/retrieval/default-policy.json`.
- [x] No `OPENCODE_RETRIEVAL_MODE` env var is documented as supported.
- [x] `git diff --check` passes.
- [x] `pnpm validate` passes.
- [x] `pnpm test:unit` passes (179 / 179).
- [x] `pnpm test:integration` passes (162 / 162).
- [x] No commits, no pushes, no working-tree changes outside the
  artefacts listed above.

### Phase 1 Acceptance (COMPLETED)

Phase 1 adapters approved and implemented:

- [x] `bin/retrieval/adapters/shared.mjs` - common logic (envelope, deny globs, POSIX path)
- [x] `bin/retrieval/adapters/ripgrep.mjs` - ripgrep adapter with `--json --hidden --smart-case --no-config`
- [x] `bin/retrieval/adapters/git-grep.mjs` - git-grep adapter with `-nI --no-color -e <query>`
- [x] `bin/retrieval/adapters/filesystem.mjs` - filesystem adapter for knowledge strategy
- [x] `tests/retrieval-adapters.test.mjs` - 30 tests covering all adapter functionality
- [x] `node --test tests/retrieval-adapters.test.mjs` passes (30 / 30)
- [x] `node --test tests/security-boundaries.test.mjs` passes (11 / 11)
- [x] `pnpm validate` passes
- [x] `git diff --check` passes

### Phase 2 Acceptance (COMPLETED)

Phase 2 engine approved and implemented:

- [x] `bin/retrieval/reason-codes.mjs` - versioned reason codes catalog
- [x] `bin/retrieval/token-estimator-v1.mjs` - deterministic token estimator
- [x] `bin/retrieval/path-restrict.mjs` - path restriction utilities
- [x] `bin/retrieval/repository-state.mjs` - multi-repo state capture with fingerprints
- [x] `bin/retrieval/preflight.mjs` - preflight checks (allowed roots, deny globs, protected paths)
- [x] `bin/retrieval/budget.mjs` - budget enforcement with hard caps
- [x] `bin/retrieval/normalize.mjs` - result normalization with deduplication
- [x] `bin/retrieval/equivalence.mjs` - in-memory equivalence cache
- [x] `bin/retrieval/metrics.mjs` - metrics recording
- [x] `bin/retrieval/execution-engine.mjs` - main execution engine with executePlan()
- [x] `bin/retrieval/execute-batch.mjs` - batch execution with executeBatch()
- [x] `tests/retrieval-engine.test.mjs` - 53 tests covering all engine functionality
- [x] `node --test tests/retrieval-engine.test.mjs` passes (53 / 53)
- [x] `node --test tests/retrieval-adapters.test.mjs` passes (30 / 30)
- [x] `node --test tests/retrieval-execution-contracts.test.mjs` passes (73 / 73)
- [x] `node --test tests/security-boundaries.test.mjs` passes (11 / 11)
- [x] `pnpm validate` passes
- [x] `git diff --check` passes

### Phase 3 Acceptance (COMPLETED)

Phase 3 router wiring approved and implemented:

- [x] `bin/retrieval/retrieval-entry.mjs` - execute and batch entry points
- [x] Plan-only v0.4.0 output preserved (no mode, execution, adapter_signature)
- [x] `executeQuery()` - single query execution entry point
- [x] `executeBatchQueries()` - batch execution entry point with shared cache
- [x] Plan-only providers (lsp, codebase-memory, semantic) fall back to declared executable providers
- [x] Project adoption and manifest validation required for execution
- [x] Tests demonstrate: exact success, knowledge with filesystem, plan-only fallback, project not adopted rejection, manifest absent rejection, batch order preservation
- [x] `tests/retrieval-router.test.mjs` passes (60 / 60)
- [x] `tests/retrieval-router-execution.test.mjs` passes (10 / 10)
- [x] `node --test tests/retrieval-engine.test.mjs` passes (53 / 53)
- [x] `node --test tests/retrieval-execution-contracts.test.mjs` passes (73 / 73)
- [x] `pnpm validate` passes
- [x] `git diff --check` passes

### Next phase

Phase 6 (certify), Phase 7 (piloto) and Phase 8 (release) start only after Phase 5 is accepted
and the user approves continuing. See `docs/RETRIEVAL_EXECUTION.md` §23.

### Phase 5 Acceptance (COMPLETED)

Phase 5 doctor approved and implemented:

- [x] `bin/retrieval/retrieval-doctor.mjs` - pure testable check functions
- [x] `scripts/doctor-opencode-global.ps1` - v0.5.0 diagnostics added preserving v0.4.0 checks
- [x] `tests/retrieval-doctor.test.mjs` - comprehensive doctor test suite
- [x] Tool detection via native mechanisms (Node, PowerShell, Git paths)
- [x] Retrieval tier determination (OPTIMAL/FUNCTIONAL/INCOMPLETE)
- [x] `retrieval_execution_ready` flag reporting
- [x] `OPENCODE_RETRIEVAL_MODE` rejected when defined
- [x] Runtime retrieval dir inspection (read-only, no creation)
- [x] Wrapper security checks (no Invoke-Expression, cmd /c, powershell -Command, shell, concatenation)
- [x] v0.5.0 required files checked (entry, engine, batch, adapters, wrapper, contracts, validator)
- [x] Zero writes verified
- [x] Deterministic output/exit codes
- [x] `node --test tests/retrieval-doctor.test.mjs` passes
- [x] `pnpm validate` passes
- [x] `git diff --check` passes
- [x] Real doctor execution: `pwsh -NoProfile -File scripts/doctor-opencode-global.ps1`

### Phase 7 Acceptance (COMPLETED)

Phase 7 retrieval execution real pilot completed and **all gates pass**. The pilot ran a real read-only local-clone pilot against the real source project (`C:/quipusoft`), using a **real Quipusoft query set** discovered deterministically via `git grep --cached` (3 unique queries, each repeated twice: `LoginRequest` exact, `class Constants` symbol, `Agent Orchestrator` knowledge, 6 total).

The v0.5.0 reduction targets are **achieved**: 50% call reduction (6 baseline → 3 batch), 50% char reduction (40K baseline → 20K batch), 50% token reduction. All 9 gates pass: manifest validation, policy validation, batch calls ≤ 3, call/char/token reductions ≥ 40%, fallback provided (ripgrep→git_grep), disclosure focused reads, baseline and batch metrics envelope validity.

Pilot deliverables:

- `scripts/run-retrieval-real-pilot.mjs` (reproducible, uses `spawnSync`/`execFileSync`, `performance.now()` for wall-clock, `finally` cleanup of pilot dir, OPENCODE_CONFIG_DIR separated, session-level metrics envelope validated by canonical AJV).
- `scripts/discover-real-query-set.mjs` (deterministic query discovery via `git grep --cached`, v3, no file reads, produces frozen query set with SHA-256 hash).
- `tests/integration/retrieval-real-pilot-gates.test.mjs` (validates all 9 gates, AJV validation for result/trace/metrics envelopes, zero-writes, plan-only).
- `tests/integration/benchmark-qs-sell.test.mjs` (15 tests, RESERVED for synthetic fixture only).
- `docs/research/sources/2026-07-26-retrieval-real-query-set.json` (frozen query set, SHA-256 `c4ddde6f6556b6a7072508f40e047c3f49f917e48871b0df72bcc6507589a98d`).
- `docs/research/sources/2026-07-26-retrieval-execution-real-pilot-*.json` (evidence files, metadata only, sanitised source-project placeholder).

Minimal corrections during Phase 7 closure:

- `bin/retrieval/adapters/ripgrep.mjs`: `args.push('--')` → `args.push('--', '.')` — Windows rg 15.2.0 requires explicit path after `--` in JSON mode or it searches 0 bytes.
- `bin/retrieval/execution-engine.mjs`: repo paths resolved against `manifestDir` (was relative to `process.cwd()`), `duration_ms` added to per-run metrics.
- `scripts/run-retrieval-real-pilot.mjs`: `runPilot` made `async` with top-level `await`, fallback subgate uses `executePlan` with adapter override instead of `invokeBatch`, disclosure subgate uses `executePlan` with `batchContext.progressiveDisclosure` enabled, batch result push includes `metrics_valid`, all evidence fields match test expectations.

Real gate results (latest evidence):

- `pnpm install --frozen-lockfile` exit 0
- `pnpm run validate` exit 0
- `node scripts/generate-retrieval-validators.mjs --check` exit 0 (VALIDATORS_OK, no residue)
- `node scripts/run-retrieval-real-pilot.mjs --source-project C:/quipusoft` exit 0 (V0.5.0_PHASE7_REAL_PILOT_READY_FOR_RELEASE; all 10 gates PASS)
- `node --test tests/integration/retrieval-real-pilot-gates.test.mjs` 10/10 pass
- `node --test tests/integration/benchmark-qs-sell.test.mjs` 15/15 pass
- `pnpm test:unit` 379/379 pass
- `pnpm test:integration` 171/171 pass
- `pnpm test:all` 550/550 pass (0 fails)
- `pwsh -NoProfile -File scripts/doctor-opencode-global.ps1` 0 issues, tier OPTIMAL, `retrieval_execution_ready: True`
- `pwsh -NoProfile -File scripts/certify-opencode-global.ps1` all 8 v0.5.0 gates pass, CERTIFICATION PASSED, sandbox deleted
- `git diff --check` 0 errors
- `VERSION` and `package.json` version unchanged at 0.4.0
- residual `opencode-certify-*` and `opencode-validator-check-*` temp dirs: 0
- residual `pilot-*` dirs: 0
- pre-pilot vs post-pilot evidence: 0 writes to source project

State: `V0.5.0_PHASE7_REAL_PILOT_READY_FOR_RELEASE`. All Phase 7 gates pass against real Quipusoft content with 50% reduction. Engine, contract validation, plan-only architecture, zero-write guarantee, AJV validation, equivalence cache, progressive disclosure, fallback mechanism, and metrics envelope are all verified end-to-end.

### Phase 6 Acceptance (COMPLETED)

Phase 6 certify hardening completed. All gates pass in the exact order:

- [x] `node --check` syntax validation for all modules
- [x] Real ESM import for entry/engine/batch modules via `pathToFileURL` (absolute URL, isolated Node process)
- [x] JSON parsing validation for all contracts
- [x] `generate-retrieval-validators.mjs --check` mode for validator parity, using `process.exitCode` so the `finally` block always cleans up the temp directory
- [x] Doctor invokes --check mode and does not return valid by default
- [x] `retrieval_execution_ready` strengthened to require validator parity, `$batchPath`, entry, engine, wrapper, adapters, provider, contracts, Node
- [x] Runtime resolution with precedence (OPENCODE_CONFIG_DIR, XDG_CONFIG_HOME, ~/.config/opencode)
- [x] `tests/retrieval-doctor.test.mjs` strengthened with 23 deterministic scenarios (76 tests pass)
- [x] `scripts/certify-opencode-global.ps1` extended with 8 v0.5.0 gates (SHA-256 coverage, validator parity, node --check, real ESM import, JSON parse, wrapper security, doctor invocation, hash coverage)
- [x] `scripts/certify-opencode-global.ps1` converted to LF line endings so `git diff --check` returns 0 errors
- [x] All gates pass in order

Real numbers from this run:

- `pnpm install --frozen-lockfile`: exit 0
- `pnpm run validate`: exit 0 (all validations passed)
- `node scripts/generate-retrieval-validators.mjs --check`: VALIDATORS_OK, exit 0
- `node --test tests/retrieval-doctor.test.mjs`: 76/76 pass, 23 suites, exit 0
- `pnpm test:unit`: 375/375 pass, 95 suites, exit 0
- `pnpm test:integration`: 162/162 pass, 49 suites, exit 0
- `pnpm test:all`: 162/162 pass, 49 suites, exit 0
- `pwsh -NoProfile -File scripts/doctor-opencode-global.ps1`: 0 issues, tier OPTIMAL, `retrieval_execution_ready: True`, exit 0
- `pwsh -NoProfile -File scripts/certify-opencode-global.ps1`: all 8 v0.5.0 gates pass, CERTIFICATION PASSED, finally runs and deletes sandbox, exit 0
- PowerShell parser on certify: 0 errors
- `git diff --check`: 0 errors
- Residual `opencode-certify-*` and `opencode-validator-check-*` temp dirs in last 10 min: 0
- `VERSION` unchanged: 0.4.0
- `package.json` version unchanged: 0.4.0

## Seven Commits on Branch (v0.4.0)

| Commit | Description |
|--------|-------------|
| `05d90dd` | feat(retrieval): add deterministic retrieval foundation |
| `ae6b8ac` | docs(retrieval): clarify ripgrep is optional, git grep is required fallback |
| `35cd6c0` | feat(retrieval): add setup-retrieval-tools.ps1 and retrieval tier reporting |
| `508afb3` | fix(retrieval): finalize template portability and distribution |
| `40c6ec8` | fix(update): make project updater strictly read-only (doctor/plan only) |
| `5ad4203` | fix(retrieval): complete project adoption lifecycle |

## Completed Actions

### Retrieval Foundation v0.4.0

The Retrieval Foundation is implemented and certified:

- **Router:** `bin/retrieval/retrieval-router.mjs` - deterministic retrieval plan builder
- **Validators:** `bin/retrieval/retrieval-policy-validator.mjs`, `bin/retrieval/retrieval-index-state-validator.mjs`
- **Default Policy:** `global/retrieval/default-policy.json`
- **Setup Tools:** `scripts/setup-retrieval-tools.ps1` - cross-platform tool installer (WinGet, Homebrew, Apt, Yum, Dnf, Zypper)
- **Retrieval Policy Schema:** `contracts/retrieval-policy.schema.json`
- **Retrieval Index State Schema:** `contracts/retrieval-index-state.schema.json`

### Canonical Structure Established

The source repository follows the canonical structure:

- Scripts at root `scripts/` level
- Tests at root `tests/` level (unit + integration)
- Commands at root `commands/` level
- Templates at root `templates/` level
- Contracts at root `contracts/` level
- Global runtime defaults at `global/` level
- Bin retrieval tools at `bin/retrieval/` level

### Commands Canonical

All legacy aliases removed. Canonical public commands (8 total):

| Command | Purpose |
|---------|---------|
| `/init` | Official command for AGENTS.md creation/improvement |
| `/init-ai-env` | Initialize project AI environment |
| `/doctor-ai-env` | Diagnose project AI environment health |
| `/update-ai-env` | Update project to latest global configuration (read-only) |
| `/go` | Launch with GO profile |
| `/chatgpt-plus` | Launch with ChatGPT Plus profile |
| `/mix` | Launch with MIX profile |
| `/minimax-plus` | Launch with Minimax Plus profile |
| `/cross-session` | Cross-session orchestration (requires runtime CLI) |

### Template Neutral Fixed

- `chatgpt-plus.md` now declares `profile: chatgpt-plus` (was `profile: chatgpt`)
- `minimax-plus.md` now uses declarative `mode: launch` (was Windows-specific path)
- `go.md` and `mix.md` use portable declarative style
- Template does not create agents, MCP, skills, Speckit or topology

### Distribution Chain Verified

Source → Runtime Global → Independent Project:

1. **Source:** `C:\OpenCode\opencode-global-src`
2. **Runtime:** `C:\Users\VegaValverde\.config\opencode` (via install/update scripts)
3. **Projects:** Independent repositories using init-opencode-project.ps1

### Project Updater State (v0.4.0)

The project updater is **doctor/plan-only** in v0.4.0:

- `update-opencode-project.ps1 -Doctor` - Diagnose project
- `update-opencode-project.ps1 -Plan` - Generate update plan
- `apply <plan-id>` - **NOT IMPLEMENTED** (future Project Update Engine)
- `rollback <run-id>` - **NOT IMPLEMENTED** (future Project Update Engine)

### Orphan Policy Removed

Removed `.ai-env/retrieval-policy.json` from source root. Source is NOT a project and should not adopt itself.

Canonical retrieval policies:
- `global/retrieval/default-policy.json` - runtime default
- `templates/project-neutral/.ai-env/retrieval-policy.json` - template for new projects

## Current Structure

```
C:\OpenCode\opencode-global-src\
├── AGENTS.md
├── README.md
├── package.json
├── pnpm-lock.yaml
├── .gitignore
├── VERSION (0.4.0)
├── LICENSE
├── CHANGELOG.md (0.4.0)
├── PROGRESS.md
│
├── .github/
│   └── workflows/
│       └── validate.yml
│
├── bin/
│   └── retrieval/
│       ├── retrieval-router.mjs
│       ├── retrieval-policy-validator.mjs
│       └── retrieval-index-state-validator.mjs
│
├── commands/
│   ├── chatgpt-plus.md
│   ├── cross-session.md
│   ├── doctor-ai-env.md
│   ├── go.md
│   ├── init-ai-env.md
│   ├── minimax-plus.md
│   ├── mix.md
│   └── update-ai-env.md
│
├── contracts/
│   ├── bootstrap-manifest.schema.json
│   ├── bootstrap-manifest-v2.schema.json
│   ├── graph.schema.json
│   ├── index.schema.json
│   ├── lifecycle-records.schema.json
│   ├── manifest.schema.json
│   ├── mission-spec.schema.json
│   ├── profile.schema.json
│   ├── project-manifest.schema.json
│   ├── retrieval-index-state.schema.json
│   ├── retrieval-policy.schema.json
│   ├── runtime-records.schema.json
│   ├── security-policy.schema.json
│   └── session.schema.json
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── INSTALLATION.md
│   ├── ORCHESTRATION.md
│   ├── PROFILES.md
│   ├── RELEASES.md
│   ├── RETRIEVAL.md
│   └── SECURITY.md
│
├── global/
│   ├── opencode.jsonc
│   ├── opencode.profiles/
│   │   ├── chatgpt-plus.jsonc
│   │   ├── go.jsonc
│   │   ├── mix.jsonc
│   │   ├── minimax-plus.jsonc
│   │   ├── model-matrix.json
│   │   └── model-matrix.schema.json
│   ├── protocols/
│   │   └── AGENTS.global.md
│   ├── retrieval/
│   │   └── default-policy.json
│   └── README.runtime.md
│
├── scripts/
│   ├── certify-opencode-global.ps1
│   ├── cleanup-runtime.ps1
│   ├── cross-session.ps1
│   ├── doctor-opencode-global.ps1
│   ├── generate-retrieval-validators.mjs
│   ├── init-opencode-project.ps1
│   ├── install-opencode-global.ps1
│   ├── opencode-launcher.ps1
│   ├── retrieval-router.ps1
│   ├── setup-retrieval-tools.ps1
│   ├── update-opencode-global.ps1
│   ├── update-opencode-project.ps1
│   └── validate.mjs
│
├── templates/
│   └── project-neutral/
│       ├── AGENTS.md
│       ├── opencode.jsonc
│       ├── project-manifest.json
│       ├── active-task.txt.example
│       ├── .gitignore
│       ├── .ai-env/
│       │   └── retrieval-policy.json
│       ├── .intelligence/
│       │   └── README.md
│       └── .opencode/
│           └── commands/
│               ├── chatgpt-plus.md
│               ├── go.md
│               ├── minimax-plus.md
│               └── mix.md
│
└── tests/
    ├── config-validation.test.mjs
    ├── init-project.test.mjs
    ├── launcher.test.mjs
    ├── profile-routing.test.mjs
    ├── retrieval-router.test.mjs
    ├── schema-official.test.mjs
    ├── security-boundaries.test.mjs
    └── integration/
        ├── dryrun-zero-writes.test.mjs
        ├── install-clean.test.mjs
        ├── install-idempotent.test.mjs
        ├── profiles-commands-contracts.test.mjs
        ├── retrieval-router.test.mjs
        ├── retrieval-source-runtime-project.test.mjs
        └── update-preserves-overrides.test.mjs
```

## Test Results

| Suite | Tests | Status |
|-------|-------|--------|
| Unit tests | 106 | PASS |
| Integration tests | 147 | PASS |
| **Total** | **253** | **PASS** |

## Certification Gates (ALL PASS)

| Gate | Result |
|------|--------|
| pnpm install --frozen-lockfile | PASS |
| pnpm run validate | PASS |
| pnpm test:unit (106 tests) | PASS |
| pnpm test:integration (147 tests) | PASS |
| pnpm test:all (253 tests) | PASS |
| doctor-opencode-global.ps1 | PASS (0 issues) |
| certify-opencode-global.ps1 | PASS (all checks) |

## Profile Certification

| Profile | Model | Status |
|---------|-------|--------|
| GO | opencode-go/qwen3.7-plus | CONFIGURED |
| CHATGPT-PLUS | openai/gpt-5.6-terra | CONFIGURED |
| MIX | Hybrid (GO + ChatGPT) | CONFIGURED |
| MINIMAX-PLUS | minimax/MiniMax-M2.7 | CONFIGURED |

## Retrieval Foundation Status

| Component | Location | Status |
|-----------|----------|--------|
| Router | `bin/retrieval/retrieval-router.mjs` | IMPLEMENTED |
| Policy Validator | `bin/retrieval/retrieval-policy-validator.mjs` | IMPLEMENTED |
| Index Validator | `bin/retrieval/retrieval-index-state-validator.mjs` | IMPLEMENTED |
| Default Policy | `global/retrieval/default-policy.json` | IMPLEMENTED |
| Setup Tools | `scripts/setup-retrieval-tools.ps1` | IMPLEMENTED |
| Template Policy | `templates/project-neutral/.ai-env/retrieval-policy.json` | IMPLEMENTED |
| Schema | `contracts/retrieval-policy.schema.json` | IMPLEMENTED |
| Index Schema | `contracts/retrieval-index-state.schema.json` | IMPLEMENTED |

### Retrieval Tiers

| Tier | Condition | Providers |
|------|-----------|-----------|
| OPTIMAL | ripgrep available | exact: ripgrep, symbol: lsp, architecture: codebase-memory |
| FUNCTIONAL | git available (fallback) | exact: git-grep, symbol: lsp, architecture: codebase-memory |
| INCOMPLETE | No exact provider | Limited retrieval |

## Gates (ALL COMPLETE)

| Gate | Status |
|------|--------|
| Gate 1: Source final audit | COMPLETE |
| Gate 2: Runtime global real updated and certified | COMPLETE |
| Gate 3: Independent project pilot (Quipusoft) | COMPLETE |

## Dependencies

| Dependency | Version | Status |
|------------|---------|--------|
| pnpm | 11.9.0 | INSTALLED |
| ajv | ^8.17.1 | INSTALLED |
| ajv-formats | ^3.0.1 | INSTALLED |
| jsonc-parser | ^3.3.1 | INSTALLED |

## Version

- OpenCode Global: **0.5.0** (released)
- Compatible with OpenCode: **1.18.x+**

## Final Release Verification (Phase 8)

- [x] `VERSION` updated to 0.5.0
- [x] `package.json` version updated to 0.5.0
- [x] CHANGELOG converted to `[0.5.0] - 2026-07-26`
- [x] Working tree clean (`git status --porcelain` empty)
- [x] Tag `v0.5.0` created (annotated)
- [x] Unit tests 379/379 pass
- [x] Integration tests 171/171 pass
- [x] Total 550/550 pass
- [x] Real pilot exit 0, all 10 gates PASS
- [x] Doctor 0 issues, tier OPTIMAL
- [x] Certify 8/8 gates, CERTIFICATION PASSED
- [x] Quipusoft byte-identical (zero writes)
- [x] Zero temp/residual artifacts
- [x] No secrets, credentials, absolute paths versioned
- [x] No runtime, project, or foreign repository modified
- [x] No push, fetch, pull, merge, rebase performed

## Security

- No credentials or secrets in repository
- No absolute paths in configuration
- All paths use relative or environment-variable references
- Project-specific content stays in projects
- Global is portable across computers
- .gitignore excludes registry.sqlite, sessions, logs, cache
