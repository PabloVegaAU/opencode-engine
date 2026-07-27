import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { writeJournalEntry } from '../../bin/updates/journal-writer.mjs';
import { rmSync, readFileSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DIR = path.join(__dirname, '..', '..', 'tmp', 'journal-test');

describe('JournalWriter', () => {
  beforeEach(() => {
    // Clean up test directory before each test
    try {
      rmSync(TEST_DIR, { recursive: true, force: true });
    } catch {
      // Ignore if doesn't exist
    }
  });

  afterEach(() => {
    // Clean up test directory after each test
    try {
      rmSync(TEST_DIR, { recursive: true, force: true });
    } catch {
      // Ignore if doesn't exist
    }
  });

  describe('secret redaction', () => {
    it('should redact password fields', () => {
      const entry = {
        action: 'connect',
        password: 'super_secret_123',
        user: 'admin'
      };

      const result = writeJournalEntry(entry, TEST_DIR);

      assert.strictEqual(result.password, '[REDACTED]');
      assert.strictEqual(result.user, 'admin');
    });

    it('should redact secret fields', () => {
      const entry = {
        action: 'authenticate',
        secret: 'my_super_secret_key'
      };

      const result = writeJournalEntry(entry, TEST_DIR);

      assert.strictEqual(result.secret, '[REDACTED]');
    });

    it('should redact token fields', () => {
      const entry = {
        action: 'api_call',
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'
      };

      const result = writeJournalEntry(entry, TEST_DIR);

      assert.strictEqual(result.token, '[REDACTED]');
    });

    it('should redact api_key fields', () => {
      const entry = {
        action: 'api_call',
        api_key: 'sk_live_abc123xyz'
      };

      const result = writeJournalEntry(entry, TEST_DIR);

      assert.strictEqual(result['api_key'], '[REDACTED]');
    });

    it('should redact api-key fields (with hyphen)', () => {
      const entry = {
        action: 'api_call',
        'api-key': 'sk_test_hyphen_format'
      };

      const result = writeJournalEntry(entry, TEST_DIR);

      assert.strictEqual(result['api-key'], '[REDACTED]');
    });

    it('should redact auth fields', () => {
      const entry = {
        action: 'login',
        auth: 'bearer_token_here'
      };

      const result = writeJournalEntry(entry, TEST_DIR);

      assert.strictEqual(result.auth, '[REDACTED]');
    });

    it('should redact credential fields', () => {
      const entry = {
        action: 'setup',
        credential: 'service_account.json'
      };

      const result = writeJournalEntry(entry, TEST_DIR);

      assert.strictEqual(result.credential, '[REDACTED]');
    });

    it('should redact private_key fields', () => {
      const entry = {
        action: 'sign',
        private_key: '-----BEGIN RSA PRIVATE KEY-----'
      };

      const result = writeJournalEntry(entry, TEST_DIR);

      assert.strictEqual(result.private_key, '[REDACTED]');
    });

    it('should redact private-key fields (with hyphen)', () => {
      const entry = {
        action: 'sign',
        'private-key': '-----BEGIN RSA PRIVATE KEY-----'
      };

      const result = writeJournalEntry(entry, TEST_DIR);

      assert.strictEqual(result['private-key'], '[REDACTED]');
    });

    it('should redact access_key fields', () => {
      const entry = {
        action: 's3_upload',
        access_key: 'AKIAIOSFODNN7EXAMPLE'
      };

      const result = writeJournalEntry(entry, TEST_DIR);

      assert.strictEqual(result.access_key, '[REDACTED]');
    });

    it('should redact access-key fields (with hyphen)', () => {
      const entry = {
        action: 's3_upload',
        'access-key': 'AKIAIOSFODNN7EXAMPLE'
      };

      const result = writeJournalEntry(entry, TEST_DIR);

      assert.strictEqual(result['access-key'], '[REDACTED]');
    });

    it('should not contain actual secret values in returned object', () => {
      const entry = {
        action: 'connect',
        password: 'super_secret_123',
        token: 'my_token_value',
        api_key: 'sk_live_abc123'
      };

      const result = writeJournalEntry(entry, TEST_DIR);
      const resultStr = JSON.stringify(result);

      assert.strictEqual(resultStr.includes('super_secret_123'), false);
      assert.strictEqual(resultStr.includes('my_token_value'), false);
      assert.strictEqual(resultStr.includes('sk_live_abc123'), false);
      assert.strictEqual(resultStr.includes('[REDACTED]'), true);
    });
  });

  describe('path sanitization', () => {
    it('should convert absolute paths to relative paths', () => {
      const absolutePath = path.resolve(TEST_DIR, '..', 'other-dir', 'file.txt');

      const entry = {
        action: 'read',
        filepath: absolutePath
      };

      const result = writeJournalEntry(entry, TEST_DIR);

      assert.strictEqual(result.filepath.includes(':'), false);
      assert.strictEqual(result.filepath.startsWith('/'), false);
      assert.ok(result.filepath.startsWith('.'));
    });

    it('should handle nested objects with paths', () => {
      const absolutePath = path.resolve(TEST_DIR, 'config', 'settings.json');

      const entry = {
        action: 'load',
        config: {
          path: absolutePath
        }
      };

      const result = writeJournalEntry(entry, TEST_DIR);

      assert.strictEqual(result.config.path.includes(':'), false);
      assert.ok(result.config.path.startsWith('.'));
    });

    it('should handle arrays with paths', () => {
      const absolutePath1 = path.resolve(TEST_DIR, 'file1.txt');
      const absolutePath2 = path.resolve(TEST_DIR, 'file2.txt');

      const entry = {
        action: 'process',
        files: [absolutePath1, absolutePath2]
      };

      const result = writeJournalEntry(entry, TEST_DIR);

      result.files.forEach(f => {
        assert.strictEqual(f.includes(':'), false);
        assert.ok(f.startsWith('./'));
      });
    });
  });

  describe('journal file output', () => {
    it('should write sanitized entry to journal file', () => {
      const entry = {
        action: 'test',
        password: 'secret123'
      };

      writeJournalEntry(entry, TEST_DIR);

      const journalPath = path.join(TEST_DIR, 'journal.jsonl');
      const content = readFileSync(journalPath, 'utf8');
      const lines = content.trim().split('\n');
      const parsedEntry = JSON.parse(lines[0]);

      assert.strictEqual(parsedEntry.password, '[REDACTED]');
      assert.strictEqual(parsedEntry.action, 'test');
    });

    it('should not contain actual secrets in journal file', () => {
      const entry = {
        action: 'auth',
        password: 'super_secret',
        token: 'jwt_token_here'
      };

      writeJournalEntry(entry, TEST_DIR);

      const journalPath = path.join(TEST_DIR, 'journal.jsonl');
      const content = readFileSync(journalPath, 'utf8');

      assert.strictEqual(content.includes('super_secret'), false);
      assert.strictEqual(content.includes('jwt_token_here'), false);
      assert.strictEqual(content.includes('[REDACTED]'), true);
    });
  });
});
