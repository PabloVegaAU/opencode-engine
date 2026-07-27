import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const GLOBAL_ROOT = path.resolve(import.meta.dirname, '..', '..');
const CLASSIFIER_PATH = path.join(GLOBAL_ROOT, 'bin', 'updates', 'ownership-classifier.mjs');
const CLASSIFIER_URL = `file://${CLASSIFIER_PATH}`;

// Import the classifier module
const {
  classifyEnvironment,
  OWNERSHIP_CATEGORIES
} = await import(CLASSIFIER_URL);

describe('OwnershipClassifier', () => {

  // Helper to create a minimal policy
  const createPolicy = (rules = [], blockedCategories = [], defaultCategory = OWNERSHIP_CATEGORIES.PROJECT_OWNED) => ({
    version: '1.0.0',
    rules,
    blocked_categories: blockedCategories,
    default_category: defaultCategory
  });

  // Helper to get classification result for a file by suffix match
  const getClassificationBySuffix = (result, suffix) => {
    const key = Object.keys(result.classification_map).find(k => k.endsWith(suffix));
    return key ? result.classification_map[key] : undefined;
  };

  // Helper to check if a file is in unclassified list by suffix
  const isUnclassifiedBySuffix = (result, suffix) => {
    return result.unclassified.some(u => u.endsWith(suffix));
  };

  describe('glob pattern matching', () => {
    let tempDir;
    let policyPath;

    before(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ownership-glob-'));
      policyPath = path.join(tempDir, 'policy.json');
    });

    after(() => {
      if (tempDir && fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('matches exact paths', () => {
      fs.writeFileSync(policyPath, JSON.stringify(createPolicy([
        { path_pattern: 'src/index.js', category: 'project-owned' }
      ])));
      fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'src', 'index.js'), 'content');

      const result = classifyEnvironment(tempDir, policyPath);
      assert.strictEqual(result.error, null);
      assert.strictEqual(getClassificationBySuffix(result, 'index.js'), 'project-owned');
    });

    it('matches * wildcard for single segment files', () => {
      // Create file at root with a single segment pattern
      fs.writeFileSync(policyPath, JSON.stringify(createPolicy([
        { path_pattern: '*.txt', category: 'external' }
      ])));
      fs.writeFileSync(path.join(tempDir, 'readme.txt'), 'content');

      const result = classifyEnvironment(tempDir, policyPath);
      assert.strictEqual(result.error, null);
      assert.strictEqual(getClassificationBySuffix(result, 'readme.txt'), 'external');
    });

    it('? wildcard matches single character', () => {
      fs.writeFileSync(policyPath, JSON.stringify(createPolicy([
        { path_pattern: 'file?.txt', category: 'external' }
      ])));
      fs.writeFileSync(path.join(tempDir, 'file1.txt'), 'content');
      fs.writeFileSync(path.join(tempDir, 'file2.txt'), 'content');
      fs.writeFileSync(path.join(tempDir, 'file10.txt'), 'content');

      const result = classifyEnvironment(tempDir, policyPath);
      assert.strictEqual(result.error, null);
      assert.strictEqual(getClassificationBySuffix(result, 'file1.txt'), 'external');
      assert.strictEqual(getClassificationBySuffix(result, 'file2.txt'), 'external');
      // file10.txt has 2 digits after 'file', ? matches single char only
      assert.strictEqual(getClassificationBySuffix(result, 'file10.txt'), OWNERSHIP_CATEGORIES.PROJECT_OWNED);
    });
  });

  describe('blocked categories', () => {
    let tempDir;
    let policyPath;

    before(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ownership-blocked-'));
      policyPath = path.join(tempDir, 'policy.json');
    });

    after(() => {
      if (tempDir && fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('skips blocked categories and uses default for matching paths', () => {
      fs.writeFileSync(policyPath, JSON.stringify(createPolicy(
        [{ path_pattern: 'config.json', category: 'global-managed' }],
        ['global-managed']
      )));
      fs.writeFileSync(path.join(tempDir, 'config.json'), '{}');

      const result = classifyEnvironment(tempDir, policyPath);
      assert.strictEqual(result.error, null);
      // Path matches blocked category, so it should get the default
      assert.strictEqual(getClassificationBySuffix(result, 'config.json'), OWNERSHIP_CATEGORIES.PROJECT_OWNED);
      assert.ok(isUnclassifiedBySuffix(result, 'config.json'));
    });

    it('skips blocked categories and returns next matching rule', () => {
      fs.writeFileSync(policyPath, JSON.stringify(createPolicy(
        [
          { path_pattern: 'config.json', category: 'global-managed' },
          { path_pattern: '*.json', category: 'external' }
        ],
        ['global-managed']
      )));
      fs.writeFileSync(path.join(tempDir, 'config.json'), '{}');

      const result = classifyEnvironment(tempDir, policyPath);
      assert.strictEqual(result.error, null);
      // global-managed is blocked, so falls through to external
      assert.strictEqual(getClassificationBySuffix(result, 'config.json'), 'external');
      assert.ok(!isUnclassifiedBySuffix(result, 'config.json'));
    });

    it('handles multiple blocked categories', () => {
      fs.writeFileSync(policyPath, JSON.stringify(createPolicy(
        [
          { path_pattern: 'global.json', category: 'global-managed' },
          { path_pattern: 'generated.json', category: 'generated-runtime' }
        ],
        ['global-managed', 'generated-runtime']
      )));
      fs.writeFileSync(path.join(tempDir, 'global.json'), '{}');
      fs.writeFileSync(path.join(tempDir, 'generated.json'), '{}');

      const result = classifyEnvironment(tempDir, policyPath);
      assert.strictEqual(result.error, null);
      assert.strictEqual(getClassificationBySuffix(result, 'global.json'), OWNERSHIP_CATEGORIES.PROJECT_OWNED);
      assert.strictEqual(getClassificationBySuffix(result, 'generated.json'), OWNERSHIP_CATEGORIES.PROJECT_OWNED);
    });
  });

  describe('default category assignment', () => {
    it('assigns default category to unknown paths', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ownership-default1-'));
      const policyPath = path.join(tempDir, 'policy.json');
      try {
        fs.writeFileSync(policyPath, JSON.stringify(createPolicy([
          { path_pattern: '*.js', category: 'project-owned' }
        ])));
        fs.mkdirSync(path.join(tempDir, 'docs'), { recursive: true });
        fs.writeFileSync(path.join(tempDir, 'docs', 'readme.md'), 'content');

        const result = classifyEnvironment(tempDir, policyPath);
        assert.strictEqual(result.error, null);
        assert.strictEqual(getClassificationBySuffix(result, 'readme.md'), OWNERSHIP_CATEGORIES.PROJECT_OWNED);
        assert.ok(isUnclassifiedBySuffix(result, 'readme.md'));
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('uses custom default category from policy', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ownership-default2-'));
      const policyPath = path.join(tempDir, 'policy.json');
      try {
        fs.writeFileSync(policyPath, JSON.stringify(createPolicy(
          [],
          [],
          OWNERSHIP_CATEGORIES.EXTERNAL
        )));
        fs.writeFileSync(path.join(tempDir, 'unknown.txt'), 'content');

        const result = classifyEnvironment(tempDir, policyPath);
        assert.strictEqual(result.error, null);
        assert.strictEqual(result.default_category, OWNERSHIP_CATEGORIES.EXTERNAL);
        assert.strictEqual(getClassificationBySuffix(result, 'unknown.txt'), OWNERSHIP_CATEGORIES.EXTERNAL);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('tracks all unclassified files', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ownership-default3-'));
      const policyPath = path.join(tempDir, 'policy.json');
      try {
        fs.writeFileSync(policyPath, JSON.stringify(createPolicy([
          { path_pattern: '*.js', category: 'project-owned' }
        ])));
        fs.writeFileSync(path.join(tempDir, 'index.js'), 'content');
        fs.writeFileSync(path.join(tempDir, 'readme.md'), 'content');
        fs.writeFileSync(path.join(tempDir, 'guide.txt'), 'content');

        const result = classifyEnvironment(tempDir, policyPath);
        assert.strictEqual(result.error, null);
        assert.strictEqual(getClassificationBySuffix(result, 'index.js'), 'project-owned');
        assert.ok(!isUnclassifiedBySuffix(result, 'index.js'));
        assert.ok(isUnclassifiedBySuffix(result, 'readme.md'));
        assert.ok(isUnclassifiedBySuffix(result, 'guide.txt'));
        // 3 unclassified: readme.md, guide.txt, and the policy.json itself
        assert.strictEqual(result.unclassified.length, 3);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe('classifyEnvironment', () => {
    let tempDir;
    let originalHome;

    before(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ownership-env-'));
      originalHome = process.env.USERPROFILE;
    });

    after(() => {
      if (tempDir && fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
      process.env.USERPROFILE = originalHome;
    });

    it('returns error for missing environment path', () => {
      const result = classifyEnvironment(null, 'policy.json');
      assert.strictEqual(result.error, 'environmentPath is required');
    });

    it('returns error for non-existent environment path', () => {
      const result = classifyEnvironment('/nonexistent/path', 'policy.json');
      assert.strictEqual(result.error, 'environment path does not exist: /nonexistent/path');
    });

    it('returns error for non-existent policy file', () => {
      const result = classifyEnvironment(tempDir, path.join(tempDir, 'nonexistent-policy.json'));
      assert.strictEqual(result.error, `failed to load policy from: ${path.join(tempDir, 'nonexistent-policy.json')}`);
    });

    it('returns error for invalid policy JSON', () => {
      const invalidPolicyPath = path.join(tempDir, 'invalid-policy.json');
      fs.writeFileSync(invalidPolicyPath, 'not valid json {');

      const result = classifyEnvironment(tempDir, invalidPolicyPath);
      assert.strictEqual(result.error, `failed to load policy from: ${invalidPolicyPath}`);
    });

    it('includes policy version in result', () => {
      const policyPath = path.join(tempDir, 'policy.json');
      const policy = createPolicy([], []);
      policy.version = '2.0.0';
      fs.writeFileSync(policyPath, JSON.stringify(policy));

      const result = classifyEnvironment(tempDir, policyPath);
      assert.strictEqual(result.policy_version, '2.0.0');
    });

    it('returns empty classification for empty directory', () => {
      const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ownership-empty-'));
      const policyPath = path.join(tempDir, 'policy.json');
      fs.writeFileSync(policyPath, JSON.stringify(createPolicy()));

      const result = classifyEnvironment(emptyDir, policyPath);
      assert.strictEqual(result.error, null);
      assert.deepStrictEqual(result.classification_map, {});
      assert.deepStrictEqual(result.unclassified, []);

      fs.rmSync(emptyDir, { recursive: true, force: true });
    });

    it('handles files with spaces in names', () => {
      const policyPath = path.join(tempDir, 'policy.json');
      fs.writeFileSync(policyPath, JSON.stringify(createPolicy([
        { path_pattern: 'my file.txt', category: 'external' }
      ])));
      fs.writeFileSync(path.join(tempDir, 'my file.txt'), 'content');

      const result = classifyEnvironment(tempDir, policyPath);
      assert.strictEqual(result.error, null);
      assert.strictEqual(getClassificationBySuffix(result, 'my file.txt'), 'external');
    });

    it('returns all known ownership categories', () => {
      assert.strictEqual(OWNERSHIP_CATEGORIES.GLOBAL_MANAGED, 'global-managed');
      assert.strictEqual(OWNERSHIP_CATEGORIES.PROJECT_OWNED, 'project-owned');
      assert.strictEqual(OWNERSHIP_CATEGORIES.GLOBAL_MANAGED_LOCAL_OVERRIDE, 'global-managed-local-override');
      assert.strictEqual(OWNERSHIP_CATEGORIES.GENERATED_RUNTIME, 'generated-runtime');
      assert.strictEqual(OWNERSHIP_CATEGORIES.EXTERNAL, 'external');
    });
  });
});
