# OpenCode Global - Complete Technology Inventory

**Version:** v0.6.0
**Source:** `C:\OpenCode\opencode-global-src`
**Runtime:** `C:\Users\VegaValverde\.config\opencode`
**Last Updated:** 2026-07-29

---

## Table of Contents

1. [Version History](#version-history)
2. [Runtime Structure](#runtime-structure)
3. [Model Profiles System](#model-profiles-system)
4. [Model Routing Matrix](#model-routing-matrix)
5. [Retrieval Execution Engine](#retrieval-execution-engine)
6. [Ownership Update Engine](#ownership-update-engine)
7. [Orchestration & Cross-Session](#orchestration--cross-session)
8. [Lifecycle Scripts](#lifecycle-scripts)
9. [Commands](#commands)
10. [Contracts (JSON Schemas)](#contracts-json-schemas)
11. [Skills](#skills)
12. [Caching & Performance](#caching--performance)
13. [Package Manager (pnpm)](#package-manager-pnpm)
14. [Security Model](#security-model)
15. [Distribution](#distribution)
16. [Multi-Agent Orchestration (Official)](#multi-agent-orchestration-official)
17. [Runtime Audit Summary](#runtime-audit-summary)

---

## Version History

| Version | Release Date | Feature Set |
|---------|--------------|-------------|
| v0.3.1 | 2026-07-24 | Initial release |
| v0.4.0 | 2026-07-25 | Retrieval Foundation |
| v0.5.0 | 2026-07-26 | Retrieval Execution + Real Pilot |
| v0.5.1 | 2026-07-27 | Stabilization & Governance |
| v0.6.0 | 2026-07-27 | Ownership Engine Phase 1 |

---

## Runtime Structure

### Canonical Directory Layout

```
C:\Users\VegaValverde\.config\opencode\
├── .agents/                  # Project agents (not distributed)
├── .codex/                   # Codex specific
├── .intelligence/            # Project knowledge (not distributed)
├── .opencode/                # Project OpenCode state
├── .specify/                 # Speckit workspace
├── backups/                  # Legacy backups
├── bin/                      # Executable modules
│   ├── retrieval/            # Retrieval execution engine
│   │   └── adapters/         # Provider adapters
│   └── updates/              # Ownership update engine
├── commands/                 # Public command definitions (11 commands)
├── contracts/                # JSON schema contracts (26 schemas)
├── distribution/             # Distribution manifest + resolver
├── fixtures/                 # Test fixtures
├── node_modules/             # Dependencies
├── opencode.backups/         # OpenCode backups
├── opencode.profiles/        # Profile overlays (4 profiles)
├── releases/                 # Release records
├── routing/                  # Model routing matrix (copied from profiles)
├── runtime/                  # Runtime backups
├── scripts/                  # Lifecycle scripts (14 scripts)
├── skills/                   # Skill registry
└── templates/                # Project templates
```

### Key Observations

| Issue | Status | Action |
|-------|--------|--------|
| `retrieval/` directory | Removed | Duplicate of `bin/retrieval/` |
| `routing/` directory | Official | Required by launcher (model-matrix.json) |
| `bin/environment/` | Removed | Not in official distribution |
| `bin/orchestration/` | Official | Cross-session CLI |
| `.bak` backup files | Cleaned | 52+ files removed from active directories |
| Legacy backups | Preserved | Located in `backups/`, `opencode.backups/`, `runtime/` |

---

## Model Profiles System

### Available Profiles

| Profile | Primary Model | Small Model | Use Case |
|---------|---------------|-------------|----------|
| **GO** | `opencode-go/qwen3.7-plus` | `opencode-go/deepseek-v4-flash` | General operations |
| **CHATGPT-PLUS** | `openai/gpt-5.6-terra` | `openai/gpt-5.4-mini` | High-capability tasks |
| **MIX** | `opencode-go/qwen3.7-plus` + `openai/gpt-5.6-terra` | hybrid | Balanced hybrid |
| **MINIMAX-PLUS** | `minimax/MiniMax-M2.7` | `minimax/MiniMax-M2.7` | Minimax subscription |

### Profile Files Location
- **Source:** `global/opencode.profiles/`
- **Runtime:** `~/.config/opencode/opencode.profiles/`
- **Overlay Files:** `*.jsonc` (minimal config)
- **Matrix File:** `model-matrix.json` (full routing)
- **Schema:** `model-matrix.schema.json`

### Profile Overlay Structure
```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "model": "provider/model-name",
  "small_model": "provider/model-name"
}
```

---

## Model Routing Matrix

### Per-Role Assignments

| Role | GO | CHATGPT-PLUS | MIX | MINIMAX-PLUS |
|------|----|--------------|-----|--------------|
| **orchestrator** | qwen3.7-plus | gpt-5.6-terra (medium) | qwen3.7-plus | MiniMax-M2.7 |
| **explorer** | deepseek-v4-flash (low) | gpt-5.4-mini (low) | deepseek-v4-flash (low) | MiniMax-M2.7 |
| **qa** | deepseek-v4-flash (low) | gpt-5.4-mini (low) | deepseek-v4-flash (low) | MiniMax-M2.7 |
| **researcher** | minimax-m3 | gpt-5.6-terra (medium) | gpt-5.6-terra (medium) | MiniMax-M2.7 |
| **planner** | glm-5.2 (high) | gpt-5.6-terra (medium) | glm-5.2 (high) | MiniMax-M2.7 |
| **dev** | kimi-k2.7-code | gpt-5.6-terra (medium) | kimi-k2.7-code | MiniMax-M2.7 |
| **infra** | deepseek-v4-pro (medium) | gpt-5.6-terra (medium) | deepseek-v4-pro (medium) | MiniMax-M2.7 |
| **architect_pro** | glm-5.2 (high) | gpt-5.6-sol (high) | gpt-5.6-sol (high) | MiniMax-M2.7 |
| **review_pro** | qwen3.7-max | gpt-5.6-sol (high) | gpt-5.6-sol (high) | MiniMax-M2.7 |

### Model Format
- Pattern: `provider/model-name` (e.g., `openai/gpt-5.6-terra`)
- Variants: `low`, `medium`, `high` (optional)

### Routing Resolution
```
Project Agent → Role in Matrix → Resolved Model + Variant
Unknown Agent → Root Model from Profile Overlay
```

---

## Retrieval Execution Engine

### Components (`bin/retrieval/`)

| Component | File | Purpose |
|-----------|------|---------|
| Router | `retrieval-router.mjs` | Plan-only routing (v0.4.0) |
| Entry | `retrieval-entry.mjs` | Execute/batch entry (v0.5.0) |
| Engine | `execution-engine.mjs` | Core `executePlan()` |
| Batch | `execute-batch.mjs` | `executeBatch()` with cache |
| Budget | `budget.mjs` | Budget enforcement |
| Equivalence | `equivalence.mjs` | In-process cache |
| Metrics | `metrics.mjs` | Metrics recording |
| Normalize | `normalize.mjs` | Deduplication |
| Preflight | `preflight.mjs` | Safety checks |
| Path Restrict | `path-restrict.mjs` | Path validation |
| Reason Codes | `reason-codes.mjs` | Reason catalog |
| Repository State | `repository-state.mjs` | Multi-repo state |
| Token Estimator | `token-estimator-v1.mjs` | Token estimation |

### Adapters (`bin/retrieval/adapters/`)

| Adapter | Provider For | Notes |
|---------|-------------|-------|
| `ripgrep.mjs` | exact (primary) | OPTIMAL tier |
| `git-grep.mjs` | exact (fallback) | FUNCTIONAL tier |
| `filesystem.mjs` | knowledge | |
| `shared.mjs` | all | Common logic |

### Intent Ladder

| Intent | Use Case | Primary | Fallback |
|--------|----------|---------|----------|
| **exact** | Identifiers | ripgrep | git_grep |
| **symbol** | Definitions | lsp | codebase-memory |
| **architecture** | Impact analysis | codebase-memory | lsp |
| **semantic** | Ambiguous | semantic (disabled) | codebase-memory |
| **knowledge** | ADRs, docs | filesystem | ripgrep |

### Budget Enforcement

| Strategy | max_tool_calls | max_chars | timeout_ms |
|----------|---------------|-----------|------------|
| exact | 1 | 12,000 | 5,000 |
| symbol | 2 | 16,000 | 5,000 |
| architecture | 2 | 20,000 | 5,000 |
| semantic | 2 | 16,000 | 5,000 |
| knowledge | 2 | 16,000 | 5,000 |

**Global Hard Caps:** 3 calls, 24,000 chars, 5s timeout

---

## Ownership Update Engine

### Components (`bin/updates/`)

| Component | File | Purpose |
|-----------|------|---------|
| Classifier | `ownership-classifier.mjs` | Classify artifacts |
| Planner | `update-planner.mjs` | Generate plans |
| Backup | `backup-manager.mjs` | Point-in-time snapshots |
| Apply | `apply-executor.mjs` | Atomic apply |
| Rollback | `rollback-controller.mjs` | Complete rollback |
| Journal | `journal-writer.mjs` | Audit records |

### Ownership Categories

| Category | Description | Update Behavior |
|----------|-------------|-----------------|
| `global-managed` | Canonical artifacts | Update when no divergence |
| `project-owned` | Custom project artifacts | Never overwrite |
| `global-managed-local-override` | Modified globals | Preserve + record |
| `generated-runtime` | Build artifacts, caches | Skip unless migration ID |
| `external` | Third-party tooling | Never modify |

---

## Orchestration & Cross-Session

The cross-session CLI is implemented at `bin/orchestration/cross-session-cli.mjs` and exposed through `scripts/cross-session.ps1` and `scripts/cross-session.bat`. All ten subcommands are local-only: the CLI does not push, fetch, merge, or otherwise modify remotes.

### Entry Points
| File | Syntax | Purpose |
|------|--------|---------|
| `bin/orchestration/cross-session-cli.mjs` | Direct Node | Scripting, CI/CD |
| `scripts/cross-session.ps1` | PowerShell `-Flag value` | Native PowerShell |
| `scripts/cross-session.bat` | Unix `--flag value` | Translates to PowerShell flags |

### Subcommands
```
doctor, mission-create, mission-status,
task-plan, task-run, integration-preflight, integration-apply,
recovery-plan, recovery-apply, mission-run
```

### Agent Discovery
1. `opencode.json` - JSON config
2. `opencode.jsonc` - JSONC config
3. `.opencode/agents/*.md` - Markdown with YAML frontmatter

### Removed Modules (Not in Official Distribution)

| Module | Reason Removed |
|--------|---------------|
| `bin/environment/*` | Not in official distribution manifest |

`integration-apply` records local integration metadata only and requires `--approve-local-integration`; it does not modify a target repository.

---

## Lifecycle Scripts

| Script | Purpose |
|--------|---------|
| `install-opencode-global.ps1` | Install runtime from source |
| `update-opencode-global.ps1` | Update installed runtime |
| `cleanup-runtime.ps1` | Quarantine legacy items |
| `init-opencode-project.ps1` | Initialize project |
| `update-opencode-project.ps1` | Update project (doctor/plan) |
| `doctor-opencode-global.ps1` | Diagnose installation (21 checks) |
| `certify-opencode-global.ps1` | Certify installation (8 gates) |
| `opencode-launcher.ps1` | Launch with profile |
| `retrieval-router.ps1` | Retrieval wrapper |
| `setup-retrieval-tools.ps1` | Cross-platform ripgrep installer |
| `cross-session.ps1` | Cross-session orchestration wrapper |
| `cross-session.bat` | Cross-session Unix-style launcher |

---

## Commands

| Command | Purpose |
|---------|---------|
| `/go` | Launch GO profile |
| `/chatgpt-plus` | Launch ChatGPT Plus profile |
| `/mix` | Launch MIX profile |
| `/minimax-plus` | Launch Minimax Plus profile |
| `/cross-session` | Cross-session orchestration |
| `/init-ai-env` | Initialize project AI environment |
| `/doctor-ai-env` | Diagnose project |
| `/update-ai-env` | Update project (read-only) |
| `/ownership-inspect` | Inspect ownership |
| `/update-apply` | Apply ownership updates |
| `/update-rollback` | Rollback ownership updates |

---

## Contracts (JSON Schemas)

| Schema | Purpose |
|--------|---------|
| `bootstrap-manifest.schema.json` | Bootstrap manifest v1 |
| `bootstrap-manifest-v2.schema.json` | Bootstrap manifest v2 |
| `graph.schema.json` | Codebase graph |
| `index.schema.json` | Session index |
| `lifecycle-records.schema.json` | Lifecycle audit |
| `manifest.schema.json` | Project manifest |
| `mission-spec.schema.json` | Mission specification |
| `ownership-policy.schema.json` | Ownership classification |
| `migration-catalog.schema.json` | Schema migrations |
| `profile.schema.json` | Profile configuration |
| `project-manifest.schema.json` | Multi-repo manifest |
| `repository-state.schema.json` | Multi-repo state |
| `retrieval-policy.schema.json` | Per-project retrieval |
| `retrieval-index-state.schema.json` | Index freshness |
| `retrieval-plan-base.schema.json` | v0.4.0 plan |
| `retrieval-execution-plan.schema.json` | v0.5.0 execution plan |
| `retrieval-execution-result.schema.json` | Execution result |
| `retrieval-execution-trace.schema.json` | Execution trace |
| `retrieval-execution-metrics.schema.json` | Metrics envelope |
| `retrieval-execution-reason-codes.schema.json` | Reason codes |
| `rollback-plan.schema.json` | Rollback plan |
| `runtime-records.schema.json` | Runtime audit |
| `security-policy.schema.json` | Security config |
| `session.schema.json` | Session config |
| `update-plan.schema.json` | Update plan |
| `update-run.schema.json` | Update run record |
| `backup-manifest.schema.json` | Backup inventory |

---

## Skills

**Note:** Skills are NOT distributed with opencode-global. They are project-owned and referenced in AGENTS.md.

| Skill | Purpose |
|-------|---------|
| `accessibility-a11y` | Web accessibility (WCAG) |
| `codebase-memory` | Structural code queries |
| `context7-mcp` | Library/framework docs |
| `customize-opencode` | OpenCode config editing |
| `find-docs` | Developer technology docs |
| `find-skills` | Skill discovery |
| `performance-and-web-vitals` | Lighthouse/CWV |
| `prompt-master` | AI prompt generation |
| `skill-creator` | Create/edit skills |
| `speckit-analyze` | Cross-artifact analysis |
| `speckit-checklist` | Requirements validation |
| `speckit-clarify` | Feature spec clarification |
| `speckit-converge` | Codebase vs spec |
| `speckit-constitution` | Project constitution |
| `speckit-implement` | Execute implementation |
| `speckit-plan` | Generate design artifacts |
| `speckit-specify` | Create specs |
| `speckit-tasks` | Generate tasks |
| `speckit-taskstoissues` | Tasks to GitHub issues |

---

## Caching & Performance

### Equivalence Cache
- **Location:** `bin/retrieval/equivalence.mjs`
- **Type:** In-process, per-batch, Map-based
- **Max Size:** 1,000 entries (LRU eviction)
- **Disabled When:** Any repository has dirty worktree
- **Signature:** SHA-256 of `scopeFingerprint|strategy|provider|normalizedQuery`

### Token Estimation
- **Version:** token-estimator-v1
- **Formula:** `ceil((emittedChars + focusedReadChars) / 4)`
- **Deterministic:** No external API calls

### Progressive Disclosure
- Returns partial results for large sets
- Batch context aware

---

## Package Manager (pnpm)

### Overview
OpenCode Global uses **pnpm** as the package manager for runtime dependencies. This ensures:
- Faster installations (via content-addressable storage)
- Strict dependency management (no phantom dependencies)
- Efficient disk space usage (content-addressable store)

### Runtime Configuration

| Setting | Value |
|---------|-------|
| Package Manager | pnpm |
| Lockfile | `pnpm-lock.yaml` |
| Engine | Node.js >= 18.0.0 |
| Dependencies | `@opencode-ai/plugin` |
| Dev Dependencies | `ajv`, `ajv-formats`, `jsonc-parser` |

### Commands

| Command | Purpose |
|---------|---------|
| `pnpm install` | Install dependencies |
| `pnpm test` | Run all tests |
| `pnpm test:unit` | Run unit tests |
| `pnpm test:integration` | Run integration tests |
| `pnpm doctor` | Run doctor script |

### Migration from npm

If the runtime was previously using npm:
1. Remove `package-lock.json`
2. Run `pnpm install`
3. Verify with `pnpm doctor`

### Source vs Runtime Parity

| Package Manager | Source | Runtime |
|-----------------|--------|---------|
| pnpm-lock.yaml | ✓ Present | ✓ Present (converted) |
| package-lock.json | ✗ Absent | ✓ Removed |

---

## Security Model

### Permission System (opencode.jsonc)

```jsonc
"read": { "*": "allow" },
"write": {
  "bin/": "deny",
  "scripts/": "deny",
  "contracts/": "deny",
  ".Opencode/": "deny",
  ".intelligence/": "deny",
  ".agents/": "deny",
  ".ai-env/": "allow",
  "**/*": "deny"
}
```

### Path Security
- Deny globs: `**/.git/**`, `**/node_modules/.cache/**`
- Allowed roots validation
- Restricted trace/metrics paths

### Secrets Handling
- Journal entries sanitized
- No secrets in logs
- Absolute paths redacted in output

---

## Distribution

### Source → Runtime Flow
```
C:\OpenCode\opencode-global-src (source)
    ↓ (install/update scripts)
C:\Users\<user>\.config\opencode (runtime)
```

### Runtime → Project Flow
```
C:\Users\<user>\.config\opencode (runtime)
    ↓ (init/update scripts)
<project> (independent repo)
```

### Distribution Files
- `distribution/runtime-manifest.json` - Maps source to runtime paths
- `distribution/resolve-runtime-manifest.ps1` - Runtime discovery

---

## Multi-Agent Orchestration (Official)

### Overview

The **Portable Multi-Agent Orchestration Architecture** is now an official technology, no longer hidden. It provides a tool-agnostic architecture for orchestrating multiple AI sub-agents.

**Location:** `C:\OpenCode\portable-agent-orchestration\`

### Research Domains (7 Total)

| Domain | Description |
|--------|-------------|
| Multi Sub-Agent Management | Spawning, isolation, and coordination of N sub-agents |
| Parallel Session Execution | Concurrent processes avoiding race conditions |
| Memory Engine | Episodic, semantic, and procedural memory persistence |
| Agent Harness & Token Efficiency | Compaction, pruning, dynamic context windows |
| MCPs & Skills as Tool Hierarchy | Integration of MCP servers and skill workflows |
| Sub-Agent Lifecycle | Spawn → Execute → Report → Collect → Die → Resume |
| Multi-Agent Portability | Cross-CLI abstraction (OpenCode, Claude Code, Cline, Codex, Cursor, Gemini CLI) |

### Sub-Agent Taxonomy

| Type | Responsibility | Context Budget | Output |
|------|---------------|----------------|--------|
| Explorer | Fast codebase search, globbing, grep | Low (quick passes) | File paths, line numbers, snippets |
| Implementer | Code generation, file edits | High (full task context) | Changed files, test results |
| Researcher | Web fetch, doc lookup, analysis | Medium | Structured findings |
| Planner | Design, architecture, sequencing | Medium | Plans, specs, task lists |

### Memory Taxonomy

| Type | Description | Storage |
|------|-------------|---------|
| Episodic | Session logs, transcripts, raw history | Markdown files, tool output dirs |
| Semantic | Extracted knowledge, decisions, patterns | Vector DB, structured JSON, markdown notes |
| Procedural | How-to knowledge, recipes, workflows | Skills, AGENTS.md, scripts |

### Tool Hierarchy

```
Orchestrator Agent
  |-- Built-in Tools (read, write, edit, grep, glob, bash, task, question)
  |-- MCP Servers
  |     |-- sequential-thinking (reasoning chain)
  |     |-- playwright (browser automation)
  |     |-- context7 (external docs)
  |-- Loaded Skills
        |-- speckit-* (9 skills: specify, plan, tasks, implement, clarify, checklist, analyze, converge, taskstoissues, constitution)
        |-- context7-mcp, prompt-master, find-skills, skill-creator
```

### Existing Multi-Agent Reference

The `skill-creator` skill already implements a working multi-agent pattern:

| Sub-Agent | Purpose | Output |
|-----------|---------|--------|
| Grader | Evaluates assertions from transcripts | `grading.json` |
| Comparator | Blind A/B comparison | `comparison.json` |
| Analyzer | Post-hoc analysis | `analysis.json` |

### Cross-CLI Comparison

| Feature | OpenCode | Claude Code | Cline | Codex | Cursor | Gemini CLI |
|---------|----------|-------------|-------|-------|--------|------------|
| Sub-agent spawn | `task` tool | `Agent` tool | `create_subagent` | `createAgent` | Agent mode | `subagent` |
| Context isolation | Fresh per spawn | Fresh per spawn | Isolated | Isolated | File-scoped | Isolated |
| Resumption | Via `task_id` | Agent session IDs | Checkpoint | Agent IDs | Chat history | Session IDs |
| Memory | File + compaction | Projects | `memory/` | Vector store | `.cursorrules` | Context cache |
| Skills/Plugins | SKILL.md + AGENTS.md | CLAUDE.md | Rules files | Custom instructions | `.cursor/rules` | Instruction files |
| MCP support | Yes (JSON config) | Yes (JSON config) | Yes (JSON config) | Yes | Yes | Limited |
| Tool output limits | Configurable | Built-in | Configurable | Fixed | Fixed | Unknown |

### Key Documents

| Document | Lines | Purpose |
|----------|-------|---------|
| `spec.md` | 285 | Full specification with functional/non-functional requirements |
| `plan.md` | 357 | 4-phase research plan (Reconocimiento → Investigación → Síntesis → Validación) |
| `tasks.md` | 280 | 27 tasks across 5 phases (all completed) |
| `portable-agent-document.md` | — | Tool-agnostic portable orchestration document |

### OpenCode-Specific Configuration

| Setting | Value |
|---------|-------|
| Sub-agent types | `explore` (fast), `general` (multi-step) |
| Compaction | `auto=true`, `prune=true`, `tail_turns: 10`, `reserved: 8000` |
| Tool output limits | `max_lines: 200`, `max_bytes: 8192` |
| Task spawning | Via `task` tool with `task_id` for resumption |

---

## Runtime Audit Summary

### Directories in Runtime

| Directory | Canonical | Status |
|-----------|-----------|--------|
| `bin/` | Yes | Official - retrieval + updates only |
| `bin/retrieval/` | Yes | Official |
| `bin/updates/` | Yes | Official |
| `commands/` | Yes | Official - 11 command definitions |
| `contracts/` | Yes | Official - 26 JSON schemas |
| `distribution/` | Yes | Official - runtime manifest |
| `opencode.profiles/` | Yes | Official - profile overlays + model-matrix |
| `releases/` | Yes | Official - release records |
| `runtime/` | Backup | Contains legacy backups |
| `scripts/` | Yes | Official - 16 lifecycle scripts (14 + cross-session.bat + opencode-launcher.ps1) |
| `templates/` | Yes | Official - project templates |
| `backups/` | Backup | Legacy backup storage |
| `fixtures/` | Test | Test fixtures |
| `node_modules/` | Dependency | npm packages |
| `.agents/` | Project | Project-owned |
| `.codex/` | Project | Project-owned |
| `.intelligence/` | Project | Project-owned |
| `.opencode/` | Project | Project-owned |
| `.specify/` | Project | Project-owned |
| `skills/` | Project | Project-owned skills registry |
| `routing/` | Removed | Duplicate of `opencode.profiles/` model-matrix |
| `retrieval/` | Removed | Duplicate of `bin/retrieval/` |
| `bin/environment/` | Removed | Not in official distribution |
| `bin/orchestration/` | Yes | Official cross-session CLI |

### Cleanup Completed

| Action | Count |
|--------|-------|
| `retrieval/` directory removed | 1 |
| `bin/environment/` removed | 1 |
| `.bak` files removed | 52+ |
| `routing/` directory | Restored | Required by launcher scripts |
| cross-session CLI | Implemented | Ten local-only subcommands; no remote operations |

### Source vs Runtime Parity

| Category | Source | Runtime | Parity |
|----------|--------|---------|--------|
| commands/ | 11 files | 11 files | ✓ Match |
| bin/retrieval/ | 17 files | 17 files | ✓ Match |
| bin/updates/ | 8 files | 8 files | ✓ Match |
| contracts/ | 27 schemas | 27 schemas | ✓ Match |
| scripts/ | 17 files | 17 files | ✓ Match |
| routing/ | 2 files | 2 files | ✓ Match |

---

## Quick Reference

### Key Paths
| Path | Purpose |
|------|---------|
| `~/.config/opencode` | Global runtime |
| `.ai-env/` | Project environment |
| `.intelligence/` | Project knowledge |
| `.agents/` | Project agents |
| `bin/retrieval/` | Retrieval engine |
| `bin/updates/` | Ownership engine |
| `routing/` | Model routing matrix |
| `scripts/cross-session.ps1` | Cross-session wrapper (requires npm CLI) |
| `scripts/opencode-launcher.ps1` | Profile launcher |

---

## Integrated Projects

### quipusoft-ai-env

| Property | Value |
|----------|-------|
| Path | `C:\quipusoft-ai-env` |
| Profile | minimax-plus |
| Agents | 9 (orchestrator, dev, explorer, qa, planner, researcher, architect_pro, review_pro, infra) |
| Status | ✅ Integrated |
| Launch Command | `pwsh scripts/opencode-launcher.ps1 -Profile minimax-plus -TargetDir C:\quipusoft-ai-env` |

### whatsapp-sales-kit-ai-env

| Property | Value |
|----------|-------|
| Path | `C:\whatsapp-sales-kit-ai-env` |
| Profile | minimax-plus |
| Agents | 11 (orchestrator, dev, explorer, qa, planner, researcher, architect_pro, review_pro, infra, claude-seo, documentalist) |
| Status | ✅ Integrated |
| Launch Command | `pwsh scripts/opencode-launcher.ps1 -Profile minimax-plus -TargetDir C:\whatsapp-sales-kit-ai-env` |

### Launch Tests (All Passed)

| Project | go | chatgpt-plus | mix | minimax-plus |
|---------|----|--------------|-----|--------------|
| quipusoft-ai-env | ✅ | ✅ | ✅ | ✅ |
| whatsapp-sales-kit-ai-env | ✅ | ✅ | ✅ | ✅ |

### Key Commands
```bash
# Diagnose installation
pwsh scripts/doctor-opencode-global.ps1

# Certify installation
pwsh scripts/certify-opencode-global.ps1

# Initialize project
pwsh scripts/init-opencode-project.ps1 -ProjectPath <path>

# Update runtime
pwsh scripts/update-opencode-global.ps1

# Cross-session (Unix-style via .bat)
scripts\cross-session.bat --subcommand doctor --ai-env-home <path> --project-root <path> --environment-manifest <path> --project-manifest <path> --spec <path>

# Cross-session (PowerShell-style)
pwsh scripts/cross-session.ps1 -Subcommand doctor -AiEnvHome <path> -ProjectRoot <path> -EnvironmentManifest <path> -ProjectManifest <path> -Spec <path>
```

---

**End of Inventory**
