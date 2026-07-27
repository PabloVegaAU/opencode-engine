import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { resolveSafePath, requireAbsoluteRoot } from './path-safety.mjs';

function atomicWrite(path, content) { const tmp = `${path}.tmp.${randomUUID()}`; try { writeFileSync(tmp, content, 'utf8'); renameSync(tmp, path); } finally { if (existsSync(tmp)) unlinkSync(tmp); } }
function cleanupEmptyParents(path, root) { for (let dir = dirname(path); dir !== root; dir = dirname(dir)) { try { rmdirSync(dir); } catch { break; } } }
export function createUpdateRun(runId, planId, operations, backupManifestPath = null, journalEntryId = randomUUID()) {
 return { run_id: runId, plan_id: planId, started_at: new Date().toISOString(), completed_at: null, status: 'in_progress', operations: operations.map(o => ({ type:o.type,path:o.path,status:'pending',error:null })), backup_manifest_path: backupManifestPath, journal_entry_id: journalEntryId, rollback_id: null };
}
/** Transactional executor. operations must already have passed approval and policy validation. */
export async function executeApply(plan, backupManifest, runId = randomUUID(), options = {}) {
 const root = requireAbsoluteRoot(options.environmentRoot || process.env.AI_ENV_HOME, 'AI_ENV_HOME');
 const run = createUpdateRun(runId, plan.plan_id, plan.operations, backupManifest?.storage_path || null);
 const changed = [];
 const rollback = () => { for (const item of changed.reverse()) { try { if (item.existed) { mkdirSync(dirname(item.path), {recursive:true}); atomicWrite(item.path, item.bytes); } else { if (existsSync(item.path)) unlinkSync(item.path); cleanupEmptyParents(item.path, root); } } catch { /* caller receives failed rollback status */ } } };
 try {
  for (let index=0; index<plan.operations.length; index++) {
   const op=plan.operations[index], status=run.operations[index];
   if (op.type === 'preserve') { status.status='success'; continue; }
   if (!['create','update','delete'].includes(op.type)) throw new Error(`Unsafe operation ${op.type}`);
   const target=resolveSafePath(root, op.path).path, existed=existsSync(target);
   if ((op.type==='create' && existed) || (op.type==='update' && !existed)) throw new Error(`Precondition failed for ${op.path}`);
   if ((op.type==='create'||op.type==='update') && typeof op.content !== 'string') throw new Error(`Missing content for ${op.path}`);
   changed.push({path:target, existed, bytes: existed ? readFileSync(target) : null});
   if (op.type==='delete') unlinkSync(target); else { mkdirSync(dirname(target), {recursive:true}); atomicWrite(target, op.content); }
   status.status='success';
  }
  run.status='completed'; run.completed_at=new Date().toISOString(); return { updateRun:run,error:null };
 } catch (error) {
  const failed=run.operations.find(o=>o.status==='pending'); if(failed){failed.status='failed';failed.error=error.message;}
  rollback(); run.status='rolled_back'; run.completed_at=new Date().toISOString(); run.rollback_id=randomUUID();
  for(const item of run.operations) if(item.status==='success') item.status='rolled_back';
  return { updateRun:run,error:error.message };
 }
}
