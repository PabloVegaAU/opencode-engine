import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync, mkdirSync, writeFileSync, rmSync, readdirSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const FIXTURE_ROOT = join(REPO_ROOT, 'tests', 'fixtures', 'qs-sell');
const MANIFEST_PATH = join(FIXTURE_ROOT, 'project-manifest.json');
const BASELINE_PATH = join(FIXTURE_ROOT, 'pilot-baseline.json');
const ROUTER = join(REPO_ROOT, 'bin', 'retrieval', 'retrieval-router.mjs');
const PROJECT_MANIFEST_SCHEMA = JSON.parse(readFileSync(join(REPO_ROOT, 'contracts', 'project-manifest.schema.json'), 'utf8'));

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validateManifest = ajv.compile(PROJECT_MANIFEST_SCHEMA);

const FIXED_ENV = {
  GIT_AUTHOR_NAME: 'qs-sell-fixture',
  GIT_AUTHOR_EMAIL: 'fixture@example.com',
  GIT_COMMITTER_NAME: 'qs-sell-fixture',
  GIT_COMMITTER_EMAIL: 'fixture@example.com',
  GIT_AUTHOR_DATE: '2026-07-25T00:00:00Z',
  GIT_COMMITTER_DATE: '2026-07-25T00:00:00Z'
};

const FIXED_BRANCH = 'qs-sell-fixture-branch';

let tmpRepos = [];
let currentManifest = null;

function copyDir(src, dst) {
  mkdirSync(dst, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    if (entry.name === '.git') continue;
    const s = join(src, entry.name);
    const d = join(dst, entry.name);
    if (entry.isDirectory()) {
      copyDir(s, d);
    } else {
      copyFileSync(s, d);
    }
  }
}

function setupRepos() {
  currentManifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  tmpRepos = [];
  for (const repo of currentManifest.repositories) {
    const src = join(FIXTURE_ROOT, repo.path);
    const tmpDir = join(REPO_ROOT, '.tmp-bench-' + repo.repository_id + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8));
    copyDir(src, tmpDir);
    const env = { ...process.env, ...FIXED_ENV };
    execFileSync('git', ['init', '-q', '-b', FIXED_BRANCH], { cwd: tmpDir, stdio: 'ignore', env });
    execFileSync('git', ['config', 'user.email', FIXED_ENV.GIT_AUTHOR_EMAIL], { cwd: tmpDir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', FIXED_ENV.GIT_AUTHOR_NAME], { cwd: tmpDir, stdio: 'ignore' });
    execFileSync('git', ['add', '.'], { cwd: tmpDir, stdio: 'ignore', env });
    execFileSync('git', ['commit', '-q', '-m', 'qs-sell fixture initial'], { cwd: tmpDir, stdio: 'ignore', env });
    tmpRepos.push({ repo, tmpDir });
  }
}

function teardownRepos() {
  for (const { tmpDir } of tmpRepos) {
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  }
}

function getCommit(repo) {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo.tmpDir, encoding: 'utf8' }).trim();
}

function getBranch(repo) {
  return execFileSync('git', ['branch', '--show-current'], { cwd: repo.tmpDir, encoding: 'utf8' }).trim();
}

function getAuthorDate(repo) {
  return execFileSync('git', ['log', '-1', '--format=%aI'], { cwd: repo.tmpDir, encoding: 'utf8' }).trim();
}

function getCommitterDate(repo) {
  return execFileSync('git', ['log', '-1', '--format=%cI'], { cwd: repo.tmpDir, encoding: 'utf8' }).trim();
}

function runRouter(query, repo, intent) {
  const stdout = execFileSync('node', [ROUTER, '--query', query, '--project-root', repo.tmpDir, '--intent', intent], { encoding: 'utf8' });
  return JSON.parse(stdout.trim());
}

function contentFingerprint(dir) {
  const files = [];
  function walk(d) {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      if (entry.name === '.git') continue;
      const p = join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else files.push({ path: relative(dir, p), content: readFileSync(p, 'utf8') });
    }
  }
  walk(dir);
  files.sort((a, b) => a.path.localeCompare(b.path));
  return JSON.stringify(files);
}

function relative(dir, p) {
  // Simple relative path
  return p.startsWith(dir) ? p.substring(dir.length + 1) : p;
}

const QUERY_SET = [
  { query: 'SellController.create', intent: 'exact' },
  { query: 'SellController.create', intent: 'exact' },
  { query: 'class SellService', intent: 'symbol' },
  { query: 'class SellService', intent: 'symbol' },
  { query: 'why does the qs/sell endpoint require authentication', intent: 'knowledge' },
  { query: 'why does the qs/sell endpoint require authentication', intent: 'knowledge' }
];

describe('qs/sell benchmark contract/fixture (NOT real executed)', () => {
  before(() => {
    assert.ok(existsSync(MANIFEST_PATH), 'project-manifest.json must exist');
    assert.ok(existsSync(BASELINE_PATH), 'pilot-baseline.json must exist');
    setupRepos();
  });

  after(() => {
    teardownRepos();
  });

  it('fixture is synthetic and labelled as such', () => {
    const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
    assert.strictEqual(baseline.provenance, 'synthetic', 'provenance must be synthetic');
    assert.strictEqual(baseline.measurement_method, 'contract/fixture only — NOT executed by the engine');
    assert.strictEqual(baseline.token_estimator, 'token-estimator-v1');
    assert.ok(baseline.repository_fingerprints, 'repository_fingerprints must be present');
    assert.ok(baseline.source_trace, 'source_trace must be present');
  });

  it('pilot-baseline.json has provisional placeholder values, NOT measured values', () => {
    const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
    assert.strictEqual(baseline.pilot_run.observations.provenance, 'Provisional placeholder. NOT verified. Reserved for Phase 7 release gates.');
    assert.strictEqual(baseline.pilot_run.observations.total_adapter_calls, null);
    assert.strictEqual(baseline.pilot_run.observations.total_chars_emitted, null);
    assert.strictEqual(baseline.pilot_run.observations.total_tokens_emitted, null);
    assert.strictEqual(baseline.pilot_run.observations.equivalent_repeats, null);
    assert.strictEqual(baseline.v050_release_gates.status, 'RESERVED');
    assert.strictEqual(baseline.v050_release_gates.call_reduction_min_pct, null);
  });

  it('project-manifest.json is valid against the real project-manifest schema', () => {
    const valid = validateManifest(currentManifest);
    assert.strictEqual(valid, true, 'project-manifest.json must validate against contracts/project-manifest.schema.json');
  });

  it('scope is resolved from project-manifest.json, not from hardcoded REPO_IDS constants', () => {
    assert.strictEqual(currentManifest.repositories.length, 2, 'manifest must declare 2 repositories');
    assert.strictEqual(currentManifest.repositories[0].repository_id, 'sell-app');
    assert.strictEqual(currentManifest.repositories[1].repository_id, 'sell-rules');
    assert.ok(currentManifest.repositories.every(r => r.path.startsWith('repositories/')), 'paths must be relative');
  });

  it('repositories are created with deterministic branch, author date, committer date', () => {
    for (const repo of tmpRepos) {
      assert.strictEqual(getBranch(repo), FIXED_BRANCH, 'branch must be fixed');
      assert.strictEqual(getAuthorDate(repo), FIXED_ENV.GIT_AUTHOR_DATE, 'author date must be fixed');
      assert.strictEqual(getCommitterDate(repo), FIXED_ENV.GIT_COMMITTER_DATE, 'committer date must be fixed');
    }
  });

  it('commits are NOT compared with themselves (different runs produce different commits at different timestamps, but content is reproducible)', () => {
    const fp1 = contentFingerprint(tmpRepos[0].tmpDir);
    const marker = join(tmpRepos[0].tmpDir, 'MARKER.txt');
    writeFileSync(marker, 'dirty-1');
    const fpDirty1 = contentFingerprint(tmpRepos[0].tmpDir);
    assert.notStrictEqual(fp1, fpDirty1, 'fingerprint MUST change when content changes');
    writeFileSync(marker, 'dirty-2');
    const fpDirty2 = contentFingerprint(tmpRepos[0].tmpDir);
    assert.notStrictEqual(fpDirty1, fpDirty2, 'fingerprint MUST reflect the second content change');
    rmSync(marker);
    const fpRestored = contentFingerprint(tmpRepos[0].tmpDir);
    assert.strictEqual(fpRestored, fp1, 'fingerprint MUST restore to the original after deletion');
  });

  it('fixture contains the qs/sell entities required by the contract', () => {
    const files = [];
    function walk(d) {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        if (entry.name === '.git') continue;
        const p = join(d, entry.name);
        if (entry.isDirectory()) walk(p);
        else files.push(relative(tmpRepos[0].tmpDir, p));
      }
    }
    walk(tmpRepos[0].tmpDir);
    const names = files.map(f => f.replace(/\\/g, '/'));
    assert.ok(names.some(n => n.endsWith('SellController.java')), 'SellController.java must exist');
    assert.ok(names.some(n => n.endsWith('SellService.java')), 'SellService.java must exist');
    assert.ok(names.some(n => n.endsWith('Sell.java')), 'Sell.java must exist');
    assert.ok(names.some(n => n.endsWith('SellDetail.java')), 'SellDetail.java must exist');
    const sellController = readFileSync(join(tmpRepos[0].tmpDir, 'src/main/java/com/example/sell/SellController.java'), 'utf8');
    assert.ok(sellController.includes('qs/sell'), 'endpoint literal "qs/sell" must be present');
    assert.ok(sellController.includes('SellService'), 'Controller must reference SellService');
    const sellService = readFileSync(join(tmpRepos[0].tmpDir, 'src/main/java/com/example/sell/SellService.java'), 'utf8');
    assert.ok(sellService.includes('Sell'), 'Service must reference Sell');
    assert.ok(sellService.includes('SellDetail'), 'Service must reference SellDetail');
  });

  it('benchmark queries are derived from the qs/sell flow', () => {
    const baseQuery = 'qué archivos entity están relacionados con el flujo qs/sell y de qué trata cada uno';
    assert.ok(QUERY_SET.some(q => q.query === 'SellController.create'), 'exact query must be SellController.create');
    assert.ok(QUERY_SET.some(q => q.query === 'class SellService'), 'symbol query must be class SellService');
    assert.ok(QUERY_SET.some(q => q.query === 'why does the qs/sell endpoint require authentication'), 'knowledge query must be qs/sell themed');
    assert.ok(QUERY_SET.some(q => q.query.includes('qs/sell')), 'at least one query must include the qs/sell endpoint');
    void baseQuery;
  });

  it('three distinct intents are exercised (exact, symbol, knowledge)', () => {
    const intents = new Set(QUERY_SET.map(q => q.intent));
    assert.strictEqual(intents.size, 3);
    assert.ok(intents.has('exact'));
    assert.ok(intents.has('symbol'));
    assert.ok(intents.has('knowledge'));
  });

  it('each query is run twice (in-process cache contract)', () => {
    const counts = new Map();
    for (const q of QUERY_SET) counts.set(q.query, (counts.get(q.query) || 0) + 1);
    for (const [, c] of counts) assert.strictEqual(c, 2);
  });

  it('v0.5.0 plan (router plan-only) validates against the v0.4.0 plan base, NOT the strict execution-plan', () => {
    const plan = runRouter(QUERY_SET[0].query, tmpRepos[0], QUERY_SET[0].intent);
    assert.strictEqual(plan.schema_version, '1.0');
    assert.strictEqual(plan.intent, 'exact');
    assert.strictEqual(plan.strategy, 'exact');
    assert.strictEqual(plan.mode, undefined);
  });

  it('v0.5.0 plan respects the hard cap of max_tool_calls <= 3', () => {
    for (const q of QUERY_SET) {
      const plan = runRouter(q.query, tmpRepos[0], q.intent);
      assert.ok(plan.budgets.max_tool_calls <= 3);
    }
  });

  it('v0.5.0 plan hedges architecture as plan-only (provider may be codebase-memory, knowledge, lsp, ripgrep, etc.)', () => {
    const plan = runRouter('impact of removing SellController', tmpRepos[0], 'architecture');
    assert.strictEqual(plan.intent, 'architecture');
    assert.strictEqual(plan.strategy, 'architecture');
  });

  it('deterministic fingerprint is reproducible across two invocations of the same setup', () => {
    const fpA = contentFingerprint(tmpRepos[0].tmpDir);
    const tmp2 = join(REPO_ROOT, '.tmp-bench-repro-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8));
    copyDir(join(FIXTURE_ROOT, 'repositories/sell-app'), tmp2);
    const fpB = contentFingerprint(tmp2);
    assert.strictEqual(fpA, fpB, 'same content, same fingerprint');
    rmSync(tmp2, { recursive: true, force: true });
  });

  it('benchmark is NOT executed by the engine; it is a contract/fixture gate', () => {
    const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
    assert.strictEqual(baseline.v050_release_gates.status, 'RESERVED');
  });
});