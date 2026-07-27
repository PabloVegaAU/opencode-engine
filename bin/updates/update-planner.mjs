/**
 * Update Planner - OpenCode Global v0.6.0
 *
 * Generates update plan from classification map and migration catalog.
 * Enumerates: artifacts to update, preserve, block, create, delete.
 * Includes migration IDs where required.
 * Marks blocked artifacts with BLOCKED_NO_POLICY.
 */

import { randomUUID } from 'crypto';

/**
 * @typedef {Object} Operation
 * @property {'update' | 'preserve' | 'block' | 'create' | 'delete'} type
 * @property {string} path
 * @property {string | null} migration_id
 * @property {string} reason
 */

/**
 * @typedef {Object} Migration
 * @property {string} migration_id
 * @property {string} description
 * @property {string} source_version
 * @property {string} target_version
 * @property {string[]} artifacts
 * @property {string[]} preconditions
 * @property {string | null} rollback_id
 */

/**
 * @typedef {Object} Catalog
 * @property {string} version
 * @property {Migration[]} migrations
 */

const OWNERSHIP_CATEGORIES = {
  GLOBAL_MANAGED: 'global-managed',
  PROJECT_OWNED: 'project-owned',
  GLOBAL_MANAGED_LOCAL_OVERRIDE: 'global-managed-local-override',
  GENERATED_RUNTIME: 'generated-runtime',
  EXTERNAL: 'external'
};

const BLOCKED_NO_POLICY = 'BLOCKED_NO_POLICY';

/**
 * Check if an artifact path matches any migration pattern
 * @param {string} artifactPath
 * @param {Catalog} catalog
 * @param {string} sourceVersion
 * @param {string} targetVersion
 * @returns {string | null} migration_id if found, null otherwise
 */
function findMigrationForArtifact(artifactPath, catalog, sourceVersion, targetVersion) {
  if (!catalog || !catalog.migrations) {
    return null;
  }

  for (const migration of catalog.migrations) {
    if (migration.source_version !== sourceVersion || migration.target_version !== targetVersion) {
      continue;
    }

    for (const pattern of migration.artifacts) {
      if (matchesPattern(artifactPath, pattern)) {
        return migration.migration_id;
      }
    }
  }

  return null;
}

/**
 * Match artifact path against a glob pattern
 * @param {string} artifactPath
 * @param {string} pattern
 * @returns {boolean}
 */
function matchesPattern(artifactPath, pattern) {
  const normalizedPath = artifactPath.replace(/\\/g, '/');
  const normalizedPattern = pattern.replace(/\\/g, '/');

  if (normalizedPattern === '**' || normalizedPattern === '*') {
    return true;
  }

  const regexPattern = normalizedPattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '{{DOUBLE_STAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/\{\{DOUBLE_STAR\}\}/g, '.*')
    .replace(/\?/g, '.');

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(normalizedPath);
}

/**
 * Determine the operation type and migration_id for an artifact
 * @param {string} artifactPath
 * @param {string} category
 * @param {Catalog} catalog
 * @param {string} sourceVersion
 * @param {string} targetVersion
 * @returns {{type: string, migration_id: string | null, reason: string}}
 */
function determineOperation(artifactPath, category, catalog, sourceVersion, targetVersion) {
  switch (category) {
    case OWNERSHIP_CATEGORIES.PROJECT_OWNED:
      return {
        type: 'preserve',
        migration_id: null,
        reason: 'Project-owned artifact must be preserved unconditionally'
      };

    case OWNERSHIP_CATEGORIES.GLOBAL_MANAGED_LOCAL_OVERRIDE:
      return {
        type: 'preserve',
        migration_id: null,
        reason: 'Global artifact with permitted local override preserved'
      };

    case OWNERSHIP_CATEGORIES.EXTERNAL:
      return {
        type: 'block',
        migration_id: BLOCKED_NO_POLICY,
        reason: 'External artifact blocked: owned by third-party tooling or framework'
      };

    case OWNERSHIP_CATEGORIES.GENERATED_RUNTIME:
      const runtimeMigrationId = findMigrationForArtifact(artifactPath, catalog, sourceVersion, targetVersion);
      if (runtimeMigrationId) {
        return {
          type: 'update',
          migration_id: runtimeMigrationId,
          reason: 'Generated runtime artifact with explicit migration'
        };
      }
      return {
        type: 'block',
        migration_id: BLOCKED_NO_POLICY,
        reason: 'Generated runtime artifact blocked: no migration_id provided'
      };

    case OWNERSHIP_CATEGORIES.GLOBAL_MANAGED:
      const migrationId = findMigrationForArtifact(artifactPath, catalog, sourceVersion, targetVersion);
      if (migrationId) {
        return {
          type: 'update',
          migration_id: migrationId,
          reason: 'Global artifact update with migration'
        };
      }
      return {
        type: 'update',
        migration_id: null,
        reason: 'Global artifact update (no divergence detected)'
      };

    default:
      return {
        type: 'block',
        migration_id: BLOCKED_NO_POLICY,
        reason: `Unknown ownership category: ${category}`
      };
  }
}

/**
 * Generate an update plan from classification map and migration catalog
 * @param {Object<string, string>} classificationMap - Map of artifact path to ownership category
 * @param {string} sourceVersion - Source version identifier
 * @param {string} targetVersion - Target version identifier
 * @param {Catalog} catalog - Migration catalog
 * @returns {Object} Update plan matching update-plan.schema.json
 */
export function generateUpdatePlan(classificationMap, sourceVersion, targetVersion, catalog) {
  const planId = randomUUID();
  const createdAt = new Date().toISOString();

  /** @type {Operation[]} */
  const operations = [];
  let blockedCount = 0;

  for (const [artifactPath, category] of Object.entries(classificationMap)) {
    const operation = determineOperation(artifactPath, category, catalog, sourceVersion, targetVersion);

    operations.push({
      type: operation.type,
      path: artifactPath,
      migration_id: operation.migration_id,
      reason: operation.reason
    });

    if (operation.type === 'block') {
      blockedCount++;
    }
  }

  return {
    plan_id: planId,
    created_at: createdAt,
    source_version: sourceVersion,
    target_version: targetVersion,
    classifications: { ...classificationMap },
    operations,
    blocked_count: blockedCount,
    requires_approval: true
  };
}

export default generateUpdatePlan;
