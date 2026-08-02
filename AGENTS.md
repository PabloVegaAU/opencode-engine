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
- The installed runtime exposes native agents: `orchestrator` (primary), `explorer` (investigation), `dev` (implementation), and `qa` (verification).
- Agent selection rule: Use `orchestrator` for coordination, `explorer` for read-only analysis, `dev` for code changes, and `qa` for testing. Actual behavior must be verified against the running version.

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

## Real Bootstrap

- `/init` is the official OpenCode command for creating or improving the local `AGENTS.md`.
- `/init-ai-env`, `/doctor-ai-env`, `/update-ai-env` are the project lifecycle commands.
- The bootstrap does not create agents, MCP, skills, technologies, or project topology.

## Public Cross-Session Commands

- OpenCode is the only compatible executor for `Mission Spec v1` records.
- The CLI is distributed via opencode-global at `bin/orchestration/cross-session-cli.mjs`, synced to runtime and AI environments.
- Two entry points: `scripts/cross-session.ps1` (PowerShell) and `scripts/cross-session.bat` (Unix-style `--flag value`).
- Supported subcommands: `doctor`, `mission-create`, `mission-status`, `task-plan`, `task-run`, `integration-preflight`, `integration-apply`, `recovery-plan`, `recovery-apply`, `mission-run`, `mission-loop`.
- Model, agent, and variant arrive through runtime arguments only. The Project Manifest and Mission Spec never store them.
- The CLI never pushes, fetches, merges to `main`, or touches remotes. `integration-apply` requires `--approve-local-integration`.
- `mission-run` stops at conflict, failed, interrupted, blocked, or recovery_required and runs at most one writer Task at a time.

## v0.6.0 Capabilities

### Skill Allowlist

The following skills are available and approved for use:

| Skill | Purpose |
|-------|---------|
| `accessibility-a11y` | Web accessibility (WCAG) implementation |
| `codebase-memory` | Structural code queries via knowledge graph |
| `context7-mcp` | Library/framework documentation retrieval |
| `customize-opencode` | OpenCode configuration editing |
| `find-docs` | Developer technology documentation |
| `find-skills` | Skill discovery and installation |
| `performance-and-web-vitals` | Lighthouse auditing, Core Web Vitals optimization |
| `prompt-master` | AI prompt generation and optimization |
| `skill-creator` | Create, edit, and benchmark skills |
| `speckit-analyze` | Cross-artifact consistency analysis |
| `speckit-checklist` | Requirements quality validation |
| `speckit-clarify` | Feature specification clarification |
| `speckit-converge` | Codebase vs spec reconciliation |
| `speckit-constitution` | Project constitution management |
| `speckit-implement` | Execute implementation plan |
| `speckit-plan` | Generate design artifacts |
| `speckit-specify` | Create feature specifications |
| `speckit-tasks` | Generate dependency-ordered tasks |
| `speckit-taskstoissues` | Convert tasks to GitHub issues |

### Ownership Classification

OpenCode supports automatic ownership classification of project content:

- **Global**: Neutral runtime defaults, schemas, validators, profiles, routing, and bootstrap tooling owned by the global layer.
- **Project**: Agents, MCP, skills, prompts, specialized permissions, Speckit, technologies, and `.intelligence/` content owned by each project.
- **User**: User-provided content, custom configurations, and personal settings.
- **System**: Built-in capabilities, core runtime features, and platform defaults.

Classification determines:
- Who may modify or extend the content
- Where changes should be persisted
- How conflicts are resolved
- What permissions are required for access
