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
git clone <repo>/opencode-global.git C:\OpenCode\opencode-global-src

# Install
cd C:\OpenCode\opencode-global-src
pwsh .\scripts\install-opencode-global.ps1

# Authenticate
opencode providers login

# Diagnose
pwsh .\scripts\doctor-opencode-global.ps1

# Certify
pwsh .\scripts\certify-opencode-global.ps1
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

## Security

Never commit credentials, tokens, or secrets. See [docs/SECURITY.md](docs/SECURITY.md).

## License

MIT
