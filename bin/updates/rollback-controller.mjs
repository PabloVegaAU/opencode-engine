import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { resolveSafePath, requireAbsoluteRoot } from './path-safety.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export async function executeRollback(runId, manifest, options = {}) {
 if (!options.environmentRoot && !process.env.AI_ENV_HOME) {
  const journal=options.journalDir || './journal', planPath=join(journal,'rollbacks',`${runId}.json`);
  if(!existsSync(planPath)) return {success:false,error:`Rollback plan not found: ${planPath}`,runId};
  const rollback=JSON.parse(readFileSync(planPath,'utf8')); const restoredFiles=[],failedRestorations=[];
  for(const op of [...rollback.operations].reverse()) try { if(op.type==='remove'){if(existsSync(op.path))unlinkSync(op.path);restoredFiles.push({path:op.path,status:'removed'});continue;} const bytes=readFileSync(join(manifest.storage_path,op.backup_ref));mkdirSync(dirname(op.path),{recursive:true});writeFileSync(op.path,bytes);restoredFiles.push({path:op.path,status:'restored'}); } catch(error){failedRestorations.push({path:op.path,error:error.message});}
  return {success:!failedRestorations.length,runId,rollbackId:rollback.rollback_id,restoredFiles,failedRestorations,completedAt:new Date().toISOString()};
 }
 const root=requireAbsoluteRoot(options.environmentRoot || process.env.AI_ENV_HOME, 'AI_ENV_HOME'); const journal=options.journalDir || join(root,'journal');
 const rollback=JSON.parse(readFileSync(join(journal,'rollbacks',`${runId}.json`),'utf8')); const storage=resolveSafePath(root,manifest.storage_path,{allowMissing:false}).path;
 const restored=[], failed=[];
 for(const op of [...rollback.operations].reverse()) try {
  const target=resolveSafePath(root,op.path).path;
  if(op.type==='remove'){if(existsSync(target))unlinkSync(target); restored.push({path:op.path,status:'removed'});continue;}
  const artifact=manifest.artifacts.find(a=>a.path===op.path); if(!artifact)throw new Error('Backup reference missing');
  const bytes=readFileSync(resolveSafePath(storage,op.backup_ref,{allowMissing:false}).path); if(bytes.length!==artifact.bytes||digest(bytes)!==artifact.sha256)throw new Error('Backup verification failed');
  mkdirSync(dirname(target),{recursive:true});writeFileSync(target,bytes);restored.push({path:op.path,status:'restored'});
 } catch(error){failed.push({path:op.path,error:error.message});}
 return {success:!failed.length,runId,rollbackId:rollback.rollback_id,restoredFiles:restored,failedRestorations:failed,completedAt:new Date().toISOString()};
}
