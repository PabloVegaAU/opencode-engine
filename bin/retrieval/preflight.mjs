/**
 * Preflight Checks - OpenCode Global v0.5.0
 * Real read-only preflight validation before adapter execution.
 */

import { resolve } from 'node:path';
import { existsSync, lstatSync, realpathSync } from 'node:fs';
import { isAbsolutePath, containsBackslash, hasTraversalSegment, isPathInsideRoot, buildAllowedRoots } from './path-restrict.mjs';
import { createReasonCodeTracker, REASON_CODES } from './reason-codes.mjs';

export const EXECUTABLE_PROVIDERS = ['ripgrep', 'git_grep', 'filesystem'];

export const STRATEGY_PROVIDER_COMPAT = {
  exact: ['ripgrep', 'git_grep'],
  symbol: ['ripgrep', 'git_grep'],
  architecture: ['ripgrep', 'git_grep'],
  semantic: ['ripgrep', 'git_grep'],
  knowledge: ['filesystem', 'ripgrep', 'git_grep']
};

export function checkOpenCodeRetrievalModeEnv() {
  if (process.env.OPENCODE_RETRIEVAL_MODE) {
    return {
      allowed: false,
      reason: 'OPENCODE_RETRIEEG_MODE env var is not supported'
    };
  }
  return { allowed: true };
}

export function validatePlanStrictness(plan) {
  const errors = [];

  if (!plan.schema_version || plan.schema_version !== '1.0') {
    errors.push('missing or invalid schema_version');
  }

  if (!plan.mode || plan.mode !== 'execute') {
    errors.push('mode must be "execute"');
  }

  if (!plan.execution) {
    errors.push('missing execution block');
  } else {
    if (typeof plan.execution.estimated_calls !== 'number') {
      errors.push('execution.estimated_calls must be a number');
    }
    if (!plan.execution.budget_enforcement) {
      errors.push('execution.budget_enforcement required');
    }
    if (typeof plan.execution.progressive_disclosure !== 'boolean') {
      errors.push('execution.progressive_disclosure must be boolean');
    }
    if (!plan.execution.preflight) {
      errors.push('execution.preflight required');
    }
    if (typeof plan.execution.repositories_searched !== 'number') {
      errors.push('execution.repositories_searched must be a number');
    }
  }

  if (!plan.adapter_signature || !/^[0-9a-f]{64}$/.test(plan.adapter_signature)) {
    errors.push('adapter_signature must be a 64-character hex string');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export function validateManifestPaths(manifest) {
  const errors = [];
  const warnings = [];

  for (const repo of manifest.repositories) {
    if (isAbsolutePath(repo.path)) {
      errors.push(`Absolute path not allowed for ${repo.repository_id}: ${repo.path}`);
    }

    if (containsBackslash(repo.path)) {
      errors.push(`Backslash not normalized for ${repo.repository_id}: ${repo.path}`);
    }

    if (hasTraversalSegment(repo.path)) {
      errors.push(`Traversal (..) not allowed for ${repo.repository_id}: ${repo.path}`);
    }
  }

  const repoIds = manifest.repositories.map(r => r.repository_id);
  const uniqueIds = new Set(repoIds);
  if (uniqueIds.size !== repoIds.length) {
    errors.push('Duplicate repository_id values found');
  }

  const sortedIds = [...repoIds].sort();
  if (JSON.stringify(repoIds) !== JSON.stringify(sortedIds)) {
    errors.push('repository_ids must be ordered ascending');
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function validateProviderExecutable(provider) {
  if (!EXECUTABLE_PROVIDERS.includes(provider)) {
    return {
      valid: false,
      error: `Provider ${provider} is not an executable provider. Valid: ${EXECUTABLE_PROVIDERS.join(', ')}`
    };
  }
  return { valid: true };
}

export function validateStrategyProvider(strategy, provider) {
  const allowedProviders = STRATEGY_PROVIDER_COMPAT[strategy];
  if (!allowedProviders) {
    return {
      valid: false,
      error: `Unknown strategy: ${strategy}`
    };
  }
  if (!allowedProviders.includes(provider)) {
    return {
      valid: false,
      error: `Provider ${provider} is not compatible with strategy ${strategy}. Allowed: ${allowedProviders.join(', ')}`
    };
  }
  return { valid: true };
}

export function checkAllowedRoots(repoPath, allowedReadRoots, manifestDir) {
  const absRepoPath = resolve(manifestDir, repoPath);
  let realPath = absRepoPath;
  try {
    const stats = lstatSync(absRepoPath);
    if (stats.isSymbolicLink()) {
      realPath = realpathSync(absRepoPath);
    }
  } catch {
  }

  for (const root of allowedReadRoots) {
    const absRoot = resolve(manifestDir, root);
    if (isPathInsideRoot(realPath, absRoot)) {
      return { valid: true };
    }
  }
  return { valid: false, error: `path ${repoPath} is outside allowed_read_roots` };
}

export function checkDenyGlobs(path, denyGlobs) {
  const normalizedPath = path.replace(/\\/g, '/');
  for (const glob of denyGlobs) {
    if (matchGlob(normalizedPath, glob)) {
      return { valid: false, matched: glob };
    }
  }
  return { valid: true };
}

function matchGlob(path, glob) {
  const globParts = glob.split('/');
  const pathParts = path.split('/');

  let gi = 0;
  let pi = 0;

  while (gi < globParts.length && pi < pathParts.length) {
    const gp = globParts[gi];
    const pp = pathParts[pi];

    if (gp === '**') {
      if (gi === globParts.length - 1) {
        return true;
      }
      const nextGlob = globParts[gi + 1];
      while (pi < pathParts.length) {
        if (matchSinglePart(pathParts[pi], nextGlob)) {
          if (matchGlob(pathParts.slice(pi).join('/'), globParts.slice(gi + 1).join('/'))) {
            return true;
          }
        }
        pi++;
      }
      return false;
    }

    if (!matchSinglePart(pp, gp)) {
      return false;
    }
    gi++;
    pi++;
  }

  if (gi === globParts.length && pi === pathParts.length) {
    return true;
  }
  if (gi === globParts.length - 1 && globParts[gi] === '**') {
    return true;
  }
  return false;
}

function matchSinglePart(part, pattern) {
  if (pattern === '*') {
    return !part.includes('*');
  }
  const regex = pattern.replace(/\./g, '\\.').replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*');
  return new RegExp(`^${regex}$`).test(part);
}

export function checkProtectedPaths(path, protectedPaths) {
  const normalizedPath = path.replace(/\\/g, '/');
  for (const protectedPath of protectedPaths) {
    const normalizedProtected = protectedPath.replace(/\\/g, '/');
    if (normalizedPath === normalizedProtected || normalizedPath.startsWith(normalizedProtected + '/')) {
      return { valid: false, protected: protectedPath };
    }
  }
  return { valid: true };
}

export function checkSymlinkEscape(repoPath, manifestDir) {
  const absRepoPath = resolve(manifestDir, repoPath);
  try {
    const stats = lstatSync(absRepoPath);
    if (stats.isSymbolicLink()) {
      const realPath = realpathSync(absRepoPath);
      const absManifestDir = resolve(manifestDir);
      if (!isPathInsideRoot(realPath, absManifestDir)) {
        return { valid: false, error: 'symlink escapes project root' };
      }
    }
  } catch {
  }
  return { valid: true };
}

export function runPreflightChecks(plan, manifest, repoState, options = {}) {
  const reasons = createReasonCodeTracker();
  const errors = [];
  const warnings = [];
  const manifestDir = options.manifestDir || process.cwd();

  const modeCheck = checkOpenCodeRetrievalModeEnv();
  if (!modeCheck.allowed) {
    errors.push(modeCheck.reason);
    reasons.add(REASON_CODES.PREFLIGHT_BLOCKED);
    return {
      passed: false,
      preflight: 'blocked',
      reasons: reasons.toArray(),
      errors,
      warnings
    };
  }

  const manifestValidation = validateManifestPaths(manifest);
  if (!manifestValidation.valid) {
    errors.push(...manifestValidation.errors.map(e => `Manifest: ${e}`));
  }

  for (const repo of manifest.repositories) {
    const symlinkCheck = checkSymlinkEscape(repo.path, manifestDir);
    if (!symlinkCheck.valid) {
      errors.push(`Symlink escape for ${repo.repository_id}: ${symlinkCheck.error}`);
    }

    const allowedRoots = repo.allowed_read_roots || [repo.path];
    const rootCheck = checkAllowedRoots(repo.path, allowedRoots, manifestDir);
    if (!rootCheck.valid) {
      errors.push(`Allowed root check failed for ${repo.repository_id}: ${rootCheck.error}`);
    }
  }

  const denyGlobs = plan.deny_globs || [];
  for (const glob of denyGlobs) {
    for (const repo of manifest.repositories) {
      const globCheck = checkDenyGlobs(repo.path, [glob]);
      if (!globCheck.valid) {
        reasons.add(REASON_CODES.DENY_GLOB_MATCHED);
        warnings.push(`Deny glob ${glob} matches ${repo.repository_id}`);
      }
    }
  }

  const protectedPaths = plan.protected_paths || {};
  for (const [repoId, paths] of Object.entries(protectedPaths)) {
    for (const path of paths) {
      const check = checkProtectedPaths(path, paths);
      if (!check.valid) {
        warnings.push(`Protected path ${path} in ${repoId} may be at risk`);
      }
    }
  }

  const providerValidation = validateProviderExecutable(plan.provider);
  if (!providerValidation.valid) {
    errors.push(providerValidation.error);
    reasons.add(REASON_CODES.PREFLIGHT_BLOCKED);
  }

  const strategyValidation = validateStrategyProvider(plan.strategy, plan.provider);
  if (!strategyValidation.valid) {
    errors.push(strategyValidation.error);
    reasons.add(REASON_CODES.PREFLIGHT_BLOCKED);
  }

  if (errors.length === 0) {
    reasons.add(REASON_CODES.PREFLIGHT_OK);
    return {
      passed: true,
      preflight: 'passed',
      reasons: reasons.toArray(),
      errors: [],
      warnings
    };
  }

  reasons.add(REASON_CODES.PREFLIGHT_BLOCKED);
  return {
    passed: false,
    preflight: 'blocked',
    reasons: reasons.toArray(),
    errors,
    warnings
  };
}
