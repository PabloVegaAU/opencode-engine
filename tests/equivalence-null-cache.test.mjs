import { describe, it } from 'node:test';
import assert from 'node:assert';
import { checkEquivalenceCache } from '../bin/retrieval/equivalence.mjs';

describe('checkEquivalenceCache null-cache regression', () => {
  it('does not throw when cache is null and repoState is clean', () => {
    const signature = 'sha256:test';
    const cleanRepoState = {
      repositories: [
        { dirty_worktree: false, fingerprint: 'sha256:a' }
      ]
    };
    let result;
    assert.doesNotThrow(() => {
      result = checkEquivalenceCache(signature, null, cleanRepoState);
    });
    assert.strictEqual(result.hit, false);
    assert.strictEqual(result.available, false);
    assert.ok(result.reasons);
  });

  it('does not throw when cache is null and repoState is missing repositories', () => {
    const signature = 'sha256:test';
    const emptyRepoState = {};
    let result;
    assert.doesNotThrow(() => {
      result = checkEquivalenceCache(signature, null, emptyRepoState);
    });
    assert.strictEqual(result.hit, false);
  });

  it('returns CACHE_DISABLED_DIRTY_WORKTREE when repo is dirty regardless of cache', () => {
    const signature = 'sha256:test';
    const dirtyRepoState = {
      repositories: [
        { dirty_worktree: true, fingerprint: 'sha256:a' }
      ]
    };
    const cache = new Map();
    const result = checkEquivalenceCache(signature, cache, dirtyRepoState);
    assert.strictEqual(result.hit, false);
    assert.strictEqual(result.available, false);
  });

  it('uses cache when provided and repo is clean', () => {
    const signature = 'sha256:hit';
    const cache = new Map();
    cache.set(signature, { items: [{ id: 'cached' }] });
    const cleanRepoState = {
      repositories: [
        { dirty_worktree: false, fingerprint: 'sha256:a' }
      ]
    };
    const result = checkEquivalenceCache(signature, cache, cleanRepoState);
    assert.strictEqual(result.hit, true);
    assert.strictEqual(result.available, true);
    assert.deepStrictEqual(result.cacheHitResult, { items: [{ id: 'cached' }] });
  });
});