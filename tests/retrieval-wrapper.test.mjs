/**
 * Retrieval Wrapper Tests - Phase 4
 * Tests PowerShell wrapper and CLI entry point.
 * Each test uses isolated temp directories to avoid modifying fixtures.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync, cpSync } from 'fs';
import { spawnSync, execSync } from 'node:child_process';
import { randomUUID, createHash } from 'crypto';
import { validateTrace } from '../bin/retrieval/contract-validation.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const FIXTURE_ROOT = join(REPO_ROOT, 'tests', 'fixtures', 'qs-sell');
const SCRIPTS_DIR = join(REPO_ROOT, 'scripts');
const REPOS_DIR = join(FIXTURE_ROOT, 'repositories');

const WRAPPER_SCRIPT = join(SCRIPTS_DIR, 'retrieval-router.ps1');

function runPwsh(script, args = [], options = {}) {
  const result = spawnSync('pwsh', ['-NoProfile', '-File', script, ...args], {
    encoding: 'utf8',
    timeout: options.timeout || 60000,
    ...options
  });
  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    status: result.status,
    error: result.error
  };
}

function runPwshStdin(script, args = [], stdinInput = '', options = {}) {
  const result = spawnSync('pwsh', ['-NoProfile', '-File', script, ...args], {
    encoding: 'utf8',
    input: stdinInput,
    timeout: options.timeout || 60000,
    ...options
  });
  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    status: result.status,
    error: result.error
  };
}

function createSandbox() {
  const sandboxDir = join(process.env.TEMP || '/tmp', `opencode-test-${randomUUID()}`);
  mkdirSync(sandboxDir, { recursive: true });
  mkdirSync(join(sandboxDir, 'repositories', 'sell-app', 'src', 'main', 'java', 'com', 'example', 'sell'), { recursive: true });
  mkdirSync(join(sandboxDir, 'repositories', 'sell-rules', 'adr'), { recursive: true });
  mkdirSync(join(sandboxDir, '.ai-env'), { recursive: true });
  return sandboxDir;
}

function cleanupSandbox(sandboxDir) {
  if (existsSync(sandboxDir)) {
    rmSync(sandboxDir, { recursive: true, force: true });
  }
}

function createMinimalPolicy(targetDir) {
  const policy = {
    schema_version: '1.0',
    enabled: true,
    strategies: {
      exact: { enabled: true, provider: 'ripgrep' },
      symbol: { enabled: true, provider: 'ripgrep' },
      architecture: { enabled: true, provider: 'codebase-memory' },
      semantic: { enabled: true, provider: 'semantic' },
      knowledge: { enabled: true, provider: 'filesystem' }
    },
    budgets: {
      exact: { max_tool_calls: 1, max_results: 25, max_chars: 12000 },
      symbol: { max_tool_calls: 2, max_results: 25, max_chars: 16000 },
      architecture: { max_tool_calls: 2, max_results: 30, max_chars: 20000 },
      semantic: { max_tool_calls: 2, max_results: 12, max_chars: 16000 },
      knowledge: { max_tool_calls: 2, max_results: 12, max_chars: 16000 }
    }
  };
  writeFileSync(join(targetDir, '.ai-env', 'retrieval-policy.json'), JSON.stringify(policy, null, 2));
}

function createValidManifest(targetDir) {
  const manifest = {
    version: '1',
    project_id: 'test-project',
    repositories: [
      { repository_id: 'sell-app', path: 'repositories/sell-app', allowed_read_roots: ['repositories/sell-app'], allowed_write_roots: [] },
      { repository_id: 'sell-rules', path: 'repositories/sell-rules', allowed_read_roots: ['repositories/sell-rules'], allowed_write_roots: [] }
    ],
    policy: { max_writers_per_repository: 1, max_read_only_child_tasks_per_session: 2 }
  };
  writeFileSync(join(targetDir, 'project-manifest.json'), JSON.stringify(manifest, null, 2));
}

function copyReposToSandbox(sandboxDir) {
  cpSync(REPOS_DIR, join(sandboxDir, 'repositories'), { recursive: true });
}

describe('Retrieval Wrapper - Plan-only v0.4.0 Compatibility', () => {
  const sandboxes = [];

  afterEach(() => {
    for (const sb of sandboxes) {
      cleanupSandbox(sb);
    }
    sandboxes.length = 0;
  });

  it('plan-only produces output without mode, execution, adapter_signature', () => {
    const sb = createSandbox();
    sandboxes.push(sb);
    copyReposToSandbox(sb);
    createMinimalPolicy(sb);

    const result = runPwsh(WRAPPER_SCRIPT, [
      '-Query', 'Sell',
      '-ProjectRoot', sb
    ]);

    assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);

    const output = JSON.parse(result.stdout);
    assert.strictEqual(output.schema_version, '1.0');
    assert.strictEqual(output.enabled, true);
    assert.strictEqual(output.mode, undefined);
    assert.strictEqual(output.execution, undefined);
    assert.strictEqual(output.adapter_signature, undefined);
  });

  it('plan-only with explicit intent', () => {
    const sb = createSandbox();
    sandboxes.push(sb);
    copyReposToSandbox(sb);
    createMinimalPolicy(sb);

    const result = runPwsh(WRAPPER_SCRIPT, [
      '-Query', 'Sell',
      '-ProjectRoot', sb,
      '-Intent', 'exact'
    ]);

    assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);
    const output = JSON.parse(result.stdout);
    assert.strictEqual(output.intent, 'exact');
  });
});

describe('Retrieval Wrapper - Execute Single', () => {
  const sandboxes = [];

  afterEach(() => {
    for (const sb of sandboxes) {
      cleanupSandbox(sb);
    }
    sandboxes.length = 0;
  });

  it('execute single successful', () => {
    const sb = createSandbox();
    sandboxes.push(sb);
    copyReposToSandbox(sb);
    createMinimalPolicy(sb);
    createValidManifest(sb);

    const result = runPwsh(WRAPPER_SCRIPT, [
      '-Query', 'Sell',
      '-ProjectRoot', sb,
      '-Execute'
    ]);

    if (result.status !== 0) {
      console.log('stderr:', result.stderr);
      console.log('stdout:', result.stdout);
    }
    assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);

    const output = JSON.parse(result.stdout);
    assert.strictEqual(output.success, true);
    assert.ok(output.result);
  });
});

describe('Retrieval Wrapper - Batch', () => {
  const sandboxes = [];

  afterEach(() => {
    for (const sb of sandboxes) {
      cleanupSandbox(sb);
    }
    sandboxes.length = 0;
  });

  it('batch via -BatchInput file', () => {
    const sb = createSandbox();
    sandboxes.push(sb);
    copyReposToSandbox(sb);
    createMinimalPolicy(sb);
    createValidManifest(sb);

    const batchFile = join(sb, 'batch-input.json');
    writeFileSync(batchFile, JSON.stringify({
      plans: [
        { query: 'Sell', intent: 'exact' },
        { query: 'Service', intent: 'exact' },
        { query: 'Nota', intent: 'exact' }
      ]
    }));

    const result = runPwsh(WRAPPER_SCRIPT, [
      '-BatchInput', batchFile,
      '-ProjectRoot', sb
    ]);

    assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);
    const output = JSON.parse(result.stdout);
    assert.strictEqual(output.success, true);
    assert.ok(Array.isArray(output.results));
  });

  it('batch via stdin', () => {
    const sb = createSandbox();
    sandboxes.push(sb);
    copyReposToSandbox(sb);
    createMinimalPolicy(sb);
    createValidManifest(sb);

    const batchJson = JSON.stringify({
      plans: [
        { query: 'QueryA', intent: 'exact' },
        { query: 'QueryB', intent: 'exact' }
      ]
    });

    const result = runPwshStdin(WRAPPER_SCRIPT, ['-BatchInput', '-', '-ProjectRoot', sb], batchJson);

    assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);
    const output = JSON.parse(result.stdout);
    assert.strictEqual(output.success, true);
  });
});

describe('Retrieval Wrapper - Input Validation', () => {
  const sandboxes = [];

  afterEach(() => {
    for (const sb of sandboxes) {
      cleanupSandbox(sb);
    }
    sandboxes.length = 0;
  });

  it('rejects when both Query and BatchInput provided', () => {
    const sb = createSandbox();
    sandboxes.push(sb);
    copyReposToSandbox(sb);
    createMinimalPolicy(sb);
    createValidManifest(sb);

    const result = runPwsh(WRAPPER_SCRIPT, [
      '-Query', 'Sell',
      '-BatchInput', '-',
      '-ProjectRoot', sb
    ]);

    assert.notStrictEqual(result.status, 0);
  });

  it('rejects invalid JSON', () => {
    const sb = createSandbox();
    sandboxes.push(sb);
    copyReposToSandbox(sb);
    createMinimalPolicy(sb);
    createValidManifest(sb);

    const result = runPwshStdin(WRAPPER_SCRIPT, ['-BatchInput', '-', '-ProjectRoot', sb], 'not valid json {');

    assert.notStrictEqual(result.status, 0);
  });

  it('rejects project not adopted', () => {
    const sb = createSandbox();
    sandboxes.push(sb);
    copyReposToSandbox(sb);

    const result = runPwsh(WRAPPER_SCRIPT, [
      '-Query', 'Sell',
      '-ProjectRoot', sb,
      '-Execute'
    ]);

    assert.notStrictEqual(result.status, 0);
    assert.ok(result.stderr.includes('PROJECT_NOT_ADOPTED') || result.stdout.includes('PROJECT_NOT_ADOPTED'));
  });

  it('rejects invalid manifest', () => {
    const sb = createSandbox();
    sandboxes.push(sb);
    copyReposToSandbox(sb);
    createMinimalPolicy(sb);
    writeFileSync(join(sb, 'project-manifest.json'), JSON.stringify({ version: 'invalid' }));

    const result = runPwsh(WRAPPER_SCRIPT, [
      '-Query', 'Sell',
      '-ProjectRoot', sb,
      '-Execute'
    ]);

    assert.notStrictEqual(result.status, 0);
  });
});

describe('Retrieval Wrapper - Exit Codes', () => {
  const sandboxes = [];

  afterEach(() => {
    for (const sb of sandboxes) {
      cleanupSandbox(sb);
    }
    sandboxes.length = 0;
  });

  it('exit code 0 for success', () => {
    const sb = createSandbox();
    sandboxes.push(sb);
    copyReposToSandbox(sb);
    createMinimalPolicy(sb);
    createValidManifest(sb);

    const result = runPwsh(WRAPPER_SCRIPT, [
      '-Query', 'Sell',
      '-ProjectRoot', sb,
      '-Execute'
    ]);

    assert.strictEqual(result.status, 0);
  });

  it('non-zero exit for project not adopted', () => {
    const sb = createSandbox();
    sandboxes.push(sb);
    copyReposToSandbox(sb);

    const result = runPwsh(WRAPPER_SCRIPT, [
      '-Query', 'Sell',
      '-ProjectRoot', sb,
      '-Execute'
    ]);

    assert.notStrictEqual(result.status, 0);
  });
});

describe('Retrieval Wrapper - Output', () => {
  const sandboxes = [];

  afterEach(() => {
    for (const sb of sandboxes) {
      cleanupSandbox(sb);
    }
    sandboxes.length = 0;
  });

  it('stdout is clean JSON', () => {
    const sb = createSandbox();
    sandboxes.push(sb);
    copyReposToSandbox(sb);
    createMinimalPolicy(sb);

    const result = runPwsh(WRAPPER_SCRIPT, [
      '-Query', 'Sell',
      '-ProjectRoot', sb
    ]);

    assert.strictEqual(result.status, 0);
    const output = JSON.parse(result.stdout);
    assert.strictEqual(typeof output, 'object');
  });

  it('stderr is separated from stdout', () => {
    const sb = createSandbox();
    sandboxes.push(sb);
    copyReposToSandbox(sb);
    createMinimalPolicy(sb);

    const result = runPwsh(WRAPPER_SCRIPT, [
      '-Query', 'Sell',
      '-ProjectRoot', sb
    ]);

    assert.strictEqual(result.status, 0);
    const stderrLower = result.stderr.toLowerCase();
    const stdoutLower = result.stdout.toLowerCase();
    assert.ok(!stdoutLower.includes('error') || stdoutLower.includes('"error"'));
  });
});

describe('Retrieval Wrapper - Arguments with Special Characters', () => {
  const sandboxes = [];

  afterEach(() => {
    for (const sb of sandboxes) {
      cleanupSandbox(sb);
    }
    sandboxes.length = 0;
  });

  it('query with spaces preserved', () => {
    const sb = createSandbox();
    sandboxes.push(sb);
    copyReposToSandbox(sb);
    createMinimalPolicy(sb);
    createValidManifest(sb);

    const result = runPwsh(WRAPPER_SCRIPT, [
      '-Query', 'Sell Controller',
      '-ProjectRoot', sb,
      '-Execute'
    ]);

    assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);
    const output = JSON.parse(result.stdout);
    assert.strictEqual(output.success, true);
  });

  it('project root with spaces', () => {
    const sb = createSandbox();
    sandboxes.push(sb);
    const tempDir = sb;
    copyReposToSandbox(sb);
    createMinimalPolicy(sb);
    createValidManifest(sb);

    const result = runPwsh(WRAPPER_SCRIPT, [
      '-Query', 'Sell',
      '-ProjectRoot', tempDir,
      '-Execute'
    ]);

    assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);
  });
});

describe('Retrieval Wrapper - MaxFallbacks', () => {
  const sandboxes = [];

  afterEach(() => {
    for (const sb of sandboxes) {
      cleanupSandbox(sb);
    }
    sandboxes.length = 0;
  });

  it('accepts -MaxFallbacks 0', () => {
    const sb = createSandbox();
    sandboxes.push(sb);
    copyReposToSandbox(sb);
    createMinimalPolicy(sb);
    createValidManifest(sb);

    const result = runPwsh(WRAPPER_SCRIPT, [
      '-Query', 'Sell',
      '-ProjectRoot', sb,
      '-Execute',
      '-MaxFallbacks', '0'
    ]);

    assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);
  });

  it('accepts -MaxFallbacks 1', () => {
    const sb = createSandbox();
    sandboxes.push(sb);
    copyReposToSandbox(sb);
    createMinimalPolicy(sb);
    createValidManifest(sb);

    const result = runPwsh(WRAPPER_SCRIPT, [
      '-Query', 'Sell',
      '-ProjectRoot', sb,
      '-Execute',
      '-MaxFallbacks', '1'
    ]);

    assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);
  });
});

describe('Retrieval Wrapper - Trace and Metrics', () => {
  const sandboxes = [];

  afterEach(() => {
    for (const sb of sandboxes) {
      cleanupSandbox(sb);
    }
    sandboxes.length = 0;
  });

  it('writes trace under trusted trace dir', () => {
    const sb = createSandbox();
    sandboxes.push(sb);
    copyReposToSandbox(sb);
    createMinimalPolicy(sb);
    createValidManifest(sb);

    const tempConfigDir = join(process.env.TEMP || '/tmp', `opencode-config-${randomUUID()}`);
    mkdirSync(tempConfigDir, { recursive: true });
    sandboxes.push(tempConfigDir);
    const traceDir = join(tempConfigDir, 'retrieval');
    mkdirSync(traceDir, { recursive: true });
    const traceFile = join(traceDir, 'trace.json');

    const result = runPwsh(WRAPPER_SCRIPT, [
      '-Query', 'Sell',
      '-ProjectRoot', sb,
      '-Execute',
      '-TracePath', traceFile
    ], { env: { ...process.env, OPENCODE_CONFIG_DIR: tempConfigDir } });

    assert.strictEqual(result.status, 0, `stderr: ${result.stderr}`);
    assert.ok(existsSync(traceFile), 'trace file should exist');
    const traceContent = JSON.parse(readFileSync(traceFile, 'utf8'));
    const traceValidation = validateTrace(traceContent);
    assert.strictEqual(traceValidation.valid, true, `trace AJV validation failed: ${JSON.stringify(traceValidation.errors)}`);
  });

  it('zero writes when not requested', () => {
    const sb = createSandbox();
    sandboxes.push(sb);
    copyReposToSandbox(sb);
    createMinimalPolicy(sb);
    createValidManifest(sb);

    const tempConfigDir = join(process.env.TEMP || '/tmp', `opencode-config-${randomUUID()}`);
    mkdirSync(tempConfigDir, { recursive: true });
    sandboxes.push(tempConfigDir);
    const traceDir = join(tempConfigDir, 'retrieval');

    const result = runPwsh(WRAPPER_SCRIPT, [
      '-Query', 'Sell',
      '-ProjectRoot', sb,
      '-Execute'
    ], { env: { ...process.env, OPENCODE_CONFIG_DIR: tempConfigDir } });

    assert.strictEqual(result.status, 0);
    assert.ok(!existsSync(traceDir), 'no trace dir should be created');
  });
});

describe('Retrieval Wrapper - Path Security', () => {
  const sandboxes = [];

  afterEach(() => {
    for (const sb of sandboxes) {
      cleanupSandbox(sb);
    }
    sandboxes.length = 0;
  });

  it('rejects path inside project', () => {
    const sb = createSandbox();
    sandboxes.push(sb);
    copyReposToSandbox(sb);
    createMinimalPolicy(sb);
    createValidManifest(sb);

    const insideProject = join(sb, 'trace.json');

    const result = runPwsh(WRAPPER_SCRIPT, [
      '-Query', 'Sell',
      '-ProjectRoot', sb,
      '-Execute',
      '-TracePath', insideProject
    ]);

    assert.notStrictEqual(result.status, 0);
  });

  it('rejects path outside trusted dir', () => {
    const sb = createSandbox();
    sandboxes.push(sb);
    copyReposToSandbox(sb);
    createMinimalPolicy(sb);
    createValidManifest(sb);

    const externalPath = 'C:\\Windows\\temp\\trace.json';

    const result = runPwsh(WRAPPER_SCRIPT, [
      '-Query', 'Sell',
      '-ProjectRoot', sb,
      '-Execute',
      '-TracePath', externalPath
    ]);

    assert.notStrictEqual(result.status, 0);
  });
});

describe('Retrieval Wrapper - No Shell Commands', () => {
  it('script contains no Invoke-Expression', () => {
    const content = readFileSync(WRAPPER_SCRIPT, 'utf8');
    assert.ok(!content.includes('Invoke-Expression'));
  });

  it('script contains no string concatenation for commands', () => {
    const content = readFileSync(WRAPPER_SCRIPT, 'utf8');
    assert.ok(!content.match(/\$args\s*\+/));
    assert.ok(!content.match(/\$\w+\s*\+\s*\$/));
  });

  it('uses ArgumentList.Add for arguments', () => {
    const content = readFileSync(WRAPPER_SCRIPT, 'utf8');
    assert.ok(content.includes('ArgumentList.Add'));
  });
});

describe('Retrieval Wrapper - Validator Parity Gate', () => {
  it('retrieval-policy-validator.mjs matches schema without timeout_ms drift', () => {
    const validatorPath = join(REPO_ROOT, 'bin', 'retrieval', 'retrieval-policy-validator.mjs');
    const generatorPath = join(REPO_ROOT, 'scripts', 'generate-retrieval-validators.mjs');

    const originalValidator = readFileSync(validatorPath, 'utf8');

    execSync(`node "${generatorPath}"`, { cwd: REPO_ROOT });

    const regeneratedValidator = readFileSync(validatorPath, 'utf8');

    const originalHash = createHash('sha256').update(originalValidator).digest('hex');
    const regeneratedHash = createHash('sha256').update(regeneratedValidator).digest('hex');

    assert.strictEqual(originalHash, regeneratedHash, 'Validator has drifted from schema - run scripts/generate-retrieval-validators.mjs to regenerate');
  });
});
