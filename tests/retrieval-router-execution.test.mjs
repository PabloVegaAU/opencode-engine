/**
 * Retrieval Router Execution Tests - Phase 3
 * Tests execute and batch entry points.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'fs';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const FIXTURE_ROOT = join(REPO_ROOT, 'tests', 'fixtures', 'qs-sell');

const SELL_APP_PATH = join(FIXTURE_ROOT, 'repositories', 'sell-app');
const SELL_RULES_PATH = join(FIXTURE_ROOT, 'repositories', 'sell-rules');

const {
  buildPlan,
  loadPolicy,
  INTENTS
} = await import(`file://${REPO_ROOT}/bin/retrieval/retrieval-router.mjs`);

const {
  executeQuery,
  executeBatchQueries
} = await import(`file://${REPO_ROOT}/bin/retrieval/retrieval-entry.mjs`);

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

function createProjectManifest(targetDir) {
  const manifest = createValidManifest();
  const manifestPath = join(targetDir, 'project-manifest.json');
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return manifestPath;
}

function createPolicy(targetDir, overrides = {}) {
  const policy = {
    schema_version: '1.0',
    enabled: true,
    strategies: {
      exact: { enabled: true, provider: 'ripgrep' },
      symbol: { enabled: true, provider: overrides.symbolProvider || 'ripgrep' },
      architecture: { enabled: true, provider: 'codebase-memory' },
      semantic: { enabled: true, provider: 'semantic' },
      knowledge: { enabled: true, provider: 'filesystem' }
    },
    budgets: {
      exact: { max_tool_calls: 1, max_results: 25, max_chars: 12000, timeout_ms: 5000 },
      symbol: { max_tool_calls: 2, max_results: 25, max_chars: 16000, timeout_ms: 5000 },
      architecture: { max_tool_calls: 2, max_results: 30, max_chars: 20000, timeout_ms: 5000 },
      semantic: { max_tool_calls: 2, max_results: 12, max_chars: 16000, timeout_ms: 5000 },
      knowledge: { max_tool_calls: 2, max_results: 12, max_chars: 16000, timeout_ms: 5000 }
    }
  };
  const aiEnvDir = join(targetDir, '.ai-env');
  if (!existsSync(aiEnvDir)) {
    mkdirSync(aiEnvDir, { recursive: true });
  }
  const policyPath = join(aiEnvDir, 'retrieval-policy.json');
  writeFileSync(policyPath, JSON.stringify(policy, null, 2));
  return policyPath;
}

const stubAdapter = {
  checkAvailability() { return 'available'; },
  async execute(request) {
    return {
      provider: 'ripgrep',
      status: 'success',
      provider_processes: [{ repository_id: 'sell-app', cwd: '/test', command: ['rg'], exit_code: 0 }],
      raw_items: [
        { repository_id: 'sell-app', path: 'src/Service.java', line: 10, column: 1, content: `result for ${request.query}` }
      ],
      stdout_chars: 100,
      duration_ms: 50,
      error: null
    };
  }
};

const fsAdapter = {
  checkAvailability() { return 'available'; },
  async execute(request) {
    return {
      provider: 'filesystem',
      status: 'success',
      provider_processes: [],
      raw_items: [
        { repository_id: 'sell-app', path: 'AGENTS.md', line: 1, column: 1, content: '# Agents' }
      ],
      stdout_chars: 50,
      duration_ms: 10,
      error: null
    };
  }
};

describe('Retrieval Entry - Plan-only v0.4.0 Compatibility', () => {
  it('buildPlan produces plan without mode, execution, adapter_signature', () => {
    createPolicy(FIXTURE_ROOT);

    const loadedPolicy = loadPolicy(join(FIXTURE_ROOT, '.ai-env', 'retrieval-policy.json'));
    const plan = buildPlan('Sell', FIXTURE_ROOT, loadedPolicy, INTENTS.EXACT);

    assert.strictEqual(plan.schema_version, '1.0');
    assert.strictEqual(plan.enabled, true);
    assert.strictEqual(plan.intent, 'exact');
    assert.strictEqual(typeof plan.strategy, 'string');
    assert.strictEqual(typeof plan.provider, 'string');
    assert.strictEqual(typeof plan.budgets, 'object');
    assert.strictEqual(plan.mode, undefined);
    assert.strictEqual(plan.execution, undefined);
    assert.strictEqual(plan.adapter_signature, undefined);
  });
});

describe('Retrieval Entry - Execute Single', () => {
  it('execute exact successful with adapter injected', async () => {
    createPolicy(FIXTURE_ROOT);
    createProjectManifest(FIXTURE_ROOT);

    const result = await executeQuery('Sell', FIXTURE_ROOT, INTENTS.EXACT, {
      adapterOverrides: { ripgrep: () => Promise.resolve(stubAdapter) }
    });

    assert.strictEqual(result.success, true);
    assert.ok(result.result);
    assert.ok(result.trace);
  });

  it('knowledge strategy uses filesystem provider', async () => {
    createPolicy(FIXTURE_ROOT);
    createProjectManifest(FIXTURE_ROOT);

    const result = await executeQuery('ADR decision caching', FIXTURE_ROOT, INTENTS.KNOWLEDGE, {
      adapterOverrides: { filesystem: () => Promise.resolve(fsAdapter) }
    });

    assert.strictEqual(result.success, true);
    assert.ok(result.result);
    assert.strictEqual(result.result.provider, 'filesystem');
  });

  it('plan-only provider (lsp) falls back to ripgrep when configured provider unavailable', async () => {
    createPolicy(FIXTURE_ROOT, { symbolProvider: 'lsp' });
    createProjectManifest(FIXTURE_ROOT);

    const result = await executeQuery('function getData', FIXTURE_ROOT, INTENTS.SYMBOL, {
      adapterOverrides: { ripgrep: () => Promise.resolve(stubAdapter) }
    });

    assert.strictEqual(result.success, true);
    assert.ok(result.result);
    assert.strictEqual(result.result.provider, 'ripgrep');
  });

  it('project not adopted rejected without adapter calls', async () => {
    const nonAdoptedDir = join(FIXTURE_ROOT, 'non-adopted');
    mkdirSync(nonAdoptedDir, { recursive: true });

    const result = await executeQuery('Sell', nonAdoptedDir, INTENTS.EXACT, {
      adapterOverrides: { ripgrep: () => Promise.resolve(stubAdapter) }
    });

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error, 'PROJECT_NOT_ADOPTED');
    assert.ok(result.result === null);
  });

  it('manifest absent rejected', async () => {
    const noManifestDir = join(FIXTURE_ROOT, 'no-manifest');
    mkdirSync(noManifestDir, { recursive: true });
    mkdirSync(join(noManifestDir, '.ai-env'), { recursive: true });
    writeFileSync(join(noManifestDir, '.ai-env', 'retrieval-policy.json'), JSON.stringify({
      schema_version: '1.0',
      enabled: true,
      strategies: { exact: { enabled: true, provider: 'ripgrep' }, symbol: { enabled: true }, architecture: { enabled: true }, semantic: { enabled: true }, knowledge: { enabled: true } },
      budgets: { exact: { max_tool_calls: 1, max_results: 25, max_chars: 12000, timeout_ms: 5000 }, symbol: { max_tool_calls: 2 }, architecture: { max_tool_calls: 2 }, semantic: { max_tool_calls: 2 }, knowledge: { max_tool_calls: 2 } }
    }));

    const result = await executeQuery('Sell', noManifestDir, INTENTS.EXACT);

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error, 'Manifest not found');
  });
});

describe('Retrieval Entry - Batch', () => {
  it('batch of six requests produces results in order', async () => {
    createPolicy(FIXTURE_ROOT);
    createProjectManifest(FIXTURE_ROOT);

    const requests = [
      { query: 'QueryA', projectRoot: FIXTURE_ROOT, intent: INTENTS.EXACT },
      { query: 'QueryB', projectRoot: FIXTURE_ROOT, intent: INTENTS.EXACT },
      { query: 'QueryC', projectRoot: FIXTURE_ROOT, intent: INTENTS.EXACT },
      { query: 'QueryA', projectRoot: FIXTURE_ROOT, intent: INTENTS.EXACT },
      { query: 'QueryB', projectRoot: FIXTURE_ROOT, intent: INTENTS.EXACT },
      { query: 'QueryC', projectRoot: FIXTURE_ROOT, intent: INTENTS.EXACT }
    ];

    const batchResult = await executeBatchQueries(requests, {
      adapterOverrides: { ripgrep: () => Promise.resolve(stubAdapter) }
    });

    assert.strictEqual(batchResult.success, true);
    assert.ok(batchResult.results);
    assert.strictEqual(batchResult.results.length, 6);

    for (const r of batchResult.results) {
      assert.strictEqual(r.success, true);
      assert.ok(r.result);
    }

    const items = batchResult.results.map(r => r.result.items[0].preview);
    assert.strictEqual(items[0], 'result for QueryA');
    assert.strictEqual(items[1], 'result for QueryB');
    assert.strictEqual(items[2], 'result for QueryC');
    assert.strictEqual(items[3], 'result for QueryA');
    assert.strictEqual(items[4], 'result for QueryB');
    assert.strictEqual(items[5], 'result for QueryC');
  });

  it('batch of three requests with same query preserves order', async () => {
    createPolicy(FIXTURE_ROOT);
    createProjectManifest(FIXTURE_ROOT);

    const requests = [
      { query: 'First', projectRoot: FIXTURE_ROOT, intent: INTENTS.EXACT },
      { query: 'Second', projectRoot: FIXTURE_ROOT, intent: INTENTS.EXACT },
      { query: 'Third', projectRoot: FIXTURE_ROOT, intent: INTENTS.EXACT }
    ];

    const batchResult = await executeBatchQueries(requests, {
      adapterOverrides: { ripgrep: () => Promise.resolve(stubAdapter) }
    });

    assert.strictEqual(batchResult.success, true);
    assert.strictEqual(batchResult.results.length, 3);
    assert.strictEqual(batchResult.results[0].result.items[0].preview, 'result for First');
    assert.strictEqual(batchResult.results[1].result.items[0].preview, 'result for Second');
    assert.strictEqual(batchResult.results[2].result.items[0].preview, 'result for Third');
  });
});

describe('Retrieval Entry - Error Handling', () => {
  it('non-zero exit when project not adopted', async () => {
    const nonAdoptedDir = join(FIXTURE_ROOT, 'not-adopted');
    mkdirSync(nonAdoptedDir, { recursive: true });

    const result = await executeQuery('Sell', nonAdoptedDir, INTENTS.EXACT);

    assert.strictEqual(result.success, false);
    assert.ok(result.error !== null);
  });

  it('returns clean JSON structure on success', async () => {
    createPolicy(FIXTURE_ROOT);
    createProjectManifest(FIXTURE_ROOT);

    const result = await executeQuery('Sell', FIXTURE_ROOT, INTENTS.EXACT, {
      adapterOverrides: { ripgrep: () => Promise.resolve(stubAdapter) }
    });

    const jsonStr = JSON.stringify(result);
    const parsed = JSON.parse(jsonStr);
    assert.strictEqual(parsed.success, true);
    assert.ok(parsed.result);
    assert.ok(parsed.result.items);
  });
});
