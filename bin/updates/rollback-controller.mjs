/**
 * RollbackController - OpenCode Global v0.5.0
 *
 * Detects apply failure and executes complete rollback to pre-update state.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, copyFileSync, unlinkSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { gunzipSync } from 'node:zlib';

/**
 * Compute SHA256 hash of a file
 * @param {string} filePath
 * @returns {string}
 */
function computeFileHash(filePath) {
  const content = readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Get rollback plan path for a given run ID
 * @param {string} runId
 * @param {string} journalDir - Base journal directory
 * @returns {string}
 */
function getRollbackPlanPath(runId, journalDir) {
  return join(journalDir, 'rollbacks', `${runId}.json`);
}

/**
 * Get update run path for a given run ID
 * @param {string} runId
 * @param {string} journalDir - Base journal directory
 * @returns {string}
 */
function getUpdateRunPath(runId, journalDir) {
  return join(journalDir, 'update-runs', `${runId}.json`);
}

/**
 * Read and parse JSON file
 * @param {string} filePath
 * @returns {object}
 */
function readJsonFile(filePath) {
  const content = readFileSync(filePath, 'utf8');
  return JSON.parse(content);
}

/**
 * Write JSON file
 * @param {string} filePath
 * @param {object} data
 */
function writeJsonFile(filePath, data) {
  writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * Verify restored file matches expected SHA256
 * @param {string} filePath
 * @param {string} expectedSha256
 * @returns {boolean}
 */
function verifyRestoration(filePath, expectedSha256) {
  if (!existsSync(filePath)) {
    return false;
  }
  const actualSha256 = computeFileHash(filePath);
  return actualSha256 === expectedSha256;
}

/**
 * Get expected SHA256 for a file from backup manifest
 * @param {string} filePath
 * @param {object} backupManifest
 * @returns {string|null}
 */
function getExpectedSha256(filePath, backupManifest) {
  const artifact = backupManifest.artifacts.find(a => a.path === filePath);
  return artifact ? artifact.sha256 : null;
}

/**
 * Check if content appears to be gzip compressed
 * @param {Buffer} content
 * @returns {boolean}
 */
function isGzipped(content) {
  return content.length >= 2 && content[0] === 0x1f && content[1] === 0x8b;
}

/**
 * Execute complete rollback for a failed update run
 *
 * @param {string} runId - The run ID that failed
 * @param {object} backupManifest - The backup manifest from backup-manager
 * @param {object} options - Optional configuration
 * @param {string} options.journalDir - Journal directory (defaults to AI_ENV_HOME/journal or ./journal)
 * @param {boolean} options.skipVerification - Skip SHA256 verification (for testing)
 * @returns {Promise<object>} Rollback result
 */
export async function executeRollback(runId, backupManifest, options = {}) {
  const {
    journalDir = process.env.AI_ENV_HOME ? join(process.env.AI_ENV_HOME, 'journal') : './journal',
    skipVerification = false
  } = options;

  const rollbackPlanPath = getRollbackPlanPath(runId, journalDir);
  const updateRunPath = getUpdateRunPath(runId, journalDir);

  // Step 1: Read rollback-plan for the run
  if (!existsSync(rollbackPlanPath)) {
    return {
      success: false,
      error: `Rollback plan not found: ${rollbackPlanPath}`,
      runId
    };
  }

  const rollbackPlan = readJsonFile(rollbackPlanPath);

  // Step 2: Restore files from backup in reverse order
  const storagePath = backupManifest.storage_path;
  const restoredFiles = [];
  const failedRestorations = [];

  // Process operations in reverse order (LIFO)
  const reversedOperations = [...rollbackPlan.operations].reverse();

  for (const operation of reversedOperations) {
    const { type, path: targetPath, backup_ref } = operation;

    if (type === 'restore') {
      // Restore file from backup
      const backupFilePath = join(storagePath, backup_ref);

      if (!existsSync(backupFilePath)) {
        failedRestorations.push({
          path: targetPath,
          backup_ref,
          error: 'Backup file not found'
        });
        continue;
      }

      try {
        // Ensure target directory exists
        const targetDir = dirname(targetPath);
        if (!existsSync(targetDir)) {
          // Directory was created during apply, that's fine
        }

        // Read backup content and decompress if needed
        let content = readFileSync(backupFilePath);
        if (isGzipped(content)) {
          content = gunzipSync(content);
        }

        // Write restored content
        writeFileSync(targetPath, content);

        // Verify restoration with SHA256 check
        if (!skipVerification) {
          const expectedSha256 = getExpectedSha256(targetPath, backupManifest);
          if (expectedSha256 && !verifyRestoration(targetPath, expectedSha256)) {
            failedRestorations.push({
              path: targetPath,
              backup_ref,
              error: 'SHA256 verification failed'
            });
            continue;
          }
        }

        restoredFiles.push({
          path: targetPath,
          backup_ref,
          status: 'restored'
        });
      } catch (err) {
        failedRestorations.push({
          path: targetPath,
          backup_ref,
          error: err.message
        });
      }
    } else if (type === 'remove') {
      // Remove file that was created during apply
      try {
        if (existsSync(targetPath)) {
          unlinkSync(targetPath);
        }
        restoredFiles.push({
          path: targetPath,
          backup_ref,
          status: 'removed'
        });
      } catch (err) {
        failedRestorations.push({
          path: targetPath,
          backup_ref,
          error: err.message
        });
      }
    }
  }

  // Step 3: Verify restoration
  // If any restorations failed, the rollback is considered incomplete
  const success = failedRestorations.length === 0;

  // Step 4: Update run status to rolled_back
  if (existsSync(updateRunPath)) {
    try {
      const updateRun = readJsonFile(updateRunPath);
      updateRun.status = 'rolled_back';
      updateRun.completed_at = new Date().toISOString();
      updateRun.rollback_id = rollbackPlan.rollback_id;
      writeJsonFile(updateRunPath, updateRun);
    } catch (err) {
      // Non-fatal: run status update failed but rollback itself may have succeeded
    }
  }

  return {
    success,
    runId,
    rollbackId: rollbackPlan.rollback_id,
    restoredFiles,
    failedRestorations,
    completedAt: new Date().toISOString()
  };
}

export default { executeRollback };
