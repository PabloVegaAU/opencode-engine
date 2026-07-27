# Research: Canonical Runtime Lifecycle

## Decision 1: Agent modes

- **Decision**: Accept only `primary`, `subagent`, and `all`.
- **Rationale**: The official OpenCode schema and agent documentation define these values; `orchestrator` is a role/name, not a mode.
- **Alternatives considered**: Translating invalid modes silently. Rejected because invalid configuration should fail before startup.

## Decision 2: Distribution ownership

- **Decision**: Keep a machine-readable source-to-runtime manifest in the official repository.
- **Rationale**: Separate hardcoded lists in install and update drifted and produced incomplete fresh installs.
- **Alternatives considered**: Continue maintaining duplicate arrays. Rejected due demonstrated divergence.

## Decision 3: Runtime updates

- **Decision**: Require source root when an installed updater cannot see source layout.
- **Rationale**: Runtime is a derived installation and cannot update from files it does not contain.
- **Alternatives considered**: Copy the entire source repository into runtime. Rejected because runtime must remain minimal and project-neutral.

## Decision 4: Cleanup

- **Decision**: Quarantine known legacy contamination instead of deleting it.
- **Rationale**: It is reversible and preserves user data while removing active-runtime ambiguity.
- **Alternatives considered**: Permanent deletion or broad allow-only cleanup. Rejected as unsafe.

## Decision 5: Launcher dependencies

- **Decision**: Use a dependency-free, string-aware JSONC parser in the launcher.
- **Rationale**: A fresh runtime must work without source `node_modules`; naive comment stripping corrupts URLs inside strings.
- **Alternatives considered**: Install development dependencies into runtime. Rejected as unnecessary runtime weight.
