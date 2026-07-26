/**
 * Equivalence Cache - OpenCode Global v0.5.0
 * In-process, per-batch equivalence cache.
 * Disabled when any repository is dirty.
 */

import { createHash } from 'node:crypto';
import { hasDirtyRepository } from './repository-state.mjs';
import { createReasonCodeTracker, REASON_CODES } from './reason-codes.mjs';

export function computeAdapterSignature(scopeFingerprint, strategy, provider, normalizedQuery) {
  const input = `${scopeFingerprint}|${strategy}|${provider}|${normalizedQuery.toLowerCase()}`;
  return createHash('sha256').update(input).digest('hex');
}

export function normalizeQueryForCache(query) {
  return query.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function createEquivalenceCache() {
  const cache = new Map();
  let cacheHits = 0;
  let cacheEvictions = 0;

  return {
    get(signature) {
      if (cache.has(signature)) {
        cacheHits++;
        return cache.get(signature);
      }
      return null;
    },

    set(signature, result) {
      if (cache.size >= 1000) {
        const firstKey = cache.keys().next().value;
        cache.delete(firstKey);
        cacheEvictions++;
      }
      cache.set(signature, result);
    },

    getStats() {
      return { cacheHits, cacheEvictions, size: cache.size };
    },

    clear() {
      cache.clear();
      cacheHits = 0;
      cacheEvictions = 0;
    }
  };
}

export function checkEquivalenceCache(signature, cache, repoState) {
  const reasons = createReasonCodeTracker();

  if (hasDirtyRepository(repoState)) {
    reasons.add(REASON_CODES.CACHE_DISABLED_DIRTY_WORKTREE);
    return { available: false, hit: false, reasons, cacheHitResult: null };
  }

  if (!cache) {
    reasons.add(REASON_CODES.EQUIVALENT_DEDUPED);
    return { available: false, hit: false, reasons, cacheHitResult: null };
  }

  const cachedResult = cache.get(signature);
  if (cachedResult) {
    reasons.add(REASON_CODES.EQUIVALENT_REUSED);
    return { available: true, hit: true, reasons, cacheHitResult: cachedResult };
  }

  reasons.add(REASON_CODES.EQUIVALENT_DEDUPED);
  return { available: true, hit: false, reasons, cacheHitResult: null };
}

export function prepareEquivalence(plan, repoState) {
  const normalizedQuery = normalizeQueryForCache(plan.query);
  const signature = computeAdapterSignature(
    repoState.scope_fingerprint,
    plan.strategy,
    plan.provider,
    normalizedQuery
  );

  return { signature, normalizedQuery };
}
