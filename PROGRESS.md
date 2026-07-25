# OpenCode Global - Build Progress

## Status: READY_FOR_REAL_RUNTIME_DEPLOYMENT

## Current Location

**Source Repository:** `C:\OpenCode\opencode-global-src`
**Branch:** `feat/retrieval-foundation-v0.4.0`
**HEAD:** `35cd6c0a23568d7445382cf448266e50582354b6`

**Note:** This is the canonical source repository. Clone to any location for use.

## Three Commits on Branch

| Commit | Description |
|--------|-------------|
| `05d90dd` | feat(retrieval): add deterministic retrieval foundation |
| `ae6b8ac` | docs(retrieval): clarify ripgrep is optional, git grep is required fallback |
| `35cd6c0` | feat(retrieval): add setup-retrieval-tools.ps1 and retrieval tier reporting |

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
├── VERSION (0.3.1 - not yet updated for release)
├── LICENSE
├── CHANGELOG.md (0.3.1 - not yet updated for release)
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
| Integration tests | 81 | PASS |
| **Total** | **187** | **PASS** |

## Certification Gates (ALL PASS)

| Gate | Result |
|------|--------|
| pnpm install --frozen-lockfile | PASS |
| pnpm run validate | PASS |
| pnpm test:unit (106 tests) | PASS |
| pnpm test:integration (81 tests) | PASS |
| pnpm test:all (187 tests) | PASS |
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

## Gates Pending

| Gate | Status |
|------|--------|
| Gate 1: Source final audit | COMPLETE |
| Gate 2: Runtime global real updated and certified | PENDING |
| Gate 3: Independent project pilot (Quipusoft) | PENDING |

## Dependencies

| Dependency | Version | Status |
|------------|---------|--------|
| pnpm | 11.9.0 | INSTALLED |
| ajv | ^8.17.1 | INSTALLED |
| ajv-formats | ^3.0.1 | INSTALLED |
| jsonc-parser | ^3.3.1 | INSTALLED |

## Version

- OpenCode Global: **0.3.1** (not yet formally released as 0.4.0)
- Compatible with OpenCode: **1.18.x+**

## Security

- No credentials or secrets in repository
- No absolute paths in configuration
- All paths use relative or environment-variable references
- Project-specific content stays in projects
- Global is portable across computers
- .gitignore excludes registry.sqlite, sessions, logs, cache
