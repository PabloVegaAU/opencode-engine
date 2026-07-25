import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { spawnSync, execFileSync } from 'node:child_process';

const ROUTER_PATH = join(process.cwd(), 'bin', 'retrieval', 'retrieval-router.mjs');

const {
  buildPlan,
  loadPolicy,
  INTENTS,
  STRATEGIES,
  DEFAULT_BUDGETS
} = await import(`file://${ROUTER_PATH}`);

function createRealGitRepo(tmpDir) {
  mkdirSync(tmpDir, { recursive: true });
  execFileSync('git', ['init'], { cwd: tmpDir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: tmpDir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: tmpDir, stdio: 'ignore' });
  const readmePath = join(tmpDir, 'README.md');
  writeFileSync(readmePath, 'Test repository\n');
  execFileSync('git', ['add', 'README.md'], { cwd: tmpDir, stdio: 'ignore' });
  execFileSync('git', ['commit', '-m', 'Initial commit'], { cwd: tmpDir, stdio: 'ignore' });
  mkdirSync(join(tmpDir, '.ai-env'), { recursive: true });
  return tmpDir;
}

describe('Retrieval Router Integration', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = join(process.cwd(), '.test-tmp-' + Date.now());
    createRealGitRepo(tmpDir);
  });

  afterEach(() => {
    if (existsSync(tmpDir)) {
      try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
  });

  describe('Zero Writes', () => {
    it('router does not modify project files', () => {
      const markerFile = join(tmpDir, '.marker');
      writeFileSync(markerFile, 'original');
      const originalContent = readFileSync(markerFile, 'utf8');
      buildPlan('test', tmpDir, null, INTENTS.AUTO);
      const afterContent = readFileSync(markerFile, 'utf8');
      assert.strictEqual(afterContent, originalContent);
    });
  });

  describe('Project Not Adopted', () => {
    it('returns enabled false when no policy', () => {
      const plan = buildPlan('test', tmpDir, null, INTENTS.AUTO);
      assert.strictEqual(plan.enabled, false);
      assert.strictEqual(plan.reason, 'PROJECT_NOT_ADOPTED');
    });
  });

  describe('Policy with Valid Schema', () => {
    const policy = {
      schema_version: '1.0', enabled: true,
      strategies: { 
        exact: { enabled: true, provider: 'ripgrep' }, 
        symbol: { enabled: true, provider: 'lsp' }, 
        architecture: { enabled: true, provider: 'codebase-memory' }, 
        semantic: { enabled: false, provider: null }, 
        knowledge: { enabled: true, provider: 'filesystem', paths: [] } 
      },
      budgets: DEFAULT_BUDGETS
    };
    it('accepts valid policy', () => {
      const plan = buildPlan('idImportacion', tmpDir, policy, INTENTS.AUTO);
      assert.strictEqual(plan.enabled, true);
      assert.strictEqual(plan.strategy, STRATEGIES.EXACT);
    });
    it('has knowledge_paths for knowledge strategy', () => {
      const plan = buildPlan('why was this done', tmpDir, policy, INTENTS.AUTO);
      assert.ok(plan.knowledge_paths);
      assert.ok(Array.isArray(plan.knowledge_paths));
    });
  });

  describe('Index State', () => {
    it('returns NOT_INDEXED when no index state file', () => {
      const indexPath = join(tmpDir, '.ai-env', 'retrieval-index-state.json');
      if (existsSync(indexPath)) {
        rmSync(indexPath);
      }
      const plan = buildPlan('test', tmpDir, null, INTENTS.AUTO);
      assert.strictEqual(plan.index_status, 'NOT_INDEXED');
    });
  });

  describe('Plan Fields', () => {
    const policy = {
      schema_version: '1.0', enabled: true,
      strategies: { 
        exact: { enabled: true, provider: 'ripgrep' }, 
        symbol: { enabled: true, provider: 'lsp' }, 
        architecture: { enabled: true, provider: 'codebase-memory' }, 
        semantic: { enabled: false, provider: null }, 
        knowledge: { enabled: true, provider: 'filesystem', paths: [] } 
      },
      budgets: DEFAULT_BUDGETS
    };
    it('returns compact JSON', () => {
      const plan = buildPlan('idImportacion', tmpDir, policy, INTENTS.AUTO);
      const str = JSON.stringify(plan);
      assert.ok(str.length < 5000);
    });
    it('has all required fields', () => {
      const plan = buildPlan('test', tmpDir, policy, INTENTS.AUTO);
      const required = ['schema_version', 'enabled', 'intent', 'strategy', 'provider', 'reason', 'budgets', 'fallbacks', 'repository', 'branch', 'commit', 'indexed_commit', 'index_generation', 'indexed_at', 'index_status', 'dirty_worktree', 'warnings'];
      for (const f of required) {
        assert.ok(plan.hasOwnProperty(f), `Missing: ${f}`);
      }
    });
    it('warnings is always array', () => {
      const plan = buildPlan('test', tmpDir, policy, INTENTS.AUTO);
      assert.ok(Array.isArray(plan.warnings));
    });
    it('schema_version is 1.0', () => {
      const plan = buildPlan('test', tmpDir, policy, INTENTS.AUTO);
      assert.strictEqual(plan.schema_version, '1.0');
    });
  });

  describe('Query Classification', () => {
    const policy = {
      schema_version: '1.0', enabled: true,
      strategies: { 
        exact: { enabled: true, provider: 'ripgrep' }, 
        symbol: { enabled: true, provider: 'lsp' }, 
        architecture: { enabled: true, provider: 'codebase-memory' }, 
        semantic: { enabled: true, provider: 'semantic' }, 
        knowledge: { enabled: true, provider: 'filesystem', paths: [] } 
      },
      budgets: DEFAULT_BUDGETS
    };
    const cases = [
      { q: 'idImportacion', s: STRATEGIES.EXACT },
      { q: 'NotaService.listar', s: STRATEGIES.EXACT },
      { q: 'def getData', s: STRATEGIES.SYMBOL },
      { q: 'impact of removing', s: STRATEGIES.ARCHITECTURE },
      { q: 'best practice for caching', s: STRATEGIES.SEMANTIC },
      { q: 'why was this implemented', s: STRATEGIES.KNOWLEDGE }
    ];
    for (const c of cases) {
      it(`"${c.q}" -> ${c.s}`, () => {
        const plan = buildPlan(c.q, tmpDir, policy, INTENTS.AUTO);
        assert.strictEqual(plan.strategy, c.s, `"${c.q}" expected ${c.s} got ${plan.strategy}`);
      });
    }
  });
});

describe('Retrieval Schema Files', () => {
  const SCHEMA_PATH = join(process.cwd(), 'contracts', 'retrieval-policy.schema.json');
  const INDEX_SCHEMA_PATH = join(process.cwd(), 'contracts', 'retrieval-index-state.schema.json');

  it('retrieval-policy.schema.json exists', () => {
    assert.ok(existsSync(SCHEMA_PATH));
  });

  it('retrieval-index-state.schema.json exists', () => {
    assert.ok(existsSync(INDEX_SCHEMA_PATH));
  });

  it('schemas are valid JSON with $schema', () => {
    const s1 = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
    assert.ok(s1.$schema);
    const s2 = JSON.parse(readFileSync(INDEX_SCHEMA_PATH, 'utf8'));
    assert.ok(s2.$schema);
  });
});

describe('Retrieval Policy Loading', () => {
  const POLICY_PATH = join(process.cwd(), 'global', 'retrieval', 'default-policy.json');
  it('default policy exists', () => {
    assert.ok(existsSync(POLICY_PATH));
  });
  it('default policy is valid JSON', () => {
    const p = JSON.parse(readFileSync(POLICY_PATH, 'utf8'));
    assert.strictEqual(p.schema_version, '1.0');
    assert.strictEqual(typeof p.enabled, 'boolean');
  });
});

describe('Retrieval Router CLI', () => {
  it('router module is loadable', async () => {
    const mod = await import(`file://${join(process.cwd(), 'bin', 'retrieval', 'retrieval-router.mjs')}`);
    assert.ok(typeof mod.buildPlan === 'function');
    assert.ok(typeof mod.classifyQueryAuto === 'function');
  });
});
