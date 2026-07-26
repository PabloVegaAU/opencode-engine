/**
 * Path Restriction Utilities - OpenCode Global v0.5.0
 * Safe path normalization and validation to prevent traversal, symlink escapes,
 * prefix collisions, and access outside allowed roots.
 */

import { resolve, relative, isAbsolute, normalize } from 'node:path';
import { realpathSync } from 'node:fs';

export function toPosixPath(absolutePath) {
  return absolutePath.replace(/\\/g, '/');
}

export function isAbsolutePath(path) {
  return isAbsolute(path);
}

export function containsBackslash(path) {
  return path.includes('\\');
}

export function containsTraversal(path) {
  const segments = path.split('/');
  let depth = 0;
  for (const segment of segments) {
    if (segment === '..') {
      depth--;
      if (depth < 0) return true;
    } else if (segment !== '' && segment !== '.') {
      depth++;
    }
  }
  return false;
}

export function hasTraversalSegment(path) {
  const posixPath = path.replace(/\\/g, '/');
  const segments = posixPath.split('/');
  return segments.some(s => s === '..');
}

export function normalizePath(path) {
  const normalized = normalize(path);
  return toPosixPath(normalized);
}

export function resolveAgainstRoot(path, root) {
  const resolved = resolve(root, path);
  return resolved;
}

export function isPathInsideRoot(path, root) {
  const absPath = resolve(path);
  const absRoot = resolve(root);
  const rel = relative(absRoot, absPath);
  return !rel.startsWith('..') && !isAbsolute(rel);
}

export function safeResolve(repoRelativePath, repoRoot, allowedRoots) {
  if (hasTraversalSegment(repoRelativePath)) {
    return { valid: false, error: 'path contains traversal (..) segment' };
  }

  if (isAbsolutePath(repoRelativePath)) {
    return { valid: false, error: 'path must be relative' };
  }

  if (containsBackslash(repoRelativePath)) {
    return { valid: false, error: 'path contains backslash' };
  }

  const resolved = resolveAgainstRoot(repoRelativePath, repoRoot);

  let insideAllowedRoot = false;
  for (const root of allowedRoots) {
    const absRoot = resolve(root);
    if (isPathInsideRoot(resolved, absRoot)) {
      insideAllowedRoot = true;
      break;
    }
  }

  if (!insideAllowedRoot) {
    return { valid: false, error: 'path resolves outside allowed roots' };
  }

  try {
    const realResolved = realpathSync(resolved);
    let insideRealRoot = false;
    for (const root of allowedRoots) {
      const absRoot = resolve(root);
      if (isPathInsideRoot(realResolved, absRoot)) {
        insideRealRoot = true;
        break;
      }
    }
    if (!insideRealRoot) {
      return { valid: false, error: 'symlink escapes allowed root' };
    }
  } catch {
  }

  const posixPath = toPosixPath(relative(repoRoot, resolved));
  if (posixPath.startsWith('..')) {
    return { valid: false, error: 'path resolves outside repository root' };
  }

  return { valid: true, normalizedPath: posixPath, resolvedPath: resolved };
}

export function validateNoPrefixCollision(paths) {
  const sorted = [...paths].sort();
  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];
    if (next.startsWith(current + '/')) {
      return { valid: false, error: `prefix collision: ${current} is a prefix of ${next}` };
    }
  }
  return { valid: true };
}

export function buildAllowedRoots(repoRoots) {
  return repoRoots.map(r => resolve(r));
}
