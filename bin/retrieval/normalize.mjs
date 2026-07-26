/**
 * Normalizer - OpenCode Global v0.5.0
 * Normalizes raw adapter items to contract items with deduplication and truncation.
 */

import { createHash } from 'node:crypto';
import { truncateByMaxChars, truncateByMaxResults } from './budget.mjs';
import { toPosixPath } from './path-restrict.mjs';

export function generateItemId(provider, repositoryId, path, line) {
  return `${provider}:${repositoryId}:${path}:${line}`;
}

export function normalizeItem(rawItem, sourceProvider, strategy) {
  const path = toPosixPath(rawItem.path);
  const id = generateItemId(sourceProvider, rawItem.repository_id, path, rawItem.line || 0);
  const preview = generatePreview(rawItem.content || '');

  return {
    id,
    kind: strategy,
    path,
    repository_id: rawItem.repository_id,
    line: rawItem.line || 1,
    column: rawItem.column || 1,
    preview,
    preview_token: null,
    relations: [],
    score: 1.0,
    source_provider: sourceProvider
  };
}

export function generatePreview(content, maxPreviewLen = 200) {
  const trimmed = content.trim();
  if (trimmed.length <= maxPreviewLen) {
    return trimmed;
  }
  return trimmed.slice(0, maxPreviewLen - 3) + '...';
}

export function deduplicateItems(items) {
  const seen = new Map();
  const deduped = [];
  let dedupCount = 0;

  for (const item of items) {
    const key = `${item.repository_id}|${item.path}|${item.line}|${item.column}`;
    if (seen.has(key)) {
      dedupCount++;
      continue;
    }
    seen.set(key, true);
    deduped.push(item);
  }

  return { items: deduped, dedupCount };
}

export function sortItems(items) {
  return [...items].sort((a, b) => {
    if (a.repository_id !== b.repository_id) return a.repository_id.localeCompare(b.repository_id);
    if (a.path !== b.path) return a.path.localeCompare(b.path);
    if (a.line !== b.line) return a.line - b.line;
    return a.column - b.column;
  });
}

export function normalizeResults(envelopes, budget, strategy) {
  const rawItems = [];
  let rawCharCount = 0;

  for (const envelope of envelopes) {
    if (envelope.raw_items && envelope.raw_items.length > 0) {
      for (const item of envelope.raw_items) {
        rawCharCount += Buffer.byteLength(JSON.stringify(item), 'utf8');
        rawItems.push({
          ...item,
          source_provider: envelope.provider
        });
      }
    }
  }

  let normalizedItems = rawItems.map(item => normalizeItem(item, item.source_provider, strategy));

  const dedupResult = deduplicateItems(normalizedItems);
  normalizedItems = dedupResult.items;
  const deduped = dedupResult.dedupCount;

  normalizedItems = sortItems(normalizedItems);

  const charTruncResult = truncateByMaxChars(normalizedItems, budget.max_chars);
  normalizedItems = charTruncResult.items;

  let normalizedCharCount = 0;
  for (const item of normalizedItems) {
    normalizedCharCount += Buffer.byteLength(item.preview || '', 'utf8');
  }

  const resultTruncResult = truncateByMaxResults(normalizedItems, budget.max_results);
  normalizedItems = resultTruncResult.items;

  let emittedCharCount = 0;
  for (const item of normalizedItems) {
    emittedCharCount += Buffer.byteLength(item.preview || '', 'utf8');
  }

  return {
    items: normalizedItems,
    raw_result_count: rawItems.length,
    result_count: normalizedItems.length,
    raw_char_count: rawCharCount,
    normalized_char_count: normalizedCharCount,
    char_count: emittedCharCount,
    truncated: charTruncResult.truncated || resultTruncResult.truncated,
    deduped
  };
}

export function applyProgressiveDisclosure(items, batchId, adapterSignature) {
  return items.map((item, idx) => {
    const tokenInput = `${batchId}|${adapterSignature}|${item.repository_id}|${item.path}|${item.line}|${idx}`;
    const previewToken = createHash('sha256').update(tokenInput).digest('hex');
    return {
      ...item,
      preview_token: previewToken,
      preview: null
    };
  });
}
