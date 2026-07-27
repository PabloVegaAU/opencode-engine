/**
 * BackupManager - OpenCode Global v0.5.0
 *
 * Creates point-in-time snapshots with backup manifest generation.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

/**
 * Generate a UUID v4 string
 * @returns {string}
 */
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Create a point-in-time backup
 * @param {string} planId - UUID of the plan this backup is for
 * @param {string[]} artifactsToBackup - Array of file paths to backup
 * @param {string} backupBaseDir - Base directory for backups (e.g., AI_ENV_HOME/backups)
 * @returns {Promise<object>} Backup manifest matching backup-manifest.schema.json
 */
export async function createBackup(planId, artifactsToBackup, backupBaseDir) {
  const { gzipSync } = await import('node:zlib');

  const backupId = generateUUID();
  const createdAt = new Date().toISOString();

  // Create timestamped backup directory
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = join(backupBaseDir, timestamp);
  mkdirSync(backupDir, { recursive: true });

  const artifacts = [];

  for (const artifactPath of artifactsToBackup) {
    if (!existsSync(artifactPath)) {
      throw new Error(`Artifact not found: ${artifactPath}`);
    }

    const stats = statSync(artifactPath);
    const content = readFileSync(artifactPath);

    // Compute hash of original content
    const hash = createHash('sha256').update(content).digest('hex');

    // Determine if compression should be applied
    // Compress if file is larger than 1KB and compression reduces size
    let artifactContent = content;
    let compressed = false;

    if (stats.size > 1024) {
      try {
        const compressedContent = gzipSync(content);
        if (compressedContent.length < content.length) {
          artifactContent = compressedContent;
          compressed = true;
        }
      } catch {
        // Compression failed, use original
      }
    }

    // Write the artifact (compressed or original)
    const fileName = basename(artifactPath);
    const backupPath = join(backupDir, fileName);
    writeFileSync(backupPath, artifactContent);

    artifacts.push({
      path: artifactPath,
      sha256: hash,
      size: stats.size,
      mtime: stats.mtime.toISOString()
    });
  }

  const manifest = {
    backup_id: backupId,
    created_at: createdAt,
    plan_id: planId,
    artifacts,
    storage_path: backupDir
  };

  // Write manifest file
  const manifestPath = join(backupDir, 'backup-manifest.json');
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  return manifest;
}

/**
 * Get default backup base directory (AI_ENV_HOME/backups)
 * @returns {string|null}
 */
export function getDefaultBackupDir() {
  const envHome = process.env.AI_ENV_HOME || process.env.OPENCODE_ENV_HOME;
  if (!envHome) return null;
  return join(envHome, 'backups');
}

export default { createBackup, getDefaultBackupDir };
