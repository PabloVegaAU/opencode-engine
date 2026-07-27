# Decisions: v0.6.0

## ADR-005: Ownership Classification Model

**Status**: Proposed
**Date**: 2026-07-26

### Decision

Adopt five-category ownership model:
- `global-managed`
- `project-owned`
- `global-managed-local-override`
- `generated-runtime`
- `external`

### Rationale

Simple deterministic classification enables safe automation without AI-driven inference. Each category maps to clear update behavior.

### Alternatives Considered

1. **Binary (global/project)**: Too coarse; local overrides ambiguous
2. **AI-driven classification**: Non-deterministic; safety concerns
3. **Seven+ categories**: Overhead outweighs precision

---

## ADR-006: Deterministic Update Rules

**Status**: Proposed
**Date**: 2026-07-26

### Decision

No AI-driven conflict resolution in v0.6.0. Apply deterministic rules:
- Project-owned: preserve always
- Global without divergence: update
- Global with allowed override: preserve + record
- Global divergent without policy: block

### Rationale

Safety requires predictability. AI resolution can be added in v0.7.x after deterministic baseline is proven.

### Alternatives Considered

1. **Three-way merge**: Complex; edge cases; deferred
2. **Last-write-wins**: Data loss risk
3. **Manual resolution**: Breaks automation goal
