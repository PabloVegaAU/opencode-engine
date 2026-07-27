import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { createBackup, getDefaultBackupDir } = await import('../../bin/updates/backup-manager.mjs');

describe('BackupManager', () => {
  const tempDir = path.join(__dirname, '../fixtures/temp-backup-test');

  before(() => {
    fs.mkdirSync(tempDir, { recursive: true });
  });

  after(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('createBackup', () => {
    it('should create backup in temp directory', async () => {
      const testFile = path.join(tempDir, 'test-artifact.txt');
      fs.writeFileSync(testFile, 'test content for backup');

      const manifest = await createBackup('plan-123', [testFile], tempDir);

      assert.ok(manifest.backup_id, 'Should have backup_id');
      assert.ok(fs.existsSync(manifest.storage_path), 'Backup directory should exist');
      assert.ok(fs.existsSync(path.join(manifest.storage_path, 'test-artifact.txt')), 'Artifact should be backed up');
    });

    it('should generate valid manifest with required fields', async () => {
      const testFile = path.join(tempDir, 'test-manifest.txt');
      fs.writeFileSync(testFile, 'manifest test content');

      const manifest = await createBackup('plan-456', [testFile], tempDir);

      assert.ok(manifest.backup_id, 'Manifest should have backup_id');
      assert.ok(manifest.created_at, 'Manifest should have created_at');
      assert.strictEqual(manifest.plan_id, 'plan-456', 'Manifest should have correct plan_id');
      assert.ok(Array.isArray(manifest.artifacts), 'Manifest should have artifacts array');
      assert.ok(manifest.storage_path, 'Manifest should have storage_path');
    });

    it('should compute correct SHA256 for artifacts', async () => {
      const testContent = 'sha256 test content';
      const testFile = path.join(tempDir, 'test-sha256.txt');
      fs.writeFileSync(testFile, testContent);

      const expectedSha256 = createHash('sha256').update(Buffer.from(testContent)).digest('hex');
      const manifest = await createBackup('plan-789', [testFile], tempDir);

      assert.strictEqual(manifest.artifacts.length, 1, 'Should have one artifact');
      assert.strictEqual(manifest.artifacts[0].sha256, expectedSha256, 'SHA256 should match');
      assert.strictEqual(manifest.artifacts[0].path, testFile, 'Path should match original');
    });

    it('should include artifact metadata in manifest', async () => {
      const testContent = 'metadata test';
      const testFile = path.join(tempDir, 'test-metadata.txt');
      fs.writeFileSync(testFile, testContent);

      const stats = fs.statSync(testFile);
      const manifest = await createBackup('plan-meta', [testFile], tempDir);

      const artifact = manifest.artifacts[0];
      assert.strictEqual(artifact.size, stats.size, 'Size should match');
      assert.ok(artifact.mtime, 'Should have mtime');
    });

    it('should throw error for non-existent artifact', async () => {
      const nonExistentFile = path.join(tempDir, 'does-not-exist.txt');

      await assert.rejects(
        async () => createBackup('plan-error', [nonExistentFile], tempDir),
        /Artifact not found/
      );
    });

    it('should write backup-manifest.json file', async () => {
      const testFile = path.join(tempDir, 'test-manifest-file.txt');
      fs.writeFileSync(testFile, 'manifest file test');

      const manifest = await createBackup('plan-manifest', [testFile], tempDir);
      const manifestPath = path.join(manifest.storage_path, 'backup-manifest.json');

      assert.ok(fs.existsSync(manifestPath), 'backup-manifest.json should exist');
      const loadedManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      assert.strictEqual(loadedManifest.backup_id, manifest.backup_id, 'Loaded manifest should match');
    });
  });

  describe('getDefaultBackupDir', () => {
    it('should return null when AI_ENV_HOME is not set', () => {
      const original = process.env.AI_ENV_HOME;
      delete process.env.AI_ENV_HOME;
      delete process.env.OPENCODE_ENV_HOME;

      const result = getDefaultBackupDir();
      assert.strictEqual(result, null);

      if (original) process.env.AI_ENV_HOME = original;
    });

    it('should return backup path when AI_ENV_HOME is set', () => {
      const original = process.env.AI_ENV_HOME;
      process.env.AI_ENV_HOME = tempDir;

      const result = getDefaultBackupDir();
      assert.ok(result.endsWith('backups'), 'Should return path ending in backups');

      if (original) process.env.AI_ENV_HOME = original;
      else delete process.env.AI_ENV_HOME;
    });

    it('should prefer AI_ENV_HOME over OPENCODE_ENV_HOME', () => {
      const originalAiEnv = process.env.AI_ENV_HOME;
      const originalOpencode = process.env.OPENCODE_ENV_HOME;

      process.env.AI_ENV_HOME = tempDir;
      process.env.OPENCODE_ENV_HOME = path.join(tempDir, 'opencode-home');

      const result = getDefaultBackupDir();
      assert.ok(result.startsWith(tempDir), 'Should use AI_ENV_HOME');

      if (originalAiEnv) process.env.AI_ENV_HOME = originalAiEnv;
      else delete process.env.AI_ENV_HOME;
      if (originalOpencode) process.env.OPENCODE_ENV_HOME = originalOpencode;
      else delete process.env.OPENCODE_ENV_HOME;
    });
  });
});
