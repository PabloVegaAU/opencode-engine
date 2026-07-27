#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { classifyEnvironment } from './ownership-classifier.mjs';
import { generateUpdatePlan } from './update-planner.mjs';
import { createBackup, verifyBackup } from './backup-manager.mjs';
import { executeApply } from './apply-executor.mjs';
import { executeRollback } from './rollback-controller.mjs';
import { writeJournalEntry } from './journal-writer.mjs';
import { normalizeRelativePath, requireAbsoluteRoot } from './path-safety.mjs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function args(raw){const out={_:[]};for(let i=0;i<raw.length;i++){if(raw[i].startsWith('--')){if(!raw[i+1]||raw[i+1].startsWith('--'))throw Error(`Missing value for ${raw[i]}`);out[raw[i].slice(2)]=raw[++i];}else out._.push(raw[i]);}return out;}
function json(path){return JSON.parse(readFileSync(path,'utf8'));} function out(value){process.stdout.write(`${JSON.stringify(value)}\n`);}
function safePlan(plan){
 if(!uuid.test(plan.plan_id)||plan.requires_approval!==true||!Number.isInteger(plan.blocked_count)||plan.blocked_count<0) throw Error('Invalid plan');
 if(plan.blocked_count||plan.operations.some(o=>o.type==='block')) throw Error('Blocked plan cannot be applied');
 for(const op of plan.operations){normalizeRelativePath(op.path);const category=plan.classifications[op.path];if(!['global-managed'].includes(category)&&['create','update','delete'].includes(op.type))throw Error('Ownership does not permit mutation');if(['create','update'].includes(op.type)&&typeof op.content!=='string')throw Error('Create/update requires content');if(op.type==='delete'&&!op.migration_id)throw Error('Delete requires migration ID');}
}
async function main(){const a=args(process.argv.slice(2)), command=a._[0]; if(!['inspect','plan','apply','rollback'].includes(command))throw Error('Usage: update-cli.mjs <inspect|plan|apply|rollback> with explicit arguments');
 const root=requireAbsoluteRoot(a['ai-env-home'],'AI_ENV_HOME'); const journal=join(root,'journal');
 if(command==='inspect'){if(!a.policy)throw Error('--policy required');const result=classifyEnvironment(root,a.policy);if(result.error)throw Error(result.error);if(!/^1(?:\.0){0,2}$/.test(String(result.policy_version)))throw Error('Unsupported ownership policy version');return out(result);}
 if(command==='plan'){for(const n of ['policy','catalog','source-version','target-version'])if(!a[n])throw Error(`--${n} required`);const classified=classifyEnvironment(root,a.policy);if(classified.error)throw Error(classified.error);if(!/^1(?:\.0){0,2}$/.test(String(classified.policy_version)))throw Error('Unsupported ownership policy version');const catalog=json(a.catalog);if(!/^1(?:\.0){0,2}$/.test(String(catalog.version))||!Array.isArray(catalog.migrations))throw Error('Unsupported migration catalog version');const desired=a.desired?json(a.desired):{};out(generateUpdatePlan(classified.classification_map,a['source-version'],a['target-version'],catalog,desired));return;}
 if(command==='apply'){if(!a['plan-id']||!a['approve-plan-id']||a['plan-id']!==a['approve-plan-id']||!uuid.test(a['plan-id']))throw Error('Apply requires matching --plan-id and --approve-plan-id UUID');const plan=json(join(root,'plans',`${a['plan-id']}.json`));safePlan(plan);const targets=plan.operations.filter(o=>['update','delete'].includes(o.type)).map(o=>o.path);const backup=await createBackup(plan.plan_id,targets,join(root,'backups'),root);if(!verifyBackup(backup,root))throw Error('Backup verification failed');const result=await executeApply(plan,backup,randomUUID(),{environmentRoot:root});mkdirSync(join(journal,'update-runs'),{recursive:true});writeFileSync(join(journal,'update-runs',`${result.updateRun.run_id}.json`),JSON.stringify(result.updateRun,null,2));writeJournalEntry({event:'apply',plan_id:plan.plan_id,approved_plan_id:a['approve-plan-id'],backup_id:backup.backup_id,status:result.updateRun.status},journal);out({...result,backup_id:backup.backup_id});return;}
 if(!a['run-id']||!uuid.test(a['run-id']))throw Error('Rollback requires --run-id UUID');const run=json(join(journal,'update-runs',`${a['run-id']}.json`));const manifest=json(join(root,run.backup_manifest_path,'backup-manifest.json'));const result=await executeRollback(a['run-id'],manifest,{environmentRoot:root,journalDir:journal});writeJournalEntry({event:'rollback',run_id:a['run-id'],status:result.success?'completed':'failed'},journal);out(result);
}
main().catch(error=>{process.stderr.write(`update-cli: ${error.message}\n`);process.exitCode=1;});
