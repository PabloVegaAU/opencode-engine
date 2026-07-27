# Implementation Plan: Canonical Runtime Lifecycle

## Technical Context

- **Runtime**: PowerShell 7+, Node.js 18+, OpenCode.
- **Configuration**: JSON/JSONC and Markdown frontmatter.
- **Tests**: Node.js test runner plus isolated PowerShell sandboxes.
- **Primary constraints**: zero-write dry runs, no credentials or project state in distribution, Windows path support, source/runtime parity.

## Constitution Check

- Source remains the sole reusable distribution authority.
- Runtime contains only managed neutral artifacts and local runtime state.
- Projects own agents, skills, MCP, topology, and intelligence.
- Destructive changes require explicit authorization and reversible backup/quarantine.
- Concurrent work is preserved; no reset, force checkout, or history rewrite.

## Architecture

1. Resolve a canonical inventory from `distribution/runtime-manifest.json`.
2. Use the same resolver in install and update.
3. Validate the complete source layout before any write.
4. Back up changed managed files centrally.
5. Keep project bootstrap neutral and option-driven.
6. Validate agent modes during launcher discovery.
7. Quarantine known legacy runtime contamination.
8. Prove behavior in sandbox, installed runtime, and Quipusoft.

## Verification Gates

- Manifest schema and source-path validation.
- No duplicate runtime destinations.
- Fresh install parity and idempotency.
- Installed updater source-root behavior.
- Dry-run zero-write snapshots.
- Central backup content equality.
- Cleanup protected-path and quarantine tests.
- Launcher valid/invalid/conflicting mode tests.
- Full unit/integration suite.
- Runtime doctor and representative-project launcher dry-run.

## Rollback

- Restore managed files from `runtime/backups/managed/<timestamp>/`.
- Restore quarantined legacy items from `runtime/backups/legacy-runtime-<timestamp>/`.
- Source changes remain visible in Git for selective reversal; no automatic history rewrite is used.
