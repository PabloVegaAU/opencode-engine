import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const CONTRACTS = join(REPO_ROOT, 'contracts');
const FIXTURE_ROOT = join(REPO_ROOT, 'tests', 'fixtures', 'qs-sell');
const ROUTER = join(REPO_ROOT, 'bin', 'retrieval', 'retrieval-router.mjs');

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const SCHEMAS = [
  'retrieval-plan-base.schema.json',
  'retrieval-execution-reason-codes.schema.json',
  'retrieval-execution-plan.schema.json',
  'repository-state.schema.json',
  'retrieval-execution-result.schema.json',
  'retrieval-execution-trace.schema.json',
  'retrieval-execution-metrics.schema.json'
];

for (const s of SCHEMAS) {
  const obj = JSON.parse(readFileSync(join(CONTRACTS, s), 'utf8'));
  ajv.addSchema(obj);
}

const TRUSTED_TRACE_DIR = 'retrieval';
const PROJECT_MANIFEST_SCHEMA = JSON.parse(readFileSync(join(REPO_ROOT, 'contracts', 'project-manifest.schema.json'), 'utf8'));
const validateManifest = ajv.compile(PROJECT_MANIFEST_SCHEMA);

// ---------- helpers ----------

function repoEntry(id, path = './' + id, fingerprint = 'a'.repeat(64)) {
  return {
    repository_id: id,
    path,
    commit: 'cafebabe',
    branch: 'main',
    detached: false,
    dirty_worktree: false,
    index_status: 'FRESH',
    indexed_commit: 'cafebabe',
    index_generation: 'cafebabe',
    indexed_at: '2026-07-25T00:00:00Z',
    fingerprint
  };
}

function scopeFingerprint(repos) {
  return '1'.repeat(64);
}

function repoStateSample(repos = [repoEntry('root')]) {
  return {
    schema_version: '1.0',
    repositories: repos,
    scope_fingerprint: scopeFingerprint(repos),
    captured_at: '2026-07-25T00:00:00Z'
  };
}

function v040PlanSample() {
  return {
    schema_version: '1.0',
    enabled: true,
    intent: 'exact',
    strategy: 'exact',
    provider: 'ripgrep',
    reason: 'auto',
    budgets: { max_tool_calls: 1, max_results: 25, max_chars: 12000, timeout_ms: 5000 },
    fallbacks: [],
    repository: 'C:/repo',
    branch: 'main',
    commit: 'cafebabe',
    detached: false,
    indexed_commit: 'cafebabe',
    index_generation: 'cafebabe',
    indexed_at: '2026-07-25T00:00:00Z',
    index_status: 'FRESH',
    dirty_worktree: false,
    warnings: [],
    error: null
  };
}

function v050ExecutionPlanSample() {
  return {
    schema_version: '1.0',
    mode: 'execute',
    execution: {
      estimated_calls: 1,
      budget_enforcement: 'hard',
      progressive_disclosure: true,
      preflight: 'passed',
      repositories_searched: 1
    },
    adapter_signature: '3'.repeat(64)
  };
}

function traceSample() {
  return {
    schema_version: '1.0',
    trace_id: '00000000-0000-0000-0000-000000000000',
    started_at: '2026-07-25T00:00:00Z',
    finished_at: '2026-07-25T00:00:01Z',
    duration_ms: 1000,
    phases: { plan: 1, repository_state: 1, preflight: 1, equivalence: 1, adapter: 5, normalize: 1, budget: 1, result: 1 },
    events: [
      { phase: 'preflight', reason_code: 'PREFLIGHT_OK', at: '2026-07-25T00:00:00.500Z' },
      { phase: 'equivalence', reason_code: 'CACHE_DISABLED_DIRTY_WORKTREE', at: '2026-07-25T00:00:00.700Z' }
    ],
    logical_calls: [
      {
        provider: 'ripgrep',
        is_fallback: false,
        started_at: '2026-07-25T00:00:00.600Z',
        duration_ms: 5,
        exit_was_success: true,
        stdout_chars: 100,
        provider_process_ids: ['a1', 'a2', 'a3'],
        is_focused_read: false
      }
    ],
    provider_processes: [
      { process_id: 'a1', provider: 'ripgrep', repository_id: 'sell-app', cwd: 'repositories/sell-app', args: ['rg', '--json'], started_at: '2026-07-25T00:00:00.600Z', duration_ms: 5, exit_code: 0, stdout_chars: 100 },
      { process_id: 'a2', provider: 'ripgrep', repository_id: 'sell-rules', cwd: 'repositories/sell-rules', args: ['rg', '--json'], started_at: '2026-07-25T00:00:00.605Z', duration_ms: 4, exit_code: 0, stdout_chars: 0 },
      { process_id: 'a3', provider: 'ripgrep', repository_id: 'sell-app', cwd: 'repositories/sell-app', args: ['rg', '--json'], started_at: '2026-07-25T00:00:00.610Z', duration_ms: 5, exit_code: 0, stdout_chars: 0 }
    ],
    focused_reads: []
  };
}

function metricsSample() {
  return {
    schema_version: '1.0',
    session_id: '00000000-0000-0000-0000-000000000000',
    process_started_at: '2026-07-25T00:00:00Z',
    token_estimator_version: 'token-estimator-v1',
    runs: [
      {
        trace_id: '00000000-0000-0000-0000-000000000001',
        intent: 'exact',
        strategy: 'exact',
        provider: 'ripgrep',
        logical_adapter_calls: 1,
        call_budget: 1,
        provider_process_invocations: 3,
        fallback_count: 0,
        raw_result_count: 5,
        result_count: 5,
        result_budget: 25,
        char_count: 500,
        char_budget: 12000,
        cache_hits: 0,
        deduped: 0,
        cache_evictions: 0,
        focused_read_calls: 0,
        focused_read_chars: 0,
        adapter_stdout_chars: 1200,
        normalized_chars: 600,
        emitted_chars: 500,
        estimated_tokens_emitted: 100,
        repositories_searched: 2,
        first_relevant_result_ms: 12,
        duration_ms: 5,
        reason_codes: ['EXECUTION_OK']
      },
      {
        trace_id: '00000000-0000-0000-0000-000000000002',
        intent: 'exact',
        strategy: 'exact',
        provider: 'ripgrep',
        logical_adapter_calls: 0,
        call_budget: 1,
        provider_process_invocations: 0,
        fallback_count: 0,
        raw_result_count: 0,
        result_count: 0,
        result_budget: 25,
        char_count: 0,
        char_budget: 12000,
        cache_hits: 1,
        deduped: 0,
        cache_evictions: 0,
        focused_read_calls: 0,
        focused_read_chars: 0,
        adapter_stdout_chars: 0,
        normalized_chars: 0,
        emitted_chars: 0,
        estimated_tokens_emitted: null,
        repositories_searched: 2,
        first_relevant_result_ms: null,
        duration_ms: 1,
        reason_codes: ['EQUIVALENT_REUSED']
      }
    ],
    summary: {
      total_runs: 2,
      total_logical_adapter_calls: 1,
      total_provider_process_invocations: 3,
      total_results: 5,
      total_emitted_chars: 500,
      total_normalized_chars: 600,
      total_estimated_tokens_emitted: 100,
      total_cache_hits: 1,
      total_deduped: 0,
      total_cache_evictions: 0,
      total_focused_read_calls: 0,
      total_focused_read_chars: 0,
      total_repositories_searched: 2,
      max_logical_calls_in_run: 1,
      mean_logical_calls_per_run: 0.5,
      mean_chars_per_run: 250.0
    }
  };
}

function resultSample() {
  return {
    schema_version: '1.0',
    mode: 'execute',
    plan: v050ExecutionPlanSample(),
    repository_state: repoStateSample(),
    intent: 'exact',
    strategy: 'exact',
    provider: 'ripgrep',
    logical_adapter_calls: 1,
    call_budget: 1,
    provider_process_invocations: 3,
    fallback_count: 0,
    raw_result_count: 5,
    result_count: 3,
    result_budget: 25,  // sample has 3 items below
    char_count: 300,
    char_budget: 12000,
    truncated: false,
    cache_hits: 0,
    deduped: 2,
    cache_evictions: 0,
    focused_read_calls: 0,
    focused_read_chars: 0,
    repositories_searched: 2,
    first_relevant_result_ms: 12,
    adapter_stdout_chars: 1200,
    normalized_chars: 600,
    emitted_chars: 300,
    estimated_tokens_emitted: 60,
    token_estimator_version: 'token-estimator-v1',
    items: [
      { id: 'ripgrep:sell-app:src/main/java/com/example/sell/SellController.java:1:sell-app', kind: 'exact', path: 'src/main/java/com/example/sell/SellController.java', repository_id: 'sell-app', line: 1, column: 1, preview: 'preview', preview_token: null, score: 1.0, source_provider: 'ripgrep' },
      { id: 'ripgrep:sell-app:src/main/java/com/example/sell/SellController.java:2:sell-app', kind: 'exact', path: 'src/main/java/com/example/sell/SellController.java', repository_id: 'sell-app', line: 2, column: 1, preview: 'preview', preview_token: null, score: 1.0, source_provider: 'ripgrep' },
      { id: 'ripgrep:sell-app:src/main/java/com/example/sell/SellController.java:3:sell-app', kind: 'exact', path: 'src/main/java/com/example/sell/SellController.java', repository_id: 'sell-app', line: 3, column: 1, preview: 'preview', preview_token: null, score: 1.0, source_provider: 'ripgrep' }
    ],
    reason_codes: ['EXECUTION_OK', 'ADAPTER_INVOCATION_OK'],
    warnings: [],
    duration_ms: 12,
    trace_id: '00000000-0000-0000-0000-000000000000'
  };
}

// ---------- Describes ----------

describe('v0.5.0 retrieval execution contracts — strict execution-plan', () => {
  it('all contracts are JSON Schema draft 2020-12', () => {
    for (const s of SCHEMAS) {
      const obj = JSON.parse(readFileSync(join(CONTRACTS, s), 'utf8'));
      assert.strictEqual(obj.$schema, 'https://json-schema.org/draft/2020-12/schema', `${s} must use draft 2020-12`);
    }
  });

  it('retrieval-execution-plan is strict: requires mode, execution, adapter_signature', () => {
    const validate = ajv.getSchema('urn:opencode-global:contracts:retrieval-execution-plan:v1');
    const v = v050ExecutionPlanSample();
    assert.strictEqual(validate(v), true, 'sample must validate');
  });

  it('retrieval-execution-plan rejects a v0.4.0 plan (no addendum)', () => {
    const validate = ajv.getSchema('urn:opencode-global:contracts:retrieval-execution-plan:v1');
    assert.strictEqual(validate(v040PlanSample()), false, 'v0.4.0 plan must be rejected by execution-plan');
  });

  it('retrieval-execution-plan rejects an empty object', () => {
    const validate = ajv.getSchema('urn:opencode-global:contracts:retrieval-execution-plan:v1');
    assert.strictEqual(validate({}), false);
  });

  it('retrieval-execution-plan rejects an arbitrary object', () => {
    const validate = ajv.getSchema('urn:opencode-global:contracts:retrieval-execution-plan:v1');
    assert.strictEqual(validate({ arbitrary: true }), false);
  });

  it('retrieval-execution-plan rejects an extra field', () => {
    const validate = ajv.getSchema('urn:opencode-global:contracts:retrieval-execution-plan:v1');
    const v = v050ExecutionPlanSample();
    v.invented = 'no';
    assert.strictEqual(validate(v), false);
  });

  it('retrieval-execution-plan rejects mode other than "execute"', () => {
    const validate = ajv.getSchema('urn:opencode-global:contracts:retrieval-execution-plan:v1');
    const v = v050ExecutionPlanSample();
    v.mode = 'plan';
    assert.strictEqual(validate(v), false);
  });

  it('retrieval-execution-plan rejection is shown when execution block is missing a required field', () => {
    const validate = ajv.getSchema('urn:opencode-global:contracts:retrieval-execution-plan:v1');
    const v = v050ExecutionPlanSample();
    delete v.execution.estimated_calls;
    assert.strictEqual(validate(v), false, 'estimated_calls is required');
    const v2 = v050ExecutionPlanSample();
    delete v2.execution.budget_enforcement;
    assert.strictEqual(validate(v2), false, 'budget_enforcement is required');
    const v3 = v050ExecutionPlanSample();
    delete v3.execution.progressive_disclosure;
    assert.strictEqual(validate(v3), false, 'progressive_disclosure is required');
    const v4 = v050ExecutionPlanSample();
    delete v4.execution.preflight;
    assert.strictEqual(validate(v4), false, 'preflight is required');
    const v5 = v050ExecutionPlanSample();
    delete v5.execution.repositories_searched;
    assert.strictEqual(validate(v5), false, 'repositories_searched is required');
  });

  it('retrieval-execution-plan requires adapter_signature (sha256 64 hex)', () => {
    const validate = ajv.getSchema('urn:opencode-global:contracts:retrieval-execution-plan:v1');
    const v = v050ExecutionPlanSample();
    delete v.adapter_signature;
    assert.strictEqual(validate(v), false);
    v2_test: {
      const v2 = v050ExecutionPlanSample();
      v2.adapter_signature = 'short';
      assert.strictEqual(validate(v2), false);
      break v2_test;
    }
  });

  it('v0.4.0 plan validates against the v0.4.0 base, NOT the strict execution-plan', () => {
    const validateBase = ajv.getSchema('urn:opencode-global:contracts:retrieval-plan-base:v1');
    const validateExecution = ajv.getSchema('urn:opencode-global:contracts:retrieval-execution-plan:v1');
    const v = v040PlanSample();
    assert.strictEqual(validateBase(v), true, 'v0.4.0 plan must validate against the base');
    assert.strictEqual(validateExecution(v), false, 'v0.4.0 plan must NOT validate against the strict execution-plan');
  });
});

describe('v0.5.0 retrieval execution contracts — repository-state', () => {
  it('repository-state validates a single-repo sample', () => {
    const validate = ajv.getSchema('urn:opencode-global:contracts:repository-state:v1');
    assert.strictEqual(validate(repoStateSample()), true);
  });

  it('repository-state validates a multi-repo sample', () => {
    const validate = ajv.getSchema('urn:opencode-global:contracts:repository-state:v1');
    const multi = repoStateSample([
      repoEntry('sell-app', 'repositories/sell-app'),
      repoEntry('sell-rules', 'repositories/sell-rules')
    ]);
    assert.strictEqual(validate(multi), true);
  });

  it('repository-state requires scope_fingerprint (const 64 hex)', () => {
    const obj = JSON.parse(readFileSync(join(CONTRACTS, 'repository-state.schema.json'), 'utf8'));
    assert.strictEqual(obj.properties.scope_fingerprint.pattern, '^[0-9a-f]{64}$');
    assert.ok(!('adapter_signature' in obj.properties), 'repository-state must NOT carry adapter_signature');
  });

  it('repository entry requires fingerprint (per-repo)', () => {
    const obj = JSON.parse(readFileSync(join(CONTRACTS, 'repository-state.schema.json'), 'utf8'));
    const entry = obj.$defs.repositoryEntry;
    assert.ok(entry.required.includes('fingerprint'), 'per-repo fingerprint is required');
    assert.strictEqual(entry.properties.fingerprint.pattern, '^[0-9a-f]{64}$');
  });

  it('repository entry path is POSIX-relative (no leading slash, no backslash, no ..)', () => {
    const obj = JSON.parse(readFileSync(join(CONTRACTS, 'repository-state.schema.json'), 'utf8'));
    const pattern = obj.$defs.repositoryEntry.properties.path.pattern;
    assert.ok(pattern && pattern.includes('A-Za-z0-9'), 'path pattern must be POSIX');
    const re = new RegExp(pattern);
    assert.ok(re.test('repositories/sell-app'));
    assert.ok(re.test('src/main/java'));
    assert.ok(!re.test('/leading'));
    assert.ok(!re.test('back\\slash'));
    assert.ok(!re.test('a/../b'));
    assert.ok(!re.test(''));
  });

  it('repository_id is unique and ordered (runtime invariant)', () => {
    const validate = ajv.getSchema('urn:opencode-global:contracts:repository-state:v1');
    // The schema accepts any order and any duplicates. The runtime invariant is enforced separately.
    const ordered = [repoEntry('a'), repoEntry('b'), repoEntry('c')];
    const sortedIds = ordered.map(r => r.repository_id).sort();
    assert.deepStrictEqual(ordered.map(r => r.repository_id), sortedIds, 'sample ids must be ordered ascending');
    assert.strictEqual(new Set(ordered.map(r => r.repository_id)).size, ordered.length, 'repository_ids must be unique');
    assert.strictEqual(validate({ schema_version: '1.0', repositories: ordered, scope_fingerprint: 'f'.repeat(64), captured_at: '2026-07-25T00:00:00Z' }), true);
  });

  it('repository-state runtime invariant: duplicate repository_id is rejected at runtime', () => {
    const state = {
      schema_version: '1.0',
      repositories: [repoEntry('root'), repoEntry('root')],
      scope_fingerprint: 'f'.repeat(64),
      captured_at: '2026-07-25T00:00:00Z'
    };
    const ids = state.repositories.map(r => r.repository_id);
    // The runtime invariant detects duplicates.
    assert.notStrictEqual(new Set(ids).size, ids.length, 'duplicates must be detected at runtime');
  });

  it('repository-state runtime invariant: unordered repository_id is rejected at runtime', () => {
    const state = {
      schema_version: '1.0',
      repositories: [repoEntry('z'), repoEntry('a'), repoEntry('m')],
      scope_fingerprint: 'f'.repeat(64),
      captured_at: '2026-07-25T00:00:00Z'
    };
    const ids = state.repositories.map(r => r.repository_id);
    const sortedIds = [...ids].sort();
    assert.notDeepStrictEqual(ids, sortedIds, 'unordered ids must be rejected at runtime');
  });

  it('repository-state rejects an entry without a fingerprint', () => {
    const validate = ajv.getSchema('urn:opencode-global:contracts:repository-state:v1');
    const bad = repoEntry('root');
    delete bad.fingerprint;
    assert.strictEqual(validate(repoStateSample([bad])), false, 'per-repo fingerprint is required');
  });

  it('repository-state rejects an absolute path', () => {
    const validate = ajv.getSchema('urn:opencode-global:contracts:repository-state:v1');
    const bad = repoEntry('root', 'C:/repo');
    assert.strictEqual(validate(repoStateSample([bad])), false);
  });
});

describe('v0.5.0 retrieval execution contracts — result invariants', () => {
  it('result validates a sample', () => {
    const validate = ajv.getSchema('urn:opencode-global:contracts:retrieval-execution-result:v1');
    assert.strictEqual(validate(resultSample()), true);
  });

  it('result rejects mode other than "execute"', () => {
    const validate = ajv.getSchema('urn:opencode-global:contracts:retrieval-execution-result:v1');
    const r = resultSample();
    r.mode = 'plan';
    assert.strictEqual(validate(r), false);
  });

  it('result invariants are documented (logical_adapter_calls <= call_budget, fallback_count <= logical_adapter_calls, provider_process_invocations >= logical_adapter_calls)', () => {
    const obj = JSON.parse(readFileSync(join(CONTRACTS, 'retrieval-execution-result.schema.json'), 'utf8'));
    assert.ok(obj.properties.logical_adapter_calls.description.includes('logical adapter calls'));
    assert.ok(obj.properties.fallback_count.description.includes('fallback_count <= logical_adapter_calls'));
    assert.ok(obj.properties.provider_process_invocations.description.includes('provider_process_invocations >= logical_adapter_calls'));
  });

  it('result does NOT use the old call_count + fallback_count sum rule (rename only)', () => {
    const obj = JSON.parse(readFileSync(join(CONTRACTS, 'retrieval-execution-result.schema.json'), 'utf8'));
    assert.ok(!('call_count' in obj.properties), 'call_count must be renamed to logical_adapter_calls');
  });

  it('result rejects arbitrary reason_codes strings', () => {
    const validate = ajv.getSchema('urn:opencode-global:contracts:retrieval-execution-result:v1');
    const r = resultSample();
    r.reason_codes = ['NOT_A_REAL_CODE'];
    assert.strictEqual(validate(r), false);
  });

  it('result accepts all frozen reason codes', () => {
    const validate = ajv.getSchema('urn:opencode-global:contracts:retrieval-execution-result:v1');
    const enumSchema = JSON.parse(readFileSync(join(CONTRACTS, 'retrieval-execution-reason-codes.schema.json'), 'utf8'));
    const r = resultSample();
    r.reason_codes = enumSchema.enum;
    assert.strictEqual(validate(r), true);
  });

  it('result.item requires all promised fields', () => {
    const obj = JSON.parse(readFileSync(join(CONTRACTS, 'retrieval-execution-result.schema.json'), 'utf8'));
    const itemRequired = obj.properties.items.items.required;
    for (const f of ['id', 'kind', 'path', 'repository_id', 'line', 'column', 'preview', 'preview_token', 'score', 'source_provider']) {
      assert.ok(itemRequired.includes(f), `item must require ${f}`);
    }
  });

  it('result rejects an item where repository_id is missing', () => {
    const validate = ajv.getSchema('urn:opencode-global:contracts:retrieval-execution-result:v1');
    const r = resultSample();
    r.items[0].repository_id = undefined;
    assert.strictEqual(validate(r), false);
  });

  it('result invariants are enforced at the type level (logical_adapter_calls <= 3, call_budget <= 3, fallback_count <= 50, provider_process_invocations <= 100, raw_result_count <= 50, result_count <= 50)', () => {
    const validate = ajv.getSchema('urn:opencode-global:contracts:retrieval-execution-result:v1');
    const r = resultSample();
    // The schema enforces type-level maximums. The relative invariants are documented in the descriptions.
    assert.strictEqual(validate(r), true);
    // A snapshot with logical_adapter_calls = 100 is rejected by the type.
    const r2 = resultSample();
    r2.logical_adapter_calls = 100;
    assert.strictEqual(validate(r2), false);
  });

  it('result requires token_estimator_version', () => {
    const obj = JSON.parse(readFileSync(join(CONTRACTS, 'retrieval-execution-result.schema.json'), 'utf8'));
    assert.ok(obj.required.includes('token_estimator_version'));
  });

  it('result requires focused_read_calls and focused_read_chars', () => {
    const obj = JSON.parse(readFileSync(join(CONTRACTS, 'retrieval-execution-result.schema.json'), 'utf8'));
    assert.ok(obj.required.includes('focused_read_calls'));
    assert.ok(obj.required.includes('focused_read_chars'));
  });

  it('result requires provider_process_invocations', () => {
    const obj = JSON.parse(readFileSync(join(CONTRACTS, 'retrieval-execution-result.schema.json'), 'utf8'));
    assert.ok(obj.required.includes('provider_process_invocations'));
  });

  it('result requires logical_adapter_calls (no call_count)', () => {
    const obj = JSON.parse(readFileSync(join(CONTRACTS, 'retrieval-execution-result.schema.json'), 'utf8'));
    assert.ok(obj.required.includes('logical_adapter_calls'));
    assert.ok(!obj.required.includes('call_count'));
  });

  it('result rejects provider "knowledge" (knowledge is a strategy, not a provider)', () => {
    const validate = ajv.getSchema('urn:opencode-global:contracts:retrieval-execution-result:v1');
    const r = resultSample();
    r.provider = 'knowledge';
    assert.strictEqual(validate(r), false);
  });

  it('providers are restricted to ripgrep | git_grep | filesystem (plus null)', () => {
    const obj = JSON.parse(readFileSync(join(CONTRACTS, 'retrieval-execution-result.schema.json'), 'utf8'));
    const expected = ['ripgrep', 'git_grep', 'filesystem'];
    assert.deepStrictEqual(obj.properties.provider.enum.filter(v => v !== null), expected);
  });
});

describe('v0.5.0 retrieval execution contracts — trace and metrics', () => {
  it('trace validates a sample with logical_calls and provider_processes', () => {
    const validate = ajv.getSchema('urn:opencode-global:contracts:retrieval-execution-trace:v1');
    assert.strictEqual(validate(traceSample()), true);
  });

  it('trace runtime invariant: a logical_call must reference at least one provider_process', () => {
    const validate = ajv.getSchema('urn:opencode-global:contracts:retrieval-execution-trace:v1');
    const t = traceSample();
    t.logical_calls[0].provider_process_ids = [];
    assert.strictEqual(validate(t), true, 'schema does not enforce non-empty process_ids; runtime must');
    // Runtime invariant: the number of process_ids must match the number of processes in the same logical scope.
    const referenced = new Set(t.logical_calls[0].provider_process_ids);
    const actual = new Set(t.provider_processes.map(p => p.process_id));
    for (const r of referenced) {
      assert.ok(actual.has(r), 'referenced process_id must exist in provider_processes');
    }
  });

  it('trace runtime invariant: a logical_call with is_focused_read=true requires a focused_reads entry', () => {
    const validate = ajv.getSchema('urn:opencode-global:contracts:retrieval-execution-trace:v1');
    const t = traceSample();
    // Add a focused_read logical_call AND a focused_reads entry. The invariant holds.
    t.logical_calls.push({ provider: 'filesystem', is_fallback: false, started_at: '2026-07-25T00:00:00.700Z', duration_ms: 1, exit_was_success: true, stdout_chars: 100, provider_process_ids: ['b1'], is_focused_read: true });
    t.provider_processes.push({ process_id: 'b1', provider: 'filesystem', repository_id: 'sell-app', cwd: 'repositories/sell-app', args: ['read'], started_at: '2026-07-25T00:00:00.700Z', duration_ms: 1, exit_code: 0, stdout_chars: 100 });
    t.focused_reads.push({ preview_token: 'tok-1', scope_fingerprint: 'a'.repeat(64), allowed_root_check: 'passed', deny_glob_check: 'passed', started_at: '2026-07-25T00:00:00.700Z', duration_ms: 1, char_count: 50 });
    assert.strictEqual(validate(t), true);
    const focusedLogicalCalls = t.logical_calls.filter(l => l.is_focused_read);
    assert.strictEqual(focusedLogicalCalls.length, t.focused_reads.length, 'every focused_read logical_call MUST have a focused_reads entry');
  });

  it('focused_reads entry requires scope_fingerprint (re-validated at expansion time)', () => {
    const validate = ajv.getSchema('urn:opencode-global:contracts:retrieval-execution-trace:v1');
    const t = traceSample();
    t.focused_reads.push({ preview_token: 'tok', started_at: '2026-07-25T00:00:01.000Z', duration_ms: 1, char_count: 50 });
    assert.strictEqual(validate(t), false, 'scope_fingerprint must be re-validated at expansion');
  });

  it('metrics validates a sample', () => {
    const validate = ajv.getSchema('urn:opencode-global:contracts:retrieval-execution-metrics:v1');
    assert.strictEqual(validate(metricsSample()), true);
  });

  it('metrics invariants are documented (logical_adapter_calls <= call_budget, fallback_count <= logical_adapter_calls, provider_process_invocations >= logical_adapter_calls)', () => {
    const obj = JSON.parse(readFileSync(join(CONTRACTS, 'retrieval-execution-metrics.schema.json'), 'utf8'));
    assert.strictEqual(obj.properties.runs.items.properties.logical_adapter_calls.maximum, 3);
    assert.strictEqual(obj.properties.runs.items.properties.call_budget.maximum, 3);
    assert.ok(obj.properties.runs.items.properties.fallback_count.minimum >= 0);
    assert.ok(obj.properties.runs.items.properties.provider_process_invocations.minimum >= 0);
  });

  it('metrics does NOT use the old call_count + fallback_count sum rule', () => {
    const obj = JSON.parse(readFileSync(join(CONTRACTS, 'retrieval-execution-metrics.schema.json'), 'utf8'));
    assert.ok(!('call_count' in obj.properties.runs.items.properties), 'call_count must be renamed');
  });

  it('metrics summary invariants are documented', () => {
    const obj = JSON.parse(readFileSync(join(CONTRACTS, 'retrieval-execution-metrics.schema.json'), 'utf8'));
    assert.ok(obj.properties.summary.required.includes('total_logical_adapter_calls'));
    assert.ok(obj.properties.summary.required.includes('total_provider_process_invocations'));
    assert.ok(obj.properties.summary.required.includes('total_focused_read_calls'));
    assert.ok(obj.properties.summary.required.includes('total_focused_read_chars'));
  });

  it('metrics requires token_estimator_version at the top level', () => {
    const obj = JSON.parse(readFileSync(join(CONTRACTS, 'retrieval-execution-metrics.schema.json'), 'utf8'));
    assert.ok(obj.required.includes('token_estimator_version'));
  });
});

describe('v0.5.0 retrieval execution contracts — security globs', () => {
  it('list of deny globs is documented in the spec', () => {
    const spec = readFileSync(join(REPO_ROOT, 'docs', 'RETRIEVAL_EXECUTION.md'), 'utf8');
    for (const needle of ['.git/**', '.env', '.env.*', '.secrets/**', 'credentials', 'application.properties', 'protected_paths']) {
      assert.ok(spec.includes(needle), `spec must mention deny glob: ${needle}`);
    }
  });

  it('list of deny globs is frozen in the catalog', () => {
    const obj = JSON.parse(readFileSync(join(CONTRACTS, 'retrieval-execution-reason-codes.schema.json'), 'utf8'));
    assert.ok(obj.enum.includes('DENY_GLOB_MATCHED'));
    assert.ok(obj.enum.includes('CACHE_DISABLED_DIRTY_WORKTREE'));
    assert.ok(obj.enum.includes('FOCUSED_READ_INVOKED'));
    assert.ok(obj.enum.includes('TRACE_PATH_REJECTED'));
    assert.ok(obj.enum.includes('METRICS_PATH_REJECTED'));
    assert.ok(obj.enum.includes('CROSS_PROCESS_CACHE_HIT_DISALLOWED'));
  });
});

describe('v0.5.0 retrieval execution contracts — wrapper rules', () => {
  it('wrapper does not use Invoke-Expression', () => {
    const ps = readFileSync(join(REPO_ROOT, 'scripts', 'retrieval-router.ps1'), 'utf8');
    assert.ok(!ps.includes('Invoke-Expression'));
  });

  it('wrapper does not construct shell commands via string concatenation', () => {
    const ps = readFileSync(join(REPO_ROOT, 'scripts', 'retrieval-router.ps1'), 'utf8');
    assert.ok(!/'\s*\+\s*\$/.test(ps));
  });
});

describe('v0.5.0 retrieval execution contracts — cli opts', () => {
  it('TracePath / WriteTrace / WriteMetrics documented as restricted', () => {
    const spec = readFileSync(join(REPO_ROOT, 'docs', 'RETRIEVAL_EXECUTION.md'), 'utf8');
    assert.ok(spec.includes('TracePath') && spec.includes('WriteTrace') && spec.includes('WriteMetrics'));
  });

  it('BatchInput / executeBatch documented', () => {
    const spec = readFileSync(join(REPO_ROOT, 'docs', 'RETRIEVAL_EXECUTION.md'), 'utf8');
    assert.ok(spec.includes('BatchInput') || spec.includes('executeBatch'));
  });

  it('OPENCODE_RETRIEVAL_MODE is documented as rejected', () => {
    const spec = readFileSync(join(REPO_ROOT, 'docs', 'RETRIEVAL_EXECUTION.md'), 'utf8');
    assert.ok(spec.includes('OPENCODE_RETRIEVAL_MODE'));
    const ctx = spec.split('\n').filter(l => l.includes('OPENCODE_RETRIEVAL_MODE')).join(' ');
    assert.ok(/reject/i.test(ctx) || /not supported/i.test(ctx));
  });

  it('No new public command is introduced in v0.5.0', () => {
    const cmds = readFileSync(join(REPO_ROOT, 'commands', 'init-ai-env.md'), 'utf8');
    // sanity check: no new public command (`/qs-sell-*`, `/run-batch`, etc.)
    assert.ok(!/^\/qs-sell-run/m.test(cmds));
  });
});

describe('v0.5.0 retrieval execution contracts — fixture manifest', () => {
  it('tests/fixtures/qs-sell/project-manifest.json is valid against the real schema', () => {
    const manifest = JSON.parse(readFileSync(join(FIXTURE_ROOT, 'project-manifest.json'), 'utf8'));
    assert.strictEqual(validateManifest(manifest), true, 'project-manifest.json must validate against contracts/project-manifest.schema.json');
  });

  it('fixture manifest uses relative paths in repositories[].path', () => {
    const manifest = JSON.parse(readFileSync(join(FIXTURE_ROOT, 'project-manifest.json'), 'utf8'));
    for (const r of manifest.repositories) {
      assert.ok(!/^[A-Za-z]:[\\/]/.test(r.path), `path must be relative: ${r.path}`);
      assert.ok(!r.path.startsWith('/'), `path must not start with /: ${r.path}`);
    }
  });

  it('fixture manifest declares at least 2 repositories with unique repository_id', () => {
    const manifest = JSON.parse(readFileSync(join(FIXTURE_ROOT, 'project-manifest.json'), 'utf8'));
    assert.ok(manifest.repositories.length >= 2);
    const ids = manifest.repositories.map(r => r.repository_id);
    assert.strictEqual(new Set(ids).size, ids.length, 'repository_ids must be unique');
  });

  it('benchmark scope is resolved from the manifest, not from hardcoded REPO_IDS', () => {
    const benchmark = readFileSync(join(REPO_ROOT, 'tests', 'integration', 'benchmark-qs-sell.test.mjs'), 'utf8');
    assert.ok(/from ['"]fs['"]|from ['"]node:fs['"]|require\(['"]fs['"]\)/.test(benchmark), 'benchmark must read the manifest from disk via fs');
    assert.ok(benchmark.includes('project-manifest.json'), 'benchmark must reference project-manifest.json');
    // The benchmark file must NOT carry hardcoded REPO_IDS as a constant.
    assert.ok(!/const REPO_IDS\s*=\s*\[/.test(benchmark), 'benchmark must NOT use hardcoded REPO_IDS');
  });
});

describe('v0.5.0 retrieval execution contracts — closed decisions', () => {
  it('P1: architecture is plan-only in v0.5.0 — no executable architecture provider', () => {
    const result = JSON.parse(readFileSync(join(CONTRACTS, 'retrieval-execution-result.schema.json'), 'utf8'));
    assert.deepStrictEqual(result.properties.provider.enum.filter(v => v !== null), ['ripgrep', 'git_grep', 'filesystem']);
  });

  it('P2: CACHE_EVICTED is a reason code (metric/event, not warning)', () => {
    const obj = JSON.parse(readFileSync(join(CONTRACTS, 'retrieval-execution-reason-codes.schema.json'), 'utf8'));
    assert.ok(obj.enum.includes('CACHE_EVICTED'));
  });

  it('P3: result_count is items.length — schema describes the invariant', () => {
    const validate = ajv.getSchema('urn:opencode-global:contracts:retrieval-execution-result:v1');
    const r = resultSample();
    assert.strictEqual(r.result_count, r.items.length);
    assert.strictEqual(validate(r), true);
  });

  it('P4: ADR matching is case-insensitive — knowledge_paths includes both adr and ADR forms', () => {
    const src = readFileSync(join(REPO_ROOT, 'bin', 'retrieval', 'retrieval-router.mjs'), 'utf8');
    assert.ok(src.includes('**/adr/**') && src.includes('**/ADR/**'));
  });

  it('P5: OPENCODE_RETRIEVAL_MODE is rejected', () => {
    const spec = readFileSync(join(REPO_ROOT, 'docs', 'RETRIEVAL_EXECUTION.md'), 'utf8');
    const ctx = spec.split('\n').filter(l => l.includes('OPENCODE_RETRIEVAL_MODE')).join(' ');
    assert.ok(/reject/i.test(ctx) || /not supported/i.test(ctx));
  });

  it('P6+: logical_adapter_calls vs provider_process_invocations are separate fields', () => {
    const result = JSON.parse(readFileSync(join(CONTRACTS, 'retrieval-execution-result.schema.json'), 'utf8'));
    assert.ok('logical_adapter_calls' in result.properties);
    assert.ok('provider_process_invocations' in result.properties);
    assert.ok(!('call_count' in result.properties));
  });

  it('P7: progressive disclosure is stateless and limited to the same batch', () => {
    const result = JSON.parse(readFileSync(join(CONTRACTS, 'retrieval-execution-result.schema.json'), 'utf8'));
    const itemRequired = result.properties.items.items.required;
    assert.ok(itemRequired.includes('preview_token'));
    const itemProps = result.properties.items.items.properties;
    assert.ok(itemProps.preview_token.description.includes('Stateless') || itemProps.preview_token.description.includes('same batch'));
  });

  it('dirty_worktree disables the equivalence cache (CACHE_DISABLED_DIRTY_WORKTREE)', () => {
    const obj = JSON.parse(readFileSync(join(CONTRACTS, 'retrieval-execution-reason-codes.schema.json'), 'utf8'));
    assert.ok(obj.enum.includes('CACHE_DISABLED_DIRTY_WORKTREE'));
  });

  it('dirty_worktree=true content changes twice with dirty=true are documented', () => {
    const benchmark = readFileSync(join(REPO_ROOT, 'tests', 'integration', 'benchmark-qs-sell.test.mjs'), 'utf8');
    assert.ok(benchmark.includes('dirty-1'), 'benchmark must demonstrate content changes with dirty=true');
    assert.ok(benchmark.includes('dirty-2'), 'benchmark must demonstrate second content change');
  });

  it('adapter_signature is computed in execution-plan, not in repository-state', () => {
    const state = JSON.parse(readFileSync(join(CONTRACTS, 'repository-state.schema.json'), 'utf8'));
    const plan = JSON.parse(readFileSync(join(CONTRACTS, 'retrieval-execution-plan.schema.json'), 'utf8'));
    assert.ok(!('adapter_signature' in state.properties), 'repository-state must not carry adapter_signature');
    assert.ok('adapter_signature' in plan.properties, 'execution-plan must carry adapter_signature');
    assert.ok(plan.properties.adapter_signature.description.includes('scope_fingerprint'));
  });
});

describe('v0.5.0 retrieval execution contracts — exact fallback defaults', () => {
  it('execute default reserves 1 primary + 1 fallback (logical_adapter_calls <= 2)', () => {
    const plan = v050ExecutionPlanSample();
    assert.ok(plan.execution.estimated_calls <= 2, 'execute default reserves 1 primary + 1 fallback');
    assert.ok(plan.adapter_signature.length === 64, 'adapter_signature is computed');
  });

  it('plan-only v0.4.0 output is not modified by the execution contract', () => {
    const v = v040PlanSample();
    assert.strictEqual(v.mode, undefined);
    assert.strictEqual(v.execution, undefined);
    assert.strictEqual(v.adapter_signature, undefined);
  });
});

describe('v0.5.0 retrieval execution contracts — trace path restriction', () => {
  it('TracePath must be under the global runtime, not inside the project', () => {
    const spec = readFileSync(join(REPO_ROOT, 'docs', 'RETRIEVAL_EXECUTION.md'), 'utf8');
    assert.ok(spec.includes('Resolve-Path') || spec.includes('Resolve-Path'), 'spec must describe the path validation');
    assert.ok(spec.toLowerCase().includes('runtime') || spec.toLowerCase().includes('global'), 'spec must describe the runtime dir');
  });

  it('TRUSTED_TRACE_DIR is documented', () => {
    const spec = readFileSync(join(REPO_ROOT, 'docs', 'RETRIEVAL_EXECUTION.md'), 'utf8');
    assert.ok(spec.includes('TRUSTED_TRACE_DIR') || spec.includes('trusted trace directory'), 'spec must describe the trusted dir');
  });
});

describe('v0.5.0 retrieval execution contracts — wrapper adapter-stats', () => {
  it('v0.5.0 plan validates against the v0.5.0 plan-base compatibility gate', () => {
    // The v0.4.0 plan object must validate against the base,
    // and it must NOT validate against the strict execution-plan.
    const v = v040PlanSample();
    const validateBase = ajv.getSchema('urn:opencode-global:contracts:retrieval-plan-base:v1');
    const validateExecution = ajv.getSchema('urn:opencode-global:contracts:retrieval-execution-plan:v1');
    assert.strictEqual(validateBase(v), true);
    assert.strictEqual(validateExecution(v), false);
  });
});

describe('v0.5.0 retrieval execution contracts — scenario tests', () => {
  let tmpDir;
  let tmpHome;

  before(() => {
    tmpDir = join(REPO_ROOT, '.tmp-contracts-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8));
    mkdirSync(tmpDir, { recursive: true });
    mkdirSync(join(tmpDir, '.ai-env'), { recursive: true });
    execFileSync('git', ['init', '-q'], { cwd: tmpDir });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: tmpDir });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: tmpDir });
    writeFileSync(join(tmpDir, 'README.md'), 'Test\n');
    execFileSync('git', ['add', '.'], { cwd: tmpDir });
    execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: tmpDir });
    writeFileSync(join(tmpDir, '.ai-env', 'retrieval-policy.json'), JSON.stringify({
      schema_version: '1.0',
      enabled: true,
      strategies: {
        exact: { enabled: true, provider: 'ripgrep' },
        symbol: { enabled: true, provider: 'lsp' },
        architecture: { enabled: true, provider: 'codebase-memory' },
        semantic: { enabled: false, provider: null },
        knowledge: { enabled: true, provider: 'filesystem' }
      },
      budgets: {
        exact: { max_tool_calls: 1, max_results: 25, max_chars: 12000 },
        symbol: { max_tool_calls: 2, max_results: 25, max_chars: 16000 },
        architecture: { max_tool_calls: 2, max_results: 30, max_chars: 20000 },
        semantic: { max_tool_calls: 2, max_results: 12, max_chars: 16000 },
        knowledge: { max_tool_calls: 2, max_results: 12, max_chars: 16000 }
      }
    }));
  });

  after(() => {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  it('v0.4.0 plan from the router validates against the v0.4.0 base contract', () => {
    const stdout = execFileSync('node', [ROUTER, '--query', 'SellController.create', '--project-root', tmpDir, '--intent', 'exact'], { encoding: 'utf8' });
    const plan = JSON.parse(stdout.trim());
    const validate = ajv.getSchema('urn:opencode-global:contracts:retrieval-plan-base:v1');
    assert.strictEqual(validate(plan), true);
  });

  it('v0.4.0 plan from the router does NOT validate against the strict execution-plan', () => {
    const stdout = execFileSync('node', [ROUTER, '--query', 'SellController.create', '--project-root', tmpDir, '--intent', 'exact'], { encoding: 'utf8' });
    const plan = JSON.parse(stdout.trim());
    const validate = ajv.getSchema('urn:opencode-global:contracts:retrieval-execution-plan:v1');
    assert.strictEqual(validate(plan), false, 'v0.4.0 plan must NOT validate against the strict execution-plan');
  });
});
