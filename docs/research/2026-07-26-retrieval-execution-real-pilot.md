# Retrieval Execution Real Pilot — Phase 7 (BLOCKED)

- **Date (UTC):** 2026-07-26
- **Pilot ID:** 5e4d2ef9-14c0-4325-8538-f3fb32faed6d
- **State:** `V0.5.0_PHASE7_REAL_PILOT_BLOCKED`
- **Methodology:** real read-only local-clone pilot
- **Source project (neutralised in this document):** `<pilot-source-project>` (an absolute path is intentionally omitted for portability; see evidence JSON for the relative evidence paths).
- **Source evidence (relative):** `docs/research/sources/2026-07-26-retrieval-execution-real-pilot-5e4d2ef9-14c0-4325-8538-f3fb32faed6d.json`

## Veredicto

Phase 7 is **BLOCKED**, not because the v0.5.0 retrieval execution engine is broken, but because the **QUERY_SET** mandated by the contract does not match the real project source. The `QUERY_SET` is derived from `tests/integration/benchmark-qs-sell.test.mjs` and targets the synthetic `qs/sell` fixture content (Java entities `SellController`, `SellService`, `SellDetail`, and the `qs/sell` endpoint). The real source is a Java project whose classes and endpoints do not contain any of those identifiers, so every query returns 0 results in both the baseline and the batch, and there is nothing for the equivalence cache to dedup.

The user instruction explicitly forbids:
- changing the `QUERY_SET` (would break the contract with `tests/integration/benchmark-qs-sell.test.mjs`),
- modifying the source (read-only),
- faking the control to force a PASS,
- declaring success when the reduction fails by design.

Per the instructions, when the targets fail by design and cannot be corrected without breaking contracts, the state is `V0.5.0_PHASE7_REAL_PILOT_BLOCKED`.

## Methodology (control vs batch)

The pilot ran two independent measurements against the cloned source:

1. **Baseline (control)**: six independent wrapper invocations, one per request, in six fresh Node processes. Because each process has its own in-process equivalence cache, no deduplication can happen. This is the control for "what happens if we run every query in a separate process".
2. **Batch**: one wrapper invocation that loads all six requests in a single Node process, where the in-process equivalence cache can reuse identical adapter-signature results. This is the test for "what happens if we batch them".

Both runs use the same `QUERY_SET`, the same `max_fallbacks`, the same budget, the same progressive-disclosure option (off for the main batch), and the same wrapper invocation shape. The only difference is process count and shared cache.

## Reductions (observed)

| Metric | Baseline | Batch | Reduction |
|---|---:|---:|---:|
| `logical_adapter_calls` | 6 | 0 | 100.00% |
| `provider_process_invocations` | 24 | 0 | 100.00% |
| `adapter_stdout_chars` | 0 | 0 | 0.00% (degenerate; both zero) |
| `emitted_chars` | 0 | 0 | 0.00% (degenerate; both zero) |
| `estimated_tokens_emitted` | 0 | 0 | 0.00% (degenerate; both zero) |
| `cache_hits` | 0 | 0 | n/a |
| `focused_read_calls` | 0 | 0 | n/a |
| `focused_read_chars` | 0 | 0 | n/a |
| wall-clock total (ms) | ~20 000 | ~3 800 | n/a |
| median per request (ms) | ~3 000 | n/a | n/a |

Call reduction is 100% only because the batch had no execution (every query returned 0 results, so the engine never invoked the adapter). This is a degenerate case, not a real saving.

## Gates

| Gate | Result | Reason |
|---|---|---|
| `manifest_valid` | PASS | The pilot manifest validates against the canonical `project-manifest` schema. |
| `policy_valid` | PASS | The pilot policy validates against the canonical AJV validator generated from `retrieval-policy.schema.json`. |
| `batch_logical_calls_le_3` | PASS | Batch emitted 0 logical adapter calls (≤ 3). |
| `call_reduction_ge_50` | PASS (100%) | 6 → 0; degenerate, see Veredicto. |
| `char_reduction_ge_40` | FAIL (0%) | Both sides 0; no content matched in the real source. |
| `token_reduction_ge_40` | FAIL (0%) | Both sides 0; no content matched in the real source. |
| `result_valid` / `metrics_valid` / `trace_valid` | PASS | The single batch envelope validates against `retrieval-execution-result`, `retrieval-execution-trace`, and `retrieval-execution-metrics` via AJV. |
| `architecture plan-only` | PASS | The architecture intent returns a plan-only response with 0 provider processes spawned. |
| zero writes to source | PASS | Pre-pilot and post-pilot byte-level snapshots of all 4 repositories are byte-equal. |

## Subtests

- **Progressive disclosure**: a broad exact query (`SellService`) was used to attempt to cross the preview-token threshold inside a batch. The batch returned 0 results and 0 focused reads, so the threshold was not reached. The `progressive_disclosure` option is forwarded to the engine; the lack of focused reads is a consequence of the 0-result queries, not a defect in the engine.
- **Fallback**: a non-existent exact query (`XYZNEVERMATCHESATALLXYZ12345`) was executed twice. The engine reported `fallback_count: 0` because ripgrep returned 0 results on the first try; there is nothing to fall back from. No process was spawned against `git_grep` because the primary call did not return an error. The fallback path is wired correctly; the test was not stressed because the primary call did not error.
- **Architecture plan-only**: a wrapper invocation with `-Intent architecture` and no `-Execute` returned a plan-only response (provider = `ripgrep` per the policy's allowed executable fallback, 0 provider processes in the trace). The architecture strategy remains plan-only by design.

## Repository fingerprints (captured before the pilot, verified after)

| Repository ID | HEAD | Branch (detached) | Scope fingerprint (truncated) |
|---|---|---|---|
| `repo.backend.quipusoftapp-backend` | `1205f1aa700e97c7965ac5fb056b61c37ca50452` | HEAD-detached | `ccd89a24…` |
| `repo.backend.zhonghui-backend` | `bfcd18e7709b567e40335fa8ebd9225cb50996c4` | HEAD-detached | `5b54750f…` |
| `repo.frontend.quipusoftapp-frontend` | `297aa71df9a04b7305978baf70a2cfaf4b65c746` | HEAD-detached | `642234f6…` |
| `root` | `c5df8d7e38be161d18cfb2203769f2d1ad65cf9e` | HEAD-detached | `fbb96dac…` |

The `scope_fingerprint` is a composite over the four repositories' `commit + branch + dirty_worktree + index_status` per the strict v0.5.0 contract. `dirty_worktree=false` and `detached=true` for every repository (clones were cleaned and checked out to `--detach <original HEAD>`). The post-pilot snapshot of all 4 repositories matches the pre-pilot snapshot byte-for-byte (2116 lines of `path|size|sha256` per file in the working tree, identical before and after).

## Query set (verbatim from `tests/integration/benchmark-qs-sell.test.mjs`)

| # | query | intent |
|---|---|---|
| 1 | `SellController.create` | exact |
| 2 | `SellController.create` | exact |
| 3 | `class SellService` | symbol |
| 4 | `class SellService` | symbol |
| 5 | `why does the qs/sell endpoint require authentication` | knowledge |
| 6 | `why does the qs/sell endpoint require authentication` | knowledge |

`query_set_hash = d9bdc920814eb2b5219fa853df99a036675a3a40206a79c6a3ac94bf85e70c05`.

The qualitative canonical question `qué archivos entity están relacionados con el flujo qs/sell y de qué trata cada uno` was preserved as a separate qualitative validation. Because the source is not the qs/sell fixture, this question also returns 0 results; its role is to confirm the engine can answer knowledge-style questions about the qs/sell domain when the fixture is present, not to alter the QUERY_SET metrics.

## Limitations

1. The `QUERY_SET` was designed for the synthetic `qs/sell` fixture. The real project used as the pilot source is a Java enterprise backend that does not contain the entities the `QUERY_SET` searches for. All 4 repositories were scanned against all 6 queries, and no `SellController`, `SellService`, `SellDetail`, or `qs/sell` references were found.
2. Because both baseline and batch have 0 chars and 0 tokens, the char and token reduction percentages are degenerate (0/0). The v0.5.0 release gates from `docs/RETRIEVAL_EXECUTION.md` are not refuted by an engine defect; they are not exercised because the queries match no content in the real source.
3. The pilot intentionally preserved the synthetic provenance of `tests/fixtures/qs-sell/pilot-baseline.json` and only replaced the placeholder `pilot_run.observations` with real telemetry. The baseline still labels itself `provenance: synthetic` and `fixture_name: qs/sell`. The real measurements are in `v050_release_gates.call_reduction_observed_pct`, `char_reduction_observed_pct`, and `token_reduction_observed_pct`, and in the `note` field that documents the BLOCKED state.
4. The pilot's JSON evidence files do **not** contain absolute source paths. The source-project field uses the neutral placeholder `<pilot-source-project>`; the evidence `notes` field mentions `<pilot-source-project>` and explains the BLOCKED reason. The pre-pilot and post-pilot snapshots are stored under `working/pre-snapshot-full.txt` and `working/post-snapshot-full.txt` for byte-level comparison; the `compareObject` between them is empty (0 differences).

## Cleanup

- The pilot runner cleans up its `C:\Temp\pilot-<uuid>` directory in a `finally` block. After the last run, `Get-ChildItem -Path 'C:\Temp' -Directory -Filter 'pilot-*'` returns 0 directories.
- `Get-ChildItem -Path $env:TEMP -Directory -Filter 'opencode-validator-check-*' -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -gt (Get-Date).AddMinutes(-10) }` returns 0 directories.
- `Get-ChildItem -Path $env:TEMP -Directory -Filter 'opencode-certify-*' -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -gt (Get-Date).AddMinutes(-10) }` returns 0 directories.

## Veredicto final

`V0.5.0_PHASE7_REAL_PILOT_BLOCKED`. The Phase 7 v0.5.0 reduction targets are not demonstrated on the real source because the contractually-mandated `QUERY_SET` returns 0 results. The Phase 7 engine (Doctor, Router, Engine, Batch, Cache, Equivalence, Trace, Metrics, AJV) is structurally correct: it produces valid result/trace/metrics envelopes, dedups within the batch, never spawns adapter processes for architecture intent, and writes nothing to the source. The blocker is the `QUERY_SET ↔ source content` mismatch, not the engine.
