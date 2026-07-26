/**
 * Filesystem adapter for retrieval execution.
 * Knowledge strategy only. Traverses allowed roots and knowledge patterns.
 * Respects deny globs, case-insensitive adr/ADR, no symlinks outside root.
 */

import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import {
  PROVIDER_IDS,
  STATUS,
  createEnvelope,
  toPosixPath,
  buildDenyGlobs,
  elapsed
} from './shared.mjs';

export const id = PROVIDER_IDS.FILESYSTEM;

export function checkAvailability() {
  return 'available';
}

const KNOWLEDGE_PATTERNS = [
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

const CASE_INSENSITIVE_ADR_PATTERN = /^(adr|ADR)(\/|$)/;

function matchesKnowledgePattern(relativePath) {
  const normalized = relativePath.replace(/\\/g, '/');

  if (normalized.match(CASE_INSENSITIVE_ADR_PATTERN)) return true;

  for (const pattern of KNOWLEDGE_PATTERNS) {
    if (matchGlobPattern(normalized, pattern)) return true;
  }
  return false;
}

function matchGlobPattern(path, pattern) {
  const parts = path.split('/');
  const patternParts = pattern.split('/');

  let pi = 0;
  for (const part of parts) {
    if (pi >= patternParts.length) return false;
    const p = patternParts[pi];

    if (p === '**') {
      if (pi === patternParts.length - 1) return true;
      const nextP = patternParts[pi + 1];
      for (let i = parts.indexOf(part); i < parts.length; i++) {
        if (matchSinglePart(parts[i], nextP)) {
          const remaining = parts.slice(i + 1);
          const remainingPattern = patternParts.slice(pi + 2);
          if (remaining.length === 0 && remainingPattern.length === 0) return true;
          if (remaining.length > 0 && matchGlobPattern(remaining.join('/'), remainingPattern.join('/'))) return true;
        }
      }
      return false;
    }

    if (!matchSinglePart(part, p)) return false;
    pi++;
  }

  return pi === patternParts.length || patternParts[pi] === '**';
}

function matchSinglePart(part, pattern) {
  if (pattern === '*') return !part.includes('*');
  if (pattern === '**') return part === '**';

  const regex = pattern.replace(/\./g, '\\.').replace(/\*/g, '[^/]*');
  return new RegExp(`^${regex}$`).test(part);
}

function isSymlinkOutsideRoot(symlinkTarget, rootPath) {
  const resolved = resolve(symlinkTarget);
  const rootResolved = resolve(rootPath);
  return !resolved.startsWith(rootResolved);
}

function shouldDeny(path, denyGlobs) {
  const normalized = path.replace(/\\/g, '/');
  for (const glob of denyGlobs) {
    if (matchGlobPattern(normalized, glob)) return true;
  }
  return false;
}

function traverseKnowledge(rootPath, denyGlobs, maxChars, collected, currentChars) {
  if (currentChars >= maxChars) return currentChars;

  let chars = currentChars;

  try {
    const entries = readdirSync(rootPath, { withFileTypes: true });

    for (const entry of entries) {
      if (chars >= maxChars) break;

      const fullPath = join(rootPath, entry.name);
      const relativePath = toPosixPath(relative(rootPath, fullPath));

      if (shouldDeny(relativePath, denyGlobs)) continue;

      try {
        if (entry.isSymbolicLink()) {
          if (isSymlinkOutsideRoot(fullPath, rootPath)) continue;
          const target = resolve(fullPath);
          if (!target.startsWith(resolve(rootPath))) continue;
        }

        if (entry.isDirectory()) {
          if (!matchesKnowledgePattern(relativePath)) continue;
          chars = traverseKnowledge(fullPath, denyGlobs, maxChars, collected, chars);
        } else if (entry.isFile()) {
          if (!matchesKnowledgePattern(relativePath)) continue;

          const fileSize = statSync(fullPath).size;
          if (fileSize > maxChars) {
            chars += maxChars;
            collected.push({
              path: relativePath,
              line: 1,
              column: 1,
              content: `[truncated: file ${fileSize} bytes exceeds max_chars ${maxChars}]`,
              truncated: true
            });
          } else {
            const content = readFileSync(fullPath, 'utf8');
            chars += Buffer.byteLength(content, 'utf8');

            if (chars >= maxChars) {
              chars += maxChars;
              collected.push({
                path: relativePath,
                line: 1,
                column: 1,
                content: content.slice(0, Math.floor(maxChars / 2)),
                truncated: true
              });
            } else {
              collected.push({
                path: relativePath,
                line: 1,
                column: 1,
                content,
                truncated: false
              });
            }
          }
        }
      } catch {
      }
    }
  } catch {
  }

  return chars;
}

export async function execute(request) {
  const envelope = createEnvelope(id);
  const startTime = performance.now();

  const { query, repositories, deny_globs = [], protected_paths = {}, max_chars = 24000, timeout_ms = 5000 } = request;

  if (!repositories || repositories.length === 0) {
    envelope.status = STATUS.ERROR;
    envelope.error = 'invalid request: repositories are required';
    envelope.duration_ms = elapsed(startTime);
    return envelope;
  }

  const searchTerms = query.toLowerCase().split(/\s+/);
  let totalChars = 0;
  let hasResults = false;

  for (const repo of repositories) {
    if (totalChars >= max_chars) break;

    const { repository_id, path: repoPath } = repo;
    const repoProtectedPaths = protected_paths[repository_id] || [];
    const denyGlobs = buildDenyGlobs(deny_globs, repoProtectedPaths);

    const collected = [];
    totalChars = traverseKnowledge(repoPath, denyGlobs, max_chars - totalChars, collected, totalChars);

    for (const item of collected) {
      const contentLower = item.content.toLowerCase();
      const matchesQuery = searchTerms.every(term => contentLower.includes(term));

      if (matchesQuery) {
        envelope.raw_items.push({
          repository_id,
          path: item.path,
          line: item.line,
          column: item.column,
          content: item.content
        });
        hasResults = true;
      }
    }
  }

  if (!hasResults && envelope.raw_items.length === 0) {
    envelope.status = STATUS.EMPTY;
  }

  envelope.stdout_chars = totalChars;
  envelope.duration_ms = elapsed(startTime);
  return envelope;
}
