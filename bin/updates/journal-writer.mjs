import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { isAbsolutePath, normalizeRelativePath, requireAbsoluteRoot } from './path-safety.mjs';
const secret = /(password|secret|token|api[_-]?key|auth|credential|private[_-]?key|access[_-]?key|content|bearer)/i;
function clean(value, key = '') {
  if (secret.test(key)) return '[REDACTED]';
  if (typeof value === 'string') {
    if (/bearer\s+|token\s*[:=]|api[_-]?key\s*[:=]|password\s*[:=]/i.test(value)) return '[REDACTED]';
    if (isAbsolutePath(value)) return './[PATH_REDACTED]';
    return value;
  }
  if (Array.isArray(value)) return value.map(v => clean(v));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clean(v, k)]));
  return value;
}
export function writeJournalEntry(entry, journalDir) {
  const dir = requireAbsoluteRoot(journalDir, 'journal directory'); mkdirSync(dir, { recursive: true });
  const record = { timestamp: new Date().toISOString(), ...clean(entry) };
  appendFileSync(join(dir, 'journal.jsonl'), `${JSON.stringify(record)}\n`, 'utf8'); return record;
}
