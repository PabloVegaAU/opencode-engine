import { describe, it } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { generateUpdatePlan } from '../../bin/updates/update-planner.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GLOBAL_ROOT = path.resolve(__dirname, '..');

const OWNERSHIP_CATEGORIES = {
  GLOBAL_MANAGED: 'global-managed',
  PROJECT_OWNED: 'project-owned',
  GLOBAL_MANAGED_LOCAL_OVERRIDE: 'global-managed-local-override',
  GENERATED_RUNTIME: 'generated-runtime',
  EXTERNAL: 'external'
};

describe('UpdatePlanner', () => {
  describe('generateUpdatePlan', () => {
    const catalog = {
      version: '1.0',
      migrations: [
        {
          migration_id: 'mig-001',
          description: 'Update bin',
          source_version: '1.0',
          target_version: '2.0',
          artifacts: ['bin/*', 'scripts/**'],
          preconditions: [],
          rollback_id: null
        },
        {
          migration_id: 'mig-002',
          description: 'Update global configs',
          source_version: '1.0',
          target_version: '2.0',
          artifacts: ['global/*.jsonc'],
          preconditions: [],
          rollback_id: null
        }
      ]
    };

    it('should generate valid plan from classification map', () => {
      const classificationMap = {
        'bin/opencode.mjs': OWNERSHIP_CATEGORIES.GLOBAL_MANAGED,
        'global/opencode.jsonc': OWNERSHIP_CATEGORIES.GLOBAL_MANAGED
      };

      const plan = generateUpdatePlan(classificationMap, '1.0', '2.0', catalog);

      assert.ok(plan.plan_id, 'Plan should have plan_id');
      assert.ok(plan.created_at, 'Plan should have created_at');
      assert.strictEqual(plan.source_version, '1.0');
      assert.strictEqual(plan.target_version, '2.0');
      assert.strictEqual(plan.blocked_count, 0);
      assert.ok(plan.requires_approval);
      assert.deepStrictEqual(plan.classifications, classificationMap);
    });

    it('should flag blocked artifacts correctly', () => {
      const classificationMap = {
        'bin/opencode.mjs': OWNERSHIP_CATEGORIES.GLOBAL_MANAGED,
        'node_modules/pkg/index.mjs': OWNERSHIP_CATEGORIES.EXTERNAL,
        'generated/file.mjs': OWNERSHIP_CATEGORIES.GENERATED_RUNTIME
      };

      const plan = generateUpdatePlan(classificationMap, '1.0', '2.0', catalog);

      assert.strictEqual(plan.blocked_count, 2);

      const blockedOps = plan.operations.filter(op => op.type === 'block');
      assert.strictEqual(blockedOps.length, 2);

      const externalOp = plan.operations.find(op => op.path === 'node_modules/pkg/index.mjs');
      assert.strictEqual(externalOp.migration_id, 'BLOCKED_NO_POLICY');
      assert.ok(externalOp.reason.includes('External artifact blocked'));

      const generatedOp = plan.operations.find(op => op.path === 'generated/file.mjs');
      assert.strictEqual(generatedOp.migration_id, 'BLOCKED_NO_POLICY');
      assert.ok(generatedOp.reason.includes('no migration_id provided'));
    });

    it('should include migration IDs when required', () => {
      const classificationMap = {
        'bin/opencode.mjs': OWNERSHIP_CATEGORIES.GLOBAL_MANAGED,
        'global/opencode.jsonc': OWNERSHIP_CATEGORIES.GLOBAL_MANAGED
      };

      const plan = generateUpdatePlan(classificationMap, '1.0', '2.0', catalog);

      const binOp = plan.operations.find(op => op.path === 'bin/opencode.mjs');
      assert.strictEqual(binOp.migration_id, 'mig-001');

      const configOp = plan.operations.find(op => op.path === 'global/opencode.jsonc');
      assert.strictEqual(configOp.migration_id, 'mig-002');
    });

    it('should handle empty classification map', () => {
      const plan = generateUpdatePlan({}, '1.0', '2.0', catalog);

      assert.strictEqual(plan.operations.length, 0);
      assert.strictEqual(plan.blocked_count, 0);
    });

    it('should handle mixed ownership categories', () => {
      const classificationMap = {
        'bin/opencode.mjs': OWNERSHIP_CATEGORIES.GLOBAL_MANAGED,
        'project/custom.mjs': OWNERSHIP_CATEGORIES.PROJECT_OWNED,
        'config/override.jsonc': OWNERSHIP_CATEGORIES.GLOBAL_MANAGED_LOCAL_OVERRIDE,
        'node_modules/ext/pkg.mjs': OWNERSHIP_CATEGORIES.EXTERNAL
      };

      const plan = generateUpdatePlan(classificationMap, '1.0', '2.0', catalog);

      const preserveOps = plan.operations.filter(op => op.type === 'preserve');
      assert.strictEqual(preserveOps.length, 2);

      const blockOps = plan.operations.filter(op => op.type === 'block');
      assert.strictEqual(blockOps.length, 1);

      const updateOps = plan.operations.filter(op => op.type === 'update');
      assert.strictEqual(updateOps.length, 1);
    });

    it('should preserve operation order from classification map', () => {
      const classificationMap = {
        'z-last.mjs': OWNERSHIP_CATEGORIES.GLOBAL_MANAGED,
        'a-first.mjs': OWNERSHIP_CATEGORIES.GLOBAL_MANAGED,
        'm-middle.mjs': OWNERSHIP_CATEGORIES.GLOBAL_MANAGED
      };

      const plan = generateUpdatePlan(classificationMap, '1.0', '2.0', catalog);

      assert.strictEqual(plan.operations[0].path, 'z-last.mjs');
      assert.strictEqual(plan.operations[1].path, 'a-first.mjs');
      assert.strictEqual(plan.operations[2].path, 'm-middle.mjs');
    });

    it('should mark external artifacts as blocked with BLOCKED_NO_POLICY', () => {
      const classificationMap = {
        'vendor/package/index.mjs': OWNERSHIP_CATEGORIES.EXTERNAL
      };

      const plan = generateUpdatePlan(classificationMap, '1.0', '2.0', catalog);

      assert.strictEqual(plan.blocked_count, 1);
      const op = plan.operations[0];
      assert.strictEqual(op.type, 'block');
      assert.strictEqual(op.migration_id, 'BLOCKED_NO_POLICY');
      assert.ok(op.reason.includes('External artifact blocked'));
    });

    it('should preserve project-owned artifacts unconditionally', () => {
      const classificationMap = {
        'src/custom/logic.mjs': OWNERSHIP_CATEGORIES.PROJECT_OWNED
      };

      const plan = generateUpdatePlan(classificationMap, '1.0', '2.0', catalog);

      assert.strictEqual(plan.blocked_count, 0);
      const op = plan.operations[0];
      assert.strictEqual(op.type, 'preserve');
      assert.strictEqual(op.migration_id, null);
      assert.ok(op.reason.includes('Project-owned'));
    });

    it('should preserve global-managed-local-override artifacts', () => {
      const classificationMap = {
        'config/local-override.jsonc': OWNERSHIP_CATEGORIES.GLOBAL_MANAGED_LOCAL_OVERRIDE
      };

      const plan = generateUpdatePlan(classificationMap, '1.0', '2.0', catalog);

      assert.strictEqual(plan.blocked_count, 0);
      const op = plan.operations[0];
      assert.strictEqual(op.type, 'preserve');
      assert.strictEqual(op.migration_id, null);
      assert.ok(op.reason.includes('permitted local override'));
    });

    it('should update global-managed artifacts with migration_id from catalog', () => {
      const classificationMap = {
        'bin/opencode.mjs': OWNERSHIP_CATEGORIES.GLOBAL_MANAGED
      };

      const plan = generateUpdatePlan(classificationMap, '1.0', '2.0', catalog);

      const op = plan.operations[0];
      assert.strictEqual(op.type, 'update');
      assert.strictEqual(op.migration_id, 'mig-001');
      assert.ok(op.reason.includes('Global artifact update with migration'));
    });

    it('should update global-managed artifacts without migration_id when no catalog match', () => {
      const classificationMap = {
        'unknown/path.mjs': OWNERSHIP_CATEGORIES.GLOBAL_MANAGED
      };

      const plan = generateUpdatePlan(classificationMap, '1.0', '2.0', catalog);

      const op = plan.operations[0];
      assert.strictEqual(op.type, 'update');
      assert.strictEqual(op.migration_id, null);
      assert.ok(op.reason.includes('no divergence detected'));
    });

    it('should block generated-runtime artifacts when no migration found', () => {
      const classificationMap = {
        'runtime/generated.mjs': OWNERSHIP_CATEGORIES.GENERATED_RUNTIME
      };

      const plan = generateUpdatePlan(classificationMap, '1.0', '2.0', catalog);

      const op = plan.operations[0];
      assert.strictEqual(op.type, 'block');
      assert.strictEqual(op.migration_id, 'BLOCKED_NO_POLICY');
      assert.ok(op.reason.includes('no migration_id provided'));
    });

    it('should update generated-runtime artifacts when migration exists', () => {
      const classificationMap = {
        'bin/opencode.mjs': OWNERSHIP_CATEGORIES.GENERATED_RUNTIME
      };

      const plan = generateUpdatePlan(classificationMap, '1.0', '2.0', catalog);

      const op = plan.operations[0];
      assert.strictEqual(op.type, 'update');
      assert.strictEqual(op.migration_id, 'mig-001');
      assert.ok(op.reason.includes('Generated runtime artifact with explicit migration'));
    });

    it('should block unknown ownership categories with BLOCKED_NO_POLICY', () => {
      const classificationMap = {
        'unknown/path.mjs': 'invalid-category'
      };

      const plan = generateUpdatePlan(classificationMap, '1.0', '2.0', catalog);

      const op = plan.operations[0];
      assert.strictEqual(op.type, 'block');
      assert.strictEqual(op.migration_id, 'BLOCKED_NO_POLICY');
      assert.ok(op.reason.includes('Unknown ownership category'));
    });

    it('should match glob patterns in migration artifacts', () => {
      const classificationMap = {
        'scripts/install.ps1': OWNERSHIP_CATEGORIES.GLOBAL_MANAGED,
        'scripts/nested/deploy.ps1': OWNERSHIP_CATEGORIES.GLOBAL_MANAGED
      };

      const plan = generateUpdatePlan(classificationMap, '1.0', '2.0', catalog);

      const scriptOps = plan.operations.filter(op => op.path.startsWith('scripts/'));
      assert.strictEqual(scriptOps.length, 2);
      scriptOps.forEach(op => {
        assert.strictEqual(op.migration_id, 'mig-001');
      });
    });

    it('should handle Windows-style paths in classification map', () => {
      const classificationMap = {
        'bin\\opencode.mjs': OWNERSHIP_CATEGORIES.GLOBAL_MANAGED
      };

      const plan = generateUpdatePlan(classificationMap, '1.0', '2.0', catalog);

      const op = plan.operations[0];
      assert.strictEqual(op.type, 'update');
      assert.strictEqual(op.migration_id, 'mig-001');
    });

    it('should produce plan with all required fields', () => {
      const classificationMap = {
        'bin/opencode.mjs': OWNERSHIP_CATEGORIES.GLOBAL_MANAGED
      };

      const plan = generateUpdatePlan(classificationMap, '1.0', '2.0', catalog);

      assert.ok(plan.plan_id, 'plan_id should exist');
      assert.ok(typeof plan.plan_id === 'string', 'plan_id should be string');
      assert.ok(plan.created_at, 'created_at should exist');
      assert.ok(typeof plan.created_at === 'string', 'created_at should be string');
      assert.strictEqual(plan.source_version, '1.0');
      assert.strictEqual(plan.target_version, '2.0');
      assert.ok(plan.classifications, 'classifications should exist');
      assert.ok(Array.isArray(plan.operations), 'operations should be array');
      assert.strictEqual(typeof plan.blocked_count, 'number');
      assert.strictEqual(typeof plan.requires_approval, 'boolean');
    });
  });
});
