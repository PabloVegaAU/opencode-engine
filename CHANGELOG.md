# Changelog

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
