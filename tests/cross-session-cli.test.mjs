import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const cli = join(process.cwd(), 'bin', 'orchestration', 'cross-session-cli.mjs');
function run(root, ...args) {
  const result = spawnSync(process.execPath, [cli, ...args, '--project-root', root], { encoding: 'utf8' });
  return { ...result, json: result.stdout.trim() ? JSON.parse(result.stdout) : null };
}
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'cross-session-')); writeFileSync(join(root, 'one.md'), 'one'); writeFileSync(join(root, 'two.md'), 'two');
  const spec = join(root, 'spec.json'); writeFileSync(spec, JSON.stringify({ version: '1', title: 'Test', repository_id: 'repo', tasks: [
    { key: 'one', title: 'One', instruction_path: 'one.md', read_scope: [], write_scope: [], exclusive_scope: [], depends_on: [] },
    { key: 'two', title: 'Two', instruction_path: 'two.md', read_scope: [], write_scope: [], exclusive_scope: [], depends_on: ['one'] }
  ] }));
  const created = run(root, 'mission-create', '--operation-id', 'run-1', '--at', '2026-01-01T00:00:00.000Z', '--spec', spec);
  assert.equal(created.status, 0);
  return { root, spec, created, mission: join(root, '.opencode', 'missions', 'run-1.json') };
}
function cleanup(t, root) { t.after(() => rmSync(root, { recursive: true, force: true })); }
function assertJsonSuccess(result, command) {
  assert.equal(result.status, 0, result.stderr);
  assert.equal(typeof result.json, 'object');
  assert.equal(result.json.ok, true);
  if (command) assert.equal(result.json.command, command);
}

test('all cross-session commands operate on local mission metadata', t => {
  const { root, spec, mission } = fixture();
  cleanup(t, root);
  assertJsonSuccess(run(root, 'doctor'), 'doctor');
  assertJsonSuccess(run(root, 'doctor', '--ai-env-home', root, '--environment-manifest', spec, '--project-manifest', spec, '--spec', spec), 'doctor');
  assert.equal(run(root, 'mission-status', '--operation-id', 'run-1').json.mission.tasks.length, 2);
  assert.equal(run(root, 'task-plan', '--operation-id', 'run-1', '--task-key', 'one').json.tasks[0].ready, true);
  assert.equal(run(root, 'integration-preflight', '--operation-id', 'run-1', '--task-key', 'one').json.task_completed, false);
  assert.notEqual(run(root, 'integration-apply', '--operation-id', 'run-1', '--task-key', 'one', '--target-repository-id', 'target', '--target-ref', 'main', '--expected-target-commit', '0'.repeat(40)).status, 0);
  assert.equal(run(root, 'task-run', '--operation-id', 'run-1', '--task-key', 'one').json.execution, 'metadata_only');
  const target = join(root, 'target'); mkdirSync(target); const targetFile = join(target, 'unchanged.txt'); writeFileSync(targetFile, 'unchanged');
  const applied = run(root, 'integration-apply', '--operation-id', 'run-1', '--task-key', 'one', '--target-repository-id', target, '--target-ref', 'main', '--expected-target-commit', '0'.repeat(40), '--approve-local-integration');
  assert.equal(applied.status, 0);
  assert.equal(applied.json.integration.action, 'metadata_only_no_repository_modified');
  assert.equal(readFileSync(targetFile, 'utf8'), 'unchanged');
  assert.equal(JSON.parse(readFileSync(mission)).tasks[0].integration.status, 'recorded');
  const record = JSON.parse(readFileSync(mission)); record.tasks[1].status = 'failed'; writeFileSync(mission, JSON.stringify(record));
  assert.equal(run(root, 'recovery-plan', '--operation-id', 'run-1').json.recovery_needed, true);
  assert.deepEqual(run(root, 'recovery-apply', '--operation-id', 'run-1', '--approve-local-integration').json.recovered_tasks, ['two']);
  assert.equal(run(root, 'mission-run', '--operation-id', 'run-1').json.processed_task, 'two');
  assert.equal(JSON.parse(readFileSync(mission)).tasks.every(task => task.status === 'completed'), true);
});
test('dependency errors and mission-run process only one ready task', t => {
  const { root, mission } = fixture();
  cleanup(t, root);
  assert.equal(run(root, 'mission-run', '--operation-id', 'run-1').json.processed_task, 'one');
  assert.equal(JSON.parse(readFileSync(mission)).tasks[1].status, 'pending');
  const record = JSON.parse(readFileSync(mission)); record.tasks[1].depends_on = ['missing']; writeFileSync(mission, JSON.stringify(record));
  assert.notEqual(run(root, 'task-plan', '--operation-id', 'run-1').status, 0);
});

test('doctor rejects invalid supplied paths', t => {
  const root = mkdtempSync(join(tmpdir(), 'cross-session-'));
  cleanup(t, root);
  const result = run(root, 'doctor', '--environment-manifest', join(root, 'missing.json'));
  assert.notEqual(result.status, 0);
  assert.equal(result.json, null);
  assert.match(result.stderr, /environment-manifest path does not exist/);
});

test('every advertised subcommand returns structured JSON with valid arguments', t => {
  const { root, created, mission } = fixture();
  cleanup(t, root);
  const results = [
    ['doctor', run(root, 'doctor')],
    ['mission-create', created],
    ['mission-status', run(root, 'mission-status', '--operation-id', 'run-1')],
    ['task-plan', run(root, 'task-plan', '--operation-id', 'run-1')],
    ['integration-preflight', run(root, 'integration-preflight', '--operation-id', 'run-1', '--task-key', 'one')],
    ['task-run', run(root, 'task-run', '--operation-id', 'run-1', '--task-key', 'one')],
    ['integration-apply', run(root, 'integration-apply', '--operation-id', 'run-1', '--task-key', 'one', '--target-repository-id', 'target', '--target-ref', 'main', '--expected-target-commit', '0'.repeat(40), '--approve-local-integration')],
    ['recovery-plan', run(root, 'recovery-plan', '--operation-id', 'run-1')],
    ['recovery-apply', run(root, 'recovery-apply', '--operation-id', 'run-1', '--approve-local-integration')],
    ['mission-run', run(root, 'mission-run', '--operation-id', 'run-1')]
  ];
  for (const [command, result] of results) assertJsonSuccess(result, command === 'mission-create' ? null : command);
  assert.equal(JSON.parse(readFileSync(mission)).tasks[1].status, 'completed');
});

test('mission-create rejects operation-id traversal and malicious values without writing outside missions', t => {
  const root = mkdtempSync(join(tmpdir(), 'cross-session-'));
  cleanup(t, root);
  const spec = join(root, 'spec.json');
  writeFileSync(spec, JSON.stringify({ version: '1', title: 'Test', repository_id: 'repo', tasks: [{ key: 'one', title: 'One', instruction_path: 'one.md', read_scope: [], write_scope: [], exclusive_scope: [], depends_on: [] }] }));
  for (const operationId of ['../outside', '..\\outside', 'run/child', 'run;rm', 'C:\\outside']) {
    const result = run(root, 'mission-create', '--operation-id', operationId, '--at', '2026-01-01T00:00:00.000Z', '--spec', spec);
    assert.notEqual(result.status, 0, operationId);
  }
  assert.equal(existsSync(join(root, '.opencode')), false);
  assert.equal(existsSync(join(root, 'outside.json')), false);
});

test('mission-run safely fails without modifying blocked or recovery-required missions', t => {
  const { root, mission } = fixture();
  cleanup(t, root);
  for (const status of ['blocked', 'recovery_required']) {
    const record = JSON.parse(readFileSync(mission));
    record.tasks[0].status = status;
    writeFileSync(mission, JSON.stringify(record));
    const before = readFileSync(mission, 'utf8');
    const result = run(root, 'mission-run', '--operation-id', 'run-1');
    assert.notEqual(result.status, 0);
    assert.equal(result.json, null);
    assert.match(result.stderr, new RegExp(`Mission stopped: task 'one' is ${status}`));
    assert.equal(readFileSync(mission, 'utf8'), before);
  }
});
