/**
 * Budget Enforcement - OpenCode Global v0.5.0
 * Hard caps and per-strategy budget enforcement.
 */

export const HARD_CAPS = {
  max_tool_calls: 3,
  max_chars: 24000,
  timeout_ms: 5000
};

export const DEFAULT_BUDGETS = {
  exact: { max_tool_calls: 1, max_results: 25, max_chars: 12000, timeout_ms: 5000 },
  symbol: { max_tool_calls: 2, max_results: 25, max_chars: 16000, timeout_ms: 5000 },
  architecture: { max_tool_calls: 2, max_results: 30, max_chars: 20000, timeout_ms: 5000 },
  semantic: { max_tool_calls: 2, max_results: 12, max_chars: 16000, timeout_ms: 5000 },
  knowledge: { max_tool_calls: 2, max_results: 12, max_chars: 16000, timeout_ms: 5000 }
};

export function getBudgetForStrategy(strategy) {
  return DEFAULT_BUDGETS[strategy] || DEFAULT_BUDGETS.exact;
}

export function mergeBudgets(planBudgets, options = {}) {
  const strategy = options.strategy || 'exact';
  const defaultBudget = getBudgetForStrategy(strategy);

  return {
    max_tool_calls: Math.min(
      options.max_tool_calls || planBudgets?.max_tool_calls || defaultBudget.max_tool_calls,
      HARD_CAPS.max_tool_calls
    ),
    max_results: options.max_results || planBudgets?.max_results || defaultBudget.max_results,
    max_chars: Math.min(
      options.max_chars || planBudgets?.max_chars || defaultBudget.max_chars,
      HARD_CAPS.max_chars
    ),
    timeout_ms: options.timeout_ms || planBudgets?.timeout_ms || defaultBudget.timeout_ms
  };
}

export function enforceHardCaps(budget) {
  return {
    max_tool_calls: Math.min(budget.max_tool_calls, HARD_CAPS.max_tool_calls),
    max_results: budget.max_results,
    max_chars: Math.min(budget.max_chars, HARD_CAPS.max_chars),
    timeout_ms: budget.timeout_ms
  };
}

export function canMakeCall(logicalCalls, budget) {
  return logicalCalls < budget.max_tool_calls;
}

export function shouldFallback(fallbackCount, budget, primaryFailed) {
  if (fallbackCount >= 1) return false;
  if (primaryFailed) return true;
  return fallbackCount < 1;
}

export function truncateByMaxChars(items, maxChars) {
  let totalChars = 0;
  const truncated = [];

  for (const item of items) {
    const itemChars = Buffer.byteLength(JSON.stringify(item), 'utf8');
    if (totalChars + itemChars > maxChars) {
      return { items: truncated, truncated: true, charCount: totalChars };
    }
    totalChars += itemChars;
    truncated.push(item);
  }

  return { items: truncated, truncated: false, charCount: totalChars };
}

export function truncateByMaxResults(items, maxResults) {
  if (items.length <= maxResults) {
    return { items, truncated: false };
  }
  return {
    items: items.slice(0, maxResults),
    truncated: true
  };
}

export function computeCallBudget(strategy, options) {
  const budget = getBudgetForStrategy(strategy);
  const merged = mergeBudgets(budget, options);
  return enforceHardCaps(merged);
}
