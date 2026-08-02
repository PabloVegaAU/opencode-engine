#!/usr/bin/node
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, unlinkSync, realpathSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative, isAbsolute } from 'node:path';

const SUBCOMMANDS = ['doctor', 'mission-create', 'mission-status', 'task-plan', 'task-run', 'integration-preflight', 'integration-apply', 'recovery-plan', 'recovery-apply', 'mission-run', 'mission-loop'];
const TASK_STATES = new Set(['pending', 'running', 'completed', 'blocked', 'failed', 'recovery_required']);

class CliError extends Error {}

function parseArgs(args) {
  const result = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('-')) continue;
    const key = arg.replace(/^-{1,2}/, '');
    // Alias --mission to --operation-id for ergonomics
    if (key === 'mission') { result['operation-id'] = args[++i]; continue; }
    if (args[i + 1] && !args[i + 1].startsWith('-')) result[key] = args[++i];
    else result[key] = true;
  }
  return result;
}

function validateMissionSpec(spec) {
  const errors = [];
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return ['spec is not an object'];
  if (spec.version !== '1') errors.push('version must be 1');
  if (!spec.title || typeof spec.title !== 'string') errors.push('title is required and must be a string');
  if (!spec.repository_id || typeof spec.repository_id !== 'string') errors.push('repository_id is required');
  if (!Array.isArray(spec.tasks) || spec.tasks.length === 0) errors.push('tasks must be a non-empty array');
  const keys = new Set();
  for (const [i, task] of (spec.tasks || []).entries()) {
    if (!task || typeof task !== 'object') { errors.push(`tasks[${i}] must be an object`); continue; }
    for (const field of ['key', 'title', 'instruction_path']) if (!task[field] || typeof task[field] !== 'string') errors.push(`tasks[${i}].${field} is required`);
    for (const field of ['read_scope', 'write_scope', 'exclusive_scope', 'depends_on']) if (!Array.isArray(task[field])) errors.push(`tasks[${i}].${field} must be an array`);
    if (task.key && keys.has(task.key)) errors.push(`tasks[${i}].key is duplicated: ${task.key}`);
    keys.add(task.key);
  }
  return errors;
}

function isValidISO(iso) { const date = new Date(iso); return typeof iso === 'string' && !Number.isNaN(date.getTime()) && date.toISOString().startsWith(iso.slice(0, 10)); }
function isValidOpId(id) { return typeof id === 'string' && /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/i.test(id); }
function now() { return new Date().toISOString(); }
function fail(message) { throw new CliError(message); }
function required(opts, name) { if (!opts[name] || opts[name] === true) fail(`--${name} is required`); return opts[name]; }
function projectRoot(opts) { const root = resolve(opts['project-root'] || process.cwd()); if (!existsSync(root) || !statSync(root).isDirectory()) fail(`Project root not found or not a directory: ${root}`); return root; }
function missionPath(root, operationId) { return join(root, '.opencode', 'missions', `${operationId}.json`); }
function readJson(path, label) { try { return JSON.parse(readFileSync(path, 'utf8')); } catch (error) { fail(`Failed to read/parse ${label}: ${error.message}`); } }
function loadMission(opts) {
  const operationId = required(opts, 'operation-id');
  if (!isValidOpId(operationId)) fail('--operation-id must be 3-64 portable characters');
  const root = projectRoot(opts); const path = missionPath(root, operationId);
  if (!existsSync(path)) fail(`Mission file not found: ${path}`);
  const mission = readJson(path, 'mission file');
  if (!mission || !Array.isArray(mission.tasks)) fail('Mission file is invalid: tasks must be an array');
  for (const task of mission.tasks) if (!task || !task.key || !TASK_STATES.has(task.status)) fail('Mission file contains an invalid task state');
  return { root, path, mission };
}
function atomicWriteJson(path, value) {
  const temp = `${path}.${process.pid}.tmp`;
  try { writeFileSync(temp, JSON.stringify(value, null, 2), 'utf8'); renameSync(temp, path); }
  catch (error) { try { if (existsSync(temp)) unlinkSync(temp); } catch {} fail(`Failed to atomically write mission record: ${error.message}`); }
}
function graphErrors(mission) {
  const byKey = new Map(mission.tasks.map(task => [task.key, task])); const errors = [];
  for (const task of mission.tasks) for (const dependency of (task.depends_on || [])) if (!byKey.has(dependency)) errors.push(`Task '${task.key}' depends on missing task '${dependency}'`);
  const visiting = new Set(), visited = new Set();
  function visit(key) {
    if (visiting.has(key)) { errors.push(`Dependency cycle detected at task '${key}'`); return; }
    if (visited.has(key)) return;
    visited.add(key); visiting.add(key);
    for (const dependency of (byKey.get(key).depends_on || [])) if (byKey.has(dependency)) visit(dependency);
    visiting.delete(key);
  }
  for (const task of mission.tasks) visit(task.key);
  return [...new Set(errors)];
}
function requireValidGraph(mission) { const errors = graphErrors(mission); if (errors.length) fail(errors.join('; ')); }
function taskFor(mission, key) { const task = mission.tasks.find(item => item.key === key); if (!task) fail(`Task not found: ${key}`); return task; }
function taskReadiness(mission, task) {
  const byKey = new Map(mission.tasks.map(item => [item.key, item]));
  const dependencies = (task.depends_on || []).map(key => ({ key, status: byKey.get(key)?.status || 'missing', completed: byKey.get(key)?.status === 'completed' }));
  return { ready: task.status === 'pending' && dependencies.every(item => item.completed), dependencies };
}
function instructionExistsWithinRoot(root, instructionPath) {
  if (typeof instructionPath !== 'string' || !instructionPath || isAbsolute(instructionPath)) return false;
  const rootReal = realpathSync(root); const candidate = resolve(rootReal, instructionPath);
  if (relative(rootReal, candidate).startsWith('..') || isAbsolute(relative(rootReal, candidate)) || !existsSync(candidate)) return false;
  try { const actual = realpathSync(candidate); return !relative(rootReal, actual).startsWith('..') && !isAbsolute(relative(rootReal, actual)) && statSync(actual).isFile(); } catch { return false; }
}
function updateTaskRun(root, path, mission, task) {
  requireValidGraph(mission);
  const readiness = taskReadiness(mission, task);
  if (task.status !== 'pending') fail(`Task '${task.key}' is not pending (current state: ${task.status})`);
  if (!readiness.dependencies.every(dependency => dependency.completed)) {
    task.status = 'blocked'; task.blocked_at = now(); task.block_reason = 'Dependencies are not completed'; atomicWriteJson(path, mission);
    fail(`Task '${task.key}' is blocked because dependencies are not completed`);
  }
  if (!instructionExistsWithinRoot(root, task.instruction_path)) {
    task.status = 'blocked'; task.blocked_at = now(); task.block_reason = 'instruction_path is missing or outside project root'; atomicWriteJson(path, mission);
    fail(`Task '${task.key}' instruction_path does not exist within project root`);
  }
  task.status = 'running'; task.started_at = now(); atomicWriteJson(path, mission);
  task.status = 'completed'; task.completed_at = now(); task.execution = { mode: 'metadata_only', instruction_executed: false }; atomicWriteJson(path, mission);
  return task;
}
function taskView(mission, task) { return { key: task.key, title: task.title, status: task.status, ...taskReadiness(mission, task) }; }

function doctor(opts) {
  const paths = [['ai_env_home', 'ai-env-home', false, false], ['project_root', 'project-root', true, false], ['environment_manifest', 'environment-manifest', false, true], ['project_manifest', 'project-manifest', false, true], ['spec', 'spec', false, true]];
  const diagnostics = {};
  for (const [outputKey, option, directory, jsonFile] of paths) {
    if (!opts[option]) { diagnostics[outputKey] = { supplied: false }; continue; }
    const path = resolve(opts[option]);
    if (!existsSync(path)) fail(`Supplied --${option} path does not exist: ${path}`);
    if (directory && !statSync(path).isDirectory()) fail(`Supplied --${option} must be a directory: ${path}`);
    const detail = { supplied: true, path, exists: true };
    if (jsonFile) {
      if (!statSync(path).isFile()) fail(`Supplied --${option} must be a JSON file: ${path}`);
      readJson(path, `supplied --${option}`); detail.valid_json = true;
    }
    diagnostics[outputKey] = detail;
  }
  const root = opts['project-root'] ? resolve(opts['project-root']) : resolve(process.cwd());
  const missions = join(root, '.opencode', 'missions');
  return { ok: true, command: 'doctor', diagnostics, project: { root, exists: existsSync(root), missions_directory: missions, missions_directory_exists: existsSync(missions) } };
}
function create(opts) {
  const operationId = required(opts, 'operation-id'), at = required(opts, 'at'), specPath = required(opts, 'spec');
  if (!isValidOpId(operationId)) fail('--operation-id must be 3-64 chars'); if (!isValidISO(at)) fail('--at must be a valid ISO 8601 UTC timestamp'); if (!existsSync(specPath)) fail(`Spec file not found: ${specPath}`);
  const spec = readJson(specPath, 'spec file'); const errors = validateMissionSpec(spec); if (errors.length) fail(`Invalid mission spec: ${errors.join('; ')}`);
  const root = projectRoot(opts), directory = join(root, '.opencode', 'missions'), path = missionPath(root, operationId);
  const mission = { version: 1, operation_id: operationId, repository_id: spec.repository_id, title: spec.title, status: 'created', created_at: now(), scheduled_at: at, spec_path: specPath, tasks: spec.tasks.map(task => ({ ...task, status: 'pending' })) };
  try { if (!existsSync(directory)) mkdirSync(directory, { recursive: true }); atomicWriteJson(path, mission); } catch (error) { if (error instanceof CliError) throw error; fail(`Failed to write mission record: ${error.message}`); }
  return { ok: true, mission_path: path, operation_id: operationId, repository_id: spec.repository_id, title: spec.title, task_count: spec.tasks.length, scheduled_at: at, status: 'created' };
}
function main() {
  const args = process.argv.slice(2);
  if (!args.length || args.includes('--help') || args.includes('-h')) return { ok: true, command: 'help', subcommands: SUBCOMMANDS };
  const command = args[0]; if (!SUBCOMMANDS.includes(command)) fail(`Unknown subcommand: ${command}`);
  const opts = parseArgs(args.slice(1));
  if (command === 'doctor') return doctor(opts);
  if (command === 'mission-create') return create(opts);
  const loaded = loadMission(opts); const { root, path, mission } = loaded;
  if (command === 'mission-status') return { ok: true, command, mission };
  if (command === 'task-plan') { requireValidGraph(mission); const key = opts['task-key']; return { ok: true, command, operation_id: mission.operation_id, tasks: key ? [taskView(mission, taskFor(mission, key))] : mission.tasks.map(task => taskView(mission, task)) }; }
  if (command === 'recovery-plan') { const recoveryTasks = mission.tasks.filter(item => item.status !== 'completed'); return { ok: true, command, operation_id: mission.operation_id, recovery_needed: recoveryTasks.some(item => ['failed', 'blocked', 'recovery_required'].includes(item.status)), tasks: recoveryTasks.map(item => taskView(mission, item)) }; }
  if (command === 'recovery-apply') {
    if (opts['approve-local-integration'] !== true) fail('--approve-local-integration is required');
    const recovered = []; for (const item of mission.tasks) if (['failed', 'blocked', 'recovery_required'].includes(item.status)) { const from = item.status; item.status = 'pending'; item.recovery = { recovered_at: now(), previous_status: from }; recovered.push(item.key); }
    if (recovered.length) atomicWriteJson(path, mission); return { ok: true, command, operation_id: mission.operation_id, recovered_tasks: recovered };
  }
  if (command === 'mission-run') {
    requireValidGraph(mission);
    const stopped = mission.tasks.find(item => ['blocked', 'failed', 'recovery_required'].includes(item.status));
    if (stopped) fail(`Mission stopped: task '${stopped.key}' is ${stopped.status}`);
    const ready = mission.tasks.find(item => taskReadiness(mission, item).ready);
    if (!ready) return { ok: true, command, operation_id: mission.operation_id, processed_task: null, status: 'no_ready_tasks' };
    const completed = updateTaskRun(root, path, mission, ready); return { ok: true, command, operation_id: mission.operation_id, processed_task: completed.key, status: completed.status, execution: 'metadata_only' };
  }
  if (command === 'mission-loop') {
    // mission-loop: run mission-run repeatedly until all tasks complete or limits reached
    // NOTE: Uses synchronous iteration. For polling with delays, use an external loop or wrapper script.
    const maxIterations = parseInt(opts['max-iterations'] || '10', 10);
    const timeout = parseInt(opts['timeout'] || '300', 10);
    const startTime = Date.now();

    requireValidGraph(mission);
    const stopped = mission.tasks.find(item => ['blocked', 'failed', 'recovery_required'].includes(item.status));
    if (stopped) return { ok: true, command, operation_id: mission.operation_id, iterations: 0, status: stopped.status, stopped_task: stopped.key, reason: `Task '${stopped.key}' is ${stopped.status}` };

    const iterations = [];
    let iterCount = 0;

    while (iterCount < maxIterations) {
      // Check timeout
      const elapsed = (Date.now() - startTime) / 1000;
      if (elapsed >= timeout) {
        return { ok: true, command, operation_id: mission.operation_id, iterations: iterCount, status: 'timeout', elapsed_seconds: Math.round(elapsed), timed_out: true, tasks_completed: mission.tasks.filter(t => t.status === 'completed').length, total_tasks: mission.tasks.length };
      }

      // Re-load mission to get fresh state
      const freshMission = readJson(path, 'mission file');
      const allCompleted = freshMission.tasks.every(t => t.status === 'completed');
      if (allCompleted) {
        return { ok: true, command, operation_id: mission.operation_id, iterations: iterCount, status: 'all_completed', elapsed_seconds: Math.round((Date.now() - startTime) / 1000), tasks_completed: freshMission.tasks.length, total_tasks: freshMission.tasks.length, completed_tasks: freshMission.tasks.map(t => ({ key: t.key, title: t.title, completed_at: t.completed_at })) };
      }

      const blockedTask = freshMission.tasks.find(t => ['blocked', 'failed', 'recovery_required'].includes(t.status));
      if (blockedTask) {
        return { ok: true, command, operation_id: mission.operation_id, iterations: iterCount, status: blockedTask.status, stopped_task: blockedTask.key, reason: `Task '${blockedTask.key}' is ${blockedTask.status}`, elapsed_seconds: Math.round((Date.now() - startTime) / 1000), tasks_completed: freshMission.tasks.filter(t => t.status === 'completed').length, total_tasks: freshMission.tasks.length };
      }

      const readyTask = freshMission.tasks.find(t => taskReadiness(freshMission, t).ready);
      if (!readyTask) {
        return { ok: true, command, operation_id: mission.operation_id, iterations: iterCount, status: 'no_ready_tasks', elapsed_seconds: Math.round((Date.now() - startTime) / 1000), tasks_completed: freshMission.tasks.filter(t => t.status === 'completed').length, total_tasks: freshMission.tasks.length };
      }

      iterCount++;
      // Use a fresh load for each iteration to avoid stale state
      try {
        const iterMission = readJson(path, 'mission file');
        const iterReady = iterMission.tasks.find(t => taskReadiness(iterMission, t).ready);
        if (iterReady) {
          updateTaskRun(root, path, iterMission, iterReady);
          iterations.push({ iteration: iterCount, processed_task: iterReady.key, task_title: iterReady.title, status: 'completed', at: now() });
        }
      } catch (err) {
        iterations.push({ iteration: iterCount, processed_task: readyTask.key, status: 'error', error: err.message });
        return { ok: true, command, operation_id: mission.operation_id, iterations: iterCount, status: 'error', error: err.message, elapsed_seconds: Math.round((Date.now() - startTime) / 1000), tasks_completed: freshMission.tasks.filter(t => t.status === 'completed').length, total_tasks: freshMission.tasks.length, iteration_log: iterations };
      }
    }

    // Max iterations reached
    const finalMission = readJson(path, 'mission file');
    return { ok: true, command, operation_id: mission.operation_id, iterations: iterCount, status: 'max_iterations_reached', elapsed_seconds: Math.round((Date.now() - startTime) / 1000), timed_out: false, tasks_completed: finalMission.tasks.filter(t => t.status === 'completed').length, total_tasks: finalMission.tasks.length, iteration_log: iterations };
  }
  const key = required(opts, 'task-key'); const task = taskFor(mission, key);
  if (command === 'task-run') { const completed = updateTaskRun(root, path, mission, task); return { ok: true, command, operation_id: mission.operation_id, task: taskView(mission, completed), execution: 'metadata_only' }; }
  if (command === 'integration-preflight') return { ok: true, command, operation_id: mission.operation_id, task: taskView(mission, task), task_completed: task.status === 'completed', integration_input_requirements: ['target-repository-id', 'target-ref', 'expected-target-commit', 'approve-local-integration'] };
  if (command === 'integration-apply') {
    for (const name of ['target-repository-id', 'target-ref', 'expected-target-commit']) required(opts, name);
    if (opts['approve-local-integration'] !== true) fail('--approve-local-integration is required');
    if (task.status !== 'completed') fail(`Task '${task.key}' must be completed before integration metadata can be recorded`);
    task.integration = { status: 'recorded', target_repository_id: opts['target-repository-id'], target_ref: opts['target-ref'], expected_target_commit: opts['expected-target-commit'], approved_at: now(), action: 'metadata_only_no_repository_modified' }; atomicWriteJson(path, mission);
    return { ok: true, command, operation_id: mission.operation_id, task_key: task.key, integration: task.integration };
  }
  fail(`Unhandled subcommand: ${command}`);
}

try { console.log(JSON.stringify(main(), null, 2)); } catch (error) { console.error(`Error: ${error.message}`); process.exitCode = 1; }
