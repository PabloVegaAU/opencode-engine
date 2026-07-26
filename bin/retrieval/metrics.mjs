/**
 * Metrics - OpenCode Global v0.5.0
 * In-memory metrics recording for retrieval execution.
 */

import { randomUUID } from 'node:crypto';
import { computeRunMetrics, TOKEN_ESTIMATOR_VERSION } from './token-estimator-v1.mjs';
import { createReasonCodeTracker } from './reason-codes.mjs';

export function createSessionMetrics() {
  return {
    schema_version: '1.0',
    session_id: randomUUID(),
    process_started_at: new Date().toISOString(),
    token_estimator_version: TOKEN_ESTIMATOR_VERSION,
    runs: [],
    summary: {
      total_runs: 0,
      total_logical_adapter_calls: 0,
      total_provider_process_invocations: 0,
      total_results: 0,
      total_emitted_chars: 0,
      total_normalized_chars: 0,
      total_estimated_tokens_emitted: 0,
      total_cache_hits: 0,
      total_deduped: 0,
      total_cache_evictions: 0,
      total_focused_read_calls: 0,
      total_focused_read_chars: 0,
      total_repositories_searched: 0,
      max_logical_calls_in_run: 0,
      mean_logical_calls_per_run: 0,
      mean_chars_per_run: 0
    }
  };
}

export function recordRunMetrics(session, runData) {
  const runMetrics = computeRunMetrics(runData);
  session.runs.push(runMetrics);

  session.summary.total_runs += 1;
  session.summary.total_logical_adapter_calls += runMetrics.logical_adapter_calls;
  session.summary.total_provider_process_invocations += runMetrics.provider_process_invocations;
  session.summary.total_results += runMetrics.result_count;
  session.summary.total_emitted_chars += runMetrics.emitted_chars;
  session.summary.total_normalized_chars += runMetrics.normalized_chars;
  session.summary.total_estimated_tokens_emitted += runMetrics.estimated_tokens_emitted || 0;
  session.summary.total_cache_hits += runMetrics.cache_hits;
  session.summary.total_deduped += runMetrics.deduped;
  session.summary.total_cache_evictions += runMetrics.cache_evictions;
  session.summary.total_focused_read_calls += runMetrics.focused_read_calls;
  session.summary.total_focused_read_chars += runMetrics.focused_read_chars;
  session.summary.total_repositories_searched += runMetrics.repositories_searched;

  const runs = session.runs.length;
  session.summary.max_logical_calls_in_run = Math.max(
    session.summary.max_logical_calls_in_run,
    runMetrics.logical_adapter_calls
  );
  session.summary.mean_logical_calls_per_run = session.summary.total_logical_adapter_calls / runs;
  session.summary.mean_chars_per_run = session.summary.total_emitted_chars / runs;

  return runMetrics;
}

export function createRunMetricsAccumulator() {
  return {
    trace_id: null,
    intent: null,
    strategy: null,
    provider: null,
    logical_adapter_calls: 0,
    call_budget: 0,
    provider_process_invocations: 0,
    fallback_count: 0,
    raw_result_count: 0,
    result_count: 0,
    result_budget: 0,
    char_count: 0,
    char_budget: 0,
    adapter_stdout_chars: 0,
    normalized_chars: 0,
    emitted_chars: 0,
    focused_read_calls: 0,
    focused_read_chars: 0,
    cache_hits: 0,
    cache_evictions: 0,
    deduped: 0,
    truncated: false,
    first_relevant_result_ms: null,
    repositories_searched: 0,
    reason_codes: []
  };
}

export function computeFirstRelevantResultMs(startTime, items) {
  if (!items || items.length === 0) return null;
  return Math.round(performance.now() - startTime);
}
