/**
 * Repository State - OpenCode Global v0.5.0
 * Multi-repo state capture with per-repo fingerprints and composite scope_fingerprint.
 * Paths are resolved against the manifest directory, not cwd.
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve, relative, isAbsolute } from 'node:path';
import { realpathSync, existsSync, lstatSync } from 'node:fs';
import { toPosixPath, hasTraversalSegment, isAbsolutePath, containsBackslash } from './path-restrict.mjs';

export const SCHEMA_VERSION = '1.0';

export function computeRepoFingerprint(commit, branch, dirtyWorktree, indexStatus) {
  const input = `${commit}|${branch}|${dirtyWorktree}|${indexStatus}`;
  return createHash('sha256').update(input).digest('hex');
}

export function computeScopeFingerprint(repoEntries) {
  const lines = repoEntries
    .sort((a, b) => a.repository_id.localeCompare(b.repository_id))
    .map(r => `${r.repository_id}:${r.fingerprint}`);
  const input = lines.join('\n');
  return createHash('sha256').update(input).digest('hex');
}

export function getGitInfo(repoPath) {
  try {
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repoPath,
      encoding: 'utf8',
      timeout: 3000
    }).trim();

    let branch = 'HEAD';
    let detached = false;

    try {
      const branchOutput = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
        cwd: repoPath,
        encoding: 'utf8',
        timeout: 3000
      }).trim();
      if (branchOutput === 'HEAD') {
        detached = true;
      } else {
        branch = branchOutput;
      }
    } catch {
      detached = true;
    }

    let dirtyWorktree = false;
    try {
      const status = execFileSync('git', ['status', '--porcelain'], {
        cwd: repoPath,
        encoding: 'utf8',
        timeout: 3000
      }).trim();
      dirtyWorktree = status.length > 0;
    } catch {
      dirtyWorktree = true;
    }

    let indexStatus = 'UNKNOWN';
    try {
      execFileSync('git', ['diff', '--cached', '--quiet'], {
        cwd: repoPath,
        encoding: 'utf8',
        timeout: 3000
      });
      indexStatus = 'FRESH';
    } catch {
      try {
        const diff = execFileSync('git', ['diff', '--cached'], {
          cwd: repoPath,
          encoding: 'utf8',
          timeout: 3000
        }).trim();
        indexStatus = diff.length > 0 ? 'STALE_INDEX' : 'NOT_INDEXED';
      } catch {
        indexStatus = 'NOT_INDEXED';
      }
    }

    return { commit, branch, detached, dirtyWorktree, indexStatus };
  } catch {
    return {
      commit: 'unknown',
      branch: 'unknown',
      detached: true,
      dirtyWorktree: true,
      indexStatus: 'UNKNOWN'
    };
  }
}

function validateRepoPath(repoPath, manifestDir) {
  if (isAbsolutePath(repoPath)) {
    return { valid: false, error: 'path must be relative in manifest' };
  }
  if (containsBackslash(repoPath)) {
    return { valid: false, error: 'path contains backslash' };
  }
  if (hasTraversalSegment(repoPath)) {
    return { valid: false, error: 'path contains traversal' };
  }
  return { valid: true };
}

export function captureRepositoryState(manifest, options = {}) {
  const manifestDir = options.manifestDir || process.cwd();
  const indexState = options.indexState || null;

  const { repositories } = manifest;

  if (!repositories || repositories.length === 0) {
    throw new Error('No repositories in manifest');
  }

  const seenIds = new Set();
  const repoEntries = [];

  for (const repo of repositories) {
    const { repository_id, path: repoPath } = repo;

    if (seenIds.has(repository_id)) {
      throw new Error(`Duplicate repository_id: ${repository_id}`);
    }
    seenIds.add(repository_id);

    const pathValidation = validateRepoPath(repoPath, manifestDir);
    if (!pathValidation.valid) {
      throw new Error(`Invalid path for ${repository_id}: ${pathValidation.error}`);
    }

    const absRepoPath = resolve(manifestDir, repoPath);
    const resolvedPath = resolve(absRepoPath);

    if (!existsSync(resolvedPath)) {
      throw new Error(`Repository path does not exist: ${repoPath}`);
    }

    let realPath = resolvedPath;
    try {
      const stats = lstatSync(resolvedPath);
      if (stats.isSymbolicLink()) {
        realPath = realpathSync(resolvedPath);
      }
    } catch {
    }

    const gitInfo = getGitInfo(realPath);
    const fingerprint = computeRepoFingerprint(
      gitInfo.commit,
      gitInfo.branch,
      gitInfo.dirtyWorktree,
      gitInfo.indexStatus
    );

    const repoIndexState = indexState?.repositories?.find(r => r.repository_id === repository_id);

    const index_status = repoIndexState ? gitInfo.indexStatus : 'NOT_INDEXED';

    repoEntries.push({
      repository_id,
      path: toPosixPath(repoPath),
      commit: gitInfo.commit,
      branch: gitInfo.branch,
      detached: gitInfo.detached,
      dirty_worktree: gitInfo.dirtyWorktree,
      index_status,
      indexed_commit: repoIndexState?.indexed_commit || null,
      index_generation: repoIndexState?.index_generation || null,
      indexed_at: repoIndexState?.indexed_at || null,
      fingerprint
    });
  }

  const sortedEntries = repoEntries.sort((a, b) =>
    a.repository_id.localeCompare(b.repository_id)
  );

  const scopeFingerprint = computeScopeFingerprint(sortedEntries);

  return {
    schema_version: SCHEMA_VERSION,
    repositories: sortedEntries,
    scope_fingerprint: scopeFingerprint,
    captured_at: new Date().toISOString()
  };
}

export function hasDirtyRepository(state) {
  if (!state || !state.repositories) return false;
  return state.repositories.some(r => r.dirty_worktree);
}

export function getRepoPaths(state) {
  return state.repositories.map(r => ({
    repository_id: r.repository_id,
    path: resolve(process.cwd(), r.path)
  }));
}

export function getRepoRelativePaths(state) {
  return state.repositories.map(r => ({
    repository_id: r.repository_id,
    path: r.path
  }));
}
