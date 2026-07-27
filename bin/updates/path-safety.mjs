import { existsSync, lstatSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

export function normalizeRelativePath(value) {
  if (typeof value !== 'string' || !value.trim() || isAbsolute(value) || /^[a-z]:/i.test(value)) throw new Error('Path must be a non-empty relative path');
  const parts = value.replace(/\\/g, '/').split('/');
  if (parts.some(part => !part || part === '.' || part === '..' || /[\0]/.test(part))) throw new Error('Unsafe relative path');
  return parts.join('/');
}

export function requireAbsoluteRoot(value, name = 'root') {
  if (typeof value !== 'string' || !isAbsolute(value)) throw new Error(`${name} must be an absolute path`);
  return resolve(value);
}

export function resolveSafePath(root, relativePath, { allowMissing = true } = {}) {
  const base = requireAbsoluteRoot(root, 'environment root');
  const normalized = normalizeRelativePath(relativePath);
  const target = resolve(base, normalized);
  if (relative(base, target).startsWith('..') || relative(base, target) === '' || !target.startsWith(base + sep)) throw new Error('Path escapes environment root');
  const baseReal = existsSync(base) ? realpathSync(base) : base;
  let cursor = base;
  for (const part of normalized.split('/')) {
    cursor = resolve(cursor, part);
    if (!existsSync(cursor)) { if (allowMissing) break; throw new Error('Path does not exist'); }
    const stat = lstatSync(cursor);
    if (stat.isSymbolicLink() || (stat.isReparsePoint && stat.isReparsePoint())) throw new Error('Symlink or reparse point is not allowed');
    const actual = realpathSync(cursor);
    if (actual !== baseReal && !actual.startsWith(baseReal + sep)) throw new Error('Resolved path escapes environment root');
  }
  return { path: target, relativePath: normalized };
}

export function isAbsolutePath(value) { return typeof value === 'string' && (isAbsolute(value) || /^[a-z]:[\\/]/i.test(value)); }
