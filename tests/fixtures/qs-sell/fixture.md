# qs/sell fixture — SYNTHETIC

This directory is a **synthetic but faithful** fixture for the v0.5.0
Retrieval Execution planning benchmark. It is **NOT** a snapshot of any
real private code or any real pilot telemetry.

## Provenance

- `provenance`: synthetic
- `measurement_method`: contract/fixture only
- `source_trace`: planning agent, planning pass
- `repository_fingerprints`: per-repo `commit` is fixed at init time
- `token_estimator`: token-estimator-v1 (deterministic; same version
  used for baseline and result)

The pilot telemetry numbers in `pilot-baseline.json` are **provisional
placeholders reserved for Phase 7**. The release gates (call reduction,
char reduction, token reduction) are NOT measured by the current test
suite. The current test only validates the contract and the fixture.

## Why `qs/sell`?

The Quipusoft pilot (`qs/sell`) is the canonical natural-language
question. The synthetic fixture is built so that the same question
can be answered against a multi-repo scope with the same shape:

> "qué archivos entity están relacionados con el flujo qs/sell y de qué trata cada uno"

The fixture contains exactly the entities the v0.5.0 benchmark needs:

- `SellController` — REST endpoint `@Path("qs/sell")`.
- `SellService` — service used by the controller.
- `Sell` — entity representing a sale.
- `SellDetail` — entity representing a line item in a sale.

The relationships are:

```
SellController (qs/sell endpoint)
    -> SellService
        -> Sell
        -> SellDetail
```

The benchmark queries are derived from this flow:

1. `SellController.create` → `exact` (ripgrep).
2. `class SellService` → `symbol` (ripgrep fallback → git_grep).
3. `why does the qs/sell endpoint require authentication` → `knowledge`
   (filesystem → docs/README/CHANGELOG/PROGRESS).

The queries are Run twice in the benchmark. The same query must hit
the in-process cache the second time (the test asserts the contract
allows it). Independent wrapper invocations do NOT share the cache.

## Layout

```
tests/fixtures/qs-sell/
  fixture.md                      ← this file
  project-manifest.json           ← valid project-manifest.schema.json
  pilot-baseline.json             ← placeholder, provisional, NOT verified
  repositories/
    sell-app/                     ← repository_id = "sell-app"
      README.md
      src/main/java/com/example/sell/
        SellController.java
        SellService.java
        Sell.java
        SellDetail.java
    sell-rules/                   ← repository_id = "sell-rules"
      README.md
      adr/0001-qs-sell-auth.md
      rule/sell-rules.md
```

## Release gates (Phase 7)

The percentages in `pilot-baseline.json` are placeholders. The Phase 7
certify run will replace the placeholders with verifiable numbers
captured by the actual engine. Until Phase 7, the savings percentages
are reserved as release gates but are NOT measured by the current
contract/fixture test.
