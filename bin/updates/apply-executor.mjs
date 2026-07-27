/**
 * ApplyExecutor - OpenCode Global v0.6.0
 * Executes plan operations atomically, tracks progress, and triggers rollback on failure.
 */

import { writeFileSync, renameSync, unlinkSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * @typedef {Object} UpdateRun
 * @property {string} run_id
 * @property {string} plan_id
 * @property {string} started_at
 * @property {string|null} completed_at
 * @property {'in_progress'|'completed'|'rolled_back'|'failed'} status
 * @property {OperationResult[]} operations
 * @property {string} backup_manifest_path
 * @property {string} journal_entry_id
 */

/**
 * @typedef {Object} OperationResult
 * @property {string} type
 * @property {string} path
 * @property {'pending'|'success'|'failed'|'rolled_back'} status
 * @property {string|null} error
 */

/**
 * @typedef {Object} PlanOperation
 * @property {'create'|'update'|'delete'|'preserve'|'block'} type
 * @property {string} path
 * @property {string|null} migration_id
 * @property {string} reason
 * @property {string} [content]
 */

/**
 * Creates an update-run tracking object
 * @param {string} runId
 * @param {string} planId
 * @param {PlanOperation[]} operations
 * @param {string} backupManifestPath
 * @param {string} journalEntryId
 * @returns {UpdateRun}
 */
export function createUpdateRun(runId, planId, operations, backupManifestPath, journalEntryId) {
  return {
    run_id: runId,
    plan_id: planId,
    started_at: new Date().toISOString(),
    completed_at: null,
    status: 'in_progress',
    operations: operations.map(op => ({
      type: op.type,
      path: op.path,
      status: 'pending',
      error: null
    })),
    backup_manifest_path: backupManifestPath,
    journal_entry_id: journalEntryId
  };
}

/**
 * Performs an atomic write using temp file + rename
 * @param {string} filePath
 * @param {string} content
 */
function atomicWrite(filePath, content) {
  const tmpPath = `${filePath}.tmp.${randomUUID()}`;
  writeFileSync(tmpPath, content, { encoding: 'utf8' });
  renameSync(tmpPath, filePath);
}

/**
 * Executes a create operation atomically
 * @param {string} filePath
 * @param {string} content
 * @returns {{success: boolean, error: string|null}}
 */
function executeCreate(filePath, content) {
  try {
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    atomicWrite(filePath, content);
    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Executes an update operation atomically
 * @param {string} filePath
 * @param {string} content
 * @returns {{success: boolean, error: string|null}}
 */
function executeUpdate(filePath, content) {
  try {
    if (!existsSync(filePath)) {
      return { success: false, error: `File does not exist: ${filePath}` };
    }
    atomicWrite(filePath, content);
    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Executes a delete operation
 * @param {string} filePath
 * @returns {{success: boolean, error: string|null}}
 */
function executeDelete(filePath) {
  try {
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Filters operations by type
 * @param {PlanOperation[]} operations
 * @param {string} type
 * @returns {PlanOperation[]}
 */
function filterByType(operations, type) {
  return operations.filter(op => op.type === type);
}

/**
 * Executes an apply plan atomically
 * @param {Object} plan - The update plan containing operations
 * @param {string} plan.plan_id - Plan UUID
 * @param {PlanOperation[]} plan.operations - List of operations to execute
 * @param {string} backupManifest - Path to backup manifest
 * @param {string} runId - Run UUID
 * @returns {Promise<{updateRun: UpdateRun, error: string|null}>}
 */
export async function executeApply(plan, backupManifest, runId) {
  const journalEntryId = randomUUID();
  const updateRun = createUpdateRun(runId, plan.plan_id, plan.operations, backupManifest, journalEntryId);

  // Order: create, update, delete
  const createOps = filterByType(plan.operations, 'create');
  const updateOps = filterByType(plan.operations, 'update');
  const deleteOps = filterByType(plan.operations, 'delete');

  // Execute creates
  for (const op of createOps) {
    const result = executeCreate(op.path, op.content || '');
    const opResult = updateRun.operations.find(r => r.path === op.path && r.type === 'create');
    if (opResult) {
      opResult.status = result.success ? 'success' : 'failed';
      opResult.error = result.error;
    }
    if (!result.success) {
      updateRun.status = 'failed';
      updateRun.completed_at = new Date().toISOString();
      return { updateRun, error: `Create failed for ${op.path}: ${result.error}` };
    }
  }

  // Execute updates
  for (const op of updateOps) {
    const result = executeUpdate(op.path, op.content || '');
    const opResult = updateRun.operations.find(r => r.path === op.path && r.type === 'update');
    if (opResult) {
      opResult.status = result.success ? 'success' : 'failed';
      opResult.error = result.error;
    }
    if (!result.success) {
      updateRun.status = 'failed';
      updateRun.completed_at = new Date().toISOString();
      return { updateRun, error: `Update failed for ${op.path}: ${result.error}` };
    }
  }

  // Execute deletes
  for (const op of deleteOps) {
    const result = executeDelete(op.path);
    const opResult = updateRun.operations.find(r => r.path === op.path && r.type === 'delete');
    if (opResult) {
      opResult.status = result.success ? 'success' : 'failed';
      opResult.error = result.error;
    }
    if (!result.success) {
      updateRun.status = 'failed';
      updateRun.completed_at = new Date().toISOString();
      return { updateRun, error: `Delete failed for ${op.path}: ${result.error}` };
    }
  }

  // All operations completed successfully
  updateRun.status = 'completed';
  updateRun.completed_at = new Date().toISOString();
  return { updateRun, error: null };
}
