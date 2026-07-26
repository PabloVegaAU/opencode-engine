/**
 * Ripgrep adapter for retrieval execution.
 * Uses rg --json --hidden --smart-case --no-config
 * Respects .gitignore, applies deny globs, one process per repo.
 */

import { execFileSync } from 'node:child_process';
import {
  PROVIDER_IDS,
  STATUS,
  createEnvelope,
  toPosixPath,
  buildDenyGlobs,
  parseJsonStream,
  elapsed
} from './shared.mjs';

export const id = PROVIDER_IDS.RIPGREP;

export function checkAvailability() {
  try {
    execFileSync('rg', ['--version'], { stdio: 'ignore', timeout: 3000 });
    return 'available';
  } catch {
    return 'not_installed';
  }
}

function buildArgs(query, repoPath, denyGlobs) {
  const args = [
    '--json',
    '--hidden',
    '--smart-case',
    '--no-config',
    '-e',
    query
  ];

  for (const glob of denyGlobs) {
    args.push('--glob', glob);
  }

  args.push('--', '.');

  return args;
}

export async function execute(request) {
  const envelope = createEnvelope(id);
  const startTime = performance.now();

  if (checkAvailability() !== 'available') {
    envelope.status = STATUS.UNAVAILABLE;
    envelope.error = 'ripgrep is not installed';
    envelope.duration_ms = elapsed(startTime);
    return envelope;
  }

  const { query, repositories, deny_globs = [], protected_paths = {}, max_chars = 24000, timeout_ms = 5000 } = request;

  if (!query || !repositories || repositories.length === 0) {
    envelope.status = STATUS.ERROR;
    envelope.error = 'invalid request: query and repositories are required';
    envelope.duration_ms = elapsed(startTime);
    return envelope;
  }

  let totalChars = 0;
  let hasResults = false;

  for (const repo of repositories) {
    const { repository_id, path: repoPath } = repo;
    const repoProtectedPaths = protected_paths[repository_id] || [];
    const denyGlobs = buildDenyGlobs(deny_globs, repoProtectedPaths);

    const args = buildArgs(query, repoPath, denyGlobs);

    const processInfo = {
      repository_id,
      command: ['rg', ...args],
      cwd: repoPath,
      exit_code: null,
      signal: null
    };

    try {
      const result = execFileSync('rg', args, {
        cwd: repoPath,
        encoding: 'utf8',
        timeout: timeout_ms,
        maxBuffer: max_chars * 2,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      processInfo.exit_code = 0;
      envelope.provider_processes.push(processInfo);

      const stdoutChars = Buffer.byteLength(result, 'utf8');
      totalChars += stdoutChars;
      envelope.stdout_chars += stdoutChars;

      if (totalChars > max_chars) {
        envelope.status = STATUS.SUCCESS;
        envelope.duration_ms = elapsed(startTime);
        return envelope;
      }

      const items = parseJsonStream(result, id);

      for (const item of items) {
        if (totalChars >= max_chars) break;
        envelope.raw_items.push({
          repository_id,
          path: item.path,
          line: item.line,
          column: item.column,
          content: item.content
        });
        totalChars += Buffer.byteLength(JSON.stringify(item), 'utf8');
      }

      if (items.length > 0) hasResults = true;

    } catch (err) {
      if (err.signal === 'SIGTERM' || err.killed) {
        processInfo.signal = 'SIGTERM';
        processInfo.exit_code = -1;
        envelope.provider_processes.push(processInfo);
        envelope.status = STATUS.TIMEOUT;
        envelope.error = 'timeout exceeded';
        envelope.duration_ms = elapsed(startTime);
        return envelope;
      }

      processInfo.exit_code = err.exitCode ?? -1;
      envelope.provider_processes.push(processInfo);
    }
  }

  if (!hasResults && envelope.provider_processes.length > 0) {
    const allZero = envelope.provider_processes.every(p => p.exit_code === 0 || p.exit_code === 1);
    if (allZero) {
      envelope.status = STATUS.EMPTY;
    }
  }

  envelope.duration_ms = elapsed(startTime);
  return envelope;
}
