/**
 * Retrieval Router - OpenCode Global v0.4.0
 *
 * Deterministic, plan-only retrieval strategy selector.
 * Does NOT execute any tools or modify any files.
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'node:child_process';

import validatePolicy from './retrieval-policy-validator.mjs';
import validateIndexState from './retrieval-index-state-validator.mjs';

export const INTENTS = {
  EXACT: 'exact',
  SYMBOL: 'symbol',
  ARCHITECTURE: 'architecture',
  SEMANTIC: 'semantic',
  KNOWLEDGE: 'knowledge',
  AUTO: 'auto'
};

export const STRATEGIES = {
  EXACT: 'exact',
  SYMBOL: 'symbol',
  ARCHITECTURE: 'architecture',
  SEMANTIC: 'semantic',
  KNOWLEDGE: 'knowledge'
};

export const KNOWLEDGE_PATHS_GLOB = [
  'AGENTS.md',
  '.ai-env/**',
  'docs/**',
  'specs/**',
  '**/adr/**',
  '**/ADR/**',
  '.intelligence/**',
  'README*',
  'CHANGELOG*',
  'PROGRESS.md',
  'MIGRATION_CONTROL*',
  'HANDOFF_NEXT_RUN*'
];

export const HARD_CAPS = {
  max_tool_calls: 3,
  max_chars: 24000,
  timeout_ms: 5000
};

export const DEFAULT_BUDGETS = {
  exact: { max_tool_calls: 1, max_results: 25, max_chars: 12000, timeout_ms: 5000 },
  symbol: { max_tool_calls: 2, max_results: 25, max_chars: 16000, timeout_ms: 5000 },
  architecture: { max_tool_calls: 2, max_results: 30, max_chars: 20000, timeout_ms: 5000 },
  semantic: { max_tool_calls: 2, max_results: 12, max_chars: 16000, timeout_ms: 5000 },
  knowledge: { max_tool_calls: 2, max_results: 12, max_chars: 16000, timeout_ms: 5000 }
};

const PATTERNS = {
  EXACT_IDENTIFIER: /^[a-zA-Z_][a-zA-Z0-9_]{1,64}$/,
  CAMEL_CASE: /^[a-zA-Z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*$/,
  PASCAL_CASE: /^[A-Z][a-zA-Z0-9]+$/,
  SNAKE_CASE: /^[a-z_][a-z0-9_]*$/,
  QUALIFIED_NAME: /^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)+$/,
  METHOD_CALL: /^[a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z_][a-zA-Z0-9_]*\s*\(/,
  IMPORT_PATH: /^[\w\-\.\/\\]+\.(java|ts|js|py|cs|c|cpp|h|go|rs)$/,
  DEFINITION_KW: /\b(def|function|func|class|interface|struct|enum|module|const|let|var|import|export|module|package)\b/i,
  REFERENCE_KW: /\b(uses|imports|references|calls|instances|extends|implements)\b/i,
  IMPACT_KW: /\b(break|change|impact|affect|modify|update|refactor|remove|deprecate|dependencies)\b/i,
  CONCEPT_KW: /\b(concept|idea|approach|pattern|best practice|recommendation)\b/i,
  DECISION_KW: /\b(decision|adr|architecture|design principle|convention|rule|policy)\b/i,
  WHY_KW: /\b(why|reason|because|justification|purpose)\b/
};

export function classifyQueryAuto(query) {
  const trimmed = query.trim();
  
  if (PATTERNS.QUALIFIED_NAME.test(trimmed) || PATTERNS.METHOD_CALL.test(trimmed)) {
    return STRATEGIES.EXACT;
  }
  if (PATTERNS.EXACT_IDENTIFIER.test(trimmed) || PATTERNS.CAMEL_CASE.test(trimmed) || PATTERNS.PASCAL_CASE.test(trimmed)) {
    return STRATEGIES.EXACT;
  }
  if (PATTERNS.SNAKE_CASE.test(trimmed)) {
    return STRATEGIES.EXACT;
  }
  if (PATTERNS.IMPORT_PATH.test(trimmed)) {
    return STRATEGIES.EXACT;
  }
  if (PATTERNS.DEFINITION_KW.test(trimmed)) {
    return STRATEGIES.SYMBOL;
  }
  if (PATTERNS.IMPACT_KW.test(trimmed)) {
    return STRATEGIES.ARCHITECTURE;
  }
  if (PATTERNS.REFERENCE_KW.test(trimmed)) {
    return STRATEGIES.SYMBOL;
  }
  if (PATTERNS.DECISION_KW.test(trimmed) || PATTERNS.WHY_KW.test(trimmed)) {
    return STRATEGIES.KNOWLEDGE;
  }
  if (PATTERNS.CONCEPT_KW.test(trimmed)) {
    return STRATEGIES.SEMANTIC;
  }
  if (trimmed.length < 3) {
    return STRATEGIES.EXACT;
  }
  return STRATEGIES.SEMANTIC;
}

export function detectProviderState(cmd) {
  try {
    execFileSync(cmd, ['--version'], { stdio: 'ignore', timeout: 3000 });
    return 'available';
  } catch {
    return 'not_installed';
  }
}

export function detectCapabilities() {
  const rgState = detectProviderState('rg');
  const gitState = detectProviderState('git');
  
  return {
    ripgrep: { 
      state: rgState, 
      installed: rgState === 'available',
      available: rgState === 'available'
    },
    git_grep: { 
      state: gitState, 
      installed: gitState === 'available',
      available: gitState === 'available'
    },
    lsp: { 
      state: 'unknown', 
      installed: false, 
      configured: false,
      available: false
    },
    'codebase-memory': { 
      state: 'unknown', 
      installed: false, 
      indexed: false,
      available: false
    },
    semantic: { 
      state: 'unknown', 
      installed: false,
      available: false
    },
    filesystem: { 
      state: 'available', 
      installed: true,
      available: true
    }
  };
}

const PROVIDER_LADDERS = {
  'exact': ['ripgrep', 'git_grep'],
  'symbol': ['lsp', 'codebase-memory', 'ripgrep', 'git_grep'],
  'architecture': ['codebase-memory', 'lsp', 'ripgrep', 'git_grep'],
  'semantic': ['semantic', 'codebase-memory', 'ripgrep', 'git_grep'],
  'knowledge': ['filesystem', 'ripgrep', 'git_grep']
};

const STRATEGY_FALLBACKS = {
  'exact': ['symbol', 'architecture'],
  'symbol': ['architecture', 'exact'],
  'architecture': ['symbol', 'exact'],
  'semantic': ['exact', 'architecture'],
  'knowledge': ['exact']
};

function isProviderAvailable(p, caps) {
  if (!p) return false;
  if (p === 'ripgrep') return caps.ripgrep?.state === 'available';
  if (p === 'git_grep') return caps.git_grep?.state === 'available';
  if (p === 'filesystem') return true;
  if (p === 'lsp' || p === 'codebase-memory' || p === 'semantic') {
    const cap = caps[p];
    return cap && cap.state === 'available';
  }
  return false;
}

function resolveProviderLadder(strategy, capabilities, policy) {
  const ladder = PROVIDER_LADDERS[strategy] || ['ripgrep', 'git_grep'];
  
  for (const provider of ladder) {
    if (provider === 'semantic' && policy?.strategies?.semantic?.enabled !== true) {
      continue;
    }
    
    const cap = capabilities[provider];
    if (!cap) continue;
    
    if (isProviderAvailable(provider, capabilities)) {
      return provider;
    }
  }
  
  return null;
}

export function getGitInfo(projectRoot) {
  const info = { repository: null, branch: null, commit: null, dirty_worktree: false, detached: false, error: null };
  try {
    try {
      const toplevel = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: projectRoot, encoding: 'utf8', timeout: 5000 }).trim();
      info.repository = toplevel;
    } catch {
      info.repository = 'unknown';
    }
    try {
      const branch = execFileSync('git', ['branch', '--show-current'], { cwd: projectRoot, encoding: 'utf8', timeout: 5000 }).trim();
      info.detached = branch === '';
      info.branch = info.detached ? 'HEAD' : branch;
    } catch {
      try {
        info.branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: projectRoot, encoding: 'utf8', timeout: 5000 }).trim();
        info.detached = info.branch === 'HEAD';
      } catch {
        info.branch = 'unknown';
      }
    }
    try {
      info.commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: projectRoot, encoding: 'utf8', timeout: 5000 }).trim();
    } catch {
      info.commit = 'unknown';
    }
    try {
      const status = execFileSync('git', ['status', '--porcelain=v1'], { cwd: projectRoot, encoding: 'utf8', timeout: 5000 }).trim();
      info.dirty_worktree = status.length > 0;
    } catch {
      info.dirty_worktree = false;
    }
  } catch (e) {
    info.error = e.message;
  }
  return info;
}

export function getIndexState(projectRoot) {
  const info = { indexed_commit: null, index_generation: null, indexed_at: null, index_status: 'NOT_INDEXED', error: null };
  const statePath = join(projectRoot, '.ai-env', 'retrieval-index-state.json');

  if (existsSync(statePath)) {
    try {
      const data = JSON.parse(readFileSync(statePath, 'utf8'));
      if (data && typeof data === 'object') {
        const indexValidation = validateIndexStateWithAjv(data);
        if (!indexValidation.valid) {
          info.error = indexValidation.error;
          info.index_status = 'UNKNOWN';
          return info;
        }
        info.indexed_commit = data.indexed_commit || null;
        info.index_generation = data.index_generation || data.indexed_commit || null;
        info.indexed_at = data.indexed_at || null;

        if (info.indexed_commit) {
          try {
            const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: projectRoot, encoding: 'utf8', timeout: 5000 }).trim();
            if (head !== info.indexed_commit) {
              info.index_status = 'STALE_INDEX';
            } else {
              info.index_status = 'FRESH';
            }
          } catch (e) {
            info.error = 'git rev-parse HEAD failed: ' + e.message;
            info.index_status = 'UNKNOWN';
          }
        } else {
          info.index_status = 'NOT_INDEXED';
        }
        return info;
      }
    } catch (e) {
      info.error = 'Unreadable index state: ' + e.message;
      info.index_status = 'UNKNOWN';
      return info;
    }
  }
  
  info.index_status = 'NOT_INDEXED';
  return info;
}

export function resolveIntent(intent, query, policy, capabilities) {
  if (!Object.values(INTENTS).includes(intent)) {
    return null;
  }
  
  if (!policy || !policy.enabled) {
    return { resolved: intent, reason: 'PROJECT_NOT_ADOPTED', enabled: false };
  }
  
  if (intent !== INTENTS.AUTO) {
    return { resolved: intent, reason: 'explicit', enabled: true };
  }
  
  const classified = classifyQueryAuto(query);
  return { resolved: classified, reason: 'auto', enabled: true };
}

function getConfiguredProviderForStrategy(strategy, policy) {
  if (!policy || !policy.strategies) return null;
  const cfg = policy.strategies[strategy];
  if (!cfg || !cfg.enabled) return null;
  return cfg.provider || null;
}

function hasEnabledProvider(s, pol, caps) {
  const cfg = pol?.strategies?.[s];
  if (!cfg || !cfg.enabled) return false;
  const p = cfg.provider;
  if (!p) return false;
  return isProviderAvailable(p, caps);
}

function buildFallbacksList(strategy, selectedProvider, capabilities, policy) {
  const fallbacks = [];
  const ladder = PROVIDER_LADDERS[strategy] || [];
  let foundSelected = false;
  
  for (const p of ladder) {
    if (p === selectedProvider) {
      foundSelected = true;
      continue;
    }
    
    if (p === 'semantic' && policy?.strategies?.semantic?.enabled !== true) {
      continue;
    }
    
    if (isProviderAvailable(p, capabilities)) {
      const reason = foundSelected ? 'provider_fallback' : 'strategy_fallback';
      fallbacks.push({ provider: p, reason });
    }
  }
  
  return fallbacks;
}

export function buildPlan(query, projectRoot, policy, intent) {
  const resolved = resolveIntent(intent, query, policy, detectCapabilities());
  if (!resolved) {
    return { schema_version: '1.0', enabled: false, error: 'INVALID_INTENT', message: `Intent must be one of: ${Object.values(INTENTS).join(', ')}` };
  }

  let strategy = resolved.resolved;
  const gitInfo = getGitInfo(projectRoot);
  const indexInfo = getIndexState(projectRoot);
  const capabilities = detectCapabilities();
  const warnings = [];

  let provider = null;
  
  if (resolved.enabled && policy && policy.enabled) {
    provider = getConfiguredProviderForStrategy(strategy, policy);
  }
  
  const isExplicit = resolved.reason === 'explicit';
  const classifiedStrategyDisabled = provider === null;
  
  if (resolved.enabled && !isProviderAvailable(provider, capabilities)) {
    if (isExplicit) {
      const ladder = PROVIDER_LADDERS[strategy] || [];
      for (const p of ladder) {
        if (isProviderAvailable(p, capabilities)) {
          provider = p;
          warnings.push(`PROVIDER_FALLBACK_TO_${p.toUpperCase()}`);
          break;
        }
      }
    } else if (classifiedStrategyDisabled) {
      const strategyFallbacks = STRATEGY_FALLBACKS[strategy] || [];
      for (const fb of strategyFallbacks) {
        const fbLadder = PROVIDER_LADDERS[fb] || [];
        for (const p of fbLadder) {
          if (isProviderAvailable(p, capabilities)) {
            strategy = fb;
            provider = p;
            warnings.push(`STRATEGY_FALLBACK_TO_${fb.toUpperCase()}`);
            warnings.push(`PROVIDER_FALLBACK_TO_${p.toUpperCase()}`);
            break;
          }
        }
        if (isProviderAvailable(provider, capabilities)) break;
      }
    } else {
      const ladder = PROVIDER_LADDERS[strategy] || [];
      for (const p of ladder) {
        if (isProviderAvailable(p, capabilities)) {
          provider = p;
          warnings.push(`PROVIDER_FALLBACK_TO_${p.toUpperCase()}`);
          break;
        }
      }
      
      if (!isProviderAvailable(provider, capabilities)) {
        const strategyFallbacks = STRATEGY_FALLBACKS[strategy] || [];
        for (const fb of strategyFallbacks) {
          const fbLadder = PROVIDER_LADDERS[fb] || [];
          for (const p of fbLadder) {
            if (isProviderAvailable(p, capabilities)) {
              strategy = fb;
              provider = p;
              warnings.push(`STRATEGY_FALLBACK_TO_${fb.toUpperCase()}`);
              warnings.push(`PROVIDER_FALLBACK_TO_${p.toUpperCase()}`);
              break;
            }
          }
          if (isProviderAvailable(provider, capabilities)) break;
        }
      }
    }
  }
  
  if (resolved.enabled && strategy === 'architecture' && indexInfo.index_status === 'STALE_INDEX' && provider === 'codebase-memory') {
    let fallbackProvider = null;
    if (isProviderAvailable('ripgrep', capabilities)) {
      fallbackProvider = 'ripgrep';
    } else if (isProviderAvailable('git_grep', capabilities)) {
      fallbackProvider = 'git_grep';
    }
    if (fallbackProvider) {
      provider = fallbackProvider;
      warnings.push('STALE_INDEX_FALLBACK');
    }
  }

  if (resolved.enabled && gitInfo.dirty_worktree && (strategy === 'architecture' || strategy === 'symbol')) {
    warnings.push('DIRTY_WORKTREE_VERIFICATION_REQUIRED');
  }

  let error = null;
  if (resolved.enabled && !isProviderAvailable(provider, capabilities)) {
    error = 'NO_RETRIEVAL_PROVIDER';
    warnings.push(error);
  }

  const budgets = { ...DEFAULT_BUDGETS[strategy] } || { max_tool_calls: 1, max_results: 10, max_chars: 8000, timeout_ms: 5000 };
  if (policy?.budgets?.[strategy]) {
    const pb = policy.budgets[strategy];
    budgets.max_tool_calls = Math.min(pb.max_tool_calls || budgets.max_tool_calls, HARD_CAPS.max_tool_calls);
    budgets.max_results = pb.max_results || budgets.max_results;
    budgets.max_chars = Math.min(pb.max_chars || budgets.max_chars, HARD_CAPS.max_chars);
    budgets.timeout_ms = pb.timeout_ms || budgets.timeout_ms;
  }

  const fallbacks = buildFallbacksList(strategy, provider, capabilities, policy);

  const plan = {
    schema_version: '1.0',
    enabled: resolved.enabled && !error,
    intent: resolved.resolved,
    strategy,
    provider: provider || null,
    reason: resolved.reason === 'explicit' ? `intent:${intent}` : resolved.reason,
    budgets,
    fallbacks,
    repository: gitInfo.repository,
    branch: gitInfo.branch,
    commit: gitInfo.commit,
    detached: gitInfo.detached,
    indexed_commit: indexInfo.indexed_commit,
    index_generation: indexInfo.index_generation,
    indexed_at: indexInfo.indexed_at,
    index_status: indexInfo.index_status,
    dirty_worktree: gitInfo.dirty_worktree,
    warnings,
    error: error || null
  };

  if (strategy === 'knowledge') {
    plan.knowledge_paths = [...KNOWLEDGE_PATHS_GLOB];
  }

  return plan;
}

export function loadPolicy(policyPath) {
  if (!policyPath) return null;
  if (!existsSync(policyPath)) return null;
  try {
    return JSON.parse(readFileSync(policyPath, 'utf8'));
  } catch {
    return null;
  }
}

function getModuleDir() {
  try {
    return dirname(fileURLToPath(import.meta.url));
  } catch {
    return process.cwd();
  }
}

function getSchemaPath(schemaName) {
  const moduleDir = getModuleDir();
  return join(moduleDir, '..', '..', 'contracts', schemaName);
}

export function validatePolicySchema(policy) {
  const requiredFields = ['schema_version', 'enabled', 'strategies', 'budgets'];
  for (const field of requiredFields) {
    if (!policy.hasOwnProperty(field)) {
      return { valid: false, error: `Missing required field: ${field}` };
    }
  }
  
  if (policy.schema_version !== '1.0') {
    return { valid: false, error: `Invalid schema_version: ${policy.schema_version}` };
  }
  
  if (typeof policy.enabled !== 'boolean') {
    return { valid: false, error: 'enabled must be a boolean' };
  }
  
  if (!policy.strategies || typeof policy.strategies !== 'object') {
    return { valid: false, error: 'strategies must be an object' };
  }
  
  const validStrategies = ['exact', 'symbol', 'architecture', 'semantic', 'knowledge'];
  for (const [key, value] of Object.entries(policy.strategies)) {
    if (!validStrategies.includes(key)) {
      return { valid: false, error: `Unknown strategy: ${key}` };
    }
    if (value && typeof value === 'object') {
      if (!value.hasOwnProperty('enabled')) {
        return { valid: false, error: `Strategy ${key} missing enabled field` };
      }
    }
  }
  
  return { valid: true };
}

export function validatePolicyWithAjv(policy) {
  const schemaValidation = validatePolicySchema(policy);
  if (!schemaValidation.valid) {
    return schemaValidation;
  }

  const valid = validatePolicy(policy);
  if (!valid) {
    return { valid: false, error: validatePolicy.errors?.[0]?.message || 'validation failed' };
  }
  return { valid: true };
}

export function validateIndexStateWithAjv(state) {
  if (!state || typeof state !== 'object') {
    return { valid: false, error: 'Invalid index state: not an object' };
  }

  if (state.schema_version !== '1.0') {
    return { valid: false, error: 'Invalid schema_version' };
  }

  const valid = validateIndexState(state);
  if (!valid) {
    return { valid: false, error: validateIndexState.errors?.[0]?.message || 'validation failed' };
  }
  return { valid: true };
}

export async function main() {
  const args = process.argv.slice(2);
  let query = null, projectRoot = null, policyPath = null, intent = INTENTS.AUTO;
  let explicitPolicyPath = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--query' && i + 1 < args.length) { query = args[++i]; }
    else if (args[i] === '--project-root' && i + 1 < args.length) { projectRoot = args[++i]; }
    else if (args[i] === '--policy' && i + 1 < args.length) { 
      policyPath = args[++i];
      explicitPolicyPath = true;
    }
    else if (args[i] === '--intent' && i + 1 < args.length) { intent = args[++i]; }
    else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`Usage: node retrieval-router.mjs --query "text" --project-root <path> [--intent exact|symbol|architecture|semantic|knowledge|auto] [--policy <path>]`);
      process.exit(0);
    }
  }

  if (!query) { console.error('Error: --query is required'); process.exit(1); }
  if (!projectRoot) { console.error('Error: --project-root is required'); process.exit(1); }
  if (!existsSync(projectRoot)) { console.error(`Error: project-root does not exist: ${projectRoot}`); process.exit(1); }

  const projectPolicyPath = join(projectRoot, '.ai-env', 'retrieval-policy.json');
  
  if (explicitPolicyPath) {
    if (!existsSync(policyPath)) {
      const err = JSON.stringify({ schema_version: '1.0', enabled: false, error: 'INVALID_POLICY', message: `Policy file not found: ${policyPath}` });
      console.error(err);
      process.exit(1);
    }
    
    let policy;
    try {
      policy = JSON.parse(readFileSync(policyPath, 'utf8'));
    } catch {
      const err = JSON.stringify({ schema_version: '1.0', enabled: false, error: 'INVALID_POLICY', message: 'Policy file is not valid JSON' });
      console.error(err);
      process.exit(1);
    }
    
    const validation = await validatePolicyWithAjv(policy);
    if (!validation.valid) {
      const err = JSON.stringify({ schema_version: '1.0', enabled: false, error: 'INVALID_POLICY', message: validation.error });
      console.error(err);
      process.exit(1);
    }
    
    const plan = buildPlan(query, projectRoot, policy, intent);
    console.log(JSON.stringify(plan));
    if (plan.error) process.exit(1);
    return;
  }
  
  if (!policyPath && existsSync(projectPolicyPath)) {
    policyPath = projectPolicyPath;
  }

  const policy = loadPolicy(policyPath);
  
  if (policy) {
    const validation = await validatePolicyWithAjv(policy);
    if (!validation.valid) {
      const err = JSON.stringify({ schema_version: '1.0', enabled: false, error: 'INVALID_POLICY', message: validation.error });
      console.error(err);
      process.exit(1);
    }
  }

  const plan = buildPlan(query, projectRoot, policy, intent);
  console.log(JSON.stringify(plan));
  if (plan.error) process.exit(1);
}

function isRunDirectly() {
  try {
    const argv1Path = process.argv[1].replace(/\\/g, '/');
    const argv1Url = 'file://' + (argv1Path.match(/^\/[a-z]:/i) ? argv1Path : '/' + argv1Path);
    return import.meta.url === argv1Url;
  } catch {
    return false;
  }
}

if (isRunDirectly()) {
  main();
}
