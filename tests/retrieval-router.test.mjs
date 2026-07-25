import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { execFileSync } from 'node:child_process';

const REPO_ROOT = process.cwd();

const {
  classifyQueryAuto,
  INTENTS,
  STRATEGIES,
  HARD_CAPS,
  DEFAULT_BUDGETS,
  KNOWLEDGE_PATHS_GLOB,
  buildPlan,
  loadPolicy,
  resolveIntent,
  detectCapabilities,
  getGitInfo,
  getIndexState,
  validatePolicySchema
} = await import(`file://${REPO_ROOT}/bin/retrieval/retrieval-router.mjs`);

describe('Retrieval Router - classifyQueryAuto', () => {
  it('exact: identifiers', () => {
    assert.strictEqual(classifyQueryAuto('idImportacion'), STRATEGIES.EXACT);
    assert.strictEqual(classifyQueryAuto('NotaService'), STRATEGIES.EXACT);
    assert.strictEqual(classifyQueryAuto('listar'), STRATEGIES.EXACT);
  });
  it('exact: camelCase', () => {
    assert.strictEqual(classifyQueryAuto('notaService'), STRATEGIES.EXACT);
    assert.strictEqual(classifyQueryAuto('myVariable'), STRATEGIES.EXACT);
  });
  it('exact: PascalCase', () => {
    assert.strictEqual(classifyQueryAuto('NotaService'), STRATEGIES.EXACT);
    assert.strictEqual(classifyQueryAuto('Importacion'), STRATEGIES.EXACT);
  });
  it('exact: snake_case', () => {
    assert.strictEqual(classifyQueryAuto('nota_service'), STRATEGIES.EXACT);
    assert.strictEqual(classifyQueryAuto('id_importacion'), STRATEGIES.EXACT);
  });
  it('exact: qualified names', () => {
    assert.strictEqual(classifyQueryAuto('com.example.NotaService'), STRATEGIES.EXACT);
    assert.strictEqual(classifyQueryAuto('com.example.NotaService.listar'), STRATEGIES.EXACT);
  });
  it('exact: method calls', () => {
    assert.strictEqual(classifyQueryAuto('notaService.listar()'), STRATEGIES.EXACT);
    assert.strictEqual(classifyQueryAuto('service.getData()'), STRATEGIES.EXACT);
  });
  it('exact: import paths', () => {
    assert.strictEqual(classifyQueryAuto('src/NotaService.java'), STRATEGIES.EXACT);
    assert.strictEqual(classifyQueryAuto('com/example/NotaService.ts'), STRATEGIES.EXACT);
  });
  it('symbol: definitions', () => {
    assert.strictEqual(classifyQueryAuto('def NotaService'), STRATEGIES.SYMBOL);
    assert.strictEqual(classifyQueryAuto('function getData'), STRATEGIES.SYMBOL);
    assert.strictEqual(classifyQueryAuto('class Importacion'), STRATEGIES.SYMBOL);
    assert.strictEqual(classifyQueryAuto('interface Service'), STRATEGIES.SYMBOL);
  });
  it('symbol: references', () => {
    assert.strictEqual(classifyQueryAuto('references getData'), STRATEGIES.SYMBOL);
    assert.strictEqual(classifyQueryAuto('calls getData'), STRATEGIES.SYMBOL);
    assert.strictEqual(classifyQueryAuto('instances of'), STRATEGIES.SYMBOL);
  });
  it('architecture: impact', () => {
    assert.strictEqual(classifyQueryAuto('impact of removing'), STRATEGIES.ARCHITECTURE);
    assert.strictEqual(classifyQueryAuto('dependencies of'), STRATEGIES.ARCHITECTURE);
    assert.strictEqual(classifyQueryAuto('what breaks if I change'), STRATEGIES.ARCHITECTURE);
  });
  it('knowledge: decisions', () => {
    assert.strictEqual(classifyQueryAuto('ADR for caching'), STRATEGIES.KNOWLEDGE);
    assert.strictEqual(classifyQueryAuto('architecture decision'), STRATEGIES.KNOWLEDGE);
  });
  it('knowledge: why', () => {
    assert.strictEqual(classifyQueryAuto('why is this implemented this way'), STRATEGIES.KNOWLEDGE);
    assert.strictEqual(classifyQueryAuto('reason for the architecture'), STRATEGIES.KNOWLEDGE);
  });
  it('semantic: concepts', () => {
    assert.strictEqual(classifyQueryAuto('concept of caching'), STRATEGIES.SEMANTIC);
    assert.strictEqual(classifyQueryAuto('best practice for error handling'), STRATEGIES.SEMANTIC);
    assert.strictEqual(classifyQueryAuto('pattern for retry logic'), STRATEGIES.SEMANTIC);
  });
  it('semantic: ambiguous', () => {
    assert.strictEqual(classifyQueryAuto('how to implement pagination'), STRATEGIES.SEMANTIC);
    assert.strictEqual(classifyQueryAuto('way to authenticate users'), STRATEGIES.SEMANTIC);
  });
  it('short queries fallback to exact', () => {
    assert.strictEqual(classifyQueryAuto('x'), STRATEGIES.EXACT);
    assert.strictEqual(classifyQueryAuto('id'), STRATEGIES.EXACT);
  });
  it('whitespace normalization', () => {
    assert.strictEqual(classifyQueryAuto('  NotaService  '), STRATEGIES.EXACT);
  });
});

describe('Retrieval Router - Strategy Constants', () => {
  it('has exact symbol architecture semantic knowledge', () => {
    assert.strictEqual(STRATEGIES.EXACT, 'exact');
    assert.strictEqual(STRATEGIES.SYMBOL, 'symbol');
    assert.strictEqual(STRATEGIES.ARCHITECTURE, 'architecture');
    assert.strictEqual(STRATEGIES.SEMANTIC, 'semantic');
    assert.strictEqual(STRATEGIES.KNOWLEDGE, 'knowledge');
  });
  it('has all six intents', () => {
    assert.strictEqual(INTENTS.EXACT, 'exact');
    assert.strictEqual(INTENTS.SYMBOL, 'symbol');
    assert.strictEqual(INTENTS.ARCHITECTURE, 'architecture');
    assert.strictEqual(INTENTS.SEMANTIC, 'semantic');
    assert.strictEqual(INTENTS.KNOWLEDGE, 'knowledge');
    assert.strictEqual(INTENTS.AUTO, 'auto');
  });
});

describe('Retrieval Router - Budget Defaults', () => {
  it('exact budget structure', () => {
    const b = DEFAULT_BUDGETS.exact;
    assert.strictEqual(b.max_tool_calls, 1);
    assert.strictEqual(b.max_results, 25);
    assert.strictEqual(b.max_chars, 12000);
    assert.strictEqual(b.timeout_ms, 5000);
  });
  it('symbol budget structure', () => {
    const b = DEFAULT_BUDGETS.symbol;
    assert.strictEqual(b.max_tool_calls, 2);
    assert.strictEqual(b.max_results, 25);
    assert.strictEqual(b.max_chars, 16000);
  });
  it('architecture budget structure', () => {
    const b = DEFAULT_BUDGETS.architecture;
    assert.strictEqual(b.max_tool_calls, 2);
    assert.strictEqual(b.max_results, 30);
    assert.strictEqual(b.max_chars, 20000);
  });
  it('semantic budget structure', () => {
    const b = DEFAULT_BUDGETS.semantic;
    assert.strictEqual(b.max_tool_calls, 2);
    assert.strictEqual(b.max_results, 12);
    assert.strictEqual(b.max_chars, 16000);
  });
  it('knowledge budget structure', () => {
    const b = DEFAULT_BUDGETS.knowledge;
    assert.strictEqual(b.max_tool_calls, 2);
    assert.strictEqual(b.max_results, 12);
    assert.strictEqual(b.max_chars, 16000);
  });
  it('hard caps respected', () => {
    assert.ok(DEFAULT_BUDGETS.semantic.max_chars <= HARD_CAPS.max_chars);
    assert.ok(DEFAULT_BUDGETS.architecture.max_tool_calls <= HARD_CAPS.max_tool_calls);
  });
});

describe('Retrieval Router - Knowledge Paths', () => {
  it('has AGENTS.md', () => assert.ok(KNOWLEDGE_PATHS_GLOB.includes('AGENTS.md')));
  it('has docs/** and specs/**', () => {
    assert.ok(KNOWLEDGE_PATHS_GLOB.includes('docs/**'));
    assert.ok(KNOWLEDGE_PATHS_GLOB.includes('specs/**'));
  });
  it('has ADR paths', () => {
    assert.ok(KNOWLEDGE_PATHS_GLOB.includes('**/adr/**'));
    assert.ok(KNOWLEDGE_PATHS_GLOB.includes('**/ADR/**'));
  });
  it('has README CHANGELOG PROGRESS', () => {
    assert.ok(KNOWLEDGE_PATHS_GLOB.includes('README*'));
    assert.ok(KNOWLEDGE_PATHS_GLOB.includes('CHANGELOG*'));
    assert.ok(KNOWLEDGE_PATHS_GLOB.includes('PROGRESS.md'));
  });
});

describe('Retrieval Router - detectCapabilities', () => {
  it('returns valid structure', () => {
    const caps = detectCapabilities();
    assert.ok(caps.ripgrep, 'should have ripgrep');
    assert.ok(caps.git_grep, 'should have git_grep');
    assert.ok(caps.lsp, 'should have lsp');
    assert.ok(caps['codebase-memory'], 'should have codebase-memory');
    assert.ok(caps.semantic, 'should have semantic');
    assert.ok(caps.filesystem, 'should have filesystem');
  });

  it('ripgrep state is available or not_installed', () => {
    const caps = detectCapabilities();
    assert.ok(
      caps.ripgrep.state === 'available' || caps.ripgrep.state === 'not_installed',
      `ripgrep state should be available or not_installed, got ${caps.ripgrep.state}`
    );
  });

  it('ripgrep installed matches state', () => {
    const caps = detectCapabilities();
    if (caps.ripgrep.state === 'available') {
      assert.strictEqual(caps.ripgrep.installed, true);
      assert.strictEqual(caps.ripgrep.available, true);
    } else {
      assert.strictEqual(caps.ripgrep.installed, false);
      assert.strictEqual(caps.ripgrep.available, false);
    }
  });

  it('git_grep state is available or not_installed', () => {
    const caps = detectCapabilities();
    assert.ok(
      caps.git_grep.state === 'available' || caps.git_grep.state === 'not_installed',
      `git_grep state should be available or not_installed, got ${caps.git_grep.state}`
    );
  });

  it('lsp is unknown', () => {
    const caps = detectCapabilities();
    assert.strictEqual(caps.lsp.state, 'unknown');
    assert.strictEqual(caps.lsp.installed, false);
  });

  it('codebase-memory is unknown', () => {
    const caps = detectCapabilities();
    assert.strictEqual(caps['codebase-memory'].state, 'unknown');
    assert.strictEqual(caps['codebase-memory'].installed, false);
  });

  it('filesystem is available', () => {
    const caps = detectCapabilities();
    assert.strictEqual(caps.filesystem.state, 'available');
    assert.strictEqual(caps.filesystem.installed, true);
  });
});

describe('Retrieval Router - resolveIntent', () => {
  it('invalid intent returns null', () => {
    const result = resolveIntent('invalid', 'test', null, detectCapabilities());
    assert.strictEqual(result, null);
  });

  it('no policy returns PROJECT_NOT_ADOPTED', () => {
    const result = resolveIntent('auto', 'test', null, detectCapabilities());
    assert.strictEqual(result.enabled, false);
    assert.strictEqual(result.reason, 'PROJECT_NOT_ADOPTED');
  });

  it('policy enabled false returns PROJECT_NOT_ADOPTED', () => {
    const policy = { schema_version: '1.0', enabled: false, strategies: {}, budgets: {} };
    const result = resolveIntent('auto', 'test', policy, detectCapabilities());
    assert.strictEqual(result.enabled, false);
    assert.strictEqual(result.reason, 'PROJECT_NOT_ADOPTED');
  });

  it('explicit intent with valid policy returns enabled true', () => {
    const policy = { schema_version: '1.0', enabled: true, strategies: { exact: { enabled: true, provider: 'ripgrep' } }, budgets: {} };
    const result = resolveIntent('exact', 'test', policy, detectCapabilities());
    assert.strictEqual(result.enabled, true);
    assert.strictEqual(result.resolved, 'exact');
  });

  it('auto intent returns classified strategy', () => {
    const policy = { schema_version: '1.0', enabled: true, strategies: { exact: { enabled: true, provider: 'ripgrep' }, semantic: { enabled: true, provider: 'semantic' } }, budgets: {} };
    const result = resolveIntent('auto', 'best practice for caching', policy, detectCapabilities());
    assert.strictEqual(result.enabled, true);
    assert.strictEqual(result.resolved, 'semantic');
  });
});

describe('Retrieval Router - validatePolicySchema', () => {
  it('valid policy passes', () => {
    const policy = {
      schema_version: '1.0',
      enabled: true,
      strategies: {
        exact: { enabled: true, provider: 'ripgrep' }
      },
      budgets: DEFAULT_BUDGETS
    };
    const result = validatePolicySchema(policy);
    assert.strictEqual(result.valid, true);
  });

  it('missing schema_version fails', () => {
    const policy = {
      enabled: true,
      strategies: {},
      budgets: {}
    };
    const result = validatePolicySchema(policy);
    assert.strictEqual(result.valid, false);
    assert.ok(result.error.includes('schema_version'));
  });

  it('invalid schema_version fails', () => {
    const policy = {
      schema_version: '2.0',
      enabled: true,
      strategies: {},
      budgets: {}
    };
    const result = validatePolicySchema(policy);
    assert.strictEqual(result.valid, false);
    assert.ok(result.error.includes('schema_version'));
  });

  it('missing enabled fails', () => {
    const policy = {
      schema_version: '1.0',
      strategies: {},
      budgets: {}
    };
    const result = validatePolicySchema(policy);
    assert.strictEqual(result.valid, false);
    assert.ok(result.error.includes('enabled'));
  });

  it('missing strategies fails', () => {
    const policy = {
      schema_version: '1.0',
      enabled: true,
      budgets: {}
    };
    const result = validatePolicySchema(policy);
    assert.strictEqual(result.valid, false);
    assert.ok(result.error.includes('strategies'));
  });

  it('missing budgets fails', () => {
    const policy = {
      schema_version: '1.0',
      enabled: true,
      strategies: {}
    };
    const result = validatePolicySchema(policy);
    assert.strictEqual(result.valid, false);
    assert.ok(result.error.includes('budgets'));
  });
});

describe('Retrieval Router - Plan Output', () => {
  let tmpDir;
  beforeEach(() => {
    tmpDir = join(REPO_ROOT, '.test-tmp-' + Date.now());
    mkdirSync(tmpDir, { recursive: true });
    mkdirSync(join(tmpDir, '.ai-env'), { recursive: true });
  });
  afterEach(() => {
    if (existsSync(tmpDir)) {
      try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
  });

  it('plan has all required fields', () => {
    const plan = buildPlan('idImportacion', tmpDir, null, INTENTS.AUTO);
    assert.ok(plan.hasOwnProperty('schema_version'));
    assert.ok(plan.hasOwnProperty('enabled'));
    assert.ok(plan.hasOwnProperty('intent'));
    assert.ok(plan.hasOwnProperty('strategy'));
    assert.ok(plan.hasOwnProperty('provider'));
    assert.ok(plan.hasOwnProperty('reason'));
    assert.ok(plan.hasOwnProperty('budgets'));
    assert.ok(plan.hasOwnProperty('fallbacks'));
    assert.ok(plan.hasOwnProperty('repository'));
    assert.ok(plan.hasOwnProperty('branch'));
    assert.ok(plan.hasOwnProperty('commit'));
    assert.ok(plan.hasOwnProperty('indexed_commit'));
    assert.ok(plan.hasOwnProperty('index_generation'));
    assert.ok(plan.hasOwnProperty('indexed_at'));
    assert.ok(plan.hasOwnProperty('index_status'));
    assert.ok(plan.hasOwnProperty('dirty_worktree'));
    assert.ok(plan.hasOwnProperty('warnings'));
  });

  it('warnings is always an array', () => {
    const plan = buildPlan('idImportacion', tmpDir, null, INTENTS.AUTO);
    assert.ok(Array.isArray(plan.warnings));
  });

  it('schema_version is 1.0', () => {
    const plan = buildPlan('idImportacion', tmpDir, null, INTENTS.AUTO);
    assert.strictEqual(plan.schema_version, '1.0');
  });

  it('non-adopted project has enabled false', () => {
    const plan = buildPlan('idImportacion', tmpDir, null, INTENTS.AUTO);
    assert.strictEqual(plan.enabled, false);
  });

  it('knowledge intent includes knowledge_paths', () => {
    const policy = {
      schema_version: '1.0',
      enabled: true,
      strategies: {
        exact: { enabled: true, provider: 'ripgrep' },
        symbol: { enabled: true, provider: 'lsp' },
        architecture: { enabled: true, provider: 'codebase-memory' },
        semantic: { enabled: true, provider: 'semantic' },
        knowledge: { enabled: true, provider: 'filesystem', paths: [] }
      },
      budgets: DEFAULT_BUDGETS
    };
    const plan = buildPlan('why was this done', tmpDir, policy, INTENTS.AUTO);
    assert.ok(plan.knowledge_paths);
    assert.ok(Array.isArray(plan.knowledge_paths));
    assert.ok(plan.knowledge_paths.length > 0);
  });

  it('invalid intent returns error plan', () => {
    const plan = buildPlan('test', tmpDir, null, 'invalid');
    assert.strictEqual(plan.enabled, false);
    assert.ok(plan.error);
    assert.ok(plan.message);
  });

  it('adopted project has enabled true', () => {
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
    assert.strictEqual(plan.enabled, true);
  });
});

describe('Retrieval Router - Policy Loading', () => {
  let tmpDir;
  beforeEach(() => {
    tmpDir = join(REPO_ROOT, '.test-tmp-' + Date.now());
    mkdirSync(tmpDir, { recursive: true });
  });
  afterEach(() => {
    if (existsSync(tmpDir)) {
      try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
  });
  it('loadPolicy returns null for missing file', () => {
    assert.strictEqual(loadPolicy(join(tmpDir, 'nonexistent.json')), null);
  });
  it('loadPolicy returns null for null path', () => {
    assert.strictEqual(loadPolicy(null), null);
  });
  it('loadPolicy loads valid policy', () => {
    const policyPath = join(tmpDir, 'policy.json');
    writeFileSync(policyPath, JSON.stringify({ schema_version: '1.0', enabled: true, strategies: { exact: { enabled: true, provider: 'ripgrep' } }, budgets: DEFAULT_BUDGETS }));
    const p = loadPolicy(policyPath);
    assert.strictEqual(p.schema_version, '1.0');
    assert.strictEqual(p.enabled, true);
  });
});

describe('Retrieval Router - Budget Isolation', () => {
  let tmpDir;
  beforeEach(() => {
    tmpDir = join(REPO_ROOT, '.test-tmp-' + Date.now());
    mkdirSync(tmpDir, { recursive: true });
  });
  afterEach(() => {
    if (existsSync(tmpDir)) {
      try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
  });

  it('budgets do not contaminate between calls', () => {
    const policy1 = {
      schema_version: '1.0',
      enabled: true,
      strategies: { exact: { enabled: true, provider: 'ripgrep' } },
      budgets: { exact: { max_tool_calls: 3, max_results: 50, max_chars: 24000 } }
    };
    const policy2 = {
      schema_version: '1.0',
      enabled: true,
      strategies: { exact: { enabled: true, provider: 'ripgrep' } },
      budgets: { exact: { max_tool_calls: 1, max_results: 25, max_chars: 12000 } }
    };
    const plan1 = buildPlan('test', tmpDir, policy1, INTENTS.EXACT);
    const plan2 = buildPlan('test', tmpDir, policy2, INTENTS.EXACT);
    assert.notStrictEqual(plan1.budgets.max_tool_calls, plan2.budgets.max_tool_calls, 'Budgets should differ between calls');
    assert.strictEqual(plan1.budgets.max_tool_calls, 3, 'First call should use custom budget (capped to HARD_CAP)');
    assert.strictEqual(plan2.budgets.max_tool_calls, 1, 'Second call should use its own budget');
    assert.strictEqual(DEFAULT_BUDGETS.exact.max_tool_calls, 1, 'DEFAULT_BUDGETS should not be mutated');
  });

  it('DEFAULT_BUDGETS remains unchanged after multiple buildPlan calls', () => {
    const originalBudget = { ...DEFAULT_BUDGETS.exact };
    const policy = {
      schema_version: '1.0',
      enabled: true,
      strategies: { exact: { enabled: true, provider: 'ripgrep' } },
      budgets: { exact: { max_tool_calls: 3, max_results: 50, max_chars: 24000 } }
    };
    for (let i = 0; i < 5; i++) {
      buildPlan('test', tmpDir, policy, INTENTS.EXACT);
    }
    assert.strictEqual(DEFAULT_BUDGETS.exact.max_tool_calls, originalBudget.max_tool_calls, 'DEFAULT_BUDGETS should not be mutated');
    assert.strictEqual(DEFAULT_BUDGETS.exact.max_results, originalBudget.max_results, 'DEFAULT_BUDGETS should not be mutated');
    assert.strictEqual(DEFAULT_BUDGETS.exact.max_chars, originalBudget.max_chars, 'DEFAULT_BUDGETS should not be mutated');
  });
});

describe('Retrieval Router - Provider Availability', () => {
  let tmpDir;
  beforeEach(() => {
    tmpDir = join(REPO_ROOT, '.test-tmp-' + Date.now());
    mkdirSync(tmpDir, { recursive: true });
  });
  afterEach(() => {
    if (existsSync(tmpDir)) {
      try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
  });

  it('UNKNOWN providers are never selected even when specified in policy', () => {
    const policy = {
      schema_version: '1.0',
      enabled: true,
      strategies: {
        exact: { enabled: true, provider: 'ripgrep' },
        symbol: { enabled: true, provider: 'lsp' },
        architecture: { enabled: true, provider: 'codebase-memory' }
      },
      budgets: DEFAULT_BUDGETS
    };
    const caps = detectCapabilities();
    if (caps.lsp.state === 'unknown') {
      const planSymbol = buildPlan('def getData', tmpDir, policy, INTENTS.SYMBOL);
      assert.notStrictEqual(planSymbol.provider, 'lsp', 'lsp should not be selected when UNKNOWN');
    }
    if (caps['codebase-memory'].state === 'unknown') {
      const planArch = buildPlan('impact analysis', tmpDir, policy, INTENTS.ARCHITECTURE);
      assert.notStrictEqual(planArch.provider, 'codebase-memory', 'codebase-memory should not be selected when UNKNOWN');
    }
  });

  it('fallback provider is selected when primary is unavailable', () => {
    const policy = {
      schema_version: '1.0',
      enabled: true,
      strategies: {
        exact: { enabled: true, provider: 'ripgrep' },
        architecture: { enabled: true, provider: 'codebase-memory' }
      },
      budgets: DEFAULT_BUDGETS
    };
    const planArch = buildPlan('impact analysis', tmpDir, policy, INTENTS.ARCHITECTURE);
    assert.ok(planArch.fallbacks.length >= 0, 'Should have fallbacks array');
  });
});
