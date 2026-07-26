/**
 * Git grep adapter for retrieval execution.
 * Uses git grep -nI --no-color -e <query> --
 * Verifies Git repository, safe exclusion pathspecs, one process per repo.
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  PROVIDER_IDS,
  STATUS,
  createEnvelope,
  toPosixPath,
  buildDenyGlobs,
  parseGitGrepLine,
  elapsed
} from './shared.mjs';

export const id = PROVIDER_IDS.GIT_GREP;

export function checkAvailability() {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore', timeout: 3000 });
    return 'available';
  } catch {
    return 'not_installed';
  }
}

function isGitRepository(repoPath) {
  return existsSync(join(repoPath, '.git'));
}

function buildExclusionPathspecs(denyGlobs) {
  const pathspecs = [];
  for (const glob of denyGlobs) {
    if (glob.endsWith('/**')) {
      pathspecs.push(':!' + glob.slice(0, -3));
    } else if (!glob.includes('*')) {
      pathspecs.push(':!' + glob);
    }
  }
  return pathspecs;
}

function buildArgs(query, denyGlobs) {
  const args = [
    'grep',
    '-nI',
    '--no-color',
    '-e',
    query
  ];

  const pathspecs = buildExclusionPathspecs(denyGlobs);
  for (const pathspec of pathspecs) {
    args.push(pathspec);
  }

  args.push('--');

  return args;
}

export async function execute(request) {
  const envelope = createEnvelope(id);
  const startTime = performance.now();

  if (checkAvailability() !== 'available') {
    envelope.status = STATUS.UNAVAILABLE;
    envelope.error = 'git is not installed';
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

    if (!isGitRepository(repoPath)) {
      const processInfo = {
        repository_id,
        command: ['git', 'grep', ...buildArgs(query, [])],
        cwd: repoPath,
        exit_code: 128,
        signal: null,
        note: 'not a git repository'
      };
      envelope.provider_processes.push(processInfo);
      continue;
    }

    const repoProtectedPaths = protected_paths[repository_id] || [];
    const denyGlobs = buildDenyGlobs(deny_globs, repoProtectedPaths);

    const args = buildArgs(query, denyGlobs);

    const processInfo = {
      repository_id,
      command: ['git', ...args],
      cwd: repoPath,
      exit_code: null,
      signal: null
    };

    try {
      const result = execFileSync('git', args, {
        cwd: repoPath,
        encoding: 'utf8',
        timeout: timeout_ms,
        maxBuffer: max_chars * 2,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      processInfo.exit_code = 0;
      envelope.provider_processes.push(processInfo);

      const stdoutChars = Buffer.byteLength(result, 'utf8');
      envelope.stdout_chars += stdoutChars;

      const lines = result.split('\n').filter(line => line.trim());
      for (const line of lines) {
        if (totalChars >= max_chars) break;

        const parsed = parseGitGrepLine(line, repoPath);
        if (parsed) {
          envelope.raw_items.push({
            repository_id,
            path: parsed.path,
            line: parsed.line,
            column: parsed.column,
            content: parsed.content
          });
          totalChars += Buffer.byteLength(JSON.stringify(parsed), 'utf8');
          hasResults = true;
        }
      }

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

      const exitCode = err.exitCode ?? -1;
      processInfo.exit_code = exitCode;
      envelope.provider_processes.push(processInfo);

      if (exitCode === 1) {
        continue;
      }
    }
  }

  if (!hasResults) {
    const hasErrors = envelope.provider_processes.some(p => p.exit_code !== 0 && p.exit_code !== 1 && p.exit_code !== 128);
    if (hasErrors) {
      envelope.status = STATUS.ERROR;
      envelope.error = 'git grep execution had errors';
    } else {
      envelope.status = STATUS.EMPTY;
    }
  }

  envelope.duration_ms = elapsed(startTime);
  return envelope;
}
