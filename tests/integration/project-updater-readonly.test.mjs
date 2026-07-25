import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'crypto';

const REPO_ROOT = process.cwd();
const UPDATER_SCRIPT = join(REPO_ROOT, 'scripts', 'update-opencode-project.ps1');

function sha256(filePath) {
  const content = readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex');
}

function createRealGitRepo(tmpDir) {
  mkdirSync(tmpDir, { recursive: true });
  execFileSync('git', ['init'], { cwd: tmpDir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: tmpDir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: tmpDir, stdio: 'ignore' });
  const readmePath = join(tmpDir, 'README.md');
  writeFileSync(readmePath, 'Test repository\n');
  execFileSync('git', ['add', 'README.md'], { cwd: tmpDir, stdio: 'ignore' });
  execFileSync('git', ['commit', '-m', 'Initial commit'], { cwd: tmpDir, stdio: 'ignore' });
  return tmpDir;
}

function getAllFiles(dir, files = []) {
  if (!existsSync(dir)) return files;
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      getAllFiles(fullPath, files);
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

function countBakFiles(dir) {
  const allFiles = getAllFiles(dir);
  return allFiles.filter(f => f.endsWith('.bak')).length;
}

function createMinimalBootstrap(projectPath) {
  const bootstrapDir = join(projectPath, '.bootstrap');
  mkdirSync(bootstrapDir, { recursive: true });
  const manifest = {
    schema_version: '2.0.0',
    bootstrap_version: '1.0.0',
    project_id: 'test-project',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    initializer: 'test',
    options: {
      include_intelligence: false,
      include_contracts: false,
      include_profile_commands: false,
      include_bootstrap_manifest: false,
      force: false
    },
    ownership: 'project',
    artifacts: []
  };
  writeFileSync(join(bootstrapDir, 'project-manifest.json'), JSON.stringify(manifest, null, 2));
}

describe('Project Updater Read-Only Doctor Mode', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = join(process.env.TEMP || '/tmp', `oc-updater-test-${Date.now()}`);
    createRealGitRepo(tmpDir);
  });

  afterEach(() => {
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('doctor mode produces output without error', () => {
    const result = execFileSync('pwsh', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-File', UPDATER_SCRIPT,
      '-ProjectPath', tmpDir,
      '-Doctor'
    ], { encoding: 'utf8', timeout: 30000 });
    assert.ok(result.length > 0, 'Should produce output');
    assert.ok(result.includes('OpenCode Project Doctor'), 'Should include doctor header');
  });

  it('doctor mode creates zero .bak files', () => {
    const beforeBakCount = countBakFiles(tmpDir);
    execFileSync('pwsh', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-File', UPDATER_SCRIPT,
      '-ProjectPath', tmpDir,
      '-Doctor'
    ], { encoding: 'utf8', timeout: 30000 });
    const afterBakCount = countBakFiles(tmpDir);
    assert.strictEqual(afterBakCount, beforeBakCount, 'No .bak files should be created');
  });

  it('doctor mode does not modify any file', () => {
    const filesBefore = getAllFiles(tmpDir).map(f => ({ path: f, mtime: statSync(f).mtimeMs }));
    execFileSync('pwsh', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-File', UPDATER_SCRIPT,
      '-ProjectPath', tmpDir,
      '-Doctor'
    ], { encoding: 'utf8', timeout: 30000 });
    const filesAfter = getAllFiles(tmpDir).map(f => ({ path: f, mtime: statSync(f).mtimeMs }));

    assert.strictEqual(filesBefore.length, filesAfter.length, 'File count should not change');
    for (let i = 0; i < filesBefore.length; i++) {
      assert.strictEqual(filesBefore[i].mtime, filesAfter[i].mtime, `File ${filesBefore[i].path} should not be modified`);
    }
  });

  it('doctor mode reports PROJECT_NOT_ADOPTED when no manifest', () => {
    const result = execFileSync('pwsh', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-File', UPDATER_SCRIPT,
      '-ProjectPath', tmpDir,
      '-Doctor'
    ], { encoding: 'utf8', timeout: 30000 });
    assert.ok(result.includes('PROJECT_NOT_ADOPTED') || result.includes('No bootstrap manifest found'),
      'Should report not adopted state');
  });

  it('doctor mode reports ADOPTED when manifest and policy exist', () => {
    createMinimalBootstrap(tmpDir);
    mkdirSync(join(tmpDir, '.ai-env'), { recursive: true });
    writeFileSync(join(tmpDir, '.ai-env', 'retrieval-policy.json'),
      JSON.stringify({ schema_version: '1.0', enabled: true, strategies: {}, budgets: {} }));

    const result = execFileSync('pwsh', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-File', UPDATER_SCRIPT,
      '-ProjectPath', tmpDir,
      '-Doctor'
    ], { encoding: 'utf8', timeout: 30000 });
    assert.ok(result.includes('ADOPTED') || result.includes('Project ID'),
      'Should report adopted state');
  });
});

describe('Project Updater Read-Only Plan Mode', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = join(process.env.TEMP || '/tmp', `oc-updater-plan-test-${Date.now()}`);
    createRealGitRepo(tmpDir);
  });

  afterEach(() => {
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('plan mode returns valid JSON', () => {
    const result = execFileSync('pwsh', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-File', UPDATER_SCRIPT,
      '-ProjectPath', tmpDir,
      '-Plan'
    ], { encoding: 'utf8', timeout: 30000 });
    assert.doesNotThrow(() => JSON.parse(result.trim()), 'Should return valid JSON');
  });

  it('plan mode has apply_supported: false', () => {
    const result = execFileSync('pwsh', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-File', UPDATER_SCRIPT,
      '-ProjectPath', tmpDir,
      '-Plan'
    ], { encoding: 'utf8', timeout: 30000 });
    const plan = JSON.parse(result.trim());
    assert.strictEqual(plan.apply_supported, false, 'apply_supported should be false');
  });

  it('plan mode has rollback_supported: false', () => {
    const result = execFileSync('pwsh', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-File', UPDATER_SCRIPT,
      '-ProjectPath', tmpDir,
      '-Plan'
    ], { encoding: 'utf8', timeout: 30000 });
    const plan = JSON.parse(result.trim());
    assert.strictEqual(plan.rollback_supported, false, 'rollback_supported should be false');
  });

  it('plan mode returns PROJECT_NOT_ADOPTED state', () => {
    const result = execFileSync('pwsh', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-File', UPDATER_SCRIPT,
      '-ProjectPath', tmpDir,
      '-Plan'
    ], { encoding: 'utf8', timeout: 30000 });
    const plan = JSON.parse(result.trim());
    assert.strictEqual(plan.retrieval_policy_state, 'PROJECT_NOT_ADOPTED',
      'Should report PROJECT_NOT_ADOPTED');
  });

  it('plan mode creates zero .bak files', () => {
    const beforeBakCount = countBakFiles(tmpDir);
    execFileSync('pwsh', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-File', UPDATER_SCRIPT,
      '-ProjectPath', tmpDir,
      '-Plan'
    ], { encoding: 'utf8', timeout: 30000 });
    const afterBakCount = countBakFiles(tmpDir);
    assert.strictEqual(afterBakCount, beforeBakCount, 'No .bak files should be created');
  });

  it('plan mode does not modify any file', () => {
    const filesBefore = getAllFiles(tmpDir).map(f => ({ path: f, mtime: statSync(f).mtimeMs }));
    execFileSync('pwsh', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-File', UPDATER_SCRIPT,
      '-ProjectPath', tmpDir,
      '-Plan'
    ], { encoding: 'utf8', timeout: 30000 });
    const filesAfter = getAllFiles(tmpDir).map(f => ({ path: f, mtime: statSync(f).mtimeMs }));

    assert.strictEqual(filesBefore.length, filesAfter.length, 'File count should not change');
    for (let i = 0; i < filesBefore.length; i++) {
      assert.strictEqual(filesBefore[i].mtime, filesAfter[i].mtime, `File ${filesBefore[i].path} should not be modified`);
    }
  });
});

describe('Project Updater Zero Writes Regression', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = join(process.env.TEMP || '/tmp', `oc-updater-zero-test-${Date.now()}`);
    createRealGitRepo(tmpDir);
    createMinimalBootstrap(tmpDir);

    mkdirSync(join(tmpDir, 'contracts'), { recursive: true });
    mkdirSync(join(tmpDir, '.intelligence'), { recursive: true });
    mkdirSync(join(tmpDir, '.opencode', 'commands'), { recursive: true });
    mkdirSync(join(tmpDir, '.ai-env'), { recursive: true });

    for (const f of ['manifest.schema.json', 'index.schema.json', 'graph.schema.json']) {
      writeFileSync(join(tmpDir, 'contracts', f), '{}');
    }
    for (const f of ['manifest.json', 'index.json', 'graph.jsonl']) {
      writeFileSync(join(tmpDir, '.intelligence', f), '{}');
    }
    for (const f of ['go.md', 'chatgpt-plus.md', 'mix.md', 'minimax-plus.md']) {
      writeFileSync(join(tmpDir, '.opencode', 'commands', f), '# ' + f);
    }
    writeFileSync(join(tmpDir, 'AGENTS.md'), '# Agents');
    writeFileSync(join(tmpDir, '.ai-env', 'retrieval-policy.json'),
      JSON.stringify({ schema_version: '1.0', enabled: true, strategies: {}, budgets: {} }));
  });

  afterEach(() => {
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('doctor mode does not create AGENTS.md.bak', () => {
    const agentsPath = join(tmpDir, 'AGENTS.md');
    const bakPath = agentsPath + '.bak';
    assert.ok(existsSync(agentsPath), 'AGENTS.md should exist');
    assert.ok(!existsSync(bakPath), 'AGENTS.md.bak should not exist before');

    execFileSync('pwsh', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-File', UPDATER_SCRIPT,
      '-ProjectPath', tmpDir,
      '-Doctor'
    ], { encoding: 'utf8', timeout: 30000 });

    assert.ok(!existsSync(bakPath), 'AGENTS.md.bak should not be created');
  });

  it('doctor mode does not modify .intelligence files', () => {
    const intelFiles = ['manifest.json', 'index.json', 'graph.jsonl'].map(f =>
      ({ path: join(tmpDir, '.intelligence', f), mtime: statSync(join(tmpDir, '.intelligence', f)).mtimeMs })
    );

    execFileSync('pwsh', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-File', UPDATER_SCRIPT,
      '-ProjectPath', tmpDir,
      '-Doctor'
    ], { encoding: 'utf8', timeout: 30000 });

    for (const file of intelFiles) {
      assert.strictEqual(statSync(file.path).mtimeMs, file.mtime, `${file.path} should not be modified`);
    }
  });

  it('doctor mode does not modify contracts', () => {
    const contractFiles = ['manifest.schema.json', 'index.schema.json', 'graph.schema.json'].map(f =>
      ({ path: join(tmpDir, 'contracts', f), mtime: statSync(join(tmpDir, 'contracts', f)).mtimeMs })
    );

    execFileSync('pwsh', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-File', UPDATER_SCRIPT,
      '-ProjectPath', tmpDir,
      '-Doctor'
    ], { encoding: 'utf8', timeout: 30000 });

    for (const file of contractFiles) {
      assert.strictEqual(statSync(file.path).mtimeMs, file.mtime, `${file.path} should not be modified`);
    }
  });

  it('doctor mode does not modify commands', () => {
    const cmdFiles = ['go.md', 'chatgpt-plus.md', 'mix.md', 'minimax-plus.md'].map(f =>
      ({ path: join(tmpDir, '.opencode', 'commands', f), mtime: statSync(join(tmpDir, '.opencode', 'commands', f)).mtimeMs })
    );

    execFileSync('pwsh', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-File', UPDATER_SCRIPT,
      '-ProjectPath', tmpDir,
      '-Doctor'
    ], { encoding: 'utf8', timeout: 30000 });

    for (const file of cmdFiles) {
      assert.strictEqual(statSync(file.path).mtimeMs, file.mtime, `${file.path} should not be modified`);
    }
  });

  it('plan mode does not create any .bak files anywhere', () => {
    execFileSync('pwsh', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-File', UPDATER_SCRIPT,
      '-ProjectPath', tmpDir,
      '-Plan'
    ], { encoding: 'utf8', timeout: 30000 });

    const bakCount = countBakFiles(tmpDir);
    assert.strictEqual(bakCount, 0, 'No .bak files should exist anywhere');
  });

  it('plan mode output mentions read-only tool', () => {
    const result = execFileSync('pwsh', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-File', UPDATER_SCRIPT,
      '-ProjectPath', tmpDir,
      '-Plan'
    ], { encoding: 'utf8', timeout: 30000 });
    const plan = JSON.parse(result.trim());
    assert.ok(plan.notes.some(n => n.includes('read-only') || n.includes('v0.4.0')),
      'Plan should mention read-only nature');
  });
});

describe('Project Updater Global Directory Protection', () => {
  it('refuses to run on global opencode directory', () => {
    const globalDir = join(process.env.USERPROFILE || '', '.config', 'opencode');
    if (!existsSync(globalDir)) {
      assert.ok(true, 'Global dir does not exist, skipping');
      return;
    }

    let error;
    try {
      execFileSync('pwsh', [
        '-NoProfile', '-ExecutionPolicy', 'Bypass',
        '-File', UPDATER_SCRIPT,
        '-ProjectPath', globalDir,
        '-Doctor'
      ], { encoding: 'utf8', timeout: 30000, error: true });
    } catch (e) {
      error = e;
    }
    assert.ok(error, 'Should throw error for global directory');
  });
});
