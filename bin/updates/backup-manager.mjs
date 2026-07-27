import { createHash, randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeRelativePath, requireAbsoluteRoot, resolveSafePath } from './path-safety.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export function getDefaultBackupDir() { const home = process.env.AI_ENV_HOME || process.env.OPENCODE_ENV_HOME; return home ? join(home, 'backups') : null; }

/** Creates an uncompressed, hierarchy-preserving snapshot. */
export async function createBackup(planId, artifactPaths, backupBaseDir, environmentRoot) {
  // Compatibility for the pre-v0.6 module API. Runtime callers always supply
  // environmentRoot and therefore never persist this legacy absolute-path form.
  if (!environmentRoot && !process.env.AI_ENV_HOME && artifactPaths.every(p => typeof p === 'string' && (p.includes('\\') || p.startsWith('/')))) {
    const storage = join(backupBaseDir, randomUUID()); mkdirSync(storage, { recursive: true }); const artifacts=[];
    for (const source of artifactPaths) { if(!existsSync(source)) throw new Error(`Artifact not found: ${source}`); const bytes=readFileSync(source), stat=statSync(source), name=source.split(/[\\/]/).pop(); copyFileSync(source,join(storage,name)); artifacts.push({path:source,sha256:hash(bytes),size:bytes.length,mtime:stat.mtime.toISOString()}); }
    const manifest={backup_id:randomUUID(),created_at:new Date().toISOString(),plan_id:planId,artifacts,storage_path:storage};writeFileSync(join(storage,'backup-manifest.json'),JSON.stringify(manifest,null,2));return manifest;
  }
  const root = requireAbsoluteRoot(environmentRoot || process.env.AI_ENV_HOME, 'AI_ENV_HOME');
  const base = requireAbsoluteRoot(backupBaseDir || join(root, 'backups'), 'backup base');
  const backupId = randomUUID();
  const storagePath = `backups/${backupId}`;
  const storage = join(root, storagePath);
  mkdirSync(join(storage, 'artifacts'), { recursive: true });
  const artifacts = [];
  for (const raw of artifactPaths) {
    const relativePath = normalizeRelativePath(raw);
    const source = resolveSafePath(root, relativePath, { allowMissing: false }).path;
    if (!existsSync(source)) throw new Error(`Artifact not found: ${relativePath}`);
    const bytes = readFileSync(source); const stat = statSync(source);
    const backup_ref = `artifacts/${relativePath}`;
    const destination = resolveSafePath(storage, backup_ref).path;
    mkdirSync(join(destination, '..'), { recursive: true }); copyFileSync(source, destination);
    artifacts.push({ path: relativePath, backup_ref, sha256: hash(bytes), bytes: bytes.length, size: bytes.length, mtime: stat.mtime.toISOString() });
  }
  const manifest = { backup_id: backupId, created_at: new Date().toISOString(), plan_id: planId, artifacts, storage_path: storagePath };
  writeFileSync(join(storage, 'backup-manifest.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}

export function verifyBackup(manifest, environmentRoot) {
  const root = requireAbsoluteRoot(environmentRoot, 'AI_ENV_HOME');
  const storage = resolveSafePath(root, manifest.storage_path, { allowMissing: false }).path;
  return manifest.artifacts.every(item => {
    try { const bytes = readFileSync(resolveSafePath(storage, item.backup_ref, { allowMissing: false }).path); return bytes.length === item.bytes && hash(bytes) === item.sha256; } catch { return false; }
  });
}
