import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync, mkdirSync, rmSync, writeFileSync, cpSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'crypto';

const REPO_ROOT = process.cwd();
const ROUTER_PATH = join(REPO_ROOT, 'bin', 'retrieval', 'retrieval-router.mjs');
const ROUTER_WRAPPER = join(REPO_ROOT, 'scripts', 'retrieval-router.ps1');

const {
  buildPlan,
  loadPolicy,
  INTENTS,
  STRATEGIES,
  DEFAULT_BUDGETS,
  detectCapabilities
} = await import(`file://${ROUTER_PATH}`);

function sha256(filePath) {
  const content = readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex');
}

function createRealGitRepo(tmpDir) {
  mkdirSync(tmpDir, { recursive: true });
  const gitDir = join(tmpDir, '.git');
  mkdirSync(gitDir, { recursive: true });
  
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

function getGitCommit(tmpDir) {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: tmpDir, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function getGitBranch(tmpDir) {
  try {
    return execFileSync('git', ['branch', '--show-current'], { cwd: tmpDir, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function makeDirty(tmpDir) {
  const markerPath = join(tmpDir, 'DIRTY_MARKER.txt');
  writeFileSync(markerPath, 'dirty content\n');
  execFileSync('git', ['add', '.'], { cwd: tmpDir, stdio: 'ignore' });
}

function cleanDirty(tmpDir) {
  const markerPath = join(tmpDir, 'DIRTY_MARKER.txt');
  if (existsSync(markerPath)) {
    rmSync(markerPath);
  }
  try {
    execFileSync('git', ['checkout', '.'], { cwd: tmpDir, stdio: 'ignore' });
  } catch {}
}

function createTempProject(name) {
  const tmpDir = join(process.env.TEMP || '/tmp', `oc-test-${Date.now()}-${name.replace(/\s+/g, '-')}`);
  return createRealGitRepo(tmpDir);
}

function runRouterViaNode(query, projectRoot, intent = 'auto', policyPath = null) {
  const args = ['--query', query, '--project-root', projectRoot, '--intent', intent];
  if (policyPath) {
    args.push('--policy', policyPath);
  }
  const result = execFileSync('node', [ROUTER_PATH, ...args], {
    encoding: 'utf8',
    timeout: 15000
  });
  return JSON.parse(result.trim());
}

describe('Retrieval Source Artifacts', () => {
  it('source has retrieval-router.mjs', () => {
    assert.ok(existsSync(ROUTER_PATH), 'retrieval-router.mjs should exist');
    assert.ok(existsSync(join(REPO_ROOT, 'bin', 'retrieval')), 'bin/retrieval directory should exist');
  });

  it('source has retrieval-router.ps1 wrapper', () => {
    assert.ok(existsSync(ROUTER_WRAPPER), 'retrieval-router.ps1 should exist');
  });

  it('source has retrieval-policy.schema.json', () => {
    const schemaPath = join(REPO_ROOT, 'contracts', 'retrieval-policy.schema.json');
    assert.ok(existsSync(schemaPath), 'retrieval-policy.schema.json should exist');
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
    assert.ok(schema.$schema, 'schema should have $schema');
    assert.ok(schema.properties, 'schema should have properties');
  });

  it('source has retrieval-index-state.schema.json', () => {
    const schemaPath = join(REPO_ROOT, 'contracts', 'retrieval-index-state.schema.json');
    assert.ok(existsSync(schemaPath), 'retrieval-index-state.schema.json should exist');
  });

  it('source has global/retrieval/default-policy.json', () => {
    const policyPath = join(REPO_ROOT, 'global', 'retrieval', 'default-policy.json');
    assert.ok(existsSync(policyPath), 'default-policy.json should exist');
    const policy = JSON.parse(readFileSync(policyPath, 'utf8'));
    assert.strictEqual(policy.schema_version, '1.0');
    assert.strictEqual(typeof policy.enabled, 'boolean');
  });

  it('source has templates/project-neutral/.ai-env/retrieval-policy.json', () => {
    const tplPath = join(REPO_ROOT, 'templates', 'project-neutral', '.ai-env', 'retrieval-policy.json');
    assert.ok(existsSync(tplPath), 'template retrieval-policy.json should exist');
  });
});

describe('Retrieval Router Module', () => {
  it('exports required functions', () => {
    assert.ok(typeof buildPlan === 'function', 'buildPlan should be exported');
    assert.ok(typeof loadPolicy === 'function', 'loadPolicy should be exported');
    assert.ok(typeof STRATEGIES === 'object', 'STRATEGIES should be exported');
    assert.ok(typeof INTENTS === 'object', 'INTENTS should be exported');
    assert.ok(typeof DEFAULT_BUDGETS === 'object', 'DEFAULT_BUDGETS should be exported');
  });

  it('has correct STRATEGIES and INTENTS', () => {
    assert.strictEqual(STRATEGIES.EXACT, 'exact');
    assert.strictEqual(STRATEGIES.SYMBOL, 'symbol');
    assert.strictEqual(STRATEGIES.ARCHITECTURE, 'architecture');
    assert.strictEqual(STRATEGIES.SEMANTIC, 'semantic');
    assert.strictEqual(STRATEGIES.KNOWLEDGE, 'knowledge');
    assert.strictEqual(INTENTS.AUTO, 'auto');
  });
});

describe('Provider Detection', () => {
  it('detectCapabilities returns valid structure', () => {
    const caps = detectCapabilities();
    assert.ok(caps.ripgrep, 'should have ripgrep entry');
    assert.ok(caps.git_grep, 'should have git_grep entry');
    assert.ok(caps.lsp, 'should have lsp entry');
    assert.ok(caps['codebase-memory'], 'should have codebase-memory entry');
    assert.ok(caps.semantic, 'should have semantic entry');
    assert.ok(caps.filesystem, 'should have filesystem entry');
  });

  it('ripgrep state is either available or not_installed', () => {
    const caps = detectCapabilities();
    assert.ok(
      caps.ripgrep.state === 'available' || caps.ripgrep.state === 'not_installed',
      `ripgrep state should be available or not_installed, got ${caps.ripgrep.state}`
    );
  });

  it('git_grep state is either available or not_installed', () => {
    const caps = detectCapabilities();
    assert.ok(
      caps.git_grep.state === 'available' || caps.git_grep.state === 'not_installed',
      `git_grep state should be available or not_installed, got ${caps.git_grep.state}`
    );
  });
});

describe('Project Adoption', () => {
  it('no policy returns enabled false with PROJECT_NOT_ADOPTED', () => {
    const tmpDir = createTempProject('no-policy');
    try {
      const plan = buildPlan('test', tmpDir, null, INTENTS.AUTO);
      assert.strictEqual(plan.enabled, false, 'enabled should be false for non-adopted project');
      assert.strictEqual(plan.reason, 'PROJECT_NOT_ADOPTED', 'reason should be PROJECT_NOT_ADOPTED');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('enabled false policy returns PROJECT_NOT_ADOPTED', () => {
    const tmpDir = createTempProject('disabled');
    try {
      const policy = {
        schema_version: '1.0',
        enabled: false,
        strategies: { exact: { enabled: true, provider: 'ripgrep' } },
        budgets: DEFAULT_BUDGETS
      };
      const plan = buildPlan('test', tmpDir, policy, INTENTS.AUTO);
      assert.strictEqual(plan.enabled, false, 'enabled should be false');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('enabled true with no strategies returns enabled true but no provider', () => {
    const tmpDir = createTempProject('no-strategies');
    try {
      const policy = {
        schema_version: '1.0',
        enabled: true,
        strategies: {},
        budgets: {}
      };
      const plan = buildPlan('test', tmpDir, policy, INTENTS.AUTO);
      assert.strictEqual(plan.enabled, true, 'enabled should be true for adopted project');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('Index State Detection', () => {
  it('NOT_INDEXED when no state file exists', () => {
    const tmpDir = createTempProject('no-index');
    try {
      const indexStatePath = join(tmpDir, '.ai-env', 'retrieval-index-state.json');
      if (existsSync(indexStatePath)) {
        rmSync(indexStatePath);
      }
      const plan = buildPlan('test', tmpDir, null, INTENTS.AUTO);
      assert.strictEqual(plan.index_status, 'NOT_INDEXED', 'index_status should be NOT_INDEXED');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('FRESH when indexed_commit matches HEAD', () => {
    const tmpDir = createTempProject('fresh-index');
    try {
      const commit = getGitCommit(tmpDir);
      assert.ok(commit, 'Should have a git commit');
      
      const indexState = {
        schema_version: '1.0',
        indexed_commit: commit,
        index_generation: commit,
        indexed_at: new Date().toISOString()
      };
      const indexStatePath = join(tmpDir, '.ai-env', 'retrieval-index-state.json');
      writeFileSync(indexStatePath, JSON.stringify(indexState));
      
      const plan = buildPlan('test', tmpDir, null, INTENTS.AUTO);
      assert.strictEqual(plan.index_status, 'FRESH', `index_status should be FRESH, got ${plan.index_status}`);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('STALE_INDEX when indexed_commit differs from HEAD', () => {
    const tmpDir = createTempProject('stale-index');
    try {
      const indexState = {
        schema_version: '1.0',
        indexed_commit: '0000000000000000000000000000000000000000',
        index_generation: '0000000000000000000000000000000000000000',
        indexed_at: new Date().toISOString()
      };
      const indexStatePath = join(tmpDir, '.ai-env', 'retrieval-index-state.json');
      writeFileSync(indexStatePath, JSON.stringify(indexState));
      
      const plan = buildPlan('test', tmpDir, null, INTENTS.AUTO);
      assert.strictEqual(plan.index_status, 'STALE_INDEX', `index_status should be STALE_INDEX, got ${plan.index_status}`);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('UNKNOWN when index state is invalid JSON', () => {
    const tmpDir = createTempProject('invalid-index');
    try {
      const indexStatePath = join(tmpDir, '.ai-env', 'retrieval-index-state.json');
      writeFileSync(indexStatePath, '{ invalid json }');
      
      const plan = buildPlan('test', tmpDir, null, INTENTS.AUTO);
      assert.strictEqual(plan.index_status, 'UNKNOWN', `index_status should be UNKNOWN for invalid JSON, got ${plan.index_status}`);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('UNKNOWN when index state has invalid schema_version', () => {
    const tmpDir = createTempProject('bad-schema-index');
    try {
      const indexState = {
        schema_version: '2.0',
        indexed_commit: 'abc123',
        indexed_at: new Date().toISOString()
      };
      const indexStatePath = join(tmpDir, '.ai-env', 'retrieval-index-state.json');
      writeFileSync(indexStatePath, JSON.stringify(indexState));
      
      const plan = buildPlan('test', tmpDir, null, INTENTS.AUTO);
      assert.strictEqual(plan.index_status, 'UNKNOWN', `index_status should be UNKNOWN for invalid schema, got ${plan.index_status}`);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('Git States', () => {
  it('returns correct branch name', () => {
    const tmpDir = createTempProject('git-branch');
    try {
      const branch = getGitBranch(tmpDir);
      const plan = buildPlan('test', tmpDir, null, INTENTS.AUTO);
      assert.strictEqual(plan.branch, branch, `branch should be ${branch}`);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('returns correct commit hash', () => {
    const tmpDir = createTempProject('git-commit');
    try {
      const commit = getGitCommit(tmpDir);
      const plan = buildPlan('test', tmpDir, null, INTENTS.AUTO);
      assert.strictEqual(plan.commit, commit, `commit should be ${commit}`);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('detects clean worktree', () => {
    const tmpDir = createTempProject('clean-worktree');
    try {
      cleanDirty(tmpDir);
      const plan = buildPlan('test', tmpDir, null, INTENTS.AUTO);
      assert.strictEqual(plan.dirty_worktree, false, 'dirty_worktree should be false for clean repo');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('detects dirty worktree', () => {
    const tmpDir = createTempProject('dirty-worktree');
    try {
      makeDirty(tmpDir);
      const plan = buildPlan('test', tmpDir, null, INTENTS.AUTO);
      assert.strictEqual(plan.dirty_worktree, true, 'dirty_worktree should be true for dirty repo');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('repository is toplevel path', () => {
    const tmpDir = createTempProject('repo-toplevel');
    try {
      const plan = buildPlan('test', tmpDir, null, INTENTS.AUTO);
      assert.ok(plan.repository.includes('oc-test-'), `repository should include temp dir pattern, got ${plan.repository}`);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('Query Classification', () => {
  const policy = {
    schema_version: '1.0',
    enabled: true,
    strategies: {
      exact: { enabled: true, provider: 'ripgrep' },
      symbol: { enabled: true, provider: 'lsp' },
      architecture: { enabled: true, provider: 'codebase-memory' },
      semantic: { enabled: true, provider: 'semantic' },
      knowledge: { enabled: true, provider: 'filesystem' }
    },
    budgets: DEFAULT_BUDGETS
  };

  it('exact: identifiers like idImportacion', () => {
    const tmpDir = createTempProject('classify-exact');
    try {
      const plan = buildPlan('idImportacion', tmpDir, policy, INTENTS.AUTO);
      assert.strictEqual(plan.strategy, STRATEGIES.EXACT, `strategy should be exact, got ${plan.strategy}`);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('symbol: definition keywords', () => {
    const tmpDir = createTempProject('classify-symbol');
    try {
      const plan = buildPlan('def getData', tmpDir, policy, INTENTS.AUTO);
      assert.strictEqual(plan.strategy, STRATEGIES.SYMBOL, `strategy should be symbol, got ${plan.strategy}`);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('architecture: impact keywords', () => {
    const tmpDir = createTempProject('classify-arch');
    try {
      const plan = buildPlan('impact of removing', tmpDir, policy, INTENTS.AUTO);
      assert.strictEqual(plan.strategy, STRATEGIES.ARCHITECTURE, `strategy should be architecture, got ${plan.strategy}`);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('semantic: concept keywords', () => {
    const tmpDir = createTempProject('classify-semantic');
    try {
      const plan = buildPlan('concept of caching', tmpDir, policy, INTENTS.AUTO);
      assert.strictEqual(plan.strategy, STRATEGIES.SEMANTIC, `strategy should be semantic, got ${plan.strategy}`);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('knowledge: why/decision keywords', () => {
    const tmpDir = createTempProject('classify-knowledge');
    try {
      const plan = buildPlan('why was this implemented', tmpDir, policy, INTENTS.AUTO);
      assert.strictEqual(plan.strategy, STRATEGIES.KNOWLEDGE, `strategy should be knowledge, got ${plan.strategy}`);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('Explicit Intent', () => {
  it('explicit exact intent overrides classification', () => {
    const tmpDir = createTempProject('explicit-exact');
    try {
      const policy = {
        schema_version: '1.0',
        enabled: true,
        strategies: {
          exact: { enabled: true, provider: 'ripgrep' },
          symbol: { enabled: true, provider: 'lsp' },
          architecture: { enabled: true, provider: 'codebase-memory' },
          semantic: { enabled: false },
          knowledge: { enabled: false }
        },
        budgets: DEFAULT_BUDGETS
      };
      const plan = buildPlan('concept of caching', tmpDir, policy, INTENTS.EXACT);
      assert.strictEqual(plan.strategy, STRATEGIES.EXACT, `strategy should be exact for explicit intent`);
      assert.ok(plan.reason.startsWith('intent:'), `reason should indicate explicit intent`);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('invalid intent returns error plan', () => {
    const tmpDir = createTempProject('invalid-intent');
    try {
      const plan = buildPlan('test', tmpDir, null, 'invalid_intent');
      assert.ok(plan.error, 'Should return error for invalid intent');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('Deterministic JSON Output', () => {
  it('same query returns identical plan structure', () => {
    const tmpDir = createTempProject('deterministic');
    try {
      const policy = {
        schema_version: '1.0',
        enabled: true,
        strategies: {
          exact: { enabled: true, provider: 'ripgrep' },
          symbol: { enabled: true, provider: 'lsp' },
          architecture: { enabled: true, provider: 'codebase-memory' },
          semantic: { enabled: false },
          knowledge: { enabled: false }
        },
        budgets: DEFAULT_BUDGETS
      };
      const plan1 = buildPlan('NotaService.listar', tmpDir, policy, INTENTS.AUTO);
      const plan2 = buildPlan('NotaService.listar', tmpDir, policy, INTENTS.AUTO);
      assert.strictEqual(JSON.stringify(plan1), JSON.stringify(plan2), 'Plans should be identical');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('Zero Writes', () => {
  it('router does not write outside project root', () => {
    const tmpDir = createTempProject('zero-writes');
    try {
      const markerDir = join(process.env.TEMP || '/tmp', 'marker-check-' + Date.now());
      mkdirSync(markerDir, { recursive: true });
      const markerFile = join(markerDir, 'marker.txt');
      writeFileSync(markerFile, 'before');

      const policy = {
        schema_version: '1.0',
        enabled: true,
        strategies: {
          exact: { enabled: true, provider: 'ripgrep' },
          symbol: { enabled: false },
          architecture: { enabled: false },
          semantic: { enabled: false },
          knowledge: { enabled: false }
        },
        budgets: DEFAULT_BUDGETS
      };
      buildPlan('test', tmpDir, policy, INTENTS.AUTO);

      const afterContent = readFileSync(markerFile, 'utf8');
      assert.strictEqual(afterContent, 'before', 'marker should not be modified');

      rmSync(markerDir, { recursive: true, force: true });
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('router does not create files in project', () => {
    const tmpDir = createTempProject('no-create');
    try {
      const beforeFiles = [];
      const listFiles = (dir, fileList) => {
        try {
          const entries = readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.name !== '.git' && entry.name !== '.ai-env') {
              fileList.push(join(dir, entry.name));
            }
            if (entry.isDirectory() && entry.name !== '.git' && entry.name !== '.ai-env') {
              listFiles(join(dir, entry.name), fileList);
            }
          }
        } catch {}
      };
      listFiles(tmpDir, beforeFiles);

      const policy = {
        schema_version: '1.0',
        enabled: true,
        strategies: {
          exact: { enabled: true, provider: 'ripgrep' },
          symbol: { enabled: false },
          architecture: { enabled: false },
          semantic: { enabled: false },
          knowledge: { enabled: false }
        },
        budgets: DEFAULT_BUDGETS
      };
      buildPlan('test', tmpDir, policy, INTENTS.AUTO);

      const afterFiles = [];
      listFiles(tmpDir, afterFiles);
      assert.strictEqual(beforeFiles.length, afterFiles.length, 'No files should be created');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('Plan Output Fields', () => {
  it('plan has all required fields', () => {
    const tmpDir = createTempProject('fields');
    try {
      const policy = {
        schema_version: '1.0',
        enabled: true,
        strategies: {
          exact: { enabled: true, provider: 'ripgrep' },
          symbol: { enabled: true, provider: 'lsp' },
          architecture: { enabled: true, provider: 'codebase-memory' },
          semantic: { enabled: false },
          knowledge: { enabled: true, provider: 'filesystem' }
        },
        budgets: DEFAULT_BUDGETS
      };
      const plan = buildPlan('test', tmpDir, policy, INTENTS.AUTO);
      const required = ['schema_version', 'enabled', 'intent', 'strategy', 'provider', 'reason', 'budgets', 'fallbacks', 'repository', 'branch', 'commit', 'indexed_commit', 'index_generation', 'indexed_at', 'index_status', 'dirty_worktree', 'warnings'];
      for (const f of required) {
        assert.ok(plan.hasOwnProperty(f), `Missing field: ${f}`);
      }
      assert.strictEqual(plan.schema_version, '1.0');
      assert.ok(Array.isArray(plan.warnings), 'warnings should be array');
      assert.ok(Array.isArray(plan.fallbacks), 'fallbacks should be array');
      assert.ok(typeof plan.budgets === 'object', 'budgets should be object');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('schema_version is 1.0', () => {
    const tmpDir = createTempProject('schema-version');
    try {
      const policy = {
        schema_version: '1.0',
        enabled: true,
        strategies: { exact: { enabled: true, provider: 'ripgrep' } },
        budgets: DEFAULT_BUDGETS
      };
      const plan = buildPlan('test', tmpDir, policy, INTENTS.AUTO);
      assert.strictEqual(plan.schema_version, '1.0');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('Checksums and Source-Runtime Consistency', () => {
  it('router file has deterministic content', () => {
    const hash1 = sha256(ROUTER_PATH);
    const hash2 = sha256(ROUTER_PATH);
    assert.strictEqual(hash1, hash2, 'Same file should have same hash');
  });

  it('schema files are valid JSON', () => {
    const policySchema = JSON.parse(readFileSync(join(REPO_ROOT, 'contracts', 'retrieval-policy.schema.json'), 'utf8'));
    assert.ok(policySchema.$schema, 'policy schema should have $schema');
    assert.ok(policySchema.properties, 'policy schema should have properties');

    const indexSchema = JSON.parse(readFileSync(join(REPO_ROOT, 'contracts', 'retrieval-index-state.schema.json'), 'utf8'));
    assert.ok(indexSchema.$schema, 'index schema should have $schema');
    assert.ok(indexSchema.properties, 'index schema should have properties');
  });

  it('default policy has required fields', () => {
    const policy = JSON.parse(readFileSync(join(REPO_ROOT, 'global', 'retrieval', 'default-policy.json'), 'utf8'));
    assert.strictEqual(policy.schema_version, '1.0', 'should have schema_version 1.0');
    assert.ok(policy.hasOwnProperty('enabled'), 'should have enabled field');
    assert.ok(policy.hasOwnProperty('strategies'), 'should have strategies field');
    assert.ok(policy.hasOwnProperty('budgets'), 'should have budgets field');
    assert.ok(policy.strategies.exact, 'should have exact strategy');
    assert.ok(policy.strategies.symbol, 'should have symbol strategy');
    assert.ok(policy.strategies.architecture, 'should have architecture strategy');
    assert.ok(policy.strategies.semantic, 'should have semantic strategy');
    assert.ok(policy.strategies.knowledge, 'should have knowledge strategy');
  });
});

describe('Exact Fallback Chain', () => {
  it('exact strategy uses ripgrep when available', () => {
    const tmpDir = createTempProject('exact-ripgrep');
    try {
      const policy = {
        schema_version: '1.0',
        enabled: true,
        strategies: {
          exact: { enabled: true, provider: 'ripgrep' },
          symbol: { enabled: false },
          architecture: { enabled: false },
          semantic: { enabled: false },
          knowledge: { enabled: false }
        },
        budgets: DEFAULT_BUDGETS
      };
      const plan = buildPlan('idImportacion', tmpDir, policy, INTENTS.AUTO);
      assert.strictEqual(plan.strategy, 'exact', 'strategy should remain exact');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('semantic disabled falls back to exact', () => {
    const tmpDir = createTempProject('sem-disabled');
    try {
      const policy = {
        schema_version: '1.0',
        enabled: true,
        strategies: {
          exact: { enabled: true, provider: 'ripgrep' },
          symbol: { enabled: false },
          architecture: { enabled: false },
          semantic: { enabled: false },
          knowledge: { enabled: false }
        },
        budgets: DEFAULT_BUDGETS
      };
      const plan = buildPlan('best practice for caching', tmpDir, policy, INTENTS.AUTO);
      assert.strictEqual(plan.strategy, 'exact', 'semantic should fall back to exact');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('Provider Unknown State', () => {
  it('lsp remains unknown when not verifiable', () => {
    const caps = detectCapabilities();
    assert.strictEqual(caps.lsp.state, 'unknown', 'lsp should be unknown when not verifiable');
    assert.strictEqual(caps.lsp.installed, false, 'lsp should not be marked installed');
  });

  it('codebase-memory remains unknown when not verifiable', () => {
    const caps = detectCapabilities();
    assert.strictEqual(caps['codebase-memory'].state, 'unknown', 'codebase-memory should be unknown');
    assert.strictEqual(caps['codebase-memory'].installed, false, 'codebase-memory should not be marked installed');
  });
});

describe('Policy Invalid JSON', () => {
  it('--policy with invalid JSON returns INVALID_POLICY', () => {
    const tmpDir = createTempProject('invalid-json');
    try {
      const invalidPolicyPath = join(tmpDir, 'invalid-policy.json');
      writeFileSync(invalidPolicyPath, '{ invalid json }');
      
      let error;
      try {
        runRouterViaNode('test', tmpDir, 'auto', invalidPolicyPath);
      } catch (e) {
        error = e;
      }
      
      assert.ok(error, 'Should throw error for invalid JSON policy');
      assert.ok(error.status !== 0 || error.stdout?.includes('INVALID_POLICY'), 'Should indicate INVALID_POLICY');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('--policy with non-existent file returns INVALID_POLICY', () => {
    const tmpDir = createTempProject('missing-policy');
    try {
      const missingPath = join(tmpDir, 'nonexistent-policy.json');
      
      let error;
      try {
        runRouterViaNode('test', tmpDir, 'auto', missingPath);
      } catch (e) {
        error = e;
      }
      
      assert.ok(error, 'Should throw error for missing policy file');
      assert.ok(error.status !== 0 || error.stdout?.includes('INVALID_POLICY'), 'Should indicate INVALID_POLICY');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('Knowledge Strategy', () => {
  it('knowledge intent includes knowledge_paths', () => {
    const tmpDir = createTempProject('knowledge');
    try {
      const policy = {
        schema_version: '1.0',
        enabled: true,
        strategies: {
          exact: { enabled: false },
          symbol: { enabled: false },
          architecture: { enabled: false },
          semantic: { enabled: false },
          knowledge: { enabled: true, provider: 'filesystem' }
        },
        budgets: DEFAULT_BUDGETS
      };
      const plan = buildPlan('why was this implemented', tmpDir, policy, INTENTS.AUTO);
      assert.ok(Array.isArray(plan.knowledge_paths), 'knowledge_paths should be an array');
      assert.ok(plan.knowledge_paths.length > 0, 'knowledge_paths should not be empty');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
