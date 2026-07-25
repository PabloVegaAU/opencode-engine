# Changelog

## [0.4.0] - 2026-07-25

### Added
- **Retrieval Foundation v0.4.0** - Deterministic retrieval plan builder
- **Router:** `bin/retrieval/retrieval-router.mjs` - Plan-only retrieval routing
- **Five Intents:** exact, symbol, architecture, semantic, knowledge
- **Budgets:** per-strategy max_tool_calls (10-50) and max_chars (2400-24000)
- **Providers:** ripgrep (OPTIMAL), git-grep (FUNCTIONAL fallback), lsp, codebase-memory, filesystem
- **Policy Adoption:** Project-level retrieval policy via `init-opencode-project.ps1 -IncludeRetrievalPolicy`
- **Bootstrap Ledger:** `.opencode/bootstrap-manifest.json` tracks all managed artifacts
- **Index State Publisher:** `indexed_commit`, `index_generation`, `indexed_at` published
- **Retrieval Tiers:** OPTIMAL (ripgrep), FUNCTIONAL (git grep fallback), INCOMPLETE (no exact)
- **Setup Tools:** `scripts/setup-retrieval-tools.ps1` - Cross-platform ripgrep installer
- **Template Distribution:** Complete `templates/project-neutral/` deployed to runtime
- **Idempotent Adoption:** Already-adopted projects skip without overwriting
- **Project States:** PROJECT_NOT_ADOPTED, ADOPTED, MISSING_AFTER_ADOPTION, NOT_INDEXED, STALE_INDEX, FRESH
- **Runtime Autonomous:** Independent of source after installation

### Changed
- Project updater read-only (Doctor/Plan modes only, apply/rollback NOT_IMPLEMENTED)
- Bootstrap manifest location: `.opencode/bootstrap-manifest.json` (v0.4.0 canonical)
- Legacy support: `.bootstrap/project-manifest.json` still recognized as fallback
- Get-RetrievalPolicyState returns exact state values (no UNKNOWN in normal operation)

### Fixed
- Template `.ai-env/retrieval-policy.json` now distributed to runtime
- Init resolves templates from runtime `$OpenCodeConfigDir`, not source `$GlobalRoot`
- Idempotent `-IncludeRetrievalPolicy` on already-adopted projects (no overwrite)
- PS type conversion: `[hashtable]` → `[object[]]` for ArtifactsLedger parameter

### Security
- Zero writes from doctor/plan modes
- No source dependencies in installed runtime
- No absolute paths, credentials, or secrets in configuration

### Tests
- 106 unit tests PASS
- 147 integration tests PASS
- 253 total tests PASS

## [0.3.1] - 2026-07-24

### Added
- Initial release of opencode-global source repository
- Canonical directory structure: scripts/, tests/, commands/, templates/ at root level
- Four profiles: GO, CHATGPT-PLUS, MIX, MINIMAX-PLUS
- Routing matrix for per-role model assignment
- Lifecycle scripts: install, update, doctor, certify, init-project, launcher, cross-session wrapper
- Project initialization templates
- 12 contract schemas for validation
- 46 unit tests + 14 integration tests (60 total)
- GitHub Actions validation workflow
- Public commands: /init-ai-env, /doctor-ai-env, /update-ai-env

### Changed
- Restructured from nested `opencode-global/` container to flat canonical structure
- Renamed `chatgpt.md` to `chatgpt-plus.md`
- Removed alias `chatgpt` from launcher (only `chatgpt-plus` valid)
- Added `ajv-formats` dependency for schema validation
- Updated certify script to run validation, unit tests, and integration tests as gates

### Removed
- `opencode-global/` container directory (content moved to root)
- `commands/orchestrate.md` (redundant with cross-session.md)
- `commands/chatgpt.md` (replaced by chatgpt-plus.md)
- Legacy orchestration commands (init-orchestration, doctor-orchestration, update-orchestration)
- `scripts/switch-opencode-profile.ps1`
- `package-lock.json` (conflicts with pnpm-lock.yaml)

### Security
- No absolute paths in configuration
- No credentials or secrets in repository
- Security boundary enforcement
- Comprehensive .gitignore excludes registry.sqlite, sessions, logs, cache

### Fixed
- JSONC parser correctly handles URLs containing //
- Integration tests use correct GLOBAL_ROOT path resolution
- Profile routing tests use dynamic USERPROFILE path
