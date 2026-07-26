# Retrieval Execution

OpenCode Global v0.5.0 — Spec, plan, contracts, ownership, migration, tests,
and benchmark. This document extends the v0.4.0 Retrieval Foundation from
**plan-only** to **plan-then-execute**, while keeping every v0.4.0 contract
and CLI behaviour wire-compatible.

## 0. Status

```
Status:           V0.5.0_RETRIEVAL_EXECUTION_FINAL_PLANNING_APPROVAL_READY
Source version:   0.4.0   (unchanged — planning only, no VERSION bump)
PLAN-ONLY mode:   default (== v0.4.0 behaviour)
EXECUTE mode:     opt-in via --Execute / --Mode execute
BATCH mode:       opt-in via -BatchInput <json> or stdin JSON
EXECUTE+BATCH:    opt-in via -BatchInput with --Execute
Scope:            spec + contracts + ownership + tests + benchmark
Implementation:   NOT in this document
Plan-only v0.4.0: output unchanged
```

This is the **final contract closure** of the v0.5.0 planning phase.
The previous passes were rejected on key points; this one closes them
all. The implementation wave does not start in this document; it is
locked behind explicit approval.

## 1. Scope and Non-Goals

### In scope

- Plan-then-execute runtime that consumes the v0.4.0 plan and emits a
  normalised retrieval result.
- A **strict** v0.5.0 execution-plan contract separate from the v0.4.0
  plan-base contract. v0.4.0 plan output is validated against the base
  only; v0.5.0 execute-mode output is validated against the strict
  execution-plan.
- `executeBatch(plans, options)` — batch entry point that runs multiple
  queries in one process so the in-process equivalence cache can dedupe
  repeated queries. Surfaced via `-BatchInput <json>` or stdin JSON.
  No new public command is introduced.
- Executable providers: `ripgrep`, `git_grep`, `filesystem`. `knowledge`
  is a strategy, **not** a provider.
- Logical adapter calls vs provider process invocations — the hard cap
  of 3 applies to logical calls, not to internal processes.
- Result normalizer with deterministic field mapping.
- Deterministic fallback chain (pre-call availability probe + at-most
  one reserved fallback call by default).
- Progressive disclosure: stateless, limited to the same batch,
  revalidates scope_fingerprint, allowed roots, and deny globs at
  expansion time. Counted as `focused_read_calls` and
  `focused_read_chars`.
- Equivalence cache: in-process, per-process, never persisted. Disabled
  when any repository has `dirty_worktree=true` (CACHE_DISABLED_DIRTY_WORKTREE).
- Multi-repo repository-state for projects declared by
  `project-manifest.json` (one or more repositories, ordered, unique
  `repository_id`, per-repo fingerprint, composite `scope_fingerprint`).
- Reason codes for every visible side-effect (validated by schema).
- Metrics: per-run + per-session summary, with `logical_adapter_calls`,
  `provider_process_invocations`, `fallback_count`, `focused_read_calls`,
  `focused_read_chars`, `token_estimator_version`, and the versioned
  deterministic token estimator.
- Security preflight: deny globs, deny external directories, no
  credentials, no nested-quoting string-built commands, no
  `Invoke-Expression`, Windows path normalisation.
- `qs/sell` benchmark contract/fixture (synthetic, labelled). The
  savings percentages are **reserved** for Phase 7 release gates.
- Compatibility with v0.4.0 consumers (zero behaviour change in plan-only).

### Explicit non-goals

- No semantic / vector search execution (semantic remains policy-gated,
  disabled by default).
- No code-graph / structural index authoring (codebase-memory reads stay
  plan-only — execution is out of scope for v0.5.0).
- No remote / network provider execution.
- No project-owned content — agents, MCP, skills, prompts, Speckit,
  technologies, `.intelligence/`, and project-local policies remain
  project-owned.
- No Speckit, no new agents, no new commands, no new MCP — this is a runtime
  tightening, not a user-facing expansion.
- No `OPENCODE_RETRIEVAL_MODE` env var. The v0.5.0 release explicitly
  rejects global activation via environment variable.
- No change to `VERSION`, to `AGENTS.md` of the source root, to the four
  profiles, to the model matrix, or to the install/update lifecycle.
- No `execution` block added to the project-owned retrieval policy.
  The v0.4.0 policy schema rejects it; the policy must remain
  unchanged. Opt-in is via CLI switches only.
- No invented pilot telemetry. The qs/sell fixture is synthetic and
  labelled. The savings percentages are reserved for Phase 7.

## 2. Contract surface (final)

| Contract | Strict? | Notes |
|---|---|---|
| `retrieval-plan-base.schema.json` | permissive additional properties | v0.4.0 plan shape; v0.4.0 calls validate against this only |
| `retrieval-execution-plan.schema.json` | strict (requires `mode`, `execution`, `adapter_signature`) | v0.5.0 execute-mode plan |
| `repository-state.schema.json` | strict (per-repo fingerprint required, ordered unique ids, POSIX paths) | multi-repo |
| `retrieval-execution-result.schema.json` | strict (all promised fields required) | normalised result |
| `retrieval-execution-trace.schema.json` | strict | logical + processes + focused_reads |
| `retrieval-execution-metrics.schema.json` | strict (token_estimator_version required) | per-run + summary |
| `retrieval-execution-reason-codes.schema.json` | frozen enum | reason code catalogue |

The result's `plan` field is a `$ref` to `retrieval-execution-plan.schema.json`
(strict). v0.4.0 callers never emit a result; they emit a plan validated
against `retrieval-plan-base.schema.json`.

## 3. Reuse Map (no parallel architecture)

The v0.5.0 plan must reuse the existing structure. The following
artifacts already exist and are reused:

| Existing artifact | Reused for v0.5.0 |
|---|---|
| `bin/retrieval/retrieval-router.mjs` | host for the new `executeBatch(plans, options)` code path |
| `bin/retrieval/retrieval-policy-validator.mjs` | unchanged — policy gate |
| `bin/retrieval/retrieval-index-state-validator.mjs` | unchanged — freshness gate |
| `contracts/retrieval-policy.schema.json` | unchanged — v1.0 (no `execution` block allowed) |
| `contracts/retrieval-index-state.schema.json` | unchanged — v1.0 |
| `bin/retrieval/retrieval-router.mjs` constants | `INTENTS`, `STRATEGIES`, `HARD_CAPS`, `DEFAULT_BUDGETS`, `KNOWLEDGE_PATHS_GLOB`, `PATTERNS`, `classifyQueryAuto`, `detectProviderState`, `detectCapabilities`, `getGitInfo`, `getIndexState`, `resolveIntent`, `validatePolicyWithAjv`, `validateIndexStateWithAjv`, `loadPolicy` |
| `scripts/retrieval-router.ps1` | extended with `--Mode`, `--Execute`, `-BatchInput`, `--WriteTrace`, `--WriteMetrics`, `Resolve-Path` for restricted paths |
| `global/retrieval/default-policy.json` | unchanged (no `execution` block) |
| `templates/project-neutral/.ai-env/retrieval-policy.json` | unchanged |
| `global/protocols/AGENTS.global.md` | extended with execution rules |
| `scripts/doctor-opencode-global.ps1` | extended with execution-engine checks |
| `scripts/certify-opencode-global.ps1` | extended with execution-engine phase |
| `tests/retrieval-router.test.mjs` | unchanged (still validates plan-only) |
| `tests/integration/retrieval-*.test.mjs` | new tests added alongside |
| `scripts/generate-retrieval-validators.mjs` | extended to emit new validators |

### New runtime modules (planned, not written here)

| Module | Owner |
|---|---|
| `bin/retrieval/execution-engine.mjs` | global |
| `bin/retrieval/execute-batch.mjs` | global |
| `bin/retrieval/adapters/ripgrep.mjs` | global |
| `bin/retrieval/adapters/git-grep.mjs` | global |
| `bin/retrieval/adapters/filesystem.mjs` | global |
| `bin/retrieval/normalize.mjs` | global |
| `bin/retrieval/equivalence.mjs` | global |
| `bin/retrieval/budget.mjs` | global |
| `bin/retrieval/reason-codes.mjs` | global |
| `bin/retrieval/metrics.mjs` | global |
| `bin/retrieval/preflight.mjs` | global |
| `bin/retrieval/repository-state.mjs` | global |
| `bin/retrieval/path-restrict.mjs` | global — `Resolve-Path` based path check |
| `bin/retrieval/token-estimator-v1.mjs` | global — deterministic token estimator |

These are wired into `bin/retrieval/retrieval-router.mjs` as new
`executePlan(plan, opts)` and `executeBatch(plans, opts)` functions.

## 4. Ownership

### Global owns

- Schemas, validators, and the AJV-generated standalone validators.
- The execution engine, adapters, normalizer, budget enforcer, equivalence
  cache, reason-code catalogue, metrics recorder, preflight, repository-state
  snapshot, path-restrict, token estimator.
- The `scripts/retrieval-router.ps1` wrapper surface.
- The `global/protocols/AGENTS.global.md` execution rules.
- The `scripts/doctor-opencode-global.ps1` checks for the execution engine.
- The `scripts/certify-opencode-global.ps1` execution phase.
- The `tests/retrieval-execution-*.test.mjs` files.
- The `tests/fixtures/qs-sell/` SYNTHETIC fixture.
- The `tests/integration/benchmark-qs-sell.test.mjs` benchmark contract/fixture.

### Project owns (no change)

- `.ai-env/retrieval-policy.json` — projects continue to override.
- `.ai-env/retrieval-index-state.json` — projects continue to publish.
- Agents, MCP, skills, prompts, specialized permissions, Speckit,
  technologies, `.intelligence/`, README, AGENTS.md, project Manifest.
- The number of repositories and the paths inside `project-manifest.json`.

### Invariant

The execution engine NEVER writes to the project. It only reads the
git toplevel, the index-state file, the policy file, and the
project manifest. Trace and metrics are written outside the project
(under the global runtime) and only when explicitly requested.

## 5. Compatibility and Migration from v0.4.0

### Wire compatibility

- v0.4.0 plan JSON remains valid for v0.4.0 callers. It validates
  against `retrieval-plan-base.schema.json` (NOT the strict execution-plan).
- v0.5.0 plan JSON (mode="execute") validates against the strict
  `retrieval-execution-plan.schema.json`.
- The result `plan` field is a `$ref` to the strict execution-plan,
  because the result is produced in execute mode.

### Behaviour compatibility

- v0.4.0 router output is unchanged.
- v0.4.0 reason codes (`PROJECT_NOT_ADOPTED`, `auto`, `intent:<name>`,
  `PROVIDER_FALLBACK_TO_<X>`, `STRATEGY_FALLBACK_TO_<X>`,
  `STALE_INDEX_FALLBACK`, `DIRTY_WORKTREE_VERIFICATION_REQUIRED`,
  `NO_RETRIEVAL_PROVIDER`, `INVALID_INTENT`, `INVALID_POLICY`) are kept
  verbatim.

### Migration steps for v0.4.0 projects

1. **No action required.** v0.4.0 projects continue to use the plan router.
2. To opt into execution, the project does NOT change its
   `.ai-env/retrieval-policy.json`. Opt-in is via CLI.
3. The project policy is **not** extended. The v0.4.0 schema rejects it.

### Rollback

If v0.5.0 execution is rejected by the preflight, the engine emits
`EXECUTION_REJECTED_FALLBACK_TO_PLAN` and returns the v0.4.0 plan
JSON with `execution.preflight: "blocked"`.

## 6. Execution Pipeline

```
                 ┌───────────────────────────────────────────────┐
                 │  v0.4.0 plan (validated against base)        │
                 └───────────────────────────────────────────────┘
                                    │
                                    ▼
   ┌──────────────────────────────────────────────────────────────┐
   │  REPOSITORY STATE   :  multi-repo, per-repo fingerprint,    │
   │                         composite scope_fingerprint          │
   └──────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
   ┌──────────────────────────────────────────────────────────────┐
   │  PREFLIGHT          :  deny globs, external_dir, knowledge  │
   │                         paths, no env activation, allowed    │
   │                         roots, path normalisation,           │
   │                         project manifest required            │
   └──────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
   ┌──────────────────────────────────────────────────────────────┐
   │  EQUIVALENCE        :  compute adapter_signature;             │
   │                         disabled if any repo dirty (cache    │
   │                         disabled); cache hit returns the     │
   │                         prior result                         │
   └──────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
   ┌──────────────────────────────────────────────────────────────┐
   │  ADAPTER (logical)  :  primary = 1 logical call              │
   │                         reserved fallback = 1 logical call   │
   │  ADAPTER (processes) :  per logical call, 1 process per repo │
   └──────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
   ┌──────────────────────────────────────────────────────────────┐
   │  NORMALIZER         :  fields mapped, deduped, truncated,    │
   │                         tokens estimated, preview_token gen  │
   └──────────────────────────────────────────────────────────────┘
                                    │
   ┌──────────────────────────────────────────────────────────────┐
   │  RESULT (+ opt-in TRACE + opt-in METRICS)                   │
   └──────────────────────────────────────────────────────────────┘
```

## 7. Reason Codes

The reason-code catalogue is the single allowed vocabulary. It is
referenced by `$ref` from result, trace, and metrics. Adding a new
code requires a new contract version + a new contract test gate.

The full catalogue is in `contracts/retrieval-execution-reason-codes.schema.json`.
Closed decisions:

- `CACHE_DISABLED_DIRTY_WORKTREE` — emitted when any repository has
  `dirty_worktree=true` and the cache is disabled.
- `FOCUSED_READ_INVOKED` — emitted when a progressive disclosure
  expansion runs.
- `TRACE_PATH_REJECTED` — emitted when the trace path is denied.
- `METRICS_PATH_REJECTED` — emitted when the metrics path is denied.
- `CROSS_PROCESS_CACHE_HIT_DISALLOWED` — emitted when an
  EQUIVALENT_REUSED event is requested across processes.
- `BATCH_EXECUTED` — emitted when a batch entry ran.
- `TOKEN_ESTIMATOR_VERSION` — emitted when the versioned estimator is
  recorded.
- `READ_OUTSIDE_PROJECT` — emitted when a focused read attempts to
  read outside the project or outside the allowed roots.

## 8. Repository State (multi-repo, scope_fingerprint)

The `repository-state` snapshot is taken **before** execution starts.
The contract supports one or more Git repositories, declared by the
project's `project-manifest.json`. Each per-repo entry has a
`fingerprint` (sha256 of `commit + branch + dirty_worktree + index_status`).
The composite `scope_fingerprint` is `sha256` of the ordered,
newline-joined per-repo fingerprints.

The `adapter_signature` is NOT computed here. It lives in
`retrieval-execution-plan.schema.json` as
`sha256(scope_fingerprint + strategy + provider + normalized_query_lower)`.

Runtime invariants:
- `repository_id`s must be unique.
- `repository_id`s must be ordered ascending.
- Each entry must have a `fingerprint`.
- `path` must be a POSIX-relative path (no leading `/`, no `\\`, no `..`).

## 9. Plan Contracts (two of them)

### v0.4.0 plan (base, permissive)

`retrieval-plan-base.schema.json` is the v0.4.0 plan shape. It is
permissive on `additionalProperties` so the v0.5.0 plan can compose
via `allOf`. v0.4.0 plan output validates against this only.

### v0.5.0 execution plan (strict)

`retrieval-execution-plan.schema.json` is the strict v0.5.0 contract.
Required fields: `schema_version`, `mode` (const `"execute"`),
`execution` (with required `estimated_calls`, `budget_enforcement`,
`progressive_disclosure`, `preflight`, `repositories_searched`),
`adapter_signature` (sha256 64 hex). `additionalProperties: false`.

## 10. Result Contract

The result includes:
- `mode: const "execute"`
- `plan: $ref retrieval-execution-plan`
- `repository_state: $ref repository-state`
- `logical_adapter_calls` (renamed from `call_count`)
- `call_budget` (max 3)
- `provider_process_invocations` (>= logical_adapter_calls)
- `fallback_count` (<= logical_adapter_calls)
- `raw_result_count`, `result_count` (= items.length), `result_budget`
- `char_count`, `char_budget`, `truncated`
- `cache_hits`, `deduped`, `cache_evictions`
- `focused_read_calls`, `focused_read_chars` (new; counted, never free)
- `repositories_searched`, `first_relevant_result_ms`
- `adapter_stdout_chars`, `normalized_chars`, `emitted_chars`
- `estimated_tokens_emitted`, `token_estimator_version`
- `items` — each item requires `id`, `kind`, `path`, `repository_id`,
  `line`, `column`, `preview`, `preview_token`, `score`, `source_provider`.
  `preview` may be `null`; `preview_token` is set when `preview` is null.
- `reason_codes`, `warnings`, `error`, `duration_ms`, `trace_id`

## 11. Trace and Metrics

The trace has `logical_calls`, `provider_processes`, and `focused_reads`.
A `logical_call` references `provider_processes` via `provider_process_ids`.
A focused read produces an entry in `focused_reads` with re-validated
`scope_fingerprint`, `allowed_root_check`, and `deny_glob_check`.

The metrics use the same fields plus `token_estimator_version`.

## 12. Security Preflight

- Deny globs: `.git/**`, `.env`, `.env.*`, `.secrets/**`, credentials,
  `application.properties`, manifest `protected_paths`.
- `CACHE_DISABLED_DIRTY_WORKTREE` when any repo has dirty worktree.
- Pre-call availability probe does NOT consume a call.
- At runtime, at most one reserved fallback call by default. Override
  with explicit `--MaxFallbacks 0` to reduce to a single call.
- Hard cap of 3 logical adapter calls.
- Windows path normalisation: backslashes → forward slashes.

## 13. Progressive Disclosure (stateless)

- `preview_token` is a continuation key.
- Stateless: the token is valid only within the same batch.
- Expansion revalidates `scope_fingerprint`, `allowed_root_check`,
  `deny_glob_check`.
- Always counted as `focused_read_calls` and `focused_read_chars`.

## 14. Adapter Catalogue

- `ripgrep`, `git_grep`, `filesystem` are the only executable providers.
- `ripgrep` invocation respects `.gitignore` and the deny globs (no
  `--no-ignore`).
- `filesystem` is the provider for the `knowledge` strategy.
- `lsp`, `codebase-memory`, `semantic` are plan-only.
- `knowledge` is a strategy, not a provider.

## 15. Equivalence Cache

- Signature: `sha256(scope_fingerprint + strategy + provider + normalized_query_lower)`.
- In-process. Never persisted.
- Disabled when any repository is dirty
  (`CACHE_DISABLED_DIRTY_WORKTREE`).
- Independent wrapper invocations do NOT share the cache.

## 16. CLI Surface

| Switch | Type | Default | Description |
|---|---|---|---|
| `-Mode` | `plan` \| `execute` | `plan` | execution mode |
| `-Execute` | switch | off | alias for `-Mode execute` |
| `-BatchInput` | string | off | JSON file or `-` for stdin (batch entry) |
| `-Plan` | switch | off | require inline plan in result |
| `-Metrics` | switch | off | emit metrics |
| `-WriteMetrics` | string | off | write metrics to path (restricted) |
| `-TracePath` | string | off | write trace to path (restricted) |
| `-WriteTrace` | string | off | alias for `-TracePath` (restricted) |
| `-NoCache` | switch | off | disable equivalence cache |
| `-MaxCalls` | integer | from policy | cap logical_adapter_calls (max 3) |
| `-MaxFallbacks` | integer | 1 | reserved fallback calls (0 to disable) |
| `-MaxResults` | integer | from policy | cap result items (max 50) |
| `-MaxChars` | integer | from policy | cap emitted chars (max 24000) |
| `-Expand` | string | off | preview_token for focused read |

The env var `OPENCODE_RETRIEVAL_MODE` is **not** supported. The
preflight rejects it.

### Path restriction (TracePath / WriteTrace / WriteMetrics)

Paths must be validated by `Resolve-Path` against the global runtime
roots and the project manifest's `allowed_read_roots`. The check
rejects:
- Paths inside the project (engine must never write to the project).
- Paths outside the global runtime.
- Paths that don't exist or that traverse `..`.

The `TRUSTED_TRACE_DIR` is the global runtime's `retrieval/` subdir.
Default: `$env:USERPROFILE/.config/opencode/retrieval/`.

Argument handling:
- `ArgumentList` arrays only. No `Invoke-Expression`. No string-built
  commands. The wrapper cannot detect how the parent process invoked it.

## 17. Batch Entry (`executeBatch(plans, options)`)

The batch entry lets multiple queries run in one process and share
the in-process equivalence cache. The CLI surface is `-BatchInput <json>`
or stdin JSON. The JSON shape:

```json
{
  "trace_id": "uuid",
  "scope": { "project_id": "qs-sell-fixture" },
  "plans": [
    { "query": "SellController.create", "intent": "exact" },
    { "query": "class SellService", "intent": "symbol" },
    { "query": "why does the qs/sell endpoint require authentication", "intent": "knowledge" }
  ],
  "options": { "no_cache": false, "max_calls": 3, "max_fallbacks": 1 }
}
```

The wrapper writes the batch result (array of results, or a single
combined result) to stdout. No new public command is introduced.

## 18. Exact Fallback (default)

In execute mode, the engine reserves **1 primary call + 1 fallback call**
by default. The hard cap of 3 logical calls still applies. The user
can override:
- `-MaxFallbacks 0` reduces to a single call.
- `-MaxFallbacks 2` reserves up to 2 fallback calls (assuming `MaxCalls`
  is high enough).

The project-owned policy is not modified. The plan-only v0.4.0
output is not modified.

## 19. Deterministic Token Estimator

The estimator is versioned `token_estimator_version: "token-estimator-v1"`.
The same estimator is used for baseline and result. The estimator
operates on `emitted_chars + focused_read_chars` and produces
`estimated_tokens_emitted` deterministically. The estimator is
deterministic, versioned, and a constant of the engine.

## 20. qs/sell Benchmark (CONTRACT/FIXTURE ONLY)

The current phase labels the benchmark as **contract/fixture**, NOT
**real executed**. The benchmark is a planning gate for the
contracts. The engine is not implemented yet.

- `tests/fixtures/qs-sell/` is a **synthetic** fixture with:
  - `SellController.java` (REST endpoint `qs/sell`).
  - `SellService.java`.
  - `Sell.java`, `SellDetail.java`.
  - `sell-rules/`: `adr/0001-qs-sell-auth.md`, `rule/sell-rules.md`.
- `tests/fixtures/qs-sell/project-manifest.json` is a valid
  `project-manifest.schema.json` with `repositories[].repository_id`
  and `repositories[].path` (relative POSIX).
- The benchmark scope is resolved from the manifest, not from
  hardcoded `REPO_IDS` constants.
- The benchmark creates deterministic git repos with fixed branch,
  author date, and committer date.
- The pilot baseline is **provisional / synthetic**. All numbers are
  `null` and labelled as such. The savings percentages are reserved
  for Phase 7 release gates.

The benchmark queries are derived from the qs/sell flow:
1. `SellController.create` → `exact`.
2. `class SellService` → `symbol`.
3. `why does the qs/sell endpoint require authentication` → `knowledge`.

Each query runs twice in the same batch to exercise the in-process
cache. The benchmark verifies the contracts; it does NOT measure savings.

## 21. Tests

### Unit tests (`tests/retrieval-execution-contracts.test.mjs`)

- Strict execution-plan: requires `mode`, `execution`, `adapter_signature`.
- v0.4.0 plan validates against the base; NOT against the strict execution-plan.
- Result references the strict execution-plan.
- All metric fields required (`token_estimator_version`,
  `focused_read_calls`, `focused_read_chars`, `provider_process_invocations`).
- Each item requires `repository_id`, `line`, `column`, `preview`,
  `preview_token`, `score`, `source_provider`.
- Repository state: unique, ordered `repository_id`, per-repo fingerprint
  required, POSIX-relative paths.
- Reason codes: $ref; arbitrary strings rejected.
- Cache hits only within the same batch (independent wrapper
  invocations do NOT share cache).
- CACHE_DISABLED_DIRTY_WORKTREE: dirty_worktree disables the cache.
- Trace path restriction: must be under the global runtime.
- Token estimator version required.
- Invariants: `logical_adapter_calls <= call_budget`,
  `fallback_count <= logical_adapter_calls`,
  `provider_process_invocations >= logical_adapter_calls`.

### Integration tests (`tests/integration/retrieval-execution.test.mjs`)

- End-to-end plan+execute on a sandbox repo.
- Adapter actually invokes `rg`/`git grep` with the correct args.
- Wrapper produces the full result JSON.
- Wrapper produces a trace JSON when `--TracePath` is set.
- Wrapper produces a metrics object when `--Metrics` is set.
- Wrapper refuses to run on the global OpenCode config dir.
- Two calls with the same signature produce `cache_hits == 1` (within one batch).
- Two calls in different processes produce `cache_hits == 0`.

### E2E test (`tests/integration/retrieval-execution-e2e.test.mjs`)

- The exact pipeline:

  ```powershell
  pwsh "$env:USERPROFILE\.config\opencode\scripts\retrieval-router.ps1" `
       -Query "SellController.create" `
       -ProjectRoot "C:\sandbox\qs-sell" `
       -Execute
  ```

- Plus the batch entry via `-BatchInput`.

### Benchmark contract (`tests/integration/benchmark-qs-sell.test.mjs`)

- Synthetic fixture is present.
- Manifest is valid.
- Scope is resolved from the manifest, not hardcoded.
- Pilot baseline is provisional / synthetic.
- Deterministic repos with fixed branch, dates.
- The benchmark does NOT measure savings.

## 22. AGENTS.global Rules (additive)

`global/protocols/AGENTS.global.md` gains:

- "Plan mode is the default. Use execute mode only when the
  orchestrator has explicitly opted in via `--Mode execute` or
  `--Execute`. The env var `OPENCODE_RETRIEVAL_MODE` is rejected."
- "The wrapper uses `ArgumentList` arrays. No `Invoke-Expression`.
  No string-built commands. The wrapper cannot detect how the parent
  process invoked it."
- "The equivalence cache is per-process. Independent wrapper
  invocations do NOT share the cache."
- "Adapter signature is computed in the execution plan, not in the
  repository state. The state carries the scope fingerprint."
- "Trace and metrics are opt-in and written outside the project under
  the global runtime's `retrieval/` directory."
- "ADR matching is case-insensitive (`adr` and `ADR` both match)."

## 23. Phases

| Phase | Scope | Output |
|---|---|---|
| **0. Planning** | this document, new contracts, CHANGELOG entry, PROGRESS entry, correction report | `V0.5.0_RETRIEVAL_EXECUTION_FINAL_PLANNING_APPROVAL_READY` |
| 1. Adapters | ripgrep, git_grep, filesystem adapters | `bin/retrieval/adapters/*.mjs` |
| 2. Engine | normalizer, equivalence, budget, metrics, preflight, repository-state, path-restrict, token estimator | `bin/retrieval/*.mjs` (except adapters) |
| 3. Router wiring | `executePlan`, `executeBatch` in `retrieval-router.mjs`, AJV validators generated | router additive code paths |
| 4. Wrapper | `scripts/retrieval-router.ps1` extended, AGENTS.global updated | wrapper additive switches |
| 5. Doctor/Certify | doctor + certify additions | new checks/phases |
| 6. Tests | unit + integration + E2E + benchmark | `tests/retrieval-execution-*.test.mjs`, `tests/integration/benchmark-qs-sell.test.mjs` |
| 7. Certify run | pilot telemetry captured (real), qs/sell passes | `V0.5.0_RETRIEVAL_EXECUTION_READY` |
| 8. Release | VERSION bump to 0.5.0, CHANGELOG finalized, PROGRESS advanced | tag |

The implementation wave begins only after Phase 0 is approved.

## 24. Acceptance Criteria

Phase 0 (final contract closure) is complete when **all** of the following hold:

- [x] `docs/RETRIEVAL_EXECUTION.md` exists.
- [x] `docs/V0.5.0_PLANNING_CORRECTION_REPORT.md` has a FINAL CONTRACT CLOSURE section.
- [x] `contracts/retrieval-plan-base.schema.json` exists, parses, and
  defines the v0.4.0 plan shape.
- [x] `contracts/retrieval-execution-reason-codes.schema.json` exists,
  parses, and is the frozen catalogue.
- [x] `contracts/retrieval-execution-plan.schema.json` is **strict** and
  requires `mode`, `execution`, `adapter_signature`.
- [x] `contracts/repository-state.schema.json` exists, parses, and
  supports multiple repositories with composite `scope_fingerprint`
  (no `adapter_signature`).
- [x] `contracts/retrieval-execution-result.schema.json` exists, parses,
  references the strict `retrieval-execution-plan`, and requires
  `token_estimator_version`, `focused_read_calls`, `focused_read_chars`,
  `provider_process_invocations`, `logical_adapter_calls`.
- [x] `contracts/retrieval-execution-trace.schema.json` exists, parses,
  separates logical calls from provider processes.
- [x] `contracts/retrieval-execution-metrics.schema.json` exists, parses,
  uses `token_estimator_version`.
- [x] `tests/retrieval-execution-contracts.test.mjs` exists and passes:
  all 73 contract tests.
- [x] `tests/fixtures/qs-sell/` is a synthetic fixture with
  `SellController`, `SellService`, `Sell`, `SellDetail`, `qs/sell`,
  valid `project-manifest.json`, and `pilot-baseline.json` with
  `provenance`, `measurement_method`, `source_trace`,
  `repository_fingerprints`, `token_estimator`, and `null` placeholder
  values reserved for Phase 7.
- [x] `tests/integration/benchmark-qs-sell.test.mjs` exists and
  passes the contract/fixture gate.
- [x] Scratches (`test-data-ref.mjs`, `test-unevaluated.mjs`,
  `retrieval-execution-contracts-sanity.mjs`) are removed / outside
  test discovery.
- [x] `CHANGELOG.md` records the final contract closure state under
  "Unreleased".
- [x] `PROGRESS.md` status is
  `V0.5.0_RETRIEVAL_EXECUTION_FINAL_PLANNING_APPROVAL_READY`.
- [x] `VERSION` is unchanged.
- [x] No adopted project has been modified.
- [x] No `execution` block is added to `global/retrieval/default-policy.json`.
- [x] No `OPENCODE_RETRIEVAL_MODE` env var is documented as supported.
- [x] `git diff --check` passes.
- [x] `pnpm validate` passes.
- [x] `pnpm test:unit` passes.
- [x] `pnpm test:integration` passes (security, contracts, router,
  benchmark-contract).

## 25. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Pilot telemetry not available | benchmark cannot measure savings | placeholder values; Phase 7 capture |
| Wrapper string-built commands creep back in | preflight blocks calls | CI test asserts forbidden patterns |
| Adapter chain returns more than 3 logical calls | budget broken | `logical_calls.length` is checked |
| Equivalent cache causes stale results across commits | wrong data | signature includes per-repo commit; disabled on dirty |
| Progressive disclosure leaks content | over-budget | revalidation at expansion; counted, never free |
| Independent wrapper invocations falsely report cache hits | wrong data | cache is strictly per-process; `CROSS_PROCESS_CACHE_HIT_DISALLOWED` |
| Trace path escapes global runtime | security | `Resolve-Path` validation; `TRUSTED_TRACE_DIR` |
| Token estimator drift between baseline and result | unmeasurable | `token_estimator_version` mandatory; same version both sides |

## 26. Decisions Closed

- D1 — v0.5.0 is opt-in via `--Mode execute` or `--Execute`.
- D2 — engine is a module under `bin/retrieval/`.
- D3 — adapters are first-party global.
- D4 — result/trace/metrics are separate contracts.
- D5 — `repository-state` is inline; carries `scope_fingerprint`, not `adapter_signature`.
- D6 — wrapper uses `ArgumentList` arrays; never `Invoke-Expression`.
- D7 — `HARD_CAPS` carry over from v0.4.0.
- D8 — progressive disclosure is stateless, limited to the same batch.
- D9 — semantic / lsp / codebase-memory stay plan-only.
- D10 — benchmark is contract/fixture, not "real executed".
- D11 — reason codes are versioned.
- D12 — Index freshness is per-repo.
- D13 — Cache is in-process, never persisted.
- D14 — `VERSION` is not bumped in Phase 0.
- D15 — Project-owned content is unchanged.
- D16 — `unevaluatedProperties: false` over `allOf` composition.
- D17 — `OPENCODE_RETRIEVAL_MODE` env var rejected.
- D18 — `--no-ignore` removed from ripgrep.
- D19 — Windows path normalisation.
- D20 — Pre-call availability probe does not consume a call.
- D21 — Wrapper cannot detect parent process invocation.
- D22 — `knowledge` is a strategy, not a provider.
- D23 — Result `mode` is `const: "execute"`.
- D24 — `result_count = items.length`; `raw_result_count` preserved separately.
- D25 — `summary.total_results == sum(run.result_count)`.
- D26 — `CACHE_DISABLED_DIRTY_WORKTREE` is a metric/event.
- D27 — ADR matching is case-insensitive.
- D28 — Architecture remains plan-only.
- D29 — `logical_adapter_calls` is renamed from `call_count`.
- D30 — `provider_process_invocations` is separate from `logical_adapter_calls`.
- D31 — Equivalence cache is disabled when any repo is dirty.
- D32 — `adapter_signature` is computed in the execution plan, not in the repository state.
- D33 — `executeBatch(plans, options)` is the batch entry.
- D34 — Progressive disclosure is stateless; expansion revalidates.
- D35 — Trace/write paths are restricted via `Resolve-Path`.
- D36 — `token_estimator_version` is mandatory and versioned.
- D37 — qs/sell fixture is synthetic and labelled.
- D38 — Pilot baseline is provisional; savings percentages are reserved for Phase 7.
- D39 — `project-manifest.json` is a valid `project-manifest.schema.json`.
- D40 — Benchmark scope is resolved from the manifest, not from hardcoded `REPO_IDS`.

## 27. Pending Decisions

| ID | Question | Owner | Decision date |
|---|---|---|---|

All decisions are CLOSED for v0.5.0. See §26.

## 28. See Also

- `docs/RETRIEVAL.md` — v0.4.0 retrieval foundation.
- `docs/RELEASES.md` — release history.
- `docs/ARCHITECTURE.md` — four-layer model.
- `docs/SECURITY.md` — security guidelines.
- `docs/V0.5.0_PLANNING_CORRECTION_REPORT.md` — correction report.
- `global/protocols/AGENTS.global.md` — runtime rules (extended).
- `bin/retrieval/retrieval-router.mjs` — router (extended in Phase 3).
- `scripts/retrieval-router.ps1` — wrapper (extended in Phase 4).
- `contracts/retrieval-policy.schema.json` — v0.4.0 policy (unchanged).
- `contracts/retrieval-index-state.schema.json` — v0.4.0 index-state (unchanged).
- `tests/retrieval-router.test.mjs` — v0.4.0 router tests (unchanged).
- `tests/integration/retrieval-*.test.mjs` — v0.4.0 integration (new files added).
- `tests/fixtures/qs-sell/` — synthetic qs/sell fixture.
- `tests/integration/benchmark-qs-sell.test.mjs` — synthetic benchmark contract/fixture.
