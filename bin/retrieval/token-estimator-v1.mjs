/**
 * Token Estimator v1 - Deterministic, versioned token estimator.
 * Does not call models or external services.
 * Estimation based on emitted_chars + focused_read_chars.
 */

export const TOKEN_ESTIMATOR_VERSION = 'token-estimator-v1';

function estimateTokensV1(emittedChars, focusedReadChars = 0) {
  const totalChars = Math.max(0, emittedChars) + Math.max(0, focusedReadChars);
  const tokens = Math.ceil(totalChars / 4);
  return Math.max(0, tokens);
}

export function estimateTokens(emittedChars, focusedReadChars = 0) {
  return estimateTokensV1(emittedChars, focusedReadChars);
}

export function createMetricsAccumulator() {
  return {
    logical_adapter_calls: 0,
    provider_process_invocations: 0,
    fallback_count: 0,
    raw_result_count: 0,
    result_count: 0,
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
    estimated_tokens_emitted: 0
  };
}

export function computeRunMetrics(run, tokenEstimatorVersion = TOKEN_ESTIMATOR_VERSION) {
  const emittedChars = run.emitted_chars || 0;
  const focusedReadChars = run.focused_read_chars || 0;
  const estimatedTokens = estimateTokens(emittedChars, focusedReadChars);

  return {
    trace_id: run.trace_id || null,
    intent: run.intent || null,
    strategy: run.strategy || null,
    provider: run.provider || null,
    logical_adapter_calls: run.logical_adapter_calls || 0,
    call_budget: run.call_budget || 0,
    provider_process_invocations: run.provider_process_invocations || 0,
    fallback_count: run.fallback_count || 0,
    raw_result_count: run.raw_result_count || 0,
    result_count: run.result_count || 0,
    result_budget: run.result_budget || 0,
    char_count: run.char_count || 0,
    char_budget: run.char_budget || 0,
    cache_hits: run.cache_hits || 0,
    cache_evictions: run.cache_evictions || 0,
    deduped: run.deduped || 0,
    focused_read_calls: run.focused_read_calls || 0,
    focused_read_chars: run.focused_read_chars || 0,
    first_relevant_result_ms: run.first_relevant_result_ms || null,
    adapter_stdout_chars: run.adapter_stdout_chars || 0,
    normalized_chars: run.normalized_chars || 0,
    emitted_chars: emittedChars,
    estimated_tokens_emitted: estimatedTokens,
    repositories_searched: run.repositories_searched || 0,
    duration_ms: run.duration_ms || 0,
    reason_codes: run.reason_codes || []
  };
}
