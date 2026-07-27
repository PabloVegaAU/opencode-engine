## Authority

- Authority comes from the explicit user request, effective project rules, and current task constraints.
- OpenCode may analyze, make operational decisions, plan, delegate, implement, test, and report within authorized scope.
- When a material decision changes scope, safety, irreversible architecture, or user data, request a user decision or stop only the affected part.

## Documentation

- For current library, SDK, API, CLI, or service documentation, use the documentation capability available in the current session or project.
- Context7 may be used when it is actually configured and available.
- Do not assume that Context7, Playwright, Codebase Memory, or any other MCP is globally available.
- Do not declare any specific MCP mandatory.

## Native Orchestration

- For simple tasks, the primary agent works directly.
- For complex divisible tasks, identify independent subtasks first.
- Emit independent `Task` calls in the same turn when possible.
- Do not duplicate work that has already been delegated.
- Use a previous `task_id` when the intent is to continue the same child session.
- Keep foreground execution as the stable behavior.
- Do not use background execution or enable `OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS` without an explicit user instruction or project-approved rule.
- Do not assume custom project agents exist.
- Discover available agents before relying on them.
- The installed runtime is expected to expose native agents such as `build`, `plan`, `general`, and `explore`, but actual behavior must be verified against the running version.

## Agent Modes

The official OpenCode agent modes are:
- **primary** — main interactive agent
- **subagent** — delegated task agent
- **all** — all agents active

No other mode values are valid. The launcher validates all discovered agent modes against these three values and rejects invalid modes before launching.

## Writes And Concurrency

- Read-only agents must not write.
- Independent investigations may run concurrently.
- Never assign concurrent writers to the same file or namespace.
- Use a single responsible writer for each related file set.
- The primary agent collects and synthesizes results without repeating the investigation.

## Local Layers

- Sessions and child tasks are native OpenCode runtime state.
- `working/` is optional, temporary, and is not a scheduler or source of truth.
- No subagent is required to write into `working/`.
- `.intelligence/` stores only durable, verified knowledge owned by each project.
- There is no automatic promotion into `.intelligence/`.
- Any promotion requires an explicit user instruction or project-approved governance rule.
- Global owns only neutral runtime defaults, schemas, validators, profiles, routing, and bootstrap tooling.
- Each project owns its agents, MCP, skills, prompts, specialized permissions, Speckit, technologies, and `.intelligence/` content.

## Project Lifecycle

- `/init` is the official OpenCode command for creating or improving the local `AGENTS.md`.
- `/init-ai-env` initializes neutral runtime artifacts; retrieval policy is optional and only added when explicitly requested.
- `/doctor-ai-env` diagnoses project AI environment health.
- `/update-ai-env` provides read-only diagnostics and planning.
- The bootstrap never creates custom agent files, MCP configurations, skills, or project topology.
- Project ownership rules determine what belongs to the project vs. global.

## Public Cross-Session Commands

- OpenCode is the only compatible executor for `Mission Spec v1` records.
- The public CLI is `bin/orchestration/cross-session-cli.mjs`; the PowerShell wrapper is `scripts/cross-session.ps1`; the global command is `commands/cross-session.md`.
- Supported subcommands: `doctor`, `mission-create`, `mission-status`, `task-plan`, `task-run`, `integration-preflight`, `integration-apply`, `recovery-plan`, `recovery-apply`, `mission-run`.
- Model, agent, and variant arrive through runtime arguments only. The Project Manifest and Mission Spec never store them.
- The CLI never pushes, fetches, merges to `main`, or touches remotes. `mission-run` and `integration-apply` require `--approve-local-integration` to apply local integration.
- `mission-run` stops at conflict, failed, interrupted, blocked, or recovery_required and runs at most one writer Task at a time.

## Retrieval Policy

OpenCode Global v0.5.0 provides deterministic retrieval routing via `bin/retrieval/retrieval-router.mjs`. Retrieval is **opt-in per project** — a project without `.ai-env/retrieval-policy.json` is not adopted and the router returns `enabled:false` with reason `PROJECT_NOT_ADOPTED`.

### Do Not Assume Ripgrep Is Installed

Do not assume `ripgrep` is installed.

For exact retrieval:
1. Use ripgrep when explicitly detected as available.
2. Otherwise use `git grep` when the repository is managed by Git.
3. If neither provider is available, report `NO_RETRIEVAL_PROVIDER`.

The absence of ripgrep alone is not an error when `git grep` is available.

Do not:
- Invent that `rg` always exists
- Attempt to install ripgrep automatically
- Use Codebase Memory for simple text search
- Treat an optional optimization as a requirement

### When to Call the Router

- **Simple identifiers** (variable names, function names, file paths): do NOT call the router; use ripgrep or git grep directly.
- **Complex queries** (impact analysis, symbol lookup, knowledge questions): call the router for adopted projects.
- **Non-adopted projects**: treat as read-only, use ripgrep or git grep for identifiers only.

### Intent Ladder

Explicit intent: `exact | symbol | architecture | semantic | knowledge | auto`

| Intent | Query Type | Primary Provider | Fallback |
|--------|-----------|------------------|----------|
| `exact` | Identifiers, exact text | ripgrep (if available) | git grep |
| `symbol` | Definitions, references | lsp | codebase-memory → ripgrep → git grep |
| `architecture` | Dependencies, impact | codebase-memory | lsp → ripgrep → git grep |
| `semantic` | Ambiguous concepts | semantic (if enabled) | codebase-memory → ripgrep → git grep |
| `knowledge` | Decisions, ADRs, rules | filesystem (restricted paths) | ripgrep → git grep |

### Progressive Disclosure

1. Return **names, paths, relations** first.
2. Full content only **on demand**.
3. Never preload files for simple identifier lookups.
4. Never query the code graph for plain identifiers.

### Codebase Memory Is Structural, Not Universal Memory

Codebase Memory provides a **structural index** of code elements and their relationships. It is not a universal memory or embedding store. Use it for:
- Dependency graphs
- Call chains
- Impact analysis

Do NOT use it as a general-purpose memory or for semantic search without explicit intent.

### Provider States

Each provider reports: `available`, `unknown`, `not_installed`, `not_applicable`

```
ripgrep         → available (if rg found in PATH), not_installed (otherwise)
git_grep        → available (if Git repo), not_applicable (if not a Git repo)
lsp             → available (if LSP server configured)
codebase-memory → available (if project adopted and indexed)
semantic        → disabled by default
filesystem      → always available (for knowledge paths only)
```

### Knowledge Paths (restricted)

When intent=`knowledge`, the router plans searches only in:
- `AGENTS.md`, `.ai-env/**`, `docs/**`, `specs/**`
- ADR directories, Speckit artifacts
- `README*`, `CHANGELOG*`, `PROGRESS.md`
- `MIGRATION_CONTROL*`, `HANDOFF_NEXT_RUN*`

### Index Freshness

```
FRESH          → index_commit == git HEAD
STALE_INDEX    → index_commit != git HEAD (known)
UNKNOWN        → index state cannot be determined
NOT_INDEXED    → no index present
NOT_APPLICABLE → no git or not a code project
```

When `dirty_worktree=true` and strategy=`architecture`, verify results with LSP or ripgrep.

### Budget Hard Caps

```
max_tool_calls: 3
max_chars: 24000
timeout_ms: 5000
```

### Agent Defaults

```
orchestrator: router (adopted projects), ripgrep (all)
explorer: ripgrep, lsp, codebase-memory (if indexed)
dev: ripgrep, lsp, codebase-memory (if indexed), semantic only if enabled
qa: ripgrep, lsp
researcher: ripgrep, filesystem knowledge only
```
