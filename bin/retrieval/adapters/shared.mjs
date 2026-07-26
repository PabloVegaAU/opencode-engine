/**
 * Shared utilities for retrieval adapters.
 * Common logic for building envelopes, path handling, and deny-glob matching.
 */

export const PROVIDER_IDS = {
  RIPGREP: 'ripgrep',
  GIT_GREP: 'git_grep',
  FILESYSTEM: 'filesystem'
};

export const STATUS = {
  SUCCESS: 'success',
  EMPTY: 'empty',
  UNAVAILABLE: 'unavailable',
  TIMEOUT: 'timeout',
  ERROR: 'error'
};

export const HARD_CODED_DENY_PATTERNS = [
  '.git/**',
  '.git',
  '.env',
  '.env.*',
  '.secrets/**',
  '.secrets',
  '**/.DS_Store',
  '**/Thumbs.db',
  '**/credentials*',
  '**/Credentials*',
  '**/*credential*',
  '**/auth*',
  '**/Auth*',
  '**/token*',
  '**/Token*',
  '**/secret*',
  '**/Secret*',
  '**/application.properties',
  '**/application.properties'
];

export function createEnvelope(provider) {
  return {
    provider,
    status: STATUS.SUCCESS,
    provider_processes: [],
    raw_items: [],
    stdout_chars: 0,
    duration_ms: 0,
    error: null
  };
}

export function toPosixPath(absolutePath) {
  return absolutePath.replace(/\\/g, '/');
}

export function buildDenyGlobs(adapterDenyGlobs = [], protectedPaths = []) {
  const combined = [...HARD_CODED_DENY_PATTERNS, ...adapterDenyGlobs];
  for (const p of protectedPaths) {
    if (p && typeof p === 'string') {
      combined.push(p);
      combined.push(p + '/**');
    }
  }
  return combined;
}

export function parseJsonStream(stdout, provider) {
  const items = [];
  const lines = stdout.split('\n').filter(line => line.trim());
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      if (obj.type === 'match' && obj.data) {
        items.push({
          path: obj.data.path?.text || '',
          line: obj.data.line_number || 0,
          column: obj.data.column || 0,
          content: obj.data.lines?.text || ''
        });
      }
    } catch {
    }
  }
  return items;
}

export function parseGitGrepLine(line, repoPath) {
  const match = line.match(/^([^:]+):(\d+):(\d+):(.+)$/);
  if (match) {
    return {
      path: match[1],
      line: parseInt(match[2], 10),
      column: parseInt(match[3], 10),
      content: match[4]
    };
  }
  return null;
}

export function elapsed(startTime) {
  return Math.round((performance.now() - startTime) / 1);
}
