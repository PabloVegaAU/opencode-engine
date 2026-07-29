#!/usr/bin/node
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SUBCOMMANDS = ['doctor','mission-create','mission-status','task-plan','task-run','integration-preflight','integration-apply','recovery-plan','recovery-apply','mission-run'];

function parseArgs(args) {
  const result = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      if (args[i + 1] && !args[i + 1].startsWith('--')) { result[key] = args[i + 1]; i++; } else { result[key] = true; }
    } else if (arg.startsWith('-')) {
      const key = arg.slice(1);
      if (args[i + 1] && !args[i + 1].startsWith('--')) { result[key] = args[i + 1]; i++; } else { result[key] = true; }
    }
  }
  return result;
}

function validateMissionSpec(spec) {
  const errors = [];
  if (!spec || typeof spec !== 'object') return ['spec is not an object'];
  if (spec.version !== '1') errors.push('version must be 1');
  if (!spec.title || typeof spec.title !== 'string') errors.push('title is required and must be a string');
  if (!spec.repository_id || typeof spec.repository_id !== 'string') errors.push('repository_id is required');
  if (!Array.isArray(spec.tasks) || spec.tasks.length === 0) errors.push('tasks must be a non-empty array');
  if (spec.tasks) { spec.tasks.forEach((task, i) => {
    if (!task.key) errors.push('tasks[' + i + '].key is required');
    if (!task.title) errors.push('tasks[' + i + '].title is required');
    if (!task.instruction_path) errors.push('tasks[' + i + '].instruction_path is required');
    if (!Array.isArray(task.read_scope)) errors.push('tasks[' + i + '].read_scope must be an array');
    if (!Array.isArray(task.write_scope)) errors.push('tasks[' + i + '].write_scope must be an array');
    if (!Array.isArray(task.exclusive_scope)) errors.push('tasks[' + i + '].exclusive_scope must be an array');
    if (!Array.isArray(task.depends_on)) errors.push('tasks[' + i + '].depends_on must be an array');
  }); }
  return errors;
}

function isValidISO(iso) { if (!iso) return false; const d = new Date(iso); return !isNaN(d.getTime()) && d.toISOString().startsWith(iso.slice(0, 10)); }
function isValidOpId(id) { return typeof id === 'string' && id.length >= 3 && id.length <= 64; }

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) { console.log('OpenCode Cross-Session CLI v0.6.0'); console.log('Subcommands:', SUBCOMMANDS.join(', ')); process.exit(0); }
  const subcommand = args[0];
  if (!SUBCOMMANDS.includes(subcommand)) { console.error('Error: Unknown subcommand:', subcommand); process.exit(1); }
  if (subcommand === 'mission-create') {
    const opts = parseArgs(args.slice(1));
    if (!opts['operation-id']) { console.error('Error: --operation-id is required'); process.exit(1); }
    if (!opts.at) { console.error('Error: --at is required'); process.exit(1); }
    if (!opts.spec) { console.error('Error: --spec is required'); process.exit(1); }
    const { 'operation-id': operationId, at, spec: specPath } = opts;
    if (!isValidOpId(operationId)) { console.error('Error: --operation-id must be 3-64 chars'); process.exit(1); }
    if (!isValidISO(at)) { console.error('Error: --at must be a valid ISO 8601 UTC timestamp'); process.exit(1); }
    if (!existsSync(specPath)) { console.error('Error: Spec file not found:', specPath); process.exit(1); }
    let spec;
    try { const raw = readFileSync(specPath, 'utf8'); spec = JSON.parse(raw); }
    catch (e) { console.error('Error: Failed to read/parse spec file:', e.message); process.exit(1); }
    const errors = validateMissionSpec(spec);
    if (errors.length > 0) { console.error('Error: Invalid mission spec:'); errors.forEach(e => console.error('  -', e)); process.exit(1); }
    const mission = { version: 1, operation_id: operationId, repository_id: spec.repository_id, title: spec.title, status: 'created', created_at: new Date().toISOString(), scheduled_at: at, spec_path: specPath, tasks: spec.tasks.map(t => ({ key: t.key, title: t.title, status: 'pending', depends_on: t.depends_on })) };
    const projectRoot = opts['project-root'] || process.cwd();
    const missionsDir = join(projectRoot, '.opencode', 'missions');
    const missionPath = join(missionsDir, operationId + '.json');
    try { if (!existsSync(missionsDir)) { mkdirSync(missionsDir, { recursive: true }); } writeFileSync(missionPath, JSON.stringify(mission, null, 2), 'utf8'); }
    catch (e) { console.error('Error: Failed to write mission record:', e.message); process.exit(1); }
    console.log(JSON.stringify({ ok: true, mission_path: missionPath, operation_id: operationId, repository_id: spec.repository_id, title: spec.title, task_count: spec.tasks.length, scheduled_at: at, status: 'created' }, null, 2));
    process.exit(0);
  }
  console.error('Error: Cross-Session CLI subcommand:', subcommand, 'is not implemented.');
  console.error('This feature is planned for a future release.');
  process.exit(1);
}
main();
