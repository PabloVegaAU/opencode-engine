/**
 * Execute Batch - OpenCode Global v0.5.0
 * Batch execution entry point with shared equivalence cache and progressive disclosure.
 */

import { randomUUID } from 'node:crypto';
import { executePlan } from './execution-engine.mjs';
import { createEquivalenceCache } from './equivalence.mjs';
import { createSessionMetrics, recordRunMetrics } from './metrics.mjs';
import { createReasonCodeTracker, REASON_CODES } from './reason-codes.mjs';
import { HARD_CAPS } from './budget.mjs';

export async function executeBatch(plans, options = {}) {
  if (!Array.isArray(plans) || plans.length === 0) {
    return {
      success: false,
      error: 'plans must be a non-empty array',
      reasons: [REASON_CODES.EXECUTION_REJECTED_FALLBACK_TO_PLAN]
    };
  }

  const batchId = randomUUID();
  const cache = createEquivalenceCache();
  const session = createSessionMetrics();
  const batchReasons = createReasonCodeTracker();

  const progressiveDisclosure = options.progressive_disclosure || false;
  const continuationRegistry = new Map();

  const results = [];
  let totalLogicalCalls = 0;
  let totalProviderProcesses = 0;

  for (let i = 0; i < plans.length; i++) {
    const plan = plans[i];

    const batchContext = {
      batchId,
      progressiveDisclosure,
      continuationRegistry
    };

    const execOptions = {
      ...options,
      progressive_disclosure: progressiveDisclosure
    };

    const result = await executePlan(plan, execOptions, cache, batchContext);

    if (result.success) {
      const runData = {
        trace_id: result.result.trace_id,
        intent: result.result.intent,
        strategy: result.result.strategy,
        provider: result.result.provider,
        logical_adapter_calls: result.result.logical_adapter_calls,
        call_budget: result.result.call_budget,
        provider_process_invocations: result.result.provider_process_invocations,
        fallback_count: result.result.fallback_count,
        raw_result_count: result.result.raw_result_count,
        result_count: result.result.result_count,
        result_budget: result.result.result_budget,
        char_count: result.result.char_count,
        char_budget: result.result.char_budget,
        adapter_stdout_chars: result.result.adapter_stdout_chars,
        normalized_chars: result.result.normalized_chars,
        emitted_chars: result.result.emitted_chars,
        focused_read_calls: result.result.focused_read_calls,
        focused_read_chars: result.result.focused_read_chars,
        cache_hits: result.cached ? 1 : 0,
        cache_evictions: 0,
        deduped: result.result.deduped,
        truncated: result.result.truncated,
        first_relevant_result_ms: result.result.first_relevant_result_ms,
        repositories_searched: result.result.repositories_searched,
        reason_codes: result.result.reason_codes
      };

      recordRunMetrics(session, runData);

      totalLogicalCalls += result.result.logical_adapter_calls;
      totalProviderProcesses += result.result.provider_process_invocations;

      batchReasons.add(REASON_CODES.BATCH_EXECUTED);

      for (const item of result.result.items || []) {
        if (item.preview_token) {
          continuationRegistry.set(item.preview_token, {
            batchId,
            scope_fingerprint: result.result.repository_state.scope_fingerprint,
            repository_id: item.repository_id,
            path: item.path
          });
        }
      }

      results.push({
        index: i,
        plan_id: plan.plan_id || `plan-${i}`,
        success: true,
        result: result.result,
        trace: result.trace,
        metrics: result.metrics || null,
        reasons: result.reasons,
        cached: result.cached || false
      });
    } else {
      batchReasons.add(REASON_CODES.EXECUTION_REJECTED_FALLBACK_TO_PLAN);

      results.push({
        index: i,
        plan_id: plan.plan_id || `plan-${i}`,
        success: false,
        error: result.error,
        reasons: result.reasons,
        cached: false
      });
    }
  }

  const cacheStats = cache.getStats();

  return {
    success: true,
    batch_id: batchId,
    results,
    summary: {
      total_plans: plans.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      total_logical_adapter_calls: totalLogicalCalls,
      total_provider_process_invocations: totalProviderProcesses,
      cache_hits: cacheStats.cacheHits,
      cache_evictions: cacheStats.cacheEvictions,
      session
    },
    reasons: batchReasons.toArray()
  };
}

export async function expandFocusedRead(previewToken, options = {}) {
  const continuationRegistry = options.continuationRegistry;
  if (!continuationRegistry) {
    return {
      success: false,
      error: 'No continuation registry provided',
      reasons: [REASON_CODES.EXECUTION_REJECTED_FALLBACK_TO_PLAN]
    };
  }

  const continuation = continuationRegistry.get(previewToken);
  if (!continuation) {
    return {
      success: false,
      error: 'Invalid or expired preview token',
      reasons: [REASON_CODES.EXECUTION_REJECTED_FALLBACK_TO_PLAN]
    };
  }

  if (continuation.batchId !== options.currentBatchId) {
    return {
      success: false,
      error: 'Preview token from different batch',
      reasons: [REASON_CODES.EXECUTION_REJECTED_FALLBACK_TO_PLAN]
    };
  }

  return {
    success: true,
    continuation,
    reasons: [REASON_CODES.PROGRESSIVE_DISCLOSURE_EXPANDED]
  };
}
