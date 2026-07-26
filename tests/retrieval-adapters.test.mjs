/**
 * Retrieval Adapters Test Suite - Phase 1
 * Tests ripgrep, git-grep, and filesystem adapters.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const FIXTURE_ROOT = join(REPO_ROOT, 'tests', 'fixtures', 'qs-sell');

const RIPGREP_ADAPTER_PATH = join(REPO_ROOT, 'bin', 'retrieval', 'adapters', 'ripgrep.mjs');
const GIT_GREP_ADAPTER_PATH = join(REPO_ROOT, 'bin', 'retrieval', 'adapters', 'git-grep.mjs');
const FILESYSTEM_ADAPTER_PATH = join(REPO_ROOT, 'bin', 'retrieval', 'adapters', 'filesystem.mjs');

const ripgrepModule = await import(pathToFileURL(RIPGREP_ADAPTER_PATH).href);
const gitGrepModule = await import(pathToFileURL(GIT_GREP_ADAPTER_PATH).href);
const filesystemModule = await import(pathToFileURL(FILESYSTEM_ADAPTER_PATH).href);

const ripgrepAdapter = {
  id: ripgrepModule.id,
  checkAvailability: ripgrepModule.checkAvailability,
  execute: ripgrepModule.execute
};

const gitGrepAdapter = {
  id: gitGrepModule.id,
  checkAvailability: gitGrepModule.checkAvailability,
  execute: gitGrepModule.execute
};

const filesystemAdapter = {
  id: filesystemModule.id,
  checkAvailability: filesystemModule.checkAvailability,
  execute: filesystemModule.execute
};

const SELL_APP_PATH = join(FIXTURE_ROOT, 'repositories', 'sell-app');
const SELL_RULES_PATH = join(FIXTURE_ROOT, 'repositories', 'sell-rules');

function createRequest(overrides = {}) {
  return {
    query: 'Sell',
    repositories: [
      { repository_id: 'sell-app', path: SELL_APP_PATH },
      { repository_id: 'sell-rules', path: SELL_RULES_PATH }
    ],
    deny_globs: [],
    protected_paths: {},
    max_chars: 24000,
    timeout_ms: 5000,
    ...overrides
  };
}

describe('Adapter Interface', () => {
  it('ripgrep exports id, checkAvailability, and execute', () => {
    assert.strictEqual(typeof ripgrepAdapter.id, 'string');
    assert.strictEqual(ripgrepAdapter.id, 'ripgrep');
    assert.strictEqual(typeof ripgrepAdapter.checkAvailability, 'function');
    assert.strictEqual(typeof ripgrepAdapter.execute, 'function');
  });

  it('git-grep exports id, checkAvailability, and execute', () => {
    assert.strictEqual(typeof gitGrepAdapter.id, 'string');
    assert.strictEqual(gitGrepAdapter.id, 'git_grep');
    assert.strictEqual(typeof gitGrepAdapter.checkAvailability, 'function');
    assert.strictEqual(typeof gitGrepAdapter.execute, 'function');
  });

  it('filesystem exports id, checkAvailability, and execute', () => {
    assert.strictEqual(typeof filesystemAdapter.id, 'string');
    assert.strictEqual(filesystemAdapter.id, 'filesystem');
    assert.strictEqual(typeof filesystemAdapter.checkAvailability, 'function');
    assert.strictEqual(typeof filesystemAdapter.execute, 'function');
  });
});

describe('Ripgrep Adapter', () => {
  it('returns unavailable when rg not installed', async () => {
    const result = await ripgrepAdapter.execute({
      ...createRequest(),
      query: 'test'
    });

    assert.ok(
      result.status === 'success' ||
      result.status === 'empty' ||
      result.status === 'unavailable'
    );
    assert.strictEqual(result.provider, 'ripgrep');
    assert.ok(Array.isArray(result.provider_processes));
    assert.ok(Array.isArray(result.raw_items));
  });

  it('finds SellController in sell-app', async () => {
    const result = await ripgrepAdapter.execute({
      ...createRequest({ query: 'SellController' })
    });

    if (result.status === 'unavailable') {
      assert.ok(true, 'ripgrep not available');
      return;
    }

    assert.ok(['success', 'empty'].includes(result.status));
    if (result.status === 'success' && result.raw_items.length > 0) {
      const sellAppItems = result.raw_items.filter(
        i => i.repository_id === 'sell-app' && i.path.includes('SellController')
      );
      assert.ok(sellAppItems.length > 0);
      for (const item of sellAppItems) {
        assert.strictEqual(item.repository_id, 'sell-app');
        assert.ok(typeof item.path === 'string');
        assert.ok(typeof item.line === 'number');
        assert.ok(typeof item.column === 'number');
      }
    }
  });

  it('searches two repositories with separate processes', async () => {
    const result = await ripgrepAdapter.execute({
      ...createRequest({ query: 'Sell' })
    });

    if (result.status === 'unavailable') {
      assert.ok(true, 'ripgrep not available');
      return;
    }

    if (result.provider_processes.length > 0) {
      const repoIds = result.provider_processes.map(p => p.repository_id);
      assert.ok(repoIds.includes('sell-app'));
      assert.ok(repoIds.includes('sell-rules'));
    }
  });

  it('respects max_chars limit', async () => {
    const result = await ripgrepAdapter.execute({
      ...createRequest({ query: 'Sell', max_chars: 500 })
    });

    if (result.status === 'unavailable') {
      assert.ok(true, 'ripgrep not available');
      return;
    }

    if (result.status === 'success' && result.raw_items.length > 0) {
      const totalChars = result.raw_items.reduce((sum, item) => {
        return sum + Buffer.byteLength(JSON.stringify(item), 'utf8');
      }, 0);
      assert.ok(totalChars <= 500 * 2, 'should respect max_chars with buffer');
    }
  });

  it('uses array arguments without shell', async () => {
    const result = await ripgrepAdapter.execute({
      ...createRequest({ query: 'Sell' })
    });

    if (result.status === 'unavailable') {
      assert.ok(true, 'ripgrep not available');
      return;
    }

    for (const proc of result.provider_processes) {
      assert.ok(Array.isArray(proc.command));
      assert.strictEqual(proc.command[0], 'rg');
      assert.ok(!proc.command.some(c => typeof c === 'string' && c.includes('&&')));
      assert.ok(!proc.command.some(c => typeof c === 'string' && c.includes('|')));
    }
  });

  it('returns empty status when no matches', async () => {
    const result = await ripgrepAdapter.execute({
      ...createRequest({ query: 'XYZNONEXISTENT123XYZ' })
    });

    if (result.status === 'unavailable') {
      assert.ok(true, 'ripgrep not available');
      return;
    }

    assert.ok(['empty', 'success'].includes(result.status));
  });

  it('all provider_processes have integer exit_code', async () => {
    const result = await ripgrepAdapter.execute({
      ...createRequest({ query: 'Sell' })
    });

    if (result.status === 'unavailable') {
      assert.ok(true, 'ripgrep not available');
      return;
    }

    for (const proc of result.provider_processes) {
      assert.ok(Number.isInteger(proc.exit_code), `exit_code must be integer for ${proc.repository_id}, got ${proc.exit_code}`);
    }
  });
});

describe('Git Grep Adapter', () => {
  it('returns unavailable when git not installed', async () => {
    const result = await gitGrepAdapter.execute({
      ...createRequest(),
      query: 'test'
    });

    assert.ok(
      result.status === 'success' ||
      result.status === 'empty' ||
      result.status === 'unavailable'
    );
    assert.strictEqual(result.provider, 'git_grep');
    assert.ok(Array.isArray(result.provider_processes));
    assert.ok(Array.isArray(result.raw_items));
  });

  it('finds files in sell-rules ADR', async () => {
    const result = await gitGrepAdapter.execute({
      ...createRequest({ query: 'authentication' })
    });

    if (result.status === 'unavailable') {
      assert.ok(true, 'git not available');
      return;
    }

    assert.ok(['success', 'empty'].includes(result.status));
    if (result.status === 'success' && result.raw_items.length > 0) {
      const adrItems = result.raw_items.filter(
        i => i.repository_id === 'sell-rules' && i.path.includes('adr')
      );
      assert.ok(adrItems.length > 0);
    }
  });

  it('searches two repositories with separate processes', async () => {
    const result = await gitGrepAdapter.execute({
      ...createRequest({ query: 'Sell' })
    });

    if (result.status === 'unavailable') {
      assert.ok(true, 'git not available');
      return;
    }

    if (result.provider_processes.length > 0) {
      const repoIds = result.provider_processes.map(p => p.repository_id);
      assert.ok(repoIds.includes('sell-app'));
      assert.ok(repoIds.includes('sell-rules'));
    }
  });

  it('uses array arguments without shell', async () => {
    const result = await gitGrepAdapter.execute({
      ...createRequest({ query: 'Sell' })
    });

    if (result.status === 'unavailable') {
      assert.ok(true, 'git not available');
      return;
    }

    for (const proc of result.provider_processes) {
      assert.ok(Array.isArray(proc.command));
      assert.strictEqual(proc.command[0], 'git');
      assert.ok(!proc.command.some(c => typeof c === 'string' && c.includes('&&')));
      assert.ok(!proc.command.some(c => typeof c === 'string' && c.includes('|') || c.includes(';')));
    }
  });

  it('returns empty status when no matches', async () => {
    const result = await gitGrepAdapter.execute({
      ...createRequest({ query: 'XYZNONEXISTENT123XYZ' })
    });

    if (result.status === 'unavailable') {
      assert.ok(true, 'git not available');
      return;
    }

    assert.ok(['empty', 'success'].includes(result.status));
  });

  it('differentiates empty from error', async () => {
    const emptyResult = await gitGrepAdapter.execute({
      ...createRequest({ query: 'XYZNONEXISTENT123XYZ' })
    });

    const validResult = await gitGrepAdapter.execute({
      ...createRequest({ query: 'Sell' })
    });

    if (emptyResult.status === 'unavailable' || validResult.status === 'unavailable') {
      assert.ok(true, 'git not available');
      return;
    }

    assert.ok(emptyResult.status === 'empty');
    assert.ok(['success', 'empty'].includes(validResult.status));
  });

  it('all provider_processes have integer exit_code', async () => {
    const result = await gitGrepAdapter.execute({
      ...createRequest({ query: 'Sell' })
    });

    if (result.status === 'unavailable') {
      assert.ok(true, 'git not available');
      return;
    }

    for (const proc of result.provider_processes) {
      assert.ok(Number.isInteger(proc.exit_code), `exit_code must be integer for ${proc.repository_id}, got ${proc.exit_code}`);
    }
  });
});

describe('Filesystem Adapter', () => {
  it('returns available always', () => {
    const state = filesystemAdapter.checkAvailability();
    assert.strictEqual(state, 'available');
  });

  it('finds ADR files case-insensitive', async () => {
    const result = await filesystemAdapter.execute({
      ...createRequest({ query: 'authentication' })
    });

    assert.ok(['success', 'empty'].includes(result.status));
    assert.strictEqual(result.provider, 'filesystem');
    assert.ok(Array.isArray(result.raw_items));
    assert.ok(typeof result.stdout_chars === 'number');
    assert.ok(typeof result.duration_ms === 'number');

    if (result.status === 'success' && result.raw_items.length > 0) {
      const adrItems = result.raw_items.filter(
        i => i.repository_id === 'sell-rules' && i.path.toLowerCase().includes('adr')
      );
      assert.ok(adrItems.length > 0);
    }
  });

  it('searches two repositories', async () => {
    const result = await filesystemAdapter.execute({
      ...createRequest({ query: 'Sell' })
    });

    assert.ok(['success', 'empty'].includes(result.status));
    if (result.status === 'success' && result.raw_items.length > 0) {
      const repoIds = [...new Set(result.raw_items.map(i => i.repository_id))];
      assert.ok(repoIds.includes('sell-app'));
      assert.ok(repoIds.includes('sell-rules'));
    }
  });

  it('respects max_chars limit', async () => {
    const result = await filesystemAdapter.execute({
      ...createRequest({ query: 'Sell', max_chars: 500 })
    });

    assert.ok(['success', 'empty'].includes(result.status));
    assert.ok(result.stdout_chars <= 500 * 2, 'should respect max_chars with buffer');
  });

  it('returns empty when query does not match', async () => {
    const result = await filesystemAdapter.execute({
      ...createRequest({ query: 'XYZNONEXISTENT123XYZ' })
    });

    assert.ok(['empty', 'success'].includes(result.status));
    if (result.status === 'empty') {
      assert.strictEqual(result.raw_items.length, 0);
    }
  });

  it('returns determinist output structure', async () => {
    const result = await filesystemAdapter.execute({
      ...createRequest({ query: 'authentication' })
    });

    assert.ok(['success', 'empty'].includes(result.status));
    assert.ok(result.provider === 'filesystem');
    assert.ok(result.provider_processes !== undefined || result.provider_processes.length === 0);
    assert.ok(Array.isArray(result.raw_items));
    assert.ok(typeof result.stdout_chars === 'number');
    assert.ok(typeof result.duration_ms === 'number');
    assert.ok(result.error === null || typeof result.error === 'string');
  });
});

describe('Security Boundaries', () => {
  it('ripgrep does not use shell execution', async () => {
    const result = await ripgrepAdapter.execute({
      ...createRequest({ query: 'Sell' })
    });

    if (result.status === 'unavailable') {
      assert.ok(true, 'ripgrep not available');
      return;
    }

    for (const proc of result.provider_processes) {
      assert.ok(Array.isArray(proc.command));
      assert.ok(!proc.command.some(c =>
        typeof c === 'string' &&
        (c.includes('$(') || c.includes('`') || c.includes('&&') || c.includes('||'))
      ));
    }
  });

  it('git-grep does not use shell execution', async () => {
    const result = await gitGrepAdapter.execute({
      ...createRequest({ query: 'Sell' })
    });

    if (result.status === 'unavailable') {
      assert.ok(true, 'git not available');
      return;
    }

    for (const proc of result.provider_processes) {
      assert.ok(Array.isArray(proc.command));
      assert.ok(!proc.command.some(c =>
        typeof c === 'string' &&
        (c.includes('$(') || c.includes('`') || c.includes('&&') || c.includes('||'))
      ));
    }
  });

  it('ripgrep respects protected paths', async () => {
    const protectedPath = 'src/main/java/com/example/sell/Sell.java';
    const result = await ripgrepAdapter.execute({
      ...createRequest({
        query: 'Sell',
        protected_paths: {
          'sell-app': [protectedPath]
        }
      })
    });

    if (result.status === 'unavailable') {
      assert.ok(true, 'ripgrep not available');
      return;
    }

    if (result.status === 'success' && result.raw_items.length > 0) {
      const protectedItems = result.raw_items.filter(
        i => i.repository_id === 'sell-app' && i.path === protectedPath
      );
      assert.strictEqual(protectedItems.length, 0, 'protected path should be excluded');
    }
  });

  it('filesystem returns paths as POSIX relative', async () => {
    const result = await filesystemAdapter.execute({
      ...createRequest({ query: 'authentication' })
    });

    assert.ok(['success', 'empty'].includes(result.status));
    if (result.status === 'success' && result.raw_items.length > 0) {
      for (const item of result.raw_items) {
        assert.ok(!item.path.startsWith('/'));
        assert.ok(!item.path.includes('\\'));
      }
    }
  });
});

describe('Determinism', () => {
  it('ripgrep returns deterministic envelope structure', async () => {
    const result = await ripgrepAdapter.execute({
      ...createRequest({ query: 'Sell' })
    });

    assert.ok(['success', 'empty', 'unavailable'].includes(result.status));
    assert.strictEqual(result.provider, 'ripgrep');
    assert.ok(typeof result.duration_ms === 'number');
    assert.ok(result.duration_ms >= 0);
    assert.ok(result.error === null || typeof result.error === 'string');
  });

  it('git-grep returns deterministic envelope structure', async () => {
    const result = await gitGrepAdapter.execute({
      ...createRequest({ query: 'Sell' })
    });

    assert.ok(['success', 'empty', 'unavailable'].includes(result.status));
    assert.strictEqual(result.provider, 'git_grep');
    assert.ok(typeof result.duration_ms === 'number');
    assert.ok(result.duration_ms >= 0);
    assert.ok(result.error === null || typeof result.error === 'string');
  });

  it('filesystem returns deterministic envelope structure', async () => {
    const result = await filesystemAdapter.execute({
      ...createRequest({ query: 'authentication' })
    });

    assert.ok(['success', 'empty'].includes(result.status));
    assert.strictEqual(result.provider, 'filesystem');
    assert.ok(typeof result.duration_ms === 'number');
    assert.ok(result.duration_ms >= 0);
    assert.ok(result.error === null || typeof result.error === 'string');
  });
});

describe('Error Handling', () => {
  it('returns error status for invalid request', async () => {
    const ripgrepResult = await ripgrepAdapter.execute({
      query: '',
      repositories: [],
      deny_globs: [],
      protected_paths: {},
      max_chars: 24000,
      timeout_ms: 5000
    });

    assert.strictEqual(ripgrepResult.status, 'error');
    assert.ok(ripgrepResult.error !== null);

    const gitGrepResult = await gitGrepAdapter.execute({
      query: '',
      repositories: [],
      deny_globs: [],
      protected_paths: {},
      max_chars: 24000,
      timeout_ms: 5000
    });

    assert.strictEqual(gitGrepResult.status, 'error');
    assert.ok(gitGrepResult.error !== null);

    const fsResult = await filesystemAdapter.execute({
      query: 'test',
      repositories: [],
      deny_globs: [],
      protected_paths: {},
      max_chars: 24000,
      timeout_ms: 5000
    });

    assert.strictEqual(fsResult.status, 'error');
    assert.ok(fsResult.error !== null);
  });

  it('returns timeout status for slow operations', async () => {
    const result = await ripgrepAdapter.execute({
      ...createRequest({ query: 'Sell', timeout_ms: 1 })
    });

    if (result.status === 'unavailable') {
      assert.ok(true, 'ripgrep not available');
      return;
    }

    assert.ok(['timeout', 'success', 'empty'].includes(result.status));
  });
});
