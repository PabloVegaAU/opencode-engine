# OpenCode Global - Build Progress

## Status: READY_FOR_FIRST_COMMIT

## Current Location

**Source Repository:** `C:\OpenCode\opencode-global-src`

**Note:** This is the canonical source repository. Clone to any location for use.

## Completed Actions

### Canonical Structure Established

The source repository has been reorganized to the canonical structure:

- Scripts at root `scripts/` level
- Tests at root `tests/` level
- Commands at root `commands/` level
- Templates at root `templates/` level
- Legacy `opencode-global/` container removed

### Commands Canonical

All legacy aliases have been removed. Canonical public commands:

| Command | Purpose |
|---------|---------|
| `/init` | Official command for AGENTS.md creation/improvement |
| `/init-ai-env` | Initialize project AI environment |
| `/doctor-ai-env` | Diagnose project AI environment health |
| `/update-ai-env` | Update project to latest global configuration |
| `/go` | Launch with GO profile |
| `/chatgpt-plus` | Launch with ChatGPT Plus profile |
| `/mix` | Launch with MIX profile |
| `/minimax-plus` | Launch with Minimax Plus profile |
| `/cross-session` | Cross-session orchestration (requires runtime) |

### Corrections Applied

1. **README.md** - Canonical structure, all 4 profiles listed
2. **docs/PROFILES.md** - MINIMAX-PLUS profile entry added
3. **AGENTS.md** - Commands synchronized, cross-session clarified
4. **package.json** - ajv-formats added, test scripts configured
5. **scripts/validate.mjs** - JSONC parser fixed for URLs with //
6. **scripts/certify-opencode-global.ps1** - Gates 7-9 added (validate, test:unit, test:integration)
7. **.gitignore** - Comprehensive exclusions configured

## Current Structure

```
C:\OpenCode\opencode-global-src\
├── AGENTS.md
├── README.md
├── package.json
├── pnpm-lock.yaml
├── .gitignore
├── VERSION
├── LICENSE
├── CHANGELOG.md
├── PROGRESS.md
│
├── .github/
│   └── workflows/
│       └── validate.yml
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
│   └── [12 schema files]
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── INSTALLATION.md
│   ├── ORCHESTRATION.md
│   ├── PROFILES.md
│   ├── RELEASES.md
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
│   └── README.runtime.md
│
├── scripts/
│   ├── certify-opencode-global.ps1
│   ├── cross-session.ps1
│   ├── doctor-opencode-global.ps1
│   ├── init-opencode-project.ps1
│   ├── install-opencode-global.ps1
│   ├── opencode-launcher.ps1
│   ├── update-opencode-global.ps1
│   └── validate.mjs
│
├── templates/
│   └── project-neutral/
│       ├── AGENTS.md
│       ├── opencode.jsonc
│       ├── project-manifest.json
│       ├── active-task.txt.example
│       ├── .gitignore
│       ├── .intelligence/
│       └── .opencode/
│           └── commands/
│
└── tests/
    ├── config-validation.test.mjs
    ├── init-project.test.mjs
    ├── launcher.test.mjs
    ├── profile-routing.test.mjs
    ├── schema-official.test.mjs
    ├── security-boundaries.test.mjs
    └── integration/
        ├── dryrun-zero-writes.test.mjs
        ├── install-clean.test.mjs
        ├── install-idempotent.test.mjs
        ├── profiles-commands-contracts.test.mjs
        └── update-preserves-overrides.test.mjs
```

## Test Results

| Suite | Tests | Status |
|-------|-------|--------|
| Unit tests | 46 | PASS |
| Integration tests | 14 | PASS |
| **Total** | **60** | **PASS** |

## Certification Gates (ALL PASS)

| Gate | Result |
|------|--------|
| pnpm install --frozen-lockfile | PASS |
| pnpm run validate | PASS |
| pnpm test:unit (46 tests) | PASS |
| pnpm test:integration (14 tests) | PASS |
| pnpm test:all (60 tests) | PASS |
| doctor-opencode-global.ps1 | PASS (0 issues) |
| certify-opencode-global.ps1 | PASS (15/15) |

## Profile Certification

| Profile | Model | Status |
|---------|-------|--------|
| GO | opencode-go/qwen3.7-plus | CONFIGURED |
| CHATGPT-PLUS | openai/gpt-5.6-terra | CONFIGURED |
| MIX | Hybrid (GO + ChatGPT) | CONFIGURED |
| MINIMAX-PLUS | minimax/MiniMax-M2.7 | CONFIGURED |

## Cross-session Status

**OPTIONAL** - Not distributed in source. Requires OpenCode runtime.

- Wrapper: `scripts/cross-session.ps1` (distributed)
- Runtime CLI: Not in source, comes from `npm install -g opencode-ai`
- Does NOT make install/doctor/certify fail: Correct (optional)

## Dependencies

| Dependency | Version | Status |
|------------|---------|--------|
| pnpm | 11.9.0 | INSTALLED |
| ajv | ^8.17.1 | INSTALLED |
| ajv-formats | ^3.0.1 | INSTALLED |
| jsonc-parser | ^3.3.1 | INSTALLED |

## Version

- OpenCode Global: **0.3.1**
- Compatible with OpenCode: **1.18.x+**

## Files Modified This Session

```
M  AGENTS.md
M  README.md
M  package.json
M  .gitignore
M  scripts/validate.mjs
M  scripts/certify-opencode-global.ps1
M  scripts/opencode-launcher.ps1
M  scripts/init-opencode-project.ps1
M  tests/launcher.test.mjs
M  tests/init-project.test.mjs
M  tests/integration/*.test.mjs (5 files)
A  commands/init-ai-env.md
A  commands/doctor-ai-env.md
A  commands/update-ai-env.md
A  commands/minimax-plus.md
D  opencode-global/ (container removed)
D  package-lock.json
D  commands/orchestrate.md
D  commands/chatgpt.md
```

## Security

- No credentials or secrets in repository
- No absolute paths in configuration
- All paths use relative or environment-variable references
- Project-specific content stays in projects
- Global is portable across computers
- .gitignore excludes registry.sqlite, sessions, logs, cache
