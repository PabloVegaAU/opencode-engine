# Retrieval Foundation

Deterministic, plan-only retrieval strategy selector for OpenCode Global v0.4.0.

## Overview

Retrieval Foundation provides **plan-only** retrieval routing. The router (`bin/retrieval/retrieval-router.mjs`) does NOT execute tools or modify files. It returns a deterministic JSON plan specifying strategy, provider, and budget constraints.

**Retrieval is disabled by default.** Projects must be explicitly adopted via `-IncludeRetrievalPolicy` during init.

## Flow: Source → Runtime → Project

```
Source (distribution)
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

The router resolves schemas and validators via `import.meta.url` (standalone AJV validators in `bin/retrieval/`).

## Intent Ladder

| Intent | Query Type | Primary Provider | Fallback |
|--------|-----------|-----------------|----------|
| `exact` | Identifiers, exact text | ripgrep | git grep |
| `symbol` | Definitions, references | lsp | codebase-memory → ripgrep → git grep |
| `architecture` | Dependencies, impact | codebase-memory | lsp → ripgrep → git grep |
| `semantic` | Ambiguous concepts | semantic (if enabled) | codebase-memory → ripgrep → git grep |
| `knowledge` | Decisions, ADRs, rules | filesystem | ripgrep → git grep |

## Provider States

Each provider reports one of these states:

| State | Meaning |
|-------|---------|
| `available` | Provider is installed and can be used |
| `unknown` | Cannot verify provider availability |
| `not_installed` | Provider is not installed |
| `not_applicable` | Provider cannot be used in this context |

### Provider Availability Matrix

| Provider | Available When |
|----------|---------------|
| `ripgrep` | `rg` command found in PATH |
| `git grep` | Project is a Git repository |
| `lsp` | LSP server configured for project language |
| `codebase-memory` | Project is adopted (has `retrieval-index-state.json`) |
| `semantic` | Explicitly enabled in policy (disabled by default) |
| `filesystem` | Always available for knowledge paths |

## Exact Retrieval Rules

Git is required. Ripgrep is an optional recommended acceleration.

**When `rg` is available:** Use ripgrep for exact retrieval.

**When `rg` is unavailable but Git is available:** Use `git grep` as the supported fallback.

**When neither `rg` nor Git is available:** Exact retrieval reports `NO_RETRIEVAL_PROVIDER`. This is not an error — it is the expected state for projects outside Git repositories on systems without ripgrep.

## Knowledge Paths (Restricted)

When intent=`knowledge`, the router plans searches only in:

- `AGENTS.md`, `.ai-env/**`
- `docs/**`, `specs/**`
- ADR directories (`**/adr/**`, `**/ADR/**`)
- `.intelligence/**`
- `README*`, `CHANGELOG*`, `PROGRESS.md`
- `MIGRATION_CONTROL*`, `HANDOFF_NEXT_RUN*`

## Budgets

Hard caps apply to all strategies:

| Strategy | max_tool_calls | max_chars | timeout_ms |
|----------|---------------|-----------|------------|
| exact | 1 | 12,000 | 5,000 |
| symbol | 2 | 16,000 | 5,000 |
| architecture | 2 | 20,000 | 5,000 |
| semantic | 2 | 16,000 | 5,000 |
| knowledge | 2 | 16,000 | 5,000 |

## Index State

| State | Condition |
|-------|-----------|
| `FRESH` | `indexed_commit == git HEAD` |
| `STALE_INDEX` | `indexed_commit != git HEAD` (known) |
| `UNKNOWN` | Cannot determine index state |
| `NOT_INDEXED` | No index present |
| `NOT_APPLICABLE` | Not a Git repository |

When `dirty_worktree=true` and strategy=`architecture`, verify results with LSP or ripgrep.

## Progressive Disclosure

1. Return **names, paths, relations** first.
2. Full content only **on demand**.
3. Never preload files for simple identifier lookups.
4. Never query the code graph for plain identifiers.

## Codebase Memory

Codebase Memory provides a **structural index** of code elements and their relationships. It is not a universal memory or embedding store.

Use it for:
- Dependency graphs
- Call chains
- Impact analysis

Do NOT use it as a general-purpose memory or for semantic search without explicit intent.

## Optional Tool Installation

### ripgrep

| System | Installation |
|--------|-------------|
| Windows | `winget install --id BurntSushi.ripgrep.MSVC --exact` |
| macOS with Homebrew | `brew install ripgrep` |
| Linux | Distribution package manager |

See [ripgrep documentation](https://github.com/BurntSushi/ripgrep) for details.

## Agent Defaults

| Agent | Retrieval Approach |
|-------|-------------------|
| orchestrator | router (adopted projects), ripgrep (all) |
| explorer | ripgrep, lsp, codebase-memory (if indexed) |
| dev | ripgrep, lsp, codebase-memory (if indexed), semantic only if enabled |
| qa | ripgrep, lsp |
| researcher | ripgrep, filesystem knowledge only |

## Adoption

Retrieval is **opt-in per project**. A project without `.ai-env/retrieval-policy.json` is not adopted and the router returns `enabled:false` with reason `PROJECT_NOT_ADOPTED`.

To adopt a project:

```powershell
pwsh .\scripts\init-opencode-project.ps1 C:\my-project -IncludeRetrievalPolicy
```

## Platform Certification

| Platform | Certified |
|----------|-----------|
| Windows | Yes (v0.4.0) |
| macOS | Designed, pending certification |
| Linux | Designed, pending certification |

Portable PowerShell scripts use `$IsWindows`, `$IsMacOS`, `$IsLinux` for platform detection. The runtime follows XDG Base Directory Specification (`$env:XDG_CONFIG_HOME` or `~/.config/opencode`).

## See Also

- [AGENTS.global.md](../global/protocols/AGENTS.global.md) — Agent behavior rules
- [retrieval-router.ps1](../scripts/retrieval-router.ps1) — CLI wrapper
- [retrieval-router.mjs](../bin/retrieval/retrieval-router.mjs) — Router implementation
