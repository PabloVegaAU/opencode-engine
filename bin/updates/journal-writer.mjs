import { appendFileSync } from 'fs';
import { dirname, resolve, relative } from 'path';
import { mkdirSync } from 'fs';

/**
 * Secret field patterns to redact
 */
const SECRET_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /api[_-]?key/i,
  /auth/i,
  /credential/i,
  /private[_-]?key/i,
  /access[_-]?key/i,
];

/**
 * Check if a field name matches secret patterns
 * @param {string} key
 * @returns {boolean}
 */
function isSecretField(key) {
  return SECRET_PATTERNS.some((pattern) => pattern.test(key));
}

/**
 * Convert absolute paths to relative paths
 * @param {any} value
 * @param {string} baseDir
 * @returns {any}
 */
function sanitizePaths(value, baseDir) {
  if (typeof value === 'string') {
    try {
      const absolutePath = resolve(value);
      const baseAbsolute = resolve(baseDir);
      if (absolutePath.startsWith(baseAbsolute)) {
        return '.' + absolutePath.slice(baseAbsolute.length).replace(/\\/g, '/');
      }
      // Check if it's an absolute path that exists
      if (absolutePath.match(/^[A-Za-z]:\\|^\//)) {
        return relative(baseDir, absolutePath).replace(/\\/g, '/');
      }
    } catch {
      // If path resolution fails, return original
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizePaths(item, baseDir));
  }

  if (value && typeof value === 'object') {
    const sanitized = {};
    for (const [key, val] of Object.entries(value)) {
      sanitized[key] = sanitizePaths(val, baseDir);
    }
    return sanitized;
  }

  return value;
}

/**
 * Sanitize an entry by removing secrets and converting absolute paths
 * @param {object} entry
 * @param {string} baseDir
 * @returns {object}
 */
function sanitizeEntry(entry, baseDir) {
  const sanitized = {};

  for (const [key, value] of Object.entries(entry)) {
    if (isSecretField(key)) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = sanitizePaths(value, baseDir);
    }
  }

  return sanitized;
}

/**
 * Append a sanitized audit record to the journal file
 * @param {object} entry - The audit entry to write
 * @param {string} journalDir - The directory where the journal file is stored
 * @returns {object} The written entry with sanitized fields
 */
export function writeJournalEntry(entry, journalDir) {
  const baseDir = resolve(journalDir);
  const timestamp = new Date().toISOString();

  // Ensure journal directory exists
  mkdirSync(baseDir, { recursive: true });

  const sanitized = sanitizeEntry(entry, baseDir);

  const journalEntry = {
    timestamp,
    ...sanitized,
  };

  const line = JSON.stringify(journalEntry) + '\n';
  const journalPath = resolve(baseDir, 'journal.jsonl');

  appendFileSync(journalPath, line, 'utf8');

  return journalEntry;
}
