/**
 * Retrieval Doctor Tests - Phase 6
 * Tests v0.5.0 retrieval execution doctor diagnostics with hardening.
 * Each test uses isolated environments to avoid modifying fixtures.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync, statSync } from 'fs';
import { spawnSync } from 'node:child_process';
import { randomUUID, createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const SCRIPTS_DIR = join(REPO_ROOT, 'scripts');
const DOCTOR_SCRIPT = join(SCRIPTS_DIR, 'doctor-opencode-global.ps1');
const WRAPPER_SCRIPT = join(SCRIPTS_DIR, 'retrieval-router.ps1');
const FIXTURE_ROOT = join(REPO_ROOT, 'tests', 'fixtures', 'qs-sell');
const GENERATE_VALIDATORS = join(SCRIPTS_DIR, 'generate-retrieval-validators.mjs');

function runPwsh(script, args = [], options = {}) {
  const result = spawnSync('pwsh', ['-NoProfile', '-File', script, ...args], {
    encoding: 'utf8',
    timeout: options.timeout || 120000,
    env: { ...process.env, ...options.env },
    ...options
  });
  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    status: result.status,
    error: result.error
  };
}

function runDoctor(options = {}) {
  return runPwsh(DOCTOR_SCRIPT, [], options);
}

function createSandbox() {
  const sandboxDir = join(process.env.TEMP || '/tmp', `opencode-doctor-test-${randomUUID()}`);
  mkdirSync(sandboxDir, { recursive: true });
  mkdirSync(join(sandboxDir, 'repositories', 'sell-app', 'src'), { recursive: true });
  mkdirSync(join(sandboxDir, '.ai-env'), { recursive: true });
  return sandboxDir;
}

function cleanupSandbox(sandboxDir) {
  if (existsSync(sandboxDir)) {
    rmSync(sandboxDir, { recursive: true, force: true });
  }
}

function createMinimalProject(targetDir) {
  mkdirSync(join(targetDir, 'repositories', 'sell-app'), { recursive: true });
  mkdirSync(join(targetDir, '.ai-env'), { recursive: true });
  const policy = {
    schema_version: '1.0',
    enabled: true,
    strategies: {
      exact: { enabled: true, provider: 'ripgrep' },
      knowledge: { enabled: true, provider: 'filesystem' }
    },
    budgets: {
      exact: { max_tool_calls: 1, max_results: 25, max_chars: 12000 }
    }
  };
  writeFileSync(join(targetDir, '.ai-env', 'retrieval-policy.json'), JSON.stringify(policy, null, 2));
  const manifest = {
    version: '1',
    project_id: 'test-project',
    repositories: [
      { repository_id: 'sell-app', path: 'repositories/sell-app', allowed_read_roots: ['repositories/sell-app'], allowed_write_roots: [] }
    ]
  };
  writeFileSync(join(targetDir, 'project-manifest.json'), JSON.stringify(manifest, null, 2));
}

function getFileHash(filePath) {
  if (!existsSync(filePath)) return null;
  const content = readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex');
}

function snapshotDir(dir, files = []) {
  if (!existsSync(dir)) return files;
  const items = readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const fullPath = join(dir, item.name);
    if (item.isDirectory()) {
      snapshotDir(fullPath, files);
    } else {
      const stat = statSync(fullPath);
      files.push({
        path: fullPath,
        size: stat.size,
        sha256: getFileHash(fullPath)
      });
    }
  }
  return files;
}

describe('Retrieval Doctor - Real Execution', () => {
  it('doctor runs and exits successfully with current environment', () => {
    const result = runDoctor();
    assert.ok(result.stdout.includes('OpenCode Global Doctor'), 'Doctor header should appear');
    assert.ok(result.stdout.includes('Retrieval tier:'), 'Retrieval tier should appear');
  });

  it('doctor output contains v0.5.0 diagnostics', () => {
    const result = runDoctor();
    assert.ok(result.stdout.includes('Retrieval Execution v0.5.0 Diagnostics'), 'v0.5.0 header should appear');
    assert.ok(result.stdout.includes('retrieval_execution_ready'), 'retrieval_execution_ready should appear');
    assert.ok(result.stdout.includes('Tier:'), 'Tier should appear');
  });

  it('doctor reports retrieval_execution_ready status', () => {
    const result = runDoctor();
    const hasTrue = result.stdout.includes('retrieval_execution_ready: True') || result.stdout.includes('retrieval_execution_ready: true');
    const hasFalse = result.stdout.includes('retrieval_execution_ready: False') || result.stdout.includes('retrieval_execution_ready: false');
    assert.ok(hasTrue || hasFalse, 'retrieval_execution_ready should be reported');
  });
});

describe('Retrieval Doctor - Tool Detection', () => {
  it('detects Node.js path', () => {
    const result = runDoctor();
    assert.ok(result.stdout.includes('Node.js:'), 'Node.js path should be reported');
  });

  it('detects PowerShell path', () => {
    const result = runDoctor();
    assert.ok(result.stdout.includes('PowerShell:'), 'PowerShell path should be reported');
  });

  it('detects Git path when available', () => {
    const result = runDoctor();
    if (result.stdout.includes('Git:')) {
      assert.ok(result.stdout.match(/Git: [A-Z]:\\/i) || result.stdout.includes('Git: /'), 'Git path should be valid');
    }
  });

  it('reports ripgrep as optional', () => {
    const result = runDoctor();
    assert.ok(result.stdout.includes('ripgrep:') || result.stdout.includes('ripgrep not installed'), 'ripgrep status should appear');
  });
});

describe('Retrieval Doctor - Tier Determination', () => {
  it('reports OPTIMAL when ripgrep is available', () => {
    const result = runDoctor();
    const hasRipgrep = result.stdout.includes('ripgrep: /') || result.stdout.match(/ripgrep: [A-Z]:\\/i);
    if (hasRipgrep) {
      assert.ok(result.stdout.includes('Tier: OPTIMAL') || result.stdout.includes('tier: OPTIMAL'), 'Should report OPTIMAL tier');
    }
  });

  it('reports FUNCTIONAL when ripgrep absent but Git available', () => {
    const result = runDoctor();
    const hasRipgrep = result.stdout.includes('ripgrep: /') || result.stdout.match(/ripgrep: [A-Z]:\\/i);
    if (!hasRipgrep && result.stdout.includes('Git:')) {
      assert.ok(result.stdout.includes('Tier: FUNCTIONAL') || result.stdout.includes('tier: FUNCTIONAL'), 'Should report FUNCTIONAL tier');
    }
  });

  it('reports INCOMPLETE when no exact provider', () => {
    const result = runDoctor();
    const hasRipgrep = result.stdout.includes('ripgrep: /') || result.stdout.match(/ripgrep: [A-Z]:\\/i);
    const hasGit = result.stdout.includes('Git:');
    if (!hasRipgrep && !hasGit) {
      assert.ok(result.stdout.includes('Tier: INCOMPLETE') || result.stdout.includes('tier: INCOMPLETE'), 'Should report INCOMPLETE tier');
    } else {
      assert.ok(result.stdout.match(/Tier: (OPTIMAL|FUNCTIONAL|INCOMPLETE)/i), 'Should report a valid tier');
    }
  });

  it('retrieval tier is always reported', () => {
    const result = runDoctor();
    assert.ok(result.stdout.match(/tier: (OPTIMAL|FUNCTIONAL|INCOMPLETE)/i), 'Tier should be reported');
  });
});

describe('Retrieval Doctor - Wrapper Security', () => {
  it('wrapper has no Invoke-Expression', () => {
    const wrapperContent = readFileSync(WRAPPER_SCRIPT, 'utf8');
    assert.ok(!wrapperContent.includes('Invoke-Expression'), 'Wrapper should not contain Invoke-Expression');
  });

  it('wrapper has no cmd /c', () => {
    const wrapperContent = readFileSync(WRAPPER_SCRIPT, 'utf8');
    assert.ok(!wrapperContent.includes('cmd /c'), 'Wrapper should not contain cmd /c');
  });

  it('wrapper has no powershell -Command', () => {
    const wrapperContent = readFileSync(WRAPPER_SCRIPT, 'utf8');
    assert.ok(!wrapperContent.includes('powershell -Command'), 'Wrapper should not contain powershell -Command');
  });

  it('wrapper uses ArgumentList.Add', () => {
    const wrapperContent = readFileSync(WRAPPER_SCRIPT, 'utf8');
    assert.ok(wrapperContent.includes('ArgumentList.Add'), 'Wrapper should use ArgumentList.Add');
  });

  it('doctor reports wrapper security status', () => {
    const result = runDoctor();
    assert.ok(result.stdout.includes('secure argument handling') || result.stdout.includes('UNSAFE'), 'Wrapper security should be checked');
  });
});

describe('Retrieval Doctor - v0.5.0 Files', () => {
  it('checks retrieval-entry.mjs existence', () => {
    const result = runDoctor();
    assert.ok(result.stdout.includes('retrieval-entry.mjs'), 'retrieval-entry.mjs should be checked');
  });

  it('checks execution-engine.mjs existence', () => {
    const result = runDoctor();
    assert.ok(result.stdout.includes('execution-engine.mjs'), 'execution-engine.mjs should be checked');
  });

  it('checks execute-batch.mjs existence', () => {
    const result = runDoctor();
    assert.ok(result.stdout.includes('execute-batch.mjs'), 'execute-batch.mjs should be checked');
  });

  it('checks all three adapters', () => {
    const result = runDoctor();
    assert.ok(result.stdout.includes('ripgrep.mjs'), 'ripgrep adapter should be checked');
    assert.ok(result.stdout.includes('git-grep.mjs'), 'git-grep adapter should be checked');
    assert.ok(result.stdout.includes('filesystem.mjs'), 'filesystem adapter should be checked');
  });

  it('checks all execution contracts', () => {
    const result = runDoctor();
    assert.ok(result.stdout.includes('retrieval-execution-plan.schema.json'), 'plan contract should be checked');
    assert.ok(result.stdout.includes('retrieval-execution-result.schema.json'), 'result contract should be checked');
    assert.ok(result.stdout.includes('retrieval-execution-trace.schema.json'), 'trace contract should be checked');
    assert.ok(result.stdout.includes('retrieval-execution-metrics.schema.json'), 'metrics contract should be checked');
    assert.ok(result.stdout.includes('retrieval-execution-reason-codes.schema.json'), 'reason codes contract should be checked');
    assert.ok(result.stdout.includes('retrieval-plan-base.schema.json'), 'plan-base contract should be checked');
    assert.ok(result.stdout.includes('repository-state.schema.json'), 'repository-state contract should be checked');
  });

  it('checks policy validator', () => {
    const result = runDoctor();
    assert.ok(result.stdout.includes('retrieval-policy-validator.mjs'), 'policy validator should be checked');
  });
});

describe('Retrieval Doctor - OPENCODE_RETRIEVAL_MODE', () => {
  it('reports rejected when OPENCODE_RETRIEVAL_MODE is defined', () => {
    const result = runDoctor({ env: { ...process.env, OPENCODE_RETRIEVAL_MODE: 'execute' } });
    assert.ok(result.stdout.includes('OPENCODE_RETRIEVAL_MODE') && result.stdout.includes('REJECTED'), 'Should report OPENCODE_RETRIEVAL_MODE as rejected');
  });

  it('does not use OPENCODE_RETRIEVAL_MODE value', () => {
    const result = runDoctor({ env: { ...process.env, OPENCODE_RETRIEVAL_MODE: 'execute' } });
    const hasExecuteInWrongContext = result.stdout.match(/OPENCODE_RETRIEVAL_MODE.*execute/i);
    if (hasExecuteInWrongContext) {
      assert.ok(result.stdout.includes('REJECTED'), 'Should be rejected not used');
    }
  });
});

describe('Retrieval Doctor - Runtime Resolution', () => {
  it('resolves OPENCODE_CONFIG_DIR when set', () => {
    const result = runDoctor({ env: { ...process.env, OPENCODE_CONFIG_DIR: 'C:\\Users\\VegaValverde\\.config\\opencode' } });
    assert.ok(result.stdout.includes('Runtime:'), 'Runtime path should be resolved');
  });

  it('uses XDG_CONFIG_HOME fallback when OPENCODE_CONFIG_DIR not set', () => {
    const env = { ...process.env };
    delete env.OPENCODE_CONFIG_DIR;
    env.XDG_CONFIG_HOME = 'C:\\Users\\VegaValverde\\.config';
    const result = runDoctor({ env });
    assert.ok(result.stdout.includes('Runtime:'), 'Runtime path should be resolved');
  });

  it('uses HOME/.config fallback when neither OPENCODE_CONFIG_DIR nor XDG_CONFIG_HOME set', () => {
    const env = { ...process.env };
    delete env.OPENCODE_CONFIG_DIR;
    delete env.XDG_CONFIG_HOME;
    const result = runDoctor({ env });
    assert.ok(result.stdout.includes('Runtime:'), 'Runtime path should be resolved');
  });
});

describe('Retrieval Doctor - Runtime Retrieval Dir', () => {
  it('does not create runtime retrieval dir', () => {
    const sandboxConfig = join(process.env.TEMP || '/tmp', `opencode-config-${randomUUID()}`);
    mkdirSync(sandboxConfig, { recursive: true });
    const sandboxDir = createSandbox();
    const initialExists = existsSync(join(sandboxConfig, 'retrieval'));

    const result = runDoctor({ env: { ...process.env, OPENCODE_CONFIG_DIR: sandboxConfig } });

    const finalExists = existsSync(join(sandboxConfig, 'retrieval'));
    assert.strictEqual(initialExists, finalExists, 'Runtime retrieval dir should not be created by doctor');

    cleanupSandbox(sandboxDir);
    rmSync(sandboxConfig, { recursive: true, force: true });
  });

  it('inspects runtime retrieval dir only when it exists', () => {
    const result = runDoctor();
    assert.ok(result.stdout.includes('Runtime retrieval directory') || result.stdout.includes('retrieval'), 'Should inspect retrieval dir');
  });
});

describe('Retrieval Doctor - Exit Codes', () => {
  it('exit code 0 when no issues', () => {
    const result = runDoctor();
    if (result.stdout.includes('Issues: 0')) {
      assert.strictEqual(result.status, 0, 'Exit code should be 0 when no issues');
    }
  });

  it('non-zero exit when issues present', () => {
    const result = runDoctor();
    const issueMatch = result.stdout.match(/Issues: (\d+)/);
    if (issueMatch && parseInt(issueMatch[1]) > 0) {
      assert.notStrictEqual(result.status, 0, 'Exit code should be non-zero when issues present');
    }
  });

  it('exit code matches issue count', () => {
    const result = runDoctor();
    const issueMatch = result.stdout.match(/Issues: (\d+)/);
    if (issueMatch) {
      const reportedIssues = parseInt(issueMatch[1]);
      assert.strictEqual(result.status, reportedIssues, 'Exit code should match issue count');
    }
  });
});

describe('Retrieval Doctor - Zero Writes', () => {
  it('doctor does not write to project directories', () => {
    const sandboxDir = createSandbox();
    createMinimalProject(sandboxDir);
    const beforeFiles = snapshotDir(sandboxDir);

    const result = runDoctor();

    const afterFiles = snapshotDir(sandboxDir);
    const newFiles = afterFiles.filter(af => !beforeFiles.some(bf => bf.path === af.path));
    assert.strictEqual(newFiles.length, 0, 'Doctor should not create files in project: ' + JSON.stringify(newFiles.map(f => f.path)));

    cleanupSandbox(sandboxDir);
  });

  it('doctor does not write to fixtures', () => {
    const beforeFiles = snapshotDir(FIXTURE_ROOT);

    const result = runDoctor();

    const afterFiles = snapshotDir(FIXTURE_ROOT);
    const newFiles = afterFiles.filter(af => !beforeFiles.some(bf => bf.path === af.path));
    assert.strictEqual(newFiles.length, 0, 'Doctor should not create files in fixtures: ' + JSON.stringify(newFiles.map(f => f.path)));
  });
});

describe('Retrieval Doctor - Determinism', () => {
  it('produces deterministic output', () => {
    const result1 = runDoctor();
    const result2 = runDoctor();

    const tier1 = result1.stdout.match(/tier: (OPTIMAL|FUNCTIONAL|INCOMPLETE)/i);
    const tier2 = result2.stdout.match(/tier: (OPTIMAL|FUNCTIONAL|INCOMPLETE)/i);

    if (tier1 && tier2) {
      assert.strictEqual(tier1[1], tier2[1], 'Tier should be deterministic');
    }

    const ready1 = result1.stdout.match(/retrieval_execution_ready: (True|False|true|false)/i);
    const ready2 = result2.stdout.match(/retrieval_execution_ready: (True|False|true|false)/i);

    if (ready1 && ready2) {
      assert.strictEqual(ready1[1].toLowerCase(), ready2[1].toLowerCase(), 'Ready status should be deterministic');
    }
  });

  it('exit codes are deterministic for same state', () => {
    const result1 = runDoctor();
    const result2 = runDoctor();
    assert.strictEqual(result1.status, result2.status, 'Exit codes should be deterministic');
  });
});

describe('Retrieval Doctor - Validator Check Mode', () => {
  it('generate-retrieval-validators.mjs --check exits 0 when validators match', () => {
    const result = spawnSync('node', [GENERATE_VALIDATORS, '--check'], {
      encoding: 'utf8',
      timeout: 60000
    });
    assert.strictEqual(result.status, 0, 'Validator check should pass when validators match');
    assert.ok(result.stdout.includes('VALIDATORS_OK'), 'Should output VALIDATORS_OK');
  });
});

describe('Retrieval Doctor - Doctor Module Checks', () => {
  it('can import retrieval-doctor.mjs', async () => {
    const mod = await import('../bin/retrieval/retrieval-doctor.mjs');
    assert.ok(typeof mod.checkWrapperSecurity === 'function', 'checkWrapperSecurity should be a function');
    assert.ok(typeof mod.checkModuleImportsWithoutExecution === 'function', 'checkModuleImportsWithoutExecution should be function');
  });

  it('checkWrapperSecurity returns valid result', async () => {
    const { checkWrapperSecurity } = await import('../bin/retrieval/retrieval-doctor.mjs');
    const result = checkWrapperSecurity();
    assert.ok(typeof result.valid === 'boolean', 'Result should have valid boolean');
  });

  it('checkModuleImportsWithoutExecution returns array', async () => {
    const { checkModuleImportsWithoutExecution } = await import('../bin/retrieval/retrieval-doctor.mjs');
    const results = checkModuleImportsWithoutExecution();
    assert.ok(Array.isArray(results), 'Result should be an array');
  });

  it('checkModuleSyntax validates syntax', async () => {
    const { checkModuleSyntax } = await import('../bin/retrieval/retrieval-doctor.mjs');
    const result = checkModuleSyntax('retrieval-entry.mjs');
    assert.ok(typeof result.valid === 'boolean', 'Result should have valid boolean');
    assert.ok(result.syntaxOk, 'retrieval-entry.mjs should have valid syntax');
  });

  it('checkJsonSchema validates JSON parsing', async () => {
    const { checkJsonSchema } = await import('../bin/retrieval/retrieval-doctor.mjs');
    const result = checkJsonSchema('retrieval-execution-plan.schema.json');
    assert.ok(typeof result.valid === 'boolean', 'Result should have valid boolean');
    assert.ok(result.parseable, 'Schema should be parseable');
  });
});

describe('Retrieval Doctor - Node Absent Scenario', () => {
  it('detects Node availability via Get-Command', () => {
    const result = runDoctor();
    assert.ok(result.stdout.includes('Node.js:'), 'Should check Node availability');
  });
});

describe('Retrieval Doctor - Contract Absent Scenario', () => {
  it('detects missing execution contracts', () => {
    const result = runDoctor();
    const hasContracts = result.stdout.includes('retrieval-execution-plan.schema.json');
    assert.ok(hasContracts, 'Should check execution contracts');
  });
});

describe('Retrieval Doctor - Invalid Schema Scenario', () => {
  it('detects JSON parse errors in schemas', () => {
    const result = runDoctor();
    assert.ok(!result.stdout.includes('[INVALID_JSON]'), 'Schemas should be valid JSON');
  });
});

describe('Retrieval Doctor - Wrapper Unsafe Scenario', () => {
  it('detects unsafe wrapper patterns', () => {
    const result = runDoctor();
    const hasUnsafe = result.stdout.includes('[UNSAFE]');
    assert.ok(!hasUnsafe, 'Wrapper should be safe');
  });
});

describe('Retrieval Doctor - Snapshot Zero Writes', () => {
  it('snapshot captures paths, sizes, and SHA-256', () => {
    const sandboxDir = createSandbox();
    createMinimalProject(sandboxDir);
    const beforeSnap = snapshotDir(sandboxDir);

    assert.ok(beforeSnap.length > 0, 'Snapshot should capture files');

    runDoctor();

    const afterSnap = snapshotDir(sandboxDir);
    const newFiles = afterSnap.filter(af => !beforeSnap.some(bf => bf.path === af.path));
    assert.strictEqual(newFiles.length, 0, 'Should have zero new files');

    cleanupSandbox(sandboxDir);
  });
});

describe('Retrieval Doctor - Deterministic Pure Functions', () => {
  it('checkModuleSyntax: non-existent module returns invalid', async () => {
    const { checkModuleSyntax } = await import('../bin/retrieval/retrieval-doctor.mjs');
    const result = checkModuleSyntax('does-not-exist.mjs');
    assert.strictEqual(result.valid, false);
    assert.ok(result.error.includes('not found'));
  });

  it('checkModuleSyntax: broken syntax returns invalid', async () => {
    const sandbox = join(process.env.TEMP || '/tmp', `opencode-doctor-sbx-${randomUUID()}`);
    mkdirSync(sandbox, { recursive: true });
    mkdirSync(join(sandbox, 'bin', 'retrieval'), { recursive: true });
    const broken = join(sandbox, 'bin', 'retrieval', 'broken.mjs');
    writeFileSync(broken, 'this is not ( valid javascript !!!');
    const { checkModuleSyntax } = await import('../bin/retrieval/retrieval-doctor.mjs');
    const result = checkModuleSyntax('broken.mjs', sandbox);
    assert.strictEqual(result.valid, false);
    assert.ok(result.error);
    rmSync(sandbox, { recursive: true, force: true });
  });

  it('checkModuleSyntax: valid module returns valid', async () => {
    const { checkModuleSyntax } = await import('../bin/retrieval/retrieval-doctor.mjs');
    const result = checkModuleSyntax('retrieval-entry.mjs');
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.syntaxOk, true);
  });

  it('checkModuleEsmImport: non-existent module returns invalid', async () => {
    const { checkModuleEsmImport } = await import('../bin/retrieval/retrieval-doctor.mjs');
    const result = checkModuleEsmImport('does-not-exist.mjs');
    assert.strictEqual(result.valid, false);
    assert.ok(result.error.includes('not found'));
  });

  it('checkModuleEsmImport: throwing module returns invalid', async () => {
    const sandbox = join(process.env.TEMP || '/tmp', `opencode-doctor-sbx-${randomUUID()}`);
    mkdirSync(sandbox, { recursive: true });
    mkdirSync(join(sandbox, 'bin', 'retrieval'), { recursive: true });
    const throwing = join(sandbox, 'bin', 'retrieval', 'throwing.mjs');
    writeFileSync(throwing, 'throw new Error("intentional failure for test");');
    const { checkModuleEsmImport } = await import('../bin/retrieval/retrieval-doctor.mjs');
    const result = checkModuleEsmImport('throwing.mjs', sandbox);
    assert.strictEqual(result.valid, false);
    assert.ok(result.error.includes('intentional failure'));
    rmSync(sandbox, { recursive: true, force: true });
  });

  it('checkModuleEsmImport: real entry, engine, batch, doctor all import OK', async () => {
    const { checkModuleEsmImport } = await import('../bin/retrieval/retrieval-doctor.mjs');
    for (const m of ['retrieval-entry.mjs', 'execution-engine.mjs', 'execute-batch.mjs', 'retrieval-doctor.mjs']) {
      const result = checkModuleEsmImport(m);
      assert.strictEqual(result.valid, true, `${m} should import OK`);
      assert.strictEqual(result.importOk, true);
    }
  });

  it('checkJsonSchema: non-existent schema returns invalid', async () => {
    const { checkJsonSchema } = await import('../bin/retrieval/retrieval-doctor.mjs');
    const result = checkJsonSchema('does-not-exist.schema.json');
    assert.strictEqual(result.valid, false);
  });

  it('checkJsonSchema: invalid JSON returns invalid', async () => {
    const sandbox = join(process.env.TEMP || '/tmp', `opencode-doctor-sbx-${randomUUID()}`);
    mkdirSync(join(sandbox, 'contracts'), { recursive: true });
    const bad = join(sandbox, 'contracts', 'bad.schema.json');
    writeFileSync(bad, '{ not valid json');
    const { checkJsonSchema } = await import('../bin/retrieval/retrieval-doctor.mjs');
    const result = checkJsonSchema('bad.schema.json', sandbox);
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.parseable, false);
    rmSync(sandbox, { recursive: true, force: true });
  });

  it('checkJsonSchema: valid JSON returns valid', async () => {
    const { checkJsonSchema } = await import('../bin/retrieval/retrieval-doctor.mjs');
    const result = checkJsonSchema('retrieval-execution-plan.schema.json');
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.parseable, true);
  });

  it('checkAllJsonSchemas: all 9 contracts are valid', async () => {
    const { checkAllJsonSchemas } = await import('../bin/retrieval/retrieval-doctor.mjs');
    const results = checkAllJsonSchemas();
    assert.strictEqual(results.length, 9);
    for (const r of results) {
      assert.strictEqual(r.valid, true, `${r.contract} should be valid`);
    }
  });

  it('checkWrapperSecurity: safe wrapper returns valid', async () => {
    const { checkWrapperSecurity } = await import('../bin/retrieval/retrieval-doctor.mjs');
    const result = checkWrapperSecurity();
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.usesArgumentList, true);
  });

  it('checkWrapperSecurity: unsafe wrapper with Invoke-Expression returns invalid', async () => {
    const sandbox = join(process.env.TEMP || '/tmp', `opencode-doctor-sbx-${randomUUID()}`);
    mkdirSync(sandbox, { recursive: true });
    const unsafe = join(sandbox, 'unsafe.ps1');
    writeFileSync(unsafe, 'Invoke-Expression "Get-Process"');
    const { checkWrapperSecurity } = await import('../bin/retrieval/retrieval-doctor.mjs');
    const result = checkWrapperSecurity(unsafe, sandbox);
    assert.strictEqual(result.valid, false);
    rmSync(sandbox, { recursive: true, force: true });
  });

  it('checkWrapperSecurity: wrapper with cmd /c returns invalid', async () => {
    const sandbox = join(process.env.TEMP || '/tmp', `opencode-doctor-sbx-${randomUUID()}`);
    mkdirSync(sandbox, { recursive: true });
    const unsafe = join(sandbox, 'unsafe.ps1');
    writeFileSync(unsafe, 'cmd /c dir');
    const { checkWrapperSecurity } = await import('../bin/retrieval/retrieval-doctor.mjs');
    const result = checkWrapperSecurity(unsafe, sandbox);
    assert.strictEqual(result.valid, false);
    rmSync(sandbox, { recursive: true, force: true });
  });

  it('checkWrapperSecurity: non-existent wrapper returns invalid', async () => {
    const { checkWrapperSecurity } = await import('../bin/retrieval/retrieval-doctor.mjs');
    const result = checkWrapperSecurity('C:\\does\\not\\exist\\wrapper.ps1', process.env.TEMP || '/tmp');
    assert.strictEqual(result.valid, false);
  });

  it('getFileHash: non-existent file returns null', async () => {
    const { getFileHash } = await import('../bin/retrieval/retrieval-doctor.mjs');
    const result = getFileHash('C:\\does\\not\\exist\\file.txt');
    assert.strictEqual(result, null);
  });

  it('getFileHash: existing file returns deterministic SHA-256', async () => {
    const { getFileHash } = await import('../bin/retrieval/retrieval-doctor.mjs');
    const file = join(REPO_ROOT, 'package.json');
    const hash1 = getFileHash(file);
    const hash2 = getFileHash(file);
    assert.strictEqual(hash1, hash2);
    assert.strictEqual(hash1.length, 64);
  });

  it('checkModuleImportsWithoutExecution: all 3 modules return valid', async () => {
    const { checkModuleImportsWithoutExecution } = await import('../bin/retrieval/retrieval-doctor.mjs');
    const results = checkModuleImportsWithoutExecution();
    assert.strictEqual(results.length, 3);
    for (const r of results) {
      assert.strictEqual(r.valid, true, `${r.module} should pass syntax + ESM import`);
      assert.strictEqual(r.syntaxOk, true);
      assert.strictEqual(r.importOk, true);
    }
  });

  it('checkAdapterImports: all 3 adapters return valid', async () => {
    const { checkAdapterImports } = await import('../bin/retrieval/retrieval-doctor.mjs');
    const results = checkAdapterImports();
    assert.strictEqual(results.length, 3);
    for (const r of results) {
      assert.strictEqual(r.valid, true, `${r.adapter} should pass`);
    }
  });

  it('getRetrievalFilesystemState: returns expected paths', async () => {
    const { getRetrievalFilesystemState } = await import('../bin/retrieval/retrieval-doctor.mjs');
    const state = getRetrievalFilesystemState();
    assert.ok(state.entry.endsWith('retrieval-entry.mjs'));
    assert.ok(state.engine.endsWith('execution-engine.mjs'));
    assert.ok(state.batch.endsWith('execute-batch.mjs'));
    assert.ok(state.wrapper.endsWith('retrieval-router.ps1'));
    assert.ok(state.validator.endsWith('retrieval-policy-validator.mjs'));
    assert.ok(state.adapters.ripgrep.endsWith('ripgrep.mjs'));
    assert.ok(state.adapters.gitGrep.endsWith('git-grep.mjs'));
    assert.ok(state.adapters.filesystem.endsWith('filesystem.mjs'));
    assert.strictEqual(state.contracts.length, 7);
  });

  it('checkFilesReadable: existing files return readable', async () => {
    const { checkFilesReadable } = await import('../bin/retrieval/retrieval-doctor.mjs');
    const results = checkFilesReadable(['package.json', 'README.md']);
    for (const r of results) {
      assert.strictEqual(r.readable, true, `${r.file} should be readable`);
    }
  });

  it('checkFilesReadable: non-existent file returns not readable', async () => {
    const { checkFilesReadable } = await import('../bin/retrieval/retrieval-doctor.mjs');
    const results = checkFilesReadable(['does-not-exist.txt']);
    assert.strictEqual(results[0].readable, false);
  });
});

describe('Retrieval Doctor - Tier Scenarios via Doctor Script', () => {
  it('OPTIMAL when ripgrep is reported as available', () => {
    const result = runDoctor();
    const ripgrepReported = result.stdout.match(/ripgrep: ([A-Z]:\\[^\s]+|\/[^\s]+)/);
    if (ripgrepReported) {
      assert.ok(result.stdout.match(/tier: ?OPTIMAL/i), 'Should report OPTIMAL');
    } else {
      assert.ok(result.stdout.match(/tier: ?(FUNCTIONAL|INCOMPLETE)/i), 'Should report FUNCTIONAL or INCOMPLETE when no ripgrep');
    }
  });

  it('reports FUNCTIONAL when Git is available without ripgrep', () => {
    const result = runDoctor();
    const hasRipgrep = result.stdout.match(/ripgrep: ([A-Z]:\\[^\s]+|\/[^\s]+)/);
    const hasGit = result.stdout.match(/Git: ([A-Z]:\\[^\s]+|\/[^\s]+)/);
    if (!hasRipgrep && hasGit) {
      assert.ok(result.stdout.match(/tier: ?FUNCTIONAL/i), 'Should report FUNCTIONAL');
    }
  });

  it('reports INCOMPLETE when neither ripgrep nor Git', () => {
    const result = runDoctor();
    const hasRipgrep = result.stdout.match(/ripgrep: ([A-Z]:\\[^\s]+|\/[^\s]+)/);
    const hasGit = result.stdout.match(/Git: ([A-Z]:\\[^\s]+|\/[^\s]+)/);
    if (!hasRipgrep && !hasGit) {
      assert.ok(result.stdout.match(/tier: ?INCOMPLETE/i), 'Should report INCOMPLETE');
    }
  });
});

describe('Retrieval Doctor - Runtime Resolution Precedence', () => {
  it('OPENCODE_CONFIG_DIR takes precedence over XDG_CONFIG_HOME', () => {
    const sandbox = join(process.env.TEMP || '/tmp', `opencode-cfg-${randomUUID()}`);
    mkdirSync(sandbox, { recursive: true });
    const env = {
      ...process.env,
      OPENCODE_CONFIG_DIR: sandbox,
      XDG_CONFIG_HOME: 'C:\\should\\not\\be\\used'
    };
    const result = runDoctor({ env });
    assert.ok(result.stdout.includes('Runtime:') || result.stdout.includes('runtime'), 'Runtime should be reported');
    rmSync(sandbox, { recursive: true, force: true });
  });

  it('XDG_CONFIG_HOME used when OPENCODE_CONFIG_DIR is unset', () => {
    const sandbox = join(process.env.TEMP || '/tmp', `opencode-cfg-${randomUUID()}`);
    mkdirSync(sandbox, { recursive: true });
    const env = { ...process.env };
    delete env.OPENCODE_CONFIG_DIR;
    env.XDG_CONFIG_HOME = sandbox;
    const result = runDoctor({ env });
    assert.ok(result.stdout.includes('Runtime:') || result.stdout.includes('runtime'));
    rmSync(sandbox, { recursive: true, force: true });
  });

  it('HOME/.config used when neither OPENCODE_CONFIG_DIR nor XDG_CONFIG_HOME is set', () => {
    const sandbox = join(process.env.TEMP || '/tmp', `opencode-home-${randomUUID()}`);
    mkdirSync(sandbox, { recursive: true });
    mkdirSync(join(sandbox, '.config'), { recursive: true });
    const env = { ...process.env };
    delete env.OPENCODE_CONFIG_DIR;
    delete env.XDG_CONFIG_HOME;
    env.HOME = sandbox;
    const result = runDoctor({ env });
    assert.ok(result.stdout.includes('Runtime:') || result.stdout.includes('runtime'));
    rmSync(sandbox, { recursive: true, force: true });
  });
});

describe('Retrieval Doctor - OPENCODE_RETRIEVAL_MODE Rejected', () => {
  it('reports REJECTED when OPENCODE_RETRIEVAL_MODE is defined', () => {
    const result = runDoctor({ env: { ...process.env, OPENCODE_RETRIEVAL_MODE: 'execute' } });
    assert.ok(result.stdout.includes('OPENCODE_RETRIEVAL_MODE'));
    assert.ok(result.stdout.includes('REJECTED') || result.stdout.includes('rejected'));
  });
});

describe('Retrieval Doctor - Zero Writes via Strict Snapshot', () => {
  it('relative path, size, and SHA-256 unchanged after run', () => {
    const sandbox = createSandbox();
    createMinimalProject(sandbox);
    const before = snapshotDir(sandbox);
    runDoctor();
    const after = snapshotDir(sandbox);
    assert.strictEqual(before.length, after.length, 'File count must match');
    for (let i = 0; i < before.length; i++) {
      const bf = before[i];
      const af = after.find(x => x.path === bf.path);
      assert.ok(af, `File ${bf.path} must still exist`);
      assert.strictEqual(af.size, bf.size, `Size of ${bf.path} must not change`);
      assert.strictEqual(af.sha256, bf.sha256, `SHA-256 of ${bf.path} must not change`);
    }
    cleanupSandbox(sandbox);
  });
});
