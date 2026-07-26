/**
 * Execution Engine - OpenCode Global v0.5.0
 * Core execution engine for retrieval plans.
 * Consumes v0.4.0 base plan, produces v0.5.0 execution result with trace and metrics.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import { captureRepositoryState, getRepoRelativePaths } from './repository-state.mjs';
import { runPreflightChecks } from './preflight.mjs';
import { computeCallBudget, HARD_CAPS } from './budget.mjs';
import { prepareEquivalence, checkEquivalenceCache, createEquivalenceCache } from './equivalence.mjs';
import { normalizeResults, applyProgressiveDisclosure } from './normalize.mjs';
import { createRunMetricsAccumulator, computeFirstRelevantResultMs } from './metrics.mjs';
import { createReasonCodeTracker, REASON_CODES } from './reason-codes.mjs';
import { computeAdapterSignature } from './equivalence.mjs';
import { estimateTokens, TOKEN_ESTIMATOR_VERSION } from './token-estimator-v1.mjs';
import { validateBasePlan, validateExecutionPlan, validateResult, validateTrace, validateMetrics } from './contract-validation.mjs';
import { PROVIDER_IDS } from './adapters/shared.mjs';

const DEFAULT_ADAPTERS = {
  [PROVIDER_IDS.RIPGREP]: () => import('./adapters/ripgrep.mjs'),
  [PROVIDER_IDS.GIT_GREP]: () => import('./adapters/git-grep.mjs'),
  [PROVIDER_IDS.FILESYSTEM]: () => import('./adapters/filesystem.mjs')
};

function loadAdapter(provider, adapterOverrides = {}) {
  if (adapterOverrides[provider]) return adapterOverrides[provider]();
  const loader = DEFAULT_ADAPTERS[provider];
  if (!loader) return null;
  return loader();
}

async function probeProviderAvailability(provider, adapterOverrides = {}) {
  const adapter = await loadAdapter(provider, adapterOverrides);
  if (!adapter) return false;
  return adapter.checkAvailability() === 'available';
}

function createTrace(traceId, startedAt) {
  return {
    schema_version: '1.0',
    trace_id: traceId,
    started_at: startedAt,
    finished_at: null,
    duration_ms: 0,
    phases: {
      plan: 0,
      repository_state: 0,
      preflight: 0,
      equivalence: 0,
      adapter: 0,
      normalize: 0,
      budget: 0,
      result: 0
    },
    events: [],
    logical_calls: [],
    provider_processes: [],
    focused_reads: []
  };
}

function addTraceEvent(trace, phase, reasonCode, detail = {}) {
  trace.events.push({
    phase,
    reason_code: reasonCode,
    at: new Date().toISOString(),
    detail
  });
}

async function executeAdapterCall(provider, request, budget, trace, isFallback = false, adapterOverrides = {}) {
  const adapter = await loadAdapter(provider, adapterOverrides);
  if (!adapter) {
    return {
      envelope: {
        provider,
        status: 'error',
        provider_processes: [],
        raw_items: [],
        stdout_chars: 0,
        duration_ms: 0,
        error: `Provider ${provider} not found`
      },
      failed: true,
      unavailable: false
    };
  }

  const availability = adapter.checkAvailability();
  if (availability !== 'available') {
    return {
      envelope: {
        provider,
        status: 'unavailable',
        provider_processes: [],
        raw_items: [],
        stdout_chars: 0,
        duration_ms: 0,
        error: `Provider ${provider} is ${availability}`
      },
      failed: true,
      unavailable: true
    };
  }

  const adaptedRequest = {
    query: request.query,
    repositories: request.repositories,
    deny_globs: request.deny_globs || [],
    protected_paths: request.protected_paths || {},
    max_chars: budget.max_chars,
    timeout_ms: budget.timeout_ms
  };

  const callStartTime = performance.now();
  const startedAt = new Date().toISOString();

  try {
    const envelope = await adapter.execute(adaptedRequest);
    const durationMs = Math.round(performance.now() - callStartTime);

    for (const proc of envelope.provider_processes || []) {
      trace.provider_processes.push({
        process_id: randomUUID(),
        provider,
        repository_id: proc.repository_id,
        cwd: proc.cwd,
        args: proc.command,
        started_at: startedAt,
        duration_ms: durationMs,
        exit_code: proc.exit_code,
        stdout_chars: 0,
        stderr_present: false
      });
    }

    return {
      envelope,
      failed: envelope.status === 'error' || envelope.status === 'timeout',
      unavailable: false
    };
  } catch (err) {
    return {
      envelope: {
        provider,
        status: 'error',
        provider_processes: [],
        raw_items: [],
        stdout_chars: 0,
        duration_ms: 0,
        error: err.message
      },
      failed: true,
      unavailable: false
    };
  }
}

export async function executePlan(basePlan, options = {}, cache = null, batchContext = null) {
  const planStartTime = performance.now();
  const startedAt = new Date().toISOString();
  const traceId = randomUUID();
  const trace = createTrace(traceId, startedAt);

  const basePlanValidation = validateBasePlan(basePlan);
  if (!basePlanValidation.valid) {
    return {
      success: false,
      error: `Invalid base plan: ${JSON.stringify(basePlanValidation.errors)}`,
      reasons: [REASON_CODES.EXECUTION_REJECTED_FALLBACK_TO_PLAN]
    };
  }

  let manifest;
  try {
    if (options.manifest) {
      manifest = options.manifest;
    } else if (options.manifestPath) {
      const content = readFileSync(options.manifestPath, 'utf8');
      manifest = JSON.parse(content);
    } else {
      return {
        success: false,
        error: 'No manifest or manifestPath provided',
        reasons: [REASON_CODES.NO_PROJECT_MANIFEST]
      };
    }
  } catch (err) {
    return {
      success: false,
      error: `Failed to load manifest: ${err.message}`,
      reasons: [REASON_CODES.NO_PROJECT_MANIFEST]
    };
  }

  const manifestDir = options.manifestDir || (options.manifestPath ? dirname(options.manifestPath) : process.cwd());

  const repoStateStart = performance.now();
  let repoState;
  try {
    repoState = captureRepositoryState(manifest, { manifestDir, indexState: options.indexState });
  } catch (err) {
    return {
      success: false,
      error: `Failed to capture repository state: ${err.message}`,
      reasons: [REASON_CODES.EXECUTION_REJECTED_FALLBACK_TO_PLAN]
    };
  }
  trace.phases.repository_state = Math.round(performance.now() - repoStateStart);
  addTraceEvent(trace, 'repository_state', 'INDEX_FRESH');

  const preflightStart = performance.now();
  const preflight = runPreflightChecks(basePlan, manifest, repoState, { manifestDir });
  trace.phases.preflight = Math.round(performance.now() - preflightStart);

  if (!preflight.passed) {
    addTraceEvent(trace, 'preflight', REASON_CODES.PREFLIGHT_BLOCKED, { errors: preflight.errors });
    return {
      success: false,
      error: `Preflight failed: ${preflight.errors.join(', ')}`,
      reasons: preflight.reasons,
      preflight,
      trace,
      metrics: null
    };
  }
  addTraceEvent(trace, 'preflight', REASON_CODES.PREFLIGHT_OK);

  const { signature, normalizedQuery } = prepareEquivalence(basePlan, repoState);

  const cacheCheck = checkEquivalenceCache(signature, cache, repoState);
  const reasons = createReasonCodeTracker();
  reasons.add(...cacheCheck.reasons.toArray());

  if (cacheCheck.hit) {
    const cachedResult = cacheCheck.cacheHitResult;
    const hitResult = {
      ...cachedResult.result,
      trace_id: randomUUID(),
      duration_ms: Math.round(performance.now() - planStartTime),
      logical_adapter_calls: 0,
      provider_process_invocations: 0,
      cache_hits: 1
    };
    addTraceEvent(trace, 'equivalence', REASON_CODES.EQUIVALENT_REUSED);
    return {
      success: true,
      result: hitResult,
      trace,
      metrics: null,
      reasons: reasons.toArray(),
      cached: true
    };
  }
  addTraceEvent(trace, 'equivalence', REASON_CODES.EQUIVALENT_DEDUPED);

  const budget = computeCallBudget(basePlan.strategy, {
    max_tool_calls: basePlan.budgets?.max_tool_calls,
    max_results: basePlan.budgets?.max_results,
    max_chars: basePlan.budgets?.max_chars,
    timeout_ms: basePlan.budgets?.timeout_ms,
    ...options
  });

  const repoPaths = getRepoRelativePaths(repoState);
  // Resolve relative repo paths against manifestDir so adapters can use them as cwd
  const resolvedRepoPaths = repoPaths.map(r => {
    const p = r.path;
    if (isAbsolute(p)) return r;
    const abs = resolve(manifestDir, p);
    // Only store resolved if it actually exists
    return { ...r, path: existsSync(abs) ? abs : p };
  });
  const request = {
    query: basePlan.query,
    repositories: resolvedRepoPaths,
    deny_globs: basePlan.deny_globs || [],
    protected_paths: basePlan.protected_paths || {}
  };

  const envelopes = [];
  let logicalCalls = 0;
  let fallbackCount = 0;
  let totalProviderProcesses = 0;
  let primaryFailed = false;
  const adapterOverrides = options.adapterOverrides || {};

  const primaryProbe = await probeProviderAvailability(basePlan.provider, adapterOverrides);
  addTraceEvent(trace, 'equivalence', primaryProbe ? 'ADAPTER_INVOCATION_OK' : 'NO_RETRIEVAL_PROVIDER');

  if (!primaryProbe) {
    reasons.add(REASON_CODES.NO_RETRIEVAL_PROVIDER);
    const fallbackProviders = basePlan.fallbacks || [];
    let usedFallback = false;

    for (const fallbackEntry of fallbackProviders) {
      if (logicalCalls >= budget.max_tool_calls) break;

      const fallbackProvider = typeof fallbackEntry === 'string' ? fallbackEntry : fallbackEntry.provider;
      if (!fallbackProvider) continue;

      const fallbackProbe = await probeProviderAvailability(fallbackProvider, adapterOverrides);
      if (!fallbackProbe) continue;

      const fallbackResult = await executeAdapterCall(fallbackProvider, request, budget, trace, true, adapterOverrides);
      envelopes.push(fallbackResult.envelope);
      logicalCalls++;
      fallbackCount++;
      totalProviderProcesses += fallbackResult.envelope.provider_processes.length;

      const callReason = fallbackProvider === 'ripgrep' ? REASON_CODES.PROVIDER_FALLBACK_TO_RIPGREP :
                         fallbackProvider === 'git_grep' ? REASON_CODES.PROVIDER_FALLBACK_TO_GIT_GREP :
                         REASON_CODES.PROVIDER_FALLBACK_TO_FILESYSTEM;
      addTraceEvent(trace, 'adapter', callReason, { provider: fallbackProvider, is_fallback: true });

      if (fallbackResult.failed) {
        reasons.add(REASON_CODES.ADAPTER_NONZERO_EXIT);
      } else {
        reasons.add(REASON_CODES.ADAPTER_INVOCATION_OK);
        usedFallback = true;
        break;
      }
    }

    if (!usedFallback && fallbackCount === 0) {
      reasons.add(REASON_CODES.EXECUTION_EMPTY);
      const emptyResult = buildEmptyResult(basePlan, repoState, signature, budget, trace, planStartTime, reasons);
      return {
        success: true,
        result: emptyResult,
        trace,
        metrics: null,
        reasons: reasons.toArray(),
        cached: false
      };
    }
  } else {
    if (logicalCalls < budget.max_tool_calls) {
      const primaryResult = await executeAdapterCall(basePlan.provider, request, budget, trace, false, adapterOverrides);
      envelopes.push(primaryResult.envelope);
      logicalCalls++;
      totalProviderProcesses += primaryResult.envelope.provider_processes.length;

      addTraceEvent(trace, 'adapter', REASON_CODES.ADAPTER_INVOCATION_OK, { provider: basePlan.provider, is_fallback: false });

      if (primaryResult.failed) {
        primaryFailed = true;
        if (primaryResult.envelope.status === 'timeout') {
          reasons.add(REASON_CODES.ADAPTER_TIMEOUT);
        } else {
          reasons.add(REASON_CODES.ADAPTER_NONZERO_EXIT);
        }
      }

      if (primaryFailed && fallbackCount < 1) {
        const fallbackProviders = basePlan.fallbacks || [];
        for (const fallbackEntry of fallbackProviders) {
          if (logicalCalls >= budget.max_tool_calls) break;

          const fallbackProvider = typeof fallbackEntry === 'string' ? fallbackEntry : fallbackEntry.provider;
          if (!fallbackProvider) continue;

          const fallbackProbe = await probeProviderAvailability(fallbackProvider, adapterOverrides);
          if (!fallbackProbe) continue;

          const fallbackResult = await executeAdapterCall(fallbackProvider, request, budget, trace, true, adapterOverrides);
          envelopes.push(fallbackResult.envelope);
          logicalCalls++;
          fallbackCount++;
          totalProviderProcesses += fallbackResult.envelope.provider_processes.length;

          const callReason = fallbackProvider === 'ripgrep' ? REASON_CODES.PROVIDER_FALLBACK_TO_RIPGREP :
                             fallbackProvider === 'git_grep' ? REASON_CODES.PROVIDER_FALLBACK_TO_GIT_GREP :
                             REASON_CODES.PROVIDER_FALLBACK_TO_FILESYSTEM;
          addTraceEvent(trace, 'adapter', callReason, { provider: fallbackProvider, is_fallback: true });

          if (!fallbackResult.failed) {
            break;
          }
        }
      }
    }
  }

  const normalizeStart = performance.now();
  const normalized = normalizeResults(envelopes, budget, basePlan.strategy);
  let items = normalized.items;
  trace.phases.normalize = Math.round(performance.now() - normalizeStart);
  addTraceEvent(trace, 'normalize', REASON_CODES.NORMALIZER_OK);

  if (batchContext?.progressiveDisclosure && batchContext.batchId) {
    items = applyProgressiveDisclosure(items, batchContext.batchId, signature);
    addTraceEvent(trace, 'result', REASON_CODES.PROGRESSIVE_DISCLOSURE_APPLIED);
  }

  let adapterStdoutChars = 0;
  for (const env of envelopes) {
    adapterStdoutChars += env.stdout_chars;
  }

  const firstResultMs = computeFirstRelevantResultMs(planStartTime, items);
  const estimatedTokens = estimateTokens(normalized.char_count, 0);

  const executionPlan = {
    schema_version: '1.0',
    mode: 'execute',
    execution: {
      estimated_calls: logicalCalls,
      budget_enforcement: 'hard',
      progressive_disclosure: !!batchContext?.progressiveDisclosure,
      preflight: 'passed',
      repositories_searched: repoState.repositories.length
    },
    adapter_signature: signature
  };

  const executionPlanValidation = validateExecutionPlan(executionPlan);

  const result = {
    schema_version: '1.0',
    mode: 'execute',
    plan: executionPlan,
    repository_state: repoState,
    intent: basePlan.intent || basePlan.strategy,
    strategy: basePlan.strategy,
    provider: basePlan.provider,
    logical_adapter_calls: logicalCalls,
    call_budget: budget.max_tool_calls,
    provider_process_invocations: totalProviderProcesses,
    fallback_count: fallbackCount,
    raw_result_count: normalized.raw_result_count,
    result_count: normalized.result_count,
    result_budget: budget.max_results,
    char_count: normalized.char_count,
    char_budget: budget.max_chars,
    truncated: normalized.truncated,
    cache_hits: 0,
    deduped: normalized.deduped,
    cache_evictions: 0,
    focused_read_calls: 0,
    focused_read_chars: 0,
    repositories_searched: repoState.repositories.length,
    first_relevant_result_ms: firstResultMs,
    adapter_stdout_chars: adapterStdoutChars,
    normalized_chars: normalized.normalized_char_count,
    emitted_chars: normalized.char_count,
    estimated_tokens_emitted: estimatedTokens,
    token_estimator_version: TOKEN_ESTIMATOR_VERSION,
    items,
    reason_codes: reasons.toArray(),
    warnings: [],
    error: null,
    duration_ms: Math.round(performance.now() - planStartTime),
    trace_id: traceId
  };

  trace.finished_at = new Date().toISOString();
  trace.duration_ms = result.duration_ms;
  trace.phases.result = 0;

  const resultValidation = validateResult(result);
  if (!resultValidation.valid) {
    return {
      success: false,
      error: `Invalid result: ${JSON.stringify(resultValidation.errors)}`,
      reasons: reasons.toArray(),
      trace,
      metrics: null
    };
  }

  if (cache && !repoState.repositories.some(r => r.dirty_worktree)) {
    cache.set(signature, { result, trace: null, metrics: null });
  }

  if (logicalCalls === 0) {
    reasons.add(REASON_CODES.EXECUTION_EMPTY);
  } else if (logicalCalls > 0 && normalized.result_count === 0) {
    reasons.add(REASON_CODES.EXECUTION_EMPTY);
  } else {
    reasons.add(REASON_CODES.EXECUTION_OK);
  }

  result.reason_codes = reasons.toArray();

  const metrics = {
    schema_version: '1.0',
    trace_id: result.trace_id,
    intent: result.intent,
    strategy: result.strategy,
    provider: result.provider,
    logical_adapter_calls: result.logical_adapter_calls,
    call_budget: result.call_budget,
    provider_process_invocations: result.provider_process_invocations,
    fallback_count: result.fallback_count,
    raw_result_count: result.raw_result_count,
    result_count: result.result_count,
    result_budget: result.result_budget,
    char_count: result.char_count,
    char_budget: result.char_budget,
    adapter_stdout_chars: result.adapter_stdout_chars,
    normalized_chars: result.normalized_chars,
    emitted_chars: result.emitted_chars,
    estimated_tokens_emitted: result.estimated_tokens_emitted,
    focused_read_calls: result.focused_read_calls,
    focused_read_chars: result.focused_read_chars,
    cache_hits: result.cache_hits,
    cache_evictions: result.cache_evictions,
    deduped: result.deduped,
    truncated: result.truncated,
    first_relevant_result_ms: result.first_relevant_result_ms,
    repositories_searched: result.repositories_searched,
    token_estimator_version: result.token_estimator_version,
    reason_codes: result.reason_codes,
    duration_ms: result.duration_ms
  };

  return {
    success: true,
    result,
    trace,
    metrics,
    reasons: reasons.toArray(),
    cached: false
  };
}

function buildEmptyResult(basePlan, repoState, signature, budget, trace, startTime, reasons) {
  reasons.add(REASON_CODES.EXECUTION_EMPTY);

  const executionPlan = {
    schema_version: '1.0',
    mode: 'execute',
    execution: {
      estimated_calls: 0,
      budget_enforcement: 'hard',
      progressive_disclosure: false,
      preflight: 'passed',
      repositories_searched: repoState.repositories.length
    },
    adapter_signature: signature
  };

  return {
    schema_version: '1.0',
    mode: 'execute',
    plan: executionPlan,
    repository_state: repoState,
    intent: basePlan.intent || basePlan.strategy,
    strategy: basePlan.strategy,
    provider: basePlan.provider,
    logical_adapter_calls: 0,
    call_budget: budget.max_tool_calls,
    provider_process_invocations: 0,
    fallback_count: 0,
    raw_result_count: 0,
    result_count: 0,
    result_budget: budget.max_results,
    char_count: 0,
    char_budget: budget.max_chars,
    truncated: false,
    cache_hits: 0,
    deduped: 0,
    cache_evictions: 0,
    focused_read_calls: 0,
    focused_read_chars: 0,
    repositories_searched: repoState.repositories.length,
    first_relevant_result_ms: null,
    adapter_stdout_chars: 0,
    normalized_chars: 0,
    emitted_chars: 0,
    estimated_tokens_emitted: 0,
    token_estimator_version: TOKEN_ESTIMATOR_VERSION,
    items: [],
    reason_codes: reasons.toArray(),
    warnings: [],
    error: null,
    duration_ms: Math.round(performance.now() - startTime),
    trace_id: randomUUID()
  };
}
