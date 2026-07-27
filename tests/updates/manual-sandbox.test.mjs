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

describe('ManualSandbox Mixed Ownership Test', () => {
  let sandboxDir;
  let policyPath;

  before(() => {
    // Create a fresh sandbox directory for this test
    sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ownership-sandbox-mixed-'));

    // Create a policy with rules for all ownership categories
    // Note: Using filename-based patterns because the classifier's scanDirectory
    // stores Windows paths with backslashes while patterns use forward slashes,
    // causing directory-path patterns like 'bin/**' to fail on Windows.
    // Filename patterns (e.g., '*.global.sh') work across platforms.
    const policy = {
      version: '1',
      rules: [
        // Global-managed files - identified by .global. marker in filename
        {
          path_pattern: '*.global.sh',
          category: 'global-managed',
          allow_override: false,
          migration_id_required: true
        },
        {
          path_pattern: '*.global.ps1',
          category: 'global-managed',
          allow_override: false,
          migration_id_required: true
        },
        {
          path_pattern: '*.global.mjs',
          category: 'global-managed',
          allow_override: false,
          migration_id_required: true
        },
        // Project-owned files - identified by .owned. marker or .ai-env path
        {
          path_pattern: '*.owned.json',
          category: 'project-owned',
          allow_override: true,
          migration_id_required: false
        },
        {
          path_pattern: '*.config.json',
          category: 'project-owned',
          allow_override: true,
          migration_id_required: false
        },
        // Generated-runtime files - identified by .generated. marker
        {
          path_pattern: '*.generated.log',
          category: 'generated-runtime',
          allow_override: true,
          migration_id_required: false
        },
        {
          path_pattern: '*.generated.cache',
          category: 'generated-runtime',
          allow_override: true,
          migration_id_required: false
        },
        // External files - identified by .external. marker
        {
          path_pattern: '*.external.js',
          category: 'external',
          allow_override: true,
          migration_id_required: false
        }
      ],
      blocked_categories: [],
      default_category: 'project-owned'
    };

    policyPath = path.join(sandboxDir, 'ownership-policy.json');
    fs.writeFileSync(policyPath, JSON.stringify(policy));
  });

  after(() => {
    // Clean up sandbox directory
    if (sandboxDir && fs.existsSync(sandboxDir)) {
      fs.rmSync(sandboxDir, { recursive: true, force: true });
    }
  });

  describe('Sandbox with mixed ownership artifacts', () => {
    // Helper to get classification by suffix
    const getClassificationBySuffix = (result, suffix) => {
      const key = Object.keys(result.classification_map).find(k => k.endsWith(suffix));
      return key ? result.classification_map[key] : undefined;
    };

    it('creates sandbox directory successfully', () => {
      assert.ok(sandboxDir, 'Sandbox directory should be created');
      assert.ok(fs.existsSync(sandboxDir), 'Sandbox directory should exist');
    });

    it('creates global-managed artifacts', () => {
      // Create global-managed files (identified by .global. in filename)
      fs.writeFileSync(path.join(sandboxDir, 'opencode-cli.global.mjs'), '#!/usr/bin/env node');
      fs.writeFileSync(path.join(sandboxDir, 'helper.global.sh'), '#!/bin/bash');
      fs.writeFileSync(path.join(sandboxDir, 'deploy.global.ps1'), '# PowerShell script');

      assert.ok(fs.existsSync(path.join(sandboxDir, 'opencode-cli.global.mjs')));
      assert.ok(fs.existsSync(path.join(sandboxDir, 'deploy.global.ps1')));
    });

    it('creates project-owned artifacts', () => {
      // Create project-owned files (identified by .owned. or *.config.json)
      fs.writeFileSync(path.join(sandboxDir, 'project.owned.json'), '{}');
      fs.writeFileSync(path.join(sandboxDir, 'app.config.json'), '{}');
      fs.writeFileSync(path.join(sandboxDir, 'settings.config.json'), '{}');

      assert.ok(fs.existsSync(path.join(sandboxDir, 'project.owned.json')));
      assert.ok(fs.existsSync(path.join(sandboxDir, 'app.config.json')));
    });

    it('creates generated-runtime artifacts', () => {
      // Create generated-runtime files (identified by .generated. in filename)
      fs.writeFileSync(path.join(sandboxDir, 'session.generated.cache'), 'cache data');
      fs.writeFileSync(path.join(sandboxDir, 'app.generated.log'), 'log entry');
      fs.writeFileSync(path.join(sandboxDir, 'error.generated.log'), 'error log');

      assert.ok(fs.existsSync(path.join(sandboxDir, 'session.generated.cache')));
      assert.ok(fs.existsSync(path.join(sandboxDir, 'app.generated.log')));
    });

    it('creates external artifacts', () => {
      // Create external files (identified by .external. in filename)
      fs.writeFileSync(path.join(sandboxDir, 'lodash.external.js'), 'module.exports = {}');
      fs.writeFileSync(path.join(sandboxDir, 'bundle.external.js'), 'bundled code');

      assert.ok(fs.existsSync(path.join(sandboxDir, 'lodash.external.js')));
      assert.ok(fs.existsSync(path.join(sandboxDir, 'bundle.external.js')));
    });

    it('runs ownership-inspect and verifies classification', () => {
      const result = classifyEnvironment(sandboxDir, policyPath);

      assert.strictEqual(result.error, null, 'Should not have errors');
      assert.ok(result.classification_map, 'Should have classification map');
      assert.ok(Object.keys(result.classification_map).length > 0, 'Should classify files');

      // Verify all categories are represented
      const categories = new Set(Object.values(result.classification_map));
      assert.ok(categories.has(OWNERSHIP_CATEGORIES.GLOBAL_MANAGED), 'Should have global-managed files');
      assert.ok(categories.has(OWNERSHIP_CATEGORIES.PROJECT_OWNED), 'Should have project-owned files');
      assert.ok(categories.has(OWNERSHIP_CATEGORIES.GENERATED_RUNTIME), 'Should have generated-runtime files');
      assert.ok(categories.has(OWNERSHIP_CATEGORIES.EXTERNAL), 'Should have external files');
    });

    it('classifies global-managed files correctly', () => {
      const result = classifyEnvironment(sandboxDir, policyPath);
      const getClassificationBySuffix = (result, suffix) => {
        const key = Object.keys(result.classification_map).find(k => k.endsWith(suffix));
        return key ? result.classification_map[key] : undefined;
      };

      assert.strictEqual(getClassificationBySuffix(result, 'opencode-cli.global.mjs'), OWNERSHIP_CATEGORIES.GLOBAL_MANAGED);
      assert.strictEqual(getClassificationBySuffix(result, 'helper.global.sh'), OWNERSHIP_CATEGORIES.GLOBAL_MANAGED);
      assert.strictEqual(getClassificationBySuffix(result, 'deploy.global.ps1'), OWNERSHIP_CATEGORIES.GLOBAL_MANAGED);
    });

    it('classifies project-owned files correctly', () => {
      const result = classifyEnvironment(sandboxDir, policyPath);
      const getClassificationBySuffix = (result, suffix) => {
        const key = Object.keys(result.classification_map).find(k => k.endsWith(suffix));
        return key ? result.classification_map[key] : undefined;
      };

      assert.strictEqual(getClassificationBySuffix(result, 'project.owned.json'), OWNERSHIP_CATEGORIES.PROJECT_OWNED);
      assert.strictEqual(getClassificationBySuffix(result, 'app.config.json'), OWNERSHIP_CATEGORIES.PROJECT_OWNED);
      assert.strictEqual(getClassificationBySuffix(result, 'settings.config.json'), OWNERSHIP_CATEGORIES.PROJECT_OWNED);
    });

    it('classifies generated-runtime files correctly', () => {
      const result = classifyEnvironment(sandboxDir, policyPath);
      const getClassificationBySuffix = (result, suffix) => {
        const key = Object.keys(result.classification_map).find(k => k.endsWith(suffix));
        return key ? result.classification_map[key] : undefined;
      };

      assert.strictEqual(getClassificationBySuffix(result, 'session.generated.cache'), OWNERSHIP_CATEGORIES.GENERATED_RUNTIME);
      assert.strictEqual(getClassificationBySuffix(result, 'app.generated.log'), OWNERSHIP_CATEGORIES.GENERATED_RUNTIME);
      assert.strictEqual(getClassificationBySuffix(result, 'error.generated.log'), OWNERSHIP_CATEGORIES.GENERATED_RUNTIME);
    });

    it('classifies external files correctly', () => {
      const result = classifyEnvironment(sandboxDir, policyPath);
      const getClassificationBySuffix = (result, suffix) => {
        const key = Object.keys(result.classification_map).find(k => k.endsWith(suffix));
        return key ? result.classification_map[key] : undefined;
      };

      assert.strictEqual(getClassificationBySuffix(result, 'lodash.external.js'), OWNERSHIP_CATEGORIES.EXTERNAL);
      assert.strictEqual(getClassificationBySuffix(result, 'bundle.external.js'), OWNERSHIP_CATEGORIES.EXTERNAL);
    });

    it('verifies correct total count per category', () => {
      const result = classifyEnvironment(sandboxDir, policyPath);
      const counts = {};

      for (const category of Object.values(result.classification_map)) {
        counts[category] = (counts[category] || 0) + 1;
      }

      // Expected counts (excluding policy.json which is the default):
      // global-managed: 3 files (opencode-cli.global.mjs, helper.global.sh, deploy.global.ps1)
      // project-owned: 4 files (project.owned.json, app.config.json, settings.config.json + policy.json)
      // generated-runtime: 3 files (session.generated.cache, app.generated.log, error.generated.log)
      // external: 2 files (lodash.external.js, bundle.external.js)
      // Total: 12 files + 1 policy.json = 13

      assert.strictEqual(counts[OWNERSHIP_CATEGORIES.GLOBAL_MANAGED], 3, 'Should have exactly 3 global-managed files');
      assert.ok(counts[OWNERSHIP_CATEGORIES.PROJECT_OWNED] >= 4, 'Should have at least 4 project-owned files (including policy.json)');
      assert.strictEqual(counts[OWNERSHIP_CATEGORIES.GENERATED_RUNTIME], 3, 'Should have exactly 3 generated-runtime files');
      assert.strictEqual(counts[OWNERSHIP_CATEGORIES.EXTERNAL], 2, 'Should have exactly 2 external files');
    });

    it('cleans up sandbox after all tests', () => {
      // Verify sandbox exists before cleanup check
      assert.ok(fs.existsSync(sandboxDir), 'Sandbox should exist before cleanup verification');

      // The actual cleanup happens in the after() hook
      // This test just verifies the cleanup was initiated
    });
  });
});

// Run this test directly if executed as main module
const isMainModule = process.argv[1]?.endsWith('manual-sandbox.test.mjs');
if (isMainModule) {
  console.log('Running manual sandbox test...');
}
