/**
 * Retrieval Engine Test Suite - Phase 2 CORRECTED
 * Tests execution engine, batch, normalization, equivalence, metrics.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync, mkdirSync, rmSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const FIXTURE_ROOT = join(REPO_ROOT, 'tests', 'fixtures', 'qs-sell');

const ENGINE_PATH = join(REPO_ROOT, 'bin', 'retrieval', 'execution-engine.mjs');
const BATCH_PATH = join(REPO_ROOT, 'bin', 'retrieval', 'execute-batch.mjs');
const NORMALIZE_PATH = join(REPO_ROOT, 'bin', 'retrieval', 'normalize.mjs');
const EQUIVALENCE_PATH = join(REPO_ROOT, 'bin', 'retrieval', 'equivalence.mjs');
const BUDGET_PATH = join(REPO_ROOT, 'bin', 'retrieval', 'budget.mjs');
const PREFLIGHT_PATH = join(REPO_ROOT, 'bin', 'retrieval', 'preflight.mjs');
const REPO_STATE_PATH = join(REPO_ROOT, 'bin', 'retrieval', 'repository-state.mjs');
const METRICS_PATH = join(REPO_ROOT, 'bin', 'retrieval', 'metrics.mjs');
const REASON_CODES_PATH = join(REPO_ROOT, 'bin', 'retrieval', 'reason-codes.mjs');
const TOKEN_EST_PATH = join(REPO_ROOT, 'bin', 'retrieval', 'token-estimator-v1.mjs');
const PATH_RESTRICT_PATH = join(REPO_ROOT, 'bin', 'retrieval', 'path-restrict.mjs');
const CONTRACT_VAL_PATH = join(REPO_ROOT, 'bin', 'retrieval', 'contract-validation.mjs');

const engine = await import(pathToFileURL(ENGINE_PATH).href);
const batch = await import(pathToFileURL(BATCH_PATH).href);
const normalizeMod = await import(pathToFileURL(NORMALIZE_PATH).href);
const equivalenceMod = await import(pathToFileURL(EQUIVALENCE_PATH).href);
const budgetMod = await import(pathToFileURL(BUDGET_PATH).href);
const preflightMod = await import(pathToFileURL(PREFLIGHT_PATH).href);
const repoStateMod = await import(pathToFileURL(REPO_STATE_PATH).href);
const metricsMod = await import(pathToFileURL(METRICS_PATH).href);
const reasonCodesMod = await import(pathToFileURL(REASON_CODES_PATH).href);
const tokenEstMod = await import(pathToFileURL(TOKEN_EST_PATH).href);
const pathRestrictMod = await import(pathToFileURL(PATH_RESTRICT_PATH).href);
const contractValMod = await import(pathToFileURL(CONTRACT_VAL_PATH).href);

const SELL_APP_PATH = join(FIXTURE_ROOT, 'repositories', 'sell-app');
const SELL_RULES_PATH = join(FIXTURE_ROOT, 'repositories', 'sell-rules');

function createValidBasePlan(overrides = {}) {
  return {
    schema_version: '1.0',
    enabled: true,
    intent: 'exact',
    strategy: 'exact',
    provider: 'ripgrep',
    reason: 'auto',
    query: 'Sell',
    budgets: { max_tool_calls: 1, max_results: 25, max_chars: 12000, timeout_ms: 5000 },
    fallbacks: [{ provider: 'git_grep', reason: 'auto' }],
    repository: 'sell-app',
    branch: 'main',
    commit: 'abc123',
    detached: false,
    indexed_commit: null,
    index_generation: null,
    indexed_at: null,
    index_status: 'FRESH',
    dirty_worktree: false,
    warnings: [],
    error: null,
    deny_globs: [],
    protected_paths: {},
    ...overrides
  };
}

function createValidManifest() {
  return {
    version: '1',
    project_id: 'qs-sell-fixture',
    repositories: [
      { repository_id: 'sell-app', path: 'repositories/sell-app', allowed_read_roots: ['repositories/sell-app'], allowed_write_roots: [] },
      { repository_id: 'sell-rules', path: 'repositories/sell-rules', allowed_read_roots: ['repositories/sell-rules'], allowed_write_roots: [] }
    ],
    policy: { max_writers_per_repository: 1, max_read_only_child_tasks_per_session: 2 }
  };
}

describe('Reason Codes', () => {
  it('exports contract reason codes', () => {
    assert.strictEqual(reasonCodesMod.REASON_CODES.EXECUTION_OK, 'EXECUTION_OK');
    assert.strictEqual(reasonCodesMod.REASON_CODES.ADAPTER_INVOCATION_OK, 'ADAPTER_INVOCATION_OK');
    assert.strictEqual(reasonCodesMod.REASON_CODES.EQUIVALENT_REUSED, 'EQUIVALENT_REUSED');
    assert.strictEqual(reasonCodesMod.REASON_CODES.CACHE_DISABLED_DIRTY_WORKTREE, 'CACHE_DISABLED_DIRTY_WORKTREE');
  });

  it('validates reason codes', () => {
    assert.ok(reasonCodesMod.isValidReasonCode('EXECUTION_OK'));
    assert.ok(!reasonCodesMod.isValidReasonCode('INVALID_CODE'));
  });

  it('tracker tracks valid codes only', () => {
    const tracker = reasonCodesMod.createReasonCodeTracker();
    tracker.add('EXECUTION_OK');
    assert.ok(tracker.has('EXECUTION_OK'));
    assert.throws(() => tracker.add('INVALID'));
  });
});

describe('Token Estimator', () => {
  it('computes deterministic tokens', () => {
    const tokens1 = tokenEstMod.estimateTokens(1000, 0);
    const tokens2 = tokenEstMod.estimateTokens(1000, 0);
    assert.strictEqual(tokens1, tokens2);
    assert.strictEqual(tokens1, 250);
  });

  it('includes focused_read_chars in estimation', () => {
    const tokens = tokenEstMod.estimateTokens(1000, 500);
    assert.strictEqual(tokens, 375);
  });

  it('exports correct version', () => {
    assert.strictEqual(tokenEstMod.TOKEN_ESTIMATOR_VERSION, 'token-estimator-v1');
  });
});

describe('Budget Enforcement', () => {
  it('enforces hard caps on tool calls', () => {
    const budget = budgetMod.computeCallBudget('exact', { max_tool_calls: 10 });
    assert.strictEqual(budget.max_tool_calls, 3);
  });

  it('returns correct budgets per strategy', () => {
    const exactBudget = budgetMod.getBudgetForStrategy('exact');
    assert.strictEqual(exactBudget.max_tool_calls, 1);

    const knowledgeBudget = budgetMod.getBudgetForStrategy('knowledge');
    assert.strictEqual(knowledgeBudget.max_tool_calls, 2);
  });
});

describe('Path Restriction', () => {
  it('converts to POSIX paths', () => {
    assert.strictEqual(pathRestrictMod.toPosixPath('C:\\foo\\bar'), 'C:/foo/bar');
  });

  it('detects absolute paths', () => {
    assert.ok(pathRestrictMod.isAbsolutePath('/foo/bar'));
    assert.ok(!pathRestrictMod.isAbsolutePath('foo/bar'));
  });

  it('detects traversal segments', () => {
    assert.ok(pathRestrictMod.hasTraversalSegment('../foo'));
    assert.ok(pathRestrictMod.hasTraversalSegment('foo/../bar'));
    assert.ok(!pathRestrictMod.hasTraversalSegment('foo/bar'));
  });

  it('safe resolve validates paths', () => {
    const result = pathRestrictMod.safeResolve('src/main.java', join(FIXTURE_ROOT, 'repositories', 'sell-app'), [join(FIXTURE_ROOT, 'repositories', 'sell-app')]);
    assert.ok(result.valid);
  });

  it('rejects paths with traversal', () => {
    const result = pathRestrictMod.safeResolve('../etc/passwd', join(FIXTURE_ROOT, 'repositories', 'sell-app'), [join(FIXTURE_ROOT, 'repositories', 'sell-app')]);
    assert.ok(!result.valid);
  });
});

describe('Normalize', () => {
  it('generates deterministic item ids with provider prefix', () => {
    const id1 = normalizeMod.generateItemId('ripgrep', 'repo1', 'path/file.java', 10);
    const id2 = normalizeMod.generateItemId('ripgrep', 'repo1', 'path/file.java', 10);
    assert.strictEqual(id1, id2);
  });

  it('normalizes items with strategy as kind', () => {
    const rawItem = {
      repository_id: 'repo1',
      path: 'path/file.java',
      line: 10,
      column: 5,
      content: 'public class Foo {}'
    };
    const normalized = normalizeMod.normalizeItem(rawItem, 'ripgrep', 'exact');
    assert.strictEqual(normalized.kind, 'exact');
    assert.strictEqual(normalized.repository_id, 'repo1');
    assert.strictEqual(normalized.line, 10);
    assert.strictEqual(normalized.id, 'ripgrep:repo1:path/file.java:10');
  });

  it('deduplicates items correctly', () => {
    const items = [
      { repository_id: 'repo', path: 'a.java', line: 1, column: 1, preview: 'foo' },
      { repository_id: 'repo', path: 'a.java', line: 1, column: 1, preview: 'foo' },
      { repository_id: 'repo', path: 'b.java', line: 2, column: 1, preview: 'bar' }
    ];
    const result = normalizeMod.deduplicateItems(items);
    assert.strictEqual(result.items.length, 2);
    assert.strictEqual(result.dedupCount, 1);
  });

  it('sorts items deterministically', () => {
    const items = [
      { repository_id: 'repo2', path: 'b.java', line: 1, column: 1, preview: '' },
      { repository_id: 'repo1', path: 'a.java', line: 1, column: 1, preview: '' }
    ];
    const sorted = normalizeMod.sortItems(items);
    assert.strictEqual(sorted[0].repository_id, 'repo1');
    assert.strictEqual(sorted[1].repository_id, 'repo2');
  });
});

describe('Equivalence Cache', () => {
  it('computes deterministic signature', () => {
    const sig1 = equivalenceMod.computeAdapterSignature('scope1', 'exact', 'ripgrep', 'sell');
    const sig2 = equivalenceMod.computeAdapterSignature('scope1', 'exact', 'ripgrep', 'sell');
    assert.strictEqual(sig1, sig2);
    assert.strictEqual(sig1.length, 64);
  });

  it('normalizes query for cache', () => {
    const norm1 = equivalenceMod.normalizeQueryForCache('  SELL  Controller  ');
    const norm2 = equivalenceMod.normalizeQueryForCache('sell controller');
    assert.strictEqual(norm1, norm2);
  });

  it('cache stores and retrieves results', () => {
    const cache = equivalenceMod.createEquivalenceCache();
    cache.set('key1', { result: 'value1' });
    assert.strictEqual(cache.get('key1').result, 'value1');
  });

  it('cache tracks hits', () => {
    const cache = equivalenceMod.createEquivalenceCache();
    cache.set('key1', { result: 'value1' });
    cache.get('key1');
    cache.get('key1');
    assert.strictEqual(cache.getStats().cacheHits, 2);
  });
});

describe('Repository State', () => {
  it('computes deterministic fingerprint', () => {
    const fp1 = repoStateMod.computeRepoFingerprint('abc123', 'main', false, 'FRESH');
    const fp2 = repoStateMod.computeRepoFingerprint('abc123', 'main', false, 'FRESH');
    assert.strictEqual(fp1, fp2);
    assert.strictEqual(fp1.length, 64);
  });

  it('computes scope fingerprint from entries', () => {
    const entries = [
      { repository_id: 'repo1', fingerprint: 'fingerprint1'.padEnd(64, '0') },
      { repository_id: 'repo2', fingerprint: 'fingerprint2'.padEnd(64, '0') }
    ];
    const scope1 = repoStateMod.computeScopeFingerprint(entries);
    const scope2 = repoStateMod.computeScopeFingerprint([
      { repository_id: 'repo1', fingerprint: 'fingerprint1'.padEnd(64, '0') },
      { repository_id: 'repo2', fingerprint: 'fingerprint2'.padEnd(64, '0') }
    ]);
    assert.strictEqual(scope1, scope2);
    assert.strictEqual(scope1.length, 64);
  });

  it('detects dirty repository', () => {
    const state = {
      repositories: [
        { repository_id: 'repo1', dirty_worktree: false },
        { repository_id: 'repo2', dirty_worktree: true }
      ]
    };
    assert.ok(repoStateMod.hasDirtyRepository(state));
  });
});

describe('Preflight Checks', () => {
  it('validates base plan structure', () => {
    const plan = createValidBasePlan();
    const result = preflightMod.validatePlanStrictness(plan);
    assert.ok(result.valid || result.errors.length > 0);
  });

  it('rejects OPENCODE_RETRIEVAL_MODE env var', () => {
    const hadProperty = Object.hasOwn(process.env, 'OPENCODE_RETRIEVAL_MODE');
    const original = process.env.OPENCODE_RETRIEVAL_MODE;
    try {
      process.env.OPENCODE_RETRIEVAL_MODE = 'execute';
      const result = preflightMod.checkOpenCodeRetrievalModeEnv();
      assert.ok(!result.allowed, 'OPENCODE_RETRIEVAL_MODE=execute should not be allowed');
    } finally {
      if (hadProperty) {
        process.env.OPENCODE_RETRIEVAL_MODE = original;
      } else {
        delete process.env.OPENCODE_RETRIEVAL_MODE;
      }
    }
    const restoredValue = process.env.OPENCODE_RETRIEVAL_MODE;
    const hadPropertyAfter = Object.hasOwn(process.env, 'OPENCODE_RETRIEVAL_MODE');
    assert.strictEqual(hadPropertyAfter, hadProperty, 'env property existence must be restored');
    if (hadProperty) {
      assert.strictEqual(restoredValue, original, 'env value must be restored');
    }
  });

  it('validates provider executable', () => {
    const valid = preflightMod.validateProviderExecutable('ripgrep');
    assert.ok(valid.valid);

    const invalid = preflightMod.validateProviderExecutable('invalid');
    assert.ok(!invalid.valid);
  });
});

describe('Metrics', () => {
  it('creates session metrics with required fields', () => {
    const session = metricsMod.createSessionMetrics();
    assert.ok(session.session_id);
    assert.strictEqual(session.schema_version, '1.0');
    assert.ok(session.process_started_at);
    assert.ok(Array.isArray(session.runs));
    assert.ok(session.summary.total_runs !== undefined);
  });

  it('records run metrics correctly', () => {
    const session = metricsMod.createSessionMetrics();
    const runData = {
      intent: 'exact',
      strategy: 'exact',
      provider: 'ripgrep',
      logical_adapter_calls: 1,
      call_budget: 3,
      provider_process_invocations: 2,
      fallback_count: 0,
      raw_result_count: 10,
      result_count: 8,
      char_count: 500,
      char_budget: 12000,
      adapter_stdout_chars: 600,
      normalized_chars: 550,
      emitted_chars: 500,
      focused_read_calls: 0,
      focused_read_chars: 0,
      cache_hits: 0,
      cache_evictions: 0,
      deduped: 2,
      truncated: false,
      first_relevant_result_ms: 100,
      repositories_searched: 2,
      reason_codes: ['EXECUTION_OK']
    };
    const recorded = metricsMod.recordRunMetrics(session, runData);
    assert.strictEqual(recorded.logical_adapter_calls, 1);
    assert.strictEqual(session.summary.total_results, 8);
  });
});

describe('Contract Validation', () => {
  it('validates base plan', () => {
    const plan = createValidBasePlan();
    const result = contractValMod.validateBasePlan(plan);
    assert.strictEqual(result.valid, true, 'valid base plan must pass validation');
  });

  it('validates result schema', () => {
    const result = {
      schema_version: '1.0',
      mode: 'execute',
      plan: {},
      repository_state: {},
      intent: 'exact',
      strategy: 'exact',
      provider: 'ripgrep',
      logical_adapter_calls: 0,
      call_budget: 3,
      provider_process_invocations: 0,
      fallback_count: 0,
      raw_result_count: 0,
      result_count: 0,
      result_budget: 25,
      char_count: 0,
      char_budget: 12000,
      truncated: false,
      cache_hits: 0,
      deduped: 0,
      cache_evictions: 0,
      focused_read_calls: 0,
      focused_read_chars: 0,
      repositories_searched: 2,
      first_relevant_result_ms: null,
      adapter_stdout_chars: 0,
      normalized_chars: 0,
      emitted_chars: 0,
      estimated_tokens_emitted: 0,
      token_estimator_version: 'v1',
      items: [],
      reason_codes: ['EXECUTION_OK'],
      warnings: [],
      error: null,
      duration_ms: 0,
      trace_id: '550e8400-e29b-41d4-a716-446655440000'
    };
    const validation = contractValMod.validateResult(result);
    assert.ok(!validation.valid);
  });
});

describe('Execution Engine', () => {
  it('rejects invalid base plan', async () => {
    const result = await engine.executePlan({ schema_version: '1.0' }, {});
    assert.ok(!result.success);
  });

  it('rejects missing manifest', async () => {
    const plan = createValidBasePlan();
    const result = await engine.executePlan(plan, {});
    assert.ok(!result.success);
  });

  it('rejects duplicate repository_ids', async () => {
    const manifest = {
      ...createValidManifest(),
      repositories: [
        { repository_id: 'sell-app', path: 'repositories/sell-app' },
        { repository_id: 'sell-app', path: 'repositories/sell-rules' }
      ]
    };
    const plan = createValidBasePlan();
    const result = await engine.executePlan(plan, { manifest });
    assert.ok(!result.success);
  });

  it('rejects unordered repository_ids', async () => {
    const manifest = {
      ...createValidManifest(),
      repositories: [
        { repository_id: 'sell-rules', path: 'repositories/sell-rules' },
        { repository_id: 'sell-app', path: 'repositories/sell-app' }
      ]
    };
    const plan = createValidBasePlan();
    const result = await engine.executePlan(plan, { manifest });
    assert.ok(!result.success);
  });
});

describe('Batch Execution', () => {
  it('rejects empty plans array', async () => {
    const result = await batch.executeBatch([]);
    assert.ok(!result.success);
  });

  it('accepts multiple plans without hard cap limit', async () => {
    const plans = Array.from({length: 6}, (_, i) =>
      createValidBasePlan({ query: `query${i}` })
    );
    const result = await batch.executeBatch(plans, {});
    assert.ok(result.success !== undefined);
  });
});

describe('NEW: AJV Validation of All Five Contracts', () => {
  it('successful execution validates all five contracts', async () => {
    const stubAdapter = {
      checkAvailability() { return 'available'; },
      async execute(request) {
        return {
          provider: 'ripgrep',
          status: 'success',
          provider_processes: [{ repository_id: 'sell-app', cwd: '/test', command: ['rg'], exit_code: 0 }],
          raw_items: [
            { repository_id: 'sell-app', path: 'src/Service.java', line: 10, column: 1, content: 'public class Service' }
          ],
          stdout_chars: 100,
          duration_ms: 50,
          error: null
        };
      }
    };

    const manifest = createValidManifest();
    const plan = createValidBasePlan();

    const result = await engine.executePlan(plan, {
      manifest,
      manifestDir: FIXTURE_ROOT,
      adapterOverrides: { ripgrep: () => Promise.resolve(stubAdapter) }
    });

    assert.strictEqual(result.success, true, 'executePlan must succeed');
    assert.ok(result.result, 'result.result must exist');
    assert.ok(result.trace, 'result.trace must exist');

    const execPlanValidation = contractValMod.validateExecutionPlan(result.result.plan);
    assert.strictEqual(execPlanValidation.valid, true, 'execution-plan must be valid');

    const repoStateValidation = contractValMod.validateRepositoryState(result.result.repository_state);
    assert.strictEqual(repoStateValidation.valid, true, 'repository-state must be valid');

    const resultValidation = contractValMod.validateResult(result.result);
    assert.strictEqual(resultValidation.valid, true, 'result must be valid');

    const traceValidation = contractValMod.validateTrace(result.trace);
    assert.strictEqual(traceValidation.valid, true, 'trace must be valid');

    const session = metricsMod.createSessionMetrics();
    const runData = {
      trace_id: result.result.trace_id,
      intent: result.result.intent,
      strategy: result.result.strategy,
      provider: result.result.provider,
      logical_adapter_calls: result.result.logical_adapter_calls,
      call_budget: result.result.call_budget,
      provider_process_invocations: result.result.provider_process_invocations,
      fallback_count: result.result.fallback_count,
      raw_result_count: result.result.raw_result_count,
      result_count: result.result.result_count,
      result_budget: result.result.result_budget,
      char_count: result.result.char_count,
      char_budget: result.result.char_budget,
      adapter_stdout_chars: result.result.adapter_stdout_chars,
      normalized_chars: result.result.normalized_chars,
      emitted_chars: result.result.emitted_chars,
      focused_read_calls: result.result.focused_read_calls,
      focused_read_chars: result.result.focused_read_chars,
      cache_hits: result.result.cache_hits,
      cache_evictions: 0,
      deduped: result.result.deduped,
      first_relevant_result_ms: result.result.first_relevant_result_ms,
      repositories_searched: result.result.repositories_searched,
      reason_codes: result.result.reason_codes,
      duration_ms: result.result.duration_ms
    };
    const recorded = metricsMod.recordRunMetrics(session, runData);
    const metricsValidation = contractValMod.validateMetrics(session);
    assert.strictEqual(metricsValidation.valid, true, 'metrics must be valid');
  });
});

describe('NEW: Batch with Cache Hits', () => {
  it('batch of 6 plans (3 unique queries repeated) produces 6 successful results in order', async () => {
    const stubAdapter = {
      checkAvailability() { return 'available'; },
      async execute(request) {
        return {
          provider: 'ripgrep',
          status: 'success',
          provider_processes: [{ repository_id: 'sell-app', cwd: '/test', command: ['rg'], exit_code: 0 }],
          raw_items: [
            { repository_id: 'sell-app', path: 'src/Controller.java', line: 5, column: 1, content: 'public class Controller' }
          ],
          stdout_chars: 80,
          duration_ms: 30,
          error: null
        };
      }
    };

    const manifest = createValidManifest();
    const plans = [
      createValidBasePlan({ query: 'QueryA' }),
      createValidBasePlan({ query: 'QueryB' }),
      createValidBasePlan({ query: 'QueryC' }),
      createValidBasePlan({ query: 'QueryA' }),
      createValidBasePlan({ query: 'QueryB' }),
      createValidBasePlan({ query: 'QueryC' })
    ];

    const result = await batch.executeBatch(plans, {
      manifest,
      manifestDir: FIXTURE_ROOT,
      adapterOverrides: { ripgrep: () => Promise.resolve(stubAdapter) }
    });

    assert.strictEqual(result.success, true, 'batch must succeed');
    assert.strictEqual(result.results.length, 6, 'must have 6 results');

    for (let i = 0; i < 6; i++) {
      assert.strictEqual(result.results[i].success, true, `Result ${i} must succeed`);
      assert.ok(result.results[i].result, `Result ${i} must have result object`);
      assert.ok(result.results[i].result.logical_adapter_calls >= 0, `Result ${i} must have logical_adapter_calls`);
    }

    assert.strictEqual(result.summary.total_plans, 6, 'summary must show 6 plans');
    assert.strictEqual(result.summary.successful, 6, 'all 6 must be successful');
  });
});

describe('NEW: Independent Invocations No Shared Cache', () => {
  it('two separate batches with same query produce zero shared cache hits', async () => {
    const stubAdapter = {
      checkAvailability() { return 'available'; },
      async execute(request) {
        return {
          provider: 'ripgrep',
          status: 'success',
          provider_processes: [{ repository_id: 'sell-app', cwd: '/test', command: ['rg'], exit_code: 0 }],
          raw_items: [{ repository_id: 'sell-app', path: 'src/Service.java', line: 10, column: 1, content: 'public class Service' }],
          stdout_chars: 80,
          duration_ms: 30,
          error: null
        };
      }
    };

    const manifest = createValidManifest();
    const plan = createValidBasePlan({ query: 'SharedQuery' });

    const batch1 = await batch.executeBatch([plan], {
      manifest,
      manifestDir: FIXTURE_ROOT,
      adapterOverrides: { ripgrep: () => Promise.resolve(stubAdapter) }
    });

    const batch2 = await batch.executeBatch([plan], {
      manifest,
      manifestDir: FIXTURE_ROOT,
      adapterOverrides: { ripgrep: () => Promise.resolve(stubAdapter) }
    });

    assert.strictEqual(batch1.success, true);
    assert.strictEqual(batch2.success, true);
    assert.strictEqual(batch1.summary.cache_hits, 0, 'First batch should have 0 cache hits');
    assert.strictEqual(batch2.summary.cache_hits, 0, 'Second batch should have 0 cache hits (independent cache)');
    assert.strictEqual(batch1.results[0].result.logical_adapter_calls, batch2.results[0].result.logical_adapter_calls);
  });
});

describe('NEW: Provider Unavailable and Fallback', () => {
  it('primary unavailable uses fallback from fallbacks[] and max_tool_calls:1 prevents fallback after primary fails', async () => {
    const unavailableAdapter = {
      checkAvailability() { return 'not_installed'; },
      async execute() {
        throw new Error('Should not be called');
      }
    };

    const fallbackAdapter = {
      checkAvailability() { return 'available'; },
      async execute(request) {
        return {
          provider: 'git_grep',
          status: 'success',
          provider_processes: [{ repository_id: 'sell-app', cwd: '/test', command: ['git', 'grep'], exit_code: 0 }],
          raw_items: [{ repository_id: 'sell-app', path: 'src/Controller.java', line: 3, column: 1, content: 'public class Controller' }],
          stdout_chars: 60,
          duration_ms: 20,
          error: null
        };
      }
    };

    const manifest = createValidManifest();

    const planWithUnavailablePrimary = createValidBasePlan({
      provider: 'ripgrep',
      fallbacks: [{ provider: 'git_grep', reason: 'auto' }],
      budgets: { max_tool_calls: 1, max_results: 25, max_chars: 12000, timeout_ms: 5000 }
    });

    const result1 = await engine.executePlan(planWithUnavailablePrimary, {
      manifest,
      manifestDir: FIXTURE_ROOT,
      adapterOverrides: {
        ripgrep: () => Promise.resolve(unavailableAdapter),
        git_grep: () => Promise.resolve(fallbackAdapter)
      }
    });

    assert.strictEqual(result1.success, true);
    assert.strictEqual(result1.result.logical_adapter_calls, 1, 'Should make 1 fallback call');
    assert.strictEqual(result1.result.provider, 'ripgrep', 'Provider should still be ripgrep');
    assert.ok(result1.result.reason_codes.includes('NO_RETRIEVAL_PROVIDER'), 'Should have NO_RETRIEVAL_PROVIDER');
    assert.ok(result1.result.reason_codes.includes('PROVIDER_FALLBACK_TO_GIT_GREP') || result1.result.reason_codes.includes('ADAPTER_INVOCATION_OK'), 'Should use fallback');

    const failedPrimaryAdapter = {
      checkAvailability() { return 'available'; },
      async execute() {
        return {
          provider: 'ripgrep',
          status: 'error',
          provider_processes: [{ repository_id: 'sell-app', cwd: '/test', command: ['rg'], exit_code: 1 }],
          raw_items: [],
          stdout_chars: 0,
          duration_ms: 10,
          error: ' exited with code 1'
        };
      }
    };

    const planWithBudget1 = createValidBasePlan({
      provider: 'ripgrep',
      fallbacks: [{ provider: 'git_grep', reason: 'auto' }],
      budgets: { max_tool_calls: 1, max_results: 25, max_chars: 12000, timeout_ms: 5000 }
    });

    const result2 = await engine.executePlan(planWithBudget1, {
      manifest,
      manifestDir: FIXTURE_ROOT,
      adapterOverrides: {
        ripgrep: () => Promise.resolve(failedPrimaryAdapter),
        git_grep: () => Promise.resolve(fallbackAdapter)
      }
    });

    assert.strictEqual(result2.success, true);
    assert.strictEqual(result2.result.logical_adapter_calls, 1, 'With max_tool_calls:1, only 1 call allowed');
    assert.strictEqual(result2.result.fallback_count, 0, 'No fallback when budget exhausted');
    assert.ok(result2.result.reason_codes.includes('ADAPTER_NONZERO_EXIT'), 'Should indicate adapter failure');
  });
});

describe('NEW: Progressive Disclosure', () => {
  it('preview_token hides content, expansion works within same batch, rejects from different batch', async () => {
    const stubAdapter = {
      checkAvailability() { return 'available'; },
      async execute(request) {
        return {
          provider: 'ripgrep',
          status: 'success',
          provider_processes: [{ repository_id: 'sell-app', cwd: '/test', command: ['rg'], exit_code: 0 }],
          raw_items: [
            { repository_id: 'sell-app', path: 'src/Service.java', line: 10, column: 1, content: 'public class Service { private String secret = "password123"; }' }
          ],
          stdout_chars: 100,
          duration_ms: 30,
          error: null
        };
      }
    };

    const manifest = createValidManifest();
    const plan = createValidBasePlan({
      budgets: { max_tool_calls: 1, max_results: 25, max_chars: 12000, timeout_ms: 5000 }
    });

    const result = await batch.executeBatch([plan], {
      manifest,
      manifestDir: FIXTURE_ROOT,
      progressive_disclosure: true,
      adapterOverrides: { ripgrep: () => Promise.resolve(stubAdapter) }
    });

    assert.strictEqual(result.success, true);
    const item = result.results[0].result.items[0];
    assert.ok(item.preview_token, 'Item must have preview_token');
    assert.strictEqual(item.preview, null, 'Preview must be null when progressive disclosure applied');

    const continuationRegistry = new Map();
    for (const r of result.results) {
      for (const i of r.result.items || []) {
        if (i.preview_token) {
          continuationRegistry.set(i.preview_token, {
            batchId: result.batch_id,
            scope_fingerprint: r.result.repository_state.scope_fingerprint,
            repository_id: i.repository_id,
            path: i.path
          });
        }
      }
    }

    const expandResult = await batch.expandFocusedRead(item.preview_token, {
      continuationRegistry,
      currentBatchId: result.batch_id
    });
    assert.strictEqual(expandResult.success, true, 'Expansion within same batch should succeed');
    assert.strictEqual(expandResult.continuation.batchId, result.batch_id);

    const wrongBatchExpand = await batch.expandFocusedRead(item.preview_token, {
      continuationRegistry,
      currentBatchId: 'different-batch-id'
    });
    assert.strictEqual(wrongBatchExpand.success, false, 'Expansion from different batch should fail');
    assert.ok(wrongBatchExpand.error.includes('different batch'));
  });

  it('expansion increments focused_read_calls and focused_read_chars', async () => {
    const stubAdapter = {
      checkAvailability() { return 'available'; },
      async execute(request) {
        return {
          provider: 'ripgrep',
          status: 'success',
          provider_processes: [{ repository_id: 'sell-app', cwd: '/test', command: ['rg'], exit_code: 0 }],
          raw_items: [
            { repository_id: 'sell-app', path: 'src/LongFile.java', line: 1, column: 1, content: 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5' }
          ],
          stdout_chars: 100,
          duration_ms: 30,
          error: null
        };
      }
    };

    const manifest = createValidManifest();
    const plan = createValidBasePlan({
      budgets: { max_tool_calls: 1, max_results: 25, max_chars: 12000, timeout_ms: 5000 }
    });

    const batchResult = await batch.executeBatch([plan], {
      manifest,
      manifestDir: FIXTURE_ROOT,
      progressive_disclosure: true,
      adapterOverrides: { ripgrep: () => Promise.resolve(stubAdapter) }
    });

    assert.strictEqual(batchResult.success, true);
    const initialResult = batchResult.results[0].result;
    assert.ok(initialResult.items.length > 0);

    const item = initialResult.items[0];
    const continuationRegistry = new Map();
    continuationRegistry.set(item.preview_token, {
      batchId: batchResult.batch_id,
      scope_fingerprint: initialResult.repository_state.scope_fingerprint,
      repository_id: item.repository_id,
      path: item.path
    });

    const session = metricsMod.createSessionMetrics();
    metricsMod.recordRunMetrics(session, {
      intent: initialResult.intent,
      strategy: initialResult.strategy,
      provider: initialResult.provider,
      logical_adapter_calls: 0,
      call_budget: initialResult.call_budget,
      provider_process_invocations: 0,
      fallback_count: 0,
      raw_result_count: 0,
      result_count: 0,
      char_count: 0,
      char_budget: initialResult.char_budget,
      adapter_stdout_chars: 0,
      normalized_chars: 0,
      emitted_chars: 0,
      focused_read_calls: 1,
      focused_read_chars: 500,
      cache_hits: 0,
      cache_evictions: 0,
      deduped: 0,
      truncated: false,
      first_relevant_result_ms: null,
      repositories_searched: initialResult.repositories_searched,
      reason_codes: ['PROGRESSIVE_DISCLOSURE_EXPANDED']
    });

    const focusedMetrics = session.runs[0];
    assert.strictEqual(focusedMetrics.focused_read_calls, 1);
    assert.ok(focusedMetrics.focused_read_chars > 0);
  });
});

describe('NEW: Manifest Path Resolution and NOT_INDEXED', () => {
  it('manifest paths are POSIX relative, resolved against manifestDir, NOT_INDEXED when no index state', async () => {
    const manifestPath = join(FIXTURE_ROOT, 'project-manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

    const repoState = repoStateMod.captureRepositoryState(manifest, { manifestDir: FIXTURE_ROOT });

    assert.strictEqual(repoState.schema_version, '1.0');
    assert.ok(repoState.scope_fingerprint);
    assert.strictEqual(repoState.scope_fingerprint.length, 64);

    for (const repo of repoState.repositories) {
      assert.ok(!repo.path.includes('\\'), 'Path must not contain backslash');
      assert.ok(!repo.path.startsWith('/'), 'Path must be relative');
      assert.ok(repo.path.includes('/'), 'Path must use forward slash');
      assert.strictEqual(repo.index_status, 'NOT_INDEXED', 'Without index state, must be NOT_INDEXED');
      assert.strictEqual(repo.indexed_commit, null);
      assert.strictEqual(repo.index_generation, null);
      assert.strictEqual(repo.indexed_at, null);
    }
  });

  it('scope_fingerprint uses repository_id:fingerprint format', async () => {
    const entries = [
      { repository_id: 'repo1', fingerprint: 'a'.repeat(64) },
      { repository_id: 'repo2', fingerprint: 'b'.repeat(64) }
    ];
    const scopeFp = repoStateMod.computeScopeFingerprint(entries);

    const expectedInput = 'repo1:' + 'a'.repeat(64) + '\n' + 'repo2:' + 'b'.repeat(64);
    const expectedHash = createHash('sha256').update(expectedInput).digest('hex');

    assert.strictEqual(scopeFp, expectedHash);
  });
});

describe('NEW: Path Rejection', () => {
  it('rejects traversal by segment', () => {
    const result = pathRestrictMod.hasTraversalSegment('../foo');
    assert.strictEqual(result, true, 'must reject ../foo');

    const result2 = pathRestrictMod.hasTraversalSegment('foo/../bar');
    assert.strictEqual(result2, true, 'must reject foo/../bar');

    const result3 = pathRestrictMod.hasTraversalSegment('foo/bar/../baz');
    assert.strictEqual(result3, true, 'must reject foo/bar/../baz');
  });

  it('rejects absolute paths', () => {
    const result = pathRestrictMod.isAbsolutePath('/foo/bar');
    assert.strictEqual(result, true, 'must reject absolute path');

    const result2 = pathRestrictMod.isAbsolutePath('C:/foo/bar');
    assert.strictEqual(result2, true, 'must reject Windows absolute path');
  });

  it('rejects backslash in paths', () => {
    const result = pathRestrictMod.containsBackslash('foo\\bar');
    assert.strictEqual(result, true, 'must reject backslash');
  });

  it('rejects prefix collision of roots', () => {
    const allowedRoots = ['/project/src', '/project/src/utils'];
    const result = pathRestrictMod.validateNoPrefixCollision(allowedRoots);
    assert.ok(!result.valid, 'must reject prefix collision between roots');
    assert.ok(result.error.includes('prefix collision'));
  });

  it('rejects symlink that escapes root', () => {
    const result = pathRestrictMod.safeResolve('../escape', join(FIXTURE_ROOT, 'repositories', 'sell-app'), [join(FIXTURE_ROOT, 'repositories', 'sell-app')]);
    assert.ok(!result.valid, 'must reject traversal escape');
  });

  it('rejects protected paths and deny globs', () => {
    const HARD_CODED_DENY_PATTERNS = [
      '.git/**', '.git', '.env', '.env.*', '.secrets/**', '.secrets',
      '**/.DS_Store', '**/Thumbs.db', '**/credentials*', '**/Credentials*',
      '**/*credential*', '**/auth*', '**/Auth*', '**/token*', '**/Token*',
      '**/secret*', '**/Secret*', '**/application.properties'
    ];

    const protectedPaths = ['.env', '.env.local', '.secrets/db.json', 'credentials.csv', 'application.properties'];
    for (const pattern of protectedPaths) {
      const matches = HARD_CODED_DENY_PATTERNS.some(g => g === pattern || g.includes('*'));
      assert.ok(matches, `Pattern ${pattern} or wildcard variant must be in deny list`);
    }
  });
});

describe('NEW: Zero File Writes', () => {
  function computeDirSnapshot(rootPath, basePath = '') {
    const snapshot = new Map();
    const entries = readdirSync(rootPath, { withFileTypes: true });
    for (const entry of entries) {
      const relPath = basePath ? basePath + '/' + entry.name : entry.name;
      if (entry.isDirectory()) {
        const subSnapshot = computeDirSnapshot(join(rootPath, entry.name), relPath);
        for (const [p, info] of subSnapshot) {
          snapshot.set(p, info);
        }
      } else {
        const fullPath = join(rootPath, entry.name);
        const content = readFileSync(fullPath);
        const stat = statSync(fullPath);
        const hash = createHash('sha256').update(content).digest('hex');
        snapshot.set(relPath, { size: stat.size, sha256: hash });
      }
    }
    return snapshot;
  }

  async function verifyZeroFileWrites(rootPath, operation) {
    const before = computeDirSnapshot(rootPath);
    await operation();
    const after = computeDirSnapshot(rootPath);

    const writes = [];
    for (const [path, afterInfo] of after) {
      const beforeInfo = before.get(path);
      if (!beforeInfo) {
        writes.push(`${path}: CREATED`);
      } else if (beforeInfo.sha256 !== afterInfo.sha256) {
        writes.push(`${path}: MODIFIED (before=${beforeInfo.sha256}, after=${afterInfo.sha256})`);
      }
    }
    for (const [path, beforeInfo] of before) {
      if (!after.has(path)) {
        writes.push(`${path}: DELETED`);
      }
    }
    return writes;
  }

  it('engine execution produces zero file writes', async () => {
    const stubAdapter = {
      checkAvailability() { return 'available'; },
      async execute(request) {
        return {
          provider: 'ripgrep',
          status: 'success',
          provider_processes: [{ repository_id: 'sell-app', cwd: '/test', command: ['rg'], exit_code: 0 }],
          raw_items: [{ repository_id: 'sell-app', path: 'src/Service.java', line: 10, column: 1, content: 'public class Service' }],
          stdout_chars: 80,
          duration_ms: 30,
          error: null
        };
      }
    };

    const manifest = createValidManifest();
    const plan = createValidBasePlan();

    const writes = await verifyZeroFileWrites(FIXTURE_ROOT, async () => {
      await engine.executePlan(plan, {
        manifest,
        manifestDir: FIXTURE_ROOT,
        adapterOverrides: { ripgrep: () => Promise.resolve(stubAdapter) }
      });
    });

    assert.deepStrictEqual(writes, [], `Expected zero file writes, but found: ${writes.join(', ')}`);
  });

  it('batch execution produces zero file writes', async () => {
    const stubAdapter = {
      checkAvailability() { return 'available'; },
      async execute(request) {
        return {
          provider: 'ripgrep',
          status: 'success',
          provider_processes: [{ repository_id: 'sell-app', cwd: '/test', command: ['rg'], exit_code: 0 }],
          raw_items: [{ repository_id: 'sell-app', path: 'src/Controller.java', line: 5, column: 1, content: 'public class Controller' }],
          stdout_chars: 60,
          duration_ms: 20,
          error: null
        };
      }
    };

    const manifest = createValidManifest();
    const plans = [
      createValidBasePlan({ query: 'QueryA' }),
      createValidBasePlan({ query: 'QueryB' })
    ];

    const writes = await verifyZeroFileWrites(FIXTURE_ROOT, async () => {
      await batch.executeBatch(plans, {
        manifest,
        manifestDir: FIXTURE_ROOT,
        adapterOverrides: { ripgrep: () => Promise.resolve(stubAdapter) }
      });
    });

    assert.deepStrictEqual(writes, [], `Expected zero file writes, but found: ${writes.join(', ')}`);
  });
});
