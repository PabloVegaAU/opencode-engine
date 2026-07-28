# OpenCode Global

Neutral, portable OpenCode configuration for use across multiple computers and projects.

## Overview

OpenCode Global provides:
- Neutral security defaults and permissions
- Certified profile configurations (GO, CHATGPT-PLUS, MIX, MINIMAX-PLUS)
- Model routing matrix with per-role assignments
- Lifecycle scripts (install, update, doctor, certify)
- Project initialization templates
- Contract schemas for validation

## Requirements

| Component | Level | Usage |
|-----------|-------|-------|
| Git | Required | Repository, HEAD, state; fallback for `git grep` |
| Node.js | Required | Retrieval router runtime |
| PowerShell 7+ | Required | Install, update, init, doctor, certify scripts |
| OpenCode | Required | Runtime |
| ripgrep (`rg`) | Optional recommended | Faster exact search |
| Codebase Memory | Optional | Structural dependency graph |
| LSP | Optional language-dependent | Symbols and references |

## Quick Start

```powershell
# Clone this repository
git clone <repo>/opencode-engine.git C:\OpenCode\opencode-engine

# Install (includes doctor + certify verification)
cd C:\OpenCode\opencode-engine
pwsh .\scripts\install-opencode-global.ps1

# Authenticate
opencode providers login
```

### Install Options

| Command | Behavior |
|---------|----------|
| `.\install-opencode-global.ps1` | Full install + doctor + certify |
| `.\install-opencode-global.ps1 -Quick` | Files only, no verification |
| `.\install-opencode-global.ps1 -SkipCertify` | Install + doctor, skip certify |

### Updating

```powershell
# Full update with verification
pwsh .\scripts\update-opencode-global.ps1

# Quick update
pwsh .\scripts\update-opencode-global.ps1 -Quick
```

## Usage with Projects

```powershell
# Initialize a project
pwsh .\scripts\init-opencode-project.ps1 C:\my-project -IncludeIntelligence -IncludeContracts

# Launch with profile
pwsh .\scripts\opencode-launcher.ps1 -Profile go -TargetDir C:\my-project
```

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for details.

## Profiles

| Profile | Primary Model |
|---------|---------------|
| GO | opencode-go/qwen3.7-plus |
| CHATGPT-PLUS | openai/gpt-5.6-terra |
| MIX | Hybrid routing (GO + ChatGPT) |
| MINIMAX-PLUS | minimax/MiniMax-M2.7 |

See [docs/PROFILES.md](docs/PROFILES.md) for details.

## Retrieval Foundation

Retrieval is **disabled by default**. To enable per-project:

```powershell
pwsh .\scripts\init-opencode-project.ps1 C:\my-project -IncludeRetrievalPolicy
```

### Plan-Only Router

The retrieval router (`bin/retrieval/retrieval-router.mjs`) is **plan-only** — it does not execute tools or modify files. It returns a deterministic JSON plan specifying:
- Strategy (exact, symbol, architecture, semantic, knowledge)
- Provider (ripgrep, lsp, codebase-memory, filesystem)
- Budget constraints (max_tool_calls, max_chars, timeout_ms)
- Fallback chain if primary provider unavailable

### Flow: Source → Runtime → Project

```
Source (C:\OpenCode\opencode-global-src)
    │
    ▼ install-opencode-global.ps1
Runtime (~/.config/opencode)
    │
    ▼ init-opencode-project.ps1 -IncludeRetrievalPolicy
Project (.ai-env/retrieval-policy.json)
    │
    ▼ retrieval-router.ps1 -Query "..." -ProjectRoot C:\my-project
Plan (JSON)
```

The router resolves schemas and validators via `import.meta.url` (standalone AJV validators in `bin/retrieval/`). No runtime source dependencies, no `node_modules` from source.

### Intent Ladder

| Intent | Use When |
|--------|----------|
| `exact` | Variable names, file paths, exact text |
| `symbol` | Definitions, references, symbol lookup |
| `architecture` | Dependencies, impact analysis |
| `semantic` | Ambiguous concepts (requires explicit enable) |
| `knowledge` | ADRs, decisions, documentation |
| `auto` | Classified from query text |

### Provider Availability

| Provider | Status | Description |
|----------|--------|-------------|
| `ripgrep` | Optional recommended | Fast exact text search; falls back to `git grep` |
| `git grep` | Required fallback | Used when ripgrep unavailable in Git repos |
| `lsp` | Optional | Symbol and reference lookup |
| `codebase-memory` | Optional | Structural index for dependency analysis |
| `semantic` | Disabled by default | Semantic search when explicitly enabled |
| `filesystem` | Always available | Knowledge paths only |

**Retrieval Foundation does not install external tools.**

If ripgrep is available, it is used as the primary exact provider.
If ripgrep is unavailable and the project is a Git repository, `git grep` is used as the supported fallback.
If neither ripgrep nor `git grep` is available, exact retrieval reports `NO_RETRIEVAL_PROVIDER`.

### Retrieval Execution (v0.5.0, opt-in)

**Plan-only is the default compatible behavior.** The wrapper also supports opt-in execution and batch modes via the PowerShell wrapper.

#### Requirements

| Component | Level | Usage |
|-----------|-------|-------|
| Node.js 18+ | Required | Execution engine, adapter processes |
| Git | Required | Repository state, index freshness, `git grep` fallback |
| ripgrep | Optional | Primary exact-text provider (recommended for speed) |
| PowerShell 7+ | Required | Wrapper script (`scripts/retrieval-router.ps1`) |

#### Minimal Examples

```powershell
# Plan-only (default, compatible)
pwsh scripts/retrieval-router.ps1 -Query "LoginRequest" -ProjectRoot "C:\my-project" -Intent exact

# Execute single query (opt-in)
pwsh scripts/retrieval-router.ps1 -Query "LoginRequest" -ProjectRoot "C:\my-project" -Intent exact -Execute

# Batch execution (opt-in)
# batch-input.json: { "plans": [ { "query": "...", "intent": "exact", "project_root": "C:\my-project" } ] }
pwsh scripts/retrieval-router.ps1 -BatchInput "batch-input.json" -ProjectRoot "C:\my-project"
```

Execution mode returns a JSON envelope with `result`, `trace`, and `metrics`. Batch mode returns a single envelope with a `results` array. All responses validate against the corresponding AJV contract schemas in `contracts/`.

#### Security

- The wrapper uses `ProcessStartInfo.ArgumentList` (secure, no shell injection).
- Write paths (trace, metrics) are restricted via `Resolve-Path` to trusted directories.
- No file system modifications are performed outside the wrapper.
- Provider processes run with the same user identity, standard I/O only.
- Session-level metrics carry no proprietary content; research evidence is sanitised.

#### Trace and Metrics

Execution produces two artifacts when requested:

- **Trace** (`-TracePath`): sequential event log with phases (preflight, repository_state, adapter, normalize, cache, metrics) and reason codes.
- **Metrics** (`-WriteMetrics`): session-level JSON envelope with per-run fields (`logical_adapter_calls`, `fallback_count`, `focused_read_calls`, `duration_ms`, `reason_codes`) and a `summary` block.

Both are validated against canonical AJV schemas at write time. Rejected envelopes are not written.

#### Flow: Source → Runtime → Projects

```
Source (opencode-global-src)
    │ install-opencode-global.ps1
    ▼
Runtime (~/.config/opencode)
    │ init-opencode-project.ps1 -IncludeRetrievalPolicy
    ▼
Project (.ai-env/retrieval-policy.json)
    │ retrieval-router.ps1 -Query "..." -ProjectRoot "C:\my-project" [-Execute]
    ▼
Execution Result (JSON envelope: result + trace + metrics)
```

#### Deliverables (v0.5.0)

| Artifact | Description |
|----------|-------------|
| `contracts/retrieval-plan-base.schema.json` | v0.4.0 router output schema |
| `contracts/retrieval-execution-plan.schema.json` | v0.5.0 execution plan (extends base) |
| `contracts/retrieval-execution-result.schema.json` | Execution result schema |
| `contracts/retrieval-execution-trace.schema.json` | Execution trace schema |
| `contracts/retrieval-execution-metrics.schema.json` | Session-level metrics envelope |
| `contracts/retrieval-execution-reason-codes.schema.json` | Frozen reason code catalogue |
| `contracts/repository-state.schema.json` | Multi-repo state with scope fingerprint |
| `bin/retrieval/execution-engine.mjs` | Core `executePlan()` with budgets, cache, fallback, progressive disclosure |
| `bin/retrieval/execute-batch.mjs` | `executeBatch()` with shared cache, deterministic ordering |
| `bin/retrieval/adapters/ripgrep.mjs` | ripgrep adapter (primary for exact) |
| `bin/retrieval/adapters/git-grep.mjs` | git grep adapter (fallback) |
| `bin/retrieval/adapters/filesystem.mjs` | Filesystem adapter (knowledge paths) |
| `bin/retrieval/retrieval-entry.mjs` | Entry point for wrapper invocation |
| `bin/retrieval/retrieval-doctor.mjs` | Retrieval diagnostics module |
| `bin/retrieval/budget.mjs` | Budget enforcement with HARD_CAPS |
| `bin/retrieval/equivalence.mjs` | In-process equivalence cache |
| `bin/retrieval/metrics.mjs` | Metrics recording |
| `bin/retrieval/normalize.mjs` | Result normalisation and deduplication |
| `bin/retrieval/path-restrict.mjs` | Path restriction utilities |
| `bin/retrieval/preflight.mjs` | Preflight checks (allowed roots, deny globs) |
| `bin/retrieval/reason-codes.mjs` | Versioned reason code catalogue |
| `bin/retrieval/repository-state.mjs` | Multi-repo state capture with fingerprints |
| `bin/retrieval/token-estimator-v1.mjs` | Deterministic token estimator |
| `bin/retrieval/contract-validation.mjs` | AJV-based validation for all execution contracts |
| `scripts/retrieval-router.ps1` | PowerShell wrapper (plan, execute, batch) |
| `scripts/run-retrieval-real-pilot.mjs` | Reproducible real-source pilot runner |
| `scripts/discover-real-query-set.mjs` | Deterministic query discovery |
| `scripts/generate-retrieval-validators.mjs` | Canonical AJV validator generator |
| `tests/retrieval-execution-contracts.test.mjs` | 73 contract validation gates |
| `tests/retrieval-adapters.test.mjs` | 30 adapter tests |
| `tests/retrieval-engine.test.mjs` | 53 engine tests |
| `tests/retrieval-doctor.test.mjs` | 76 doctor tests (23 suites) |
| `tests/retrieval-wrapper.test.mjs` | Wrapper execution tests |
| `tests/retrieval-router-execution.test.mjs` | Routing + execution integration |
| `tests/equivalence-null-cache.test.mjs` | Null cache regression (4 tests) |
| `tests/integration/benchmark-qs-sell.test.mjs` | Synthetic benchmark (15 tests, RESERVED) |
| `tests/integration/retrieval-real-pilot-gates.test.mjs` | Real pilot gates (10 tests) |
| `tests/fixtures/qs-sell/` | Synthetic sell-flow fixture |
| `scripts/doctor-opencode-global.ps1` | 21 checks, tier OPTIMAL, `retrieval_execution_ready` |
| `scripts/certify-opencode-global.ps1` | 8 v0.5.0 gates, sandbox-clean |

## Security

Never commit credentials, tokens, or secrets. See [docs/SECURITY.md](docs/SECURITY.md).

## License

MIT
