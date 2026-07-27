import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { exec, execSync } from 'node:child_process';
import Ajv from 'ajv';

const GLOBAL_ROOT = path.resolve(import.meta.dirname, '../..');
const SCRIPT_DIR = path.join(GLOBAL_ROOT, 'scripts');
const DIST_DIR = path.join(GLOBAL_ROOT, 'distribution');

function runPowershell(scriptPath, args = '', env = {}) {
  return new Promise((resolve) => {
    exec(`pwsh -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}" ${args}`, { env },
      (err, stdout, stderr) => resolve({ err, stdout, stderr })
    );
  });
}

function getAllFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      getAllFiles(fullPath, files);
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

function getContentSnapshot(dir) {
  return getAllFiles(dir).sort().map(file => ({
    relative: path.relative(dir, file).replace(/\\/g, '/'),
    sha256: createHash('sha256').update(fs.readFileSync(file)).digest('hex')
  }));
}

describe('sandbox-install-manifest', () => {
  let tempHome;
  let originalHome;

  before(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-manifest-test-'));
    originalHome = process.env.USERPROFILE;
    process.env.USERPROFILE = tempHome;
  });

  after(() => {
    if (tempHome && fs.existsSync(tempHome)) {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
    process.env.USERPROFILE = originalHome;
  });

  function resetProject(config) {
    fs.rmSync(path.join(projectDir, '.opencode', 'agents'), { recursive: true, force: true });
    fs.mkdirSync(path.join(projectDir, '.opencode', 'agents'), { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'opencode.json'), JSON.stringify(config, null, 2));
  }

  it('source manifest exists and is valid JSON', () => {
    const manifestPath = path.join(DIST_DIR, 'runtime-manifest.json');
    assert.ok(fs.existsSync(manifestPath), 'runtime-manifest.json should exist');
    const content = fs.readFileSync(manifestPath, 'utf8');
    const manifest = JSON.parse(content);
    assert.ok(manifest.manifest_version, 'Should have manifest_version');
    assert.ok(manifest.categories, 'Should have categories');
  });

  it('source manifest validates against its local JSON schema', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(DIST_DIR, 'runtime-manifest.json'), 'utf8'));
    const schema = JSON.parse(fs.readFileSync(path.join(DIST_DIR, 'runtime-manifest.schema.json'), 'utf8'));
    const validate = new Ajv({ strict: false }).compile(schema);
    assert.ok(validate(manifest), `Manifest schema errors: ${JSON.stringify(validate.errors)}`);
  });

  it('source manifest resolves with no missing source paths', () => {
    const manifestPath = path.join(DIST_DIR, 'runtime-manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    const missing = [];
    for (const catName of Object.keys(manifest.categories)) {
      const cat = manifest.categories[catName];
      if (cat.entries) {
        for (const entry of cat.entries) {
          const sourcePath = path.join(GLOBAL_ROOT, entry.source);
          if (!fs.existsSync(sourcePath)) {
            missing.push(`${catName}: ${entry.source}`);
          }
        }
      }
    }

    assert.strictEqual(missing.length, 0, `All source paths should exist. Missing: ${missing.join(', ')}`);
  });

  it('manifest resolver script exists', () => {
    const resolverPath = path.join(DIST_DIR, 'resolve-runtime-manifest.ps1');
    assert.ok(fs.existsSync(resolverPath), 'resolve-runtime-manifest.ps1 should exist');
  });

  it('distribution files are in manifest inventory', () => {
    const manifestPath = path.join(DIST_DIR, 'runtime-manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    assert.ok(manifest.categories.distribution, 'Should have distribution category');
    assert.ok(manifest.categories.distribution.entries, 'distribution should have entries');
    const hasManifest = manifest.categories.distribution.entries.some(e => e.source === 'distribution/runtime-manifest.json');
    const hasResolver = manifest.categories.distribution.entries.some(e => e.source === 'distribution/resolve-runtime-manifest.ps1');
    const hasSchema = manifest.categories.distribution.entries.some(e => e.source === 'distribution/runtime-manifest.schema.json');
    assert.ok(hasManifest, 'runtime-manifest.json should be in distribution entries');
    assert.ok(hasResolver, 'resolve-runtime-manifest.ps1 should be in distribution entries');
    assert.ok(hasSchema, 'runtime-manifest.schema.json should be in distribution entries');
  });

  it('install_requires includes distribution files', () => {
    const manifestPath = path.join(DIST_DIR, 'runtime-manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    assert.ok(manifest.install_requires.includes('distribution/runtime-manifest.json'), 'manifest should be in install_requires');
    assert.ok(manifest.install_requires.includes('distribution/resolve-runtime-manifest.ps1'), 'resolver should be in install_requires');
  });

  it('no duplicate runtime destinations across all categories', () => {
    const result = execSync(`pwsh -NoProfile -ExecutionPolicy Bypass -File "${path.join(DIST_DIR, 'resolve-runtime-manifest.ps1')}" -Action GetInventory`, {
      encoding: 'utf8',
      cwd: GLOBAL_ROOT
    });
    const inventory = JSON.parse(result);

    const destinations = inventory.map(e => e.runtime);
    const duplicates = destinations.filter((d, i) => destinations.indexOf(d) !== i);
    assert.strictEqual(duplicates.length, 0, `No duplicate runtime destinations. Duplicates: ${duplicates.join(', ')}`);
  });

});

describe('sandbox-install-execution', () => {
  let tempHome;
  let originalHome;
  let sandboxDir;

  before(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-sandbox-install-'));
    originalHome = process.env.USERPROFILE;
    sandboxDir = path.join(tempHome, '.config', 'opencode');
    process.env.USERPROFILE = tempHome;
  });

  after(() => {
    if (tempHome && fs.existsSync(tempHome)) {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
    process.env.USERPROFILE = originalHome;
  });

  it('fresh install has all contracts', async () => {
    const result = await runPowershell(path.join(SCRIPT_DIR, 'install-opencode-global.ps1'), '', {
      ...process.env,
      USERPROFILE: tempHome,
      OPENCODE_CONFIG_DIR: sandboxDir
    });
    assert.strictEqual(result.err, null, `Install should succeed: ${result.stderr}`);

    const contractsDir = path.join(sandboxDir, 'contracts');
    for (const contract of ['bootstrap-manifest.schema.json', 'manifest.schema.json', 'index.schema.json', 'graph.schema.json', 'session.schema.json', 'retrieval-policy.schema.json', 'retrieval-index-state.schema.json']) {
      assert.ok(fs.existsSync(path.join(contractsDir, contract)), `${contract} should be installed`);
    }
  });

  it('fresh install has all bin/retrieval recursive adapters', async () => {
    await runPowershell(path.join(SCRIPT_DIR, 'install-opencode-global.ps1'), '', {
      ...process.env,
      USERPROFILE: tempHome,
      OPENCODE_CONFIG_DIR: sandboxDir
    });

    const retrievalBinDir = path.join(sandboxDir, 'bin', 'retrieval');
    assert.ok(fs.existsSync(retrievalBinDir), 'bin/retrieval directory should exist');
    assert.ok(fs.existsSync(path.join(retrievalBinDir, 'adapters')), 'bin/retrieval/adapters should exist');

    for (const file of ['retrieval-router.mjs', 'retrieval-entry.mjs', 'execution-engine.mjs', 'execute-batch.mjs']) {
      assert.ok(fs.existsSync(path.join(retrievalBinDir, file)), `${file} should be installed`);
    }
    for (const adapter of ['shared.mjs', 'ripgrep.mjs', 'git-grep.mjs', 'filesystem.mjs']) {
      assert.ok(fs.existsSync(path.join(retrievalBinDir, 'adapters', adapter)), `adapters/${adapter} should be installed`);
    }
  });

  it('fresh install has templates/project-neutral recursively', async () => {
    await runPowershell(path.join(SCRIPT_DIR, 'install-opencode-global.ps1'), '', {
      ...process.env,
      USERPROFILE: tempHome,
      OPENCODE_CONFIG_DIR: sandboxDir
    });

    const templateDir = path.join(sandboxDir, 'templates', 'project-neutral');
    assert.ok(fs.existsSync(templateDir), 'templates/project-neutral should exist');
    assert.ok(fs.existsSync(path.join(templateDir, 'opencode.jsonc')), 'template opencode.jsonc should exist');
  });

  it('no dev-only scripts are installed', async () => {
    await runPowershell(path.join(SCRIPT_DIR, 'install-opencode-global.ps1'), '', {
      ...process.env,
      USERPROFILE: tempHome,
      OPENCODE_CONFIG_DIR: sandboxDir
    });

    const scriptsDir = path.join(sandboxDir, 'scripts');
    for (const script of ['generate-retrieval-validators.mjs', 'validate.mjs', 'discover-real-query-set.mjs', 'run-retrieval-real-pilot.mjs']) {
      assert.ok(!fs.existsSync(path.join(scriptsDir, script)), `${script} should NOT be installed`);
    }
  });

  it('all 8 commands are installed', async () => {
    await runPowershell(path.join(SCRIPT_DIR, 'install-opencode-global.ps1'), '', {
      ...process.env,
      USERPROFILE: tempHome,
      OPENCODE_CONFIG_DIR: sandboxDir
    });

    const commandsDir = path.join(sandboxDir, 'commands');
    for (const cmd of ['go.md', 'chatgpt-plus.md', 'mix.md', 'minimax-plus.md', 'cross-session.md', 'init-ai-env.md', 'doctor-ai-env.md', 'update-ai-env.md']) {
      assert.ok(fs.existsSync(path.join(commandsDir, cmd)), `${cmd} should be installed`);
    }
  });

  it('distribution files are installed', async () => {
    await runPowershell(path.join(SCRIPT_DIR, 'install-opencode-global.ps1'), '', {
      ...process.env,
      USERPROFILE: tempHome,
      OPENCODE_CONFIG_DIR: sandboxDir
    });

    const distDir = path.join(sandboxDir, 'distribution');
    assert.ok(fs.existsSync(path.join(distDir, 'runtime-manifest.json')), 'runtime-manifest.json should be installed');
    assert.ok(fs.existsSync(path.join(distDir, 'resolve-runtime-manifest.ps1')), 'resolve-runtime-manifest.ps1 should be installed');
    assert.ok(fs.existsSync(path.join(distDir, 'runtime-manifest.schema.json')), 'runtime-manifest.schema.json should be installed');
  });

  it('incomplete source root fails preflight before creating target files', async () => {
    const fakeRoot = path.join(tempHome, 'incomplete-source');
    fs.mkdirSync(path.join(fakeRoot, 'distribution'), { recursive: true });
    fs.mkdirSync(path.join(fakeRoot, 'global'), { recursive: true });
    fs.mkdirSync(path.join(fakeRoot, 'scripts'), { recursive: true });
    for (const rel of ['distribution/runtime-manifest.json', 'distribution/resolve-runtime-manifest.ps1', 'global/opencode.jsonc', 'scripts/install-opencode-global.ps1']) {
      fs.copyFileSync(path.join(GLOBAL_ROOT, rel), path.join(fakeRoot, rel));
    }
    const target = path.join(tempHome, 'preflight-target');
    const result = await runPowershell(path.join(SCRIPT_DIR, 'install-opencode-global.ps1'), `-SourceRoot "${fakeRoot}"`, {
      ...process.env, USERPROFILE: tempHome, OPENCODE_CONFIG_DIR: target
    });
    assert.ok(result.err, 'incomplete source must fail');
    assert.match(`${result.stdout}${result.stderr}`, /Distribution preflight failed/i);
    assert.deepStrictEqual(getAllFiles(target), [], 'preflight failure must create no target files');
  });

  it('rejects tampered source/runtime traversal and absolute manifest paths before writes', async () => {
    const originalManifest = JSON.parse(fs.readFileSync(path.join(DIST_DIR, 'runtime-manifest.json'), 'utf8'));
    const cases = [
      { label: 'source traversal', source: '../escape.txt', runtime: 'safe.txt' },
      { label: 'runtime traversal', source: 'global/opencode.jsonc', runtime: '../escape.txt' },
      { label: 'absolute path', source: 'C:\\absolute.txt', runtime: 'safe.txt' }
    ];
    for (const [index, testCase] of cases.entries()) {
      const fakeRoot = path.join(tempHome, `tampered-${index}`);
      fs.mkdirSync(path.join(fakeRoot, 'distribution'), { recursive: true });
      fs.mkdirSync(path.join(fakeRoot, 'global'), { recursive: true });
      fs.mkdirSync(path.join(fakeRoot, 'scripts'), { recursive: true });
      fs.copyFileSync(path.join(DIST_DIR, 'resolve-runtime-manifest.ps1'), path.join(fakeRoot, 'distribution', 'resolve-runtime-manifest.ps1'));
      fs.copyFileSync(path.join(GLOBAL_ROOT, 'global', 'opencode.jsonc'), path.join(fakeRoot, 'global', 'opencode.jsonc'));
      fs.copyFileSync(path.join(SCRIPT_DIR, 'install-opencode-global.ps1'), path.join(fakeRoot, 'scripts', 'install-opencode-global.ps1'));
      const manifest = structuredClone(originalManifest);
      manifest.categories.distribution.entries = [{ source: testCase.source, runtime: testCase.runtime }];
      fs.writeFileSync(path.join(fakeRoot, 'distribution', 'runtime-manifest.json'), JSON.stringify(manifest), 'utf8');
      const target = path.join(tempHome, `tampered-target-${index}`);
      const external = path.join(tempHome, 'escape.txt');
      fs.writeFileSync(external, 'outside', 'utf8');
      const result = await runPowershell(path.join(SCRIPT_DIR, 'install-opencode-global.ps1'), `-SourceRoot "${fakeRoot}"`, {
        ...process.env, USERPROFILE: tempHome, OPENCODE_CONFIG_DIR: target
      });
      assert.ok(result.err, `${testCase.label} must fail`);
      assert.match(`${result.stdout}${result.stderr}`, /Unsafe manifest path|Unsafe entry|escapes/i);
      assert.deepStrictEqual(getAllFiles(target), [], `${testCase.label} creates no target files`);
      assert.strictEqual(fs.readFileSync(external, 'utf8'), 'outside', `${testCase.label} does not write outside target`);
    }
  });

  it('installs immutable preflight snapshot bytes when a source mutates after capture', async () => {
    const fakeRoot = path.join(tempHome, 'snapshot-source');
    for (const dir of ['distribution', 'global', 'scripts', 'commands', 'contracts', 'bin/retrieval']) {
      fs.mkdirSync(path.join(fakeRoot, dir), { recursive: true });
    }
    fs.copyFileSync(path.join(DIST_DIR, 'resolve-runtime-manifest.ps1'), path.join(fakeRoot, 'distribution', 'resolve-runtime-manifest.ps1'));
    fs.copyFileSync(path.join(SCRIPT_DIR, 'install-opencode-global.ps1'), path.join(fakeRoot, 'scripts', 'install-opencode-global.ps1'));
    fs.writeFileSync(path.join(fakeRoot, 'global', 'opencode.jsonc'), '{"model":"snapshot"}', 'utf8');
    const originalCommandBytes = Buffer.from('snapshot-command-bytes\n', 'utf8');
    fs.writeFileSync(path.join(fakeRoot, 'commands', 'go.md'), originalCommandBytes);
    fs.writeFileSync(path.join(fakeRoot, 'contracts', 'a.schema.json'), '{}', 'utf8');
    fs.writeFileSync(path.join(fakeRoot, 'bin', 'retrieval', 'a.mjs'), 'export {};', 'utf8');
    const manifest = {
      manifest_version: '1.0.0', install_requires: [], categories: {
        global_config: { description: 'x', entries: [{ source: 'global/opencode.jsonc', runtime: 'opencode.jsonc' }] },
        commands: { description: 'x', entries: [{ source: 'commands/go.md', runtime: 'commands/go.md' }] },
        runtime_scripts: { description: 'x', entries: [{ source: 'scripts/install-opencode-global.ps1', runtime: 'scripts/install-opencode-global.ps1' }] },
        contracts: { description: 'x', entries: [{ source: 'contracts/a.schema.json', runtime: 'contracts/a.schema.json' }] },
        bin_retrieval: { description: 'x', entries: [{ source: 'bin/retrieval/a.mjs', runtime: 'bin/retrieval/a.mjs' }] }
      }
    };
    fs.writeFileSync(path.join(fakeRoot, 'distribution', 'runtime-manifest.json'), JSON.stringify(manifest), 'utf8');
    const target = path.join(tempHome, 'snapshot-target');
    fs.mkdirSync(target, { recursive: true });
    const probePath = path.join(tempHome, 'snapshot-probe.ps1');
    fs.writeFileSync(probePath, `param([string]$Resolver, [string]$Manifest, [string]$Output)\n. $Resolver -ManifestPath $Manifest\n$inventory = @(Get-RuntimeManifestInventory)\n$snapshot = New-ImmutableSourceSnapshot -Inventory $inventory -MaximumBytes 67108864\n$source = Assert-SafeSourcePath -SourceRelativePath 'commands/go.md'\n[System.IO.File]::WriteAllBytes($source, [System.Text.Encoding]::UTF8.GetBytes('mutated-after-snapshot'))\n[System.IO.File]::WriteAllBytes($Output, $snapshot['commands/go.md'].Bytes)\n`, 'utf8');
    const outputPath = path.join(target, 'go.md');
    const result = await runPowershell(probePath, `-Resolver "${path.join(fakeRoot, 'distribution', 'resolve-runtime-manifest.ps1')}" -Manifest "${path.join(fakeRoot, 'distribution', 'runtime-manifest.json')}" -Output "${outputPath}"`, {
      ...process.env,
      USERPROFILE: tempHome
    });
    assert.strictEqual(result.err, null, `Snapshot probe should succeed: ${result.stderr}`);
    assert.deepStrictEqual(fs.readFileSync(outputPath), originalCommandBytes);
    assert.notDeepStrictEqual(fs.readFileSync(path.join(fakeRoot, 'commands', 'go.md')), originalCommandBytes);
  });
});

describe('sandbox-install-idempotent', () => {
  let tempHome;
  let originalHome;
  let sandboxDir;

  before(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-sandbox-idempotent-'));
    originalHome = process.env.USERPROFILE;
    sandboxDir = path.join(tempHome, '.config', 'opencode');
    process.env.USERPROFILE = tempHome;
  });

  after(() => {
    if (tempHome && fs.existsSync(tempHome)) {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
    process.env.USERPROFILE = originalHome;
  });

  it('install is idempotent - second run does not error', async () => {
    await runPowershell(path.join(SCRIPT_DIR, 'install-opencode-global.ps1'), '', {
      ...process.env,
      USERPROFILE: tempHome,
      OPENCODE_CONFIG_DIR: sandboxDir
    });

    const result = await runPowershell(path.join(SCRIPT_DIR, 'install-opencode-global.ps1'), '', {
      ...process.env,
      USERPROFILE: tempHome,
      OPENCODE_CONFIG_DIR: sandboxDir
    });

    assert.strictEqual(result.err, null, 'Second install should not error');
    assert.ok(result.stdout.includes('[skip]'), 'Second install should skip existing files');
  });
});

describe('sandbox-dryrun-zero-writes', () => {
  let tempHome;
  let originalHome;

  before(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-sandbox-dryrun-'));
    originalHome = process.env.USERPROFILE;
    process.env.USERPROFILE = tempHome;
  });

  after(() => {
    if (tempHome && fs.existsSync(tempHome)) {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
    process.env.USERPROFILE = originalHome;
  });

  it('DryRun creates zero files in empty sandbox', async () => {
    const sandboxDir = path.join(tempHome, '.config', 'opencode');

    const result = await runPowershell(path.join(SCRIPT_DIR, 'install-opencode-global.ps1'), '-DryRun', {
      ...process.env,
      USERPROFILE: tempHome,
      OPENCODE_CONFIG_DIR: sandboxDir
    });

    assert.strictEqual(result.err, null, 'DryRun should succeed');
    assert.ok(result.stdout.includes('Dry run complete'), 'Should output dry run complete');
    assert.ok(!fs.existsSync(sandboxDir), 'Config directory should not be created in DryRun');
  });

  it('WhatIf is accepted and creates zero files in an empty sandbox', async () => {
    const sandboxDir = path.join(tempHome, 'whatif-runtime');
    const result = await runPowershell(path.join(SCRIPT_DIR, 'install-opencode-global.ps1'), '-WhatIf', {
      ...process.env, USERPROFILE: tempHome, OPENCODE_CONFIG_DIR: sandboxDir
    });
    assert.strictEqual(result.err, null, `WhatIf should succeed: ${result.stderr}`);
    assert.ok(!fs.existsSync(sandboxDir), 'WhatIf should not create target directory');
  });

  it('update DryRun creates zero file modifications', async () => {
    const sandboxDir = path.join(tempHome, '.config', 'opencode');

    await runPowershell(path.join(SCRIPT_DIR, 'install-opencode-global.ps1'), '', {
      ...process.env,
      USERPROFILE: tempHome,
      OPENCODE_CONFIG_DIR: sandboxDir
    });

    const beforeFiles = getContentSnapshot(sandboxDir);

    const result = await runPowershell(path.join(SCRIPT_DIR, 'update-opencode-global.ps1'), '-DryRun', {
      ...process.env,
      USERPROFILE: tempHome,
      OPENCODE_CONFIG_DIR: sandboxDir
    });

    assert.strictEqual(result.err, null, 'Update DryRun should succeed');
    assert.ok(result.stdout.includes('Dry run complete'), 'Should output dry run complete');

    const afterFiles = getContentSnapshot(sandboxDir);
    assert.deepStrictEqual(afterFiles, beforeFiles, 'DryRun must preserve every relative path and SHA256');
  });
});

describe('sandbox-update-central-backups', () => {
  let tempHome;
  let originalHome;
  let sandboxDir;

  before(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-sandbox-update-'));
    originalHome = process.env.USERPROFILE;
    sandboxDir = path.join(tempHome, '.config', 'opencode');
    process.env.USERPROFILE = tempHome;
  });

  after(() => {
    if (tempHome && fs.existsSync(tempHome)) {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
    process.env.USERPROFILE = originalHome;
  });

  it('update uses central backup location', async () => {
    await runPowershell(path.join(SCRIPT_DIR, 'install-opencode-global.ps1'), '', {
      ...process.env,
      USERPROFILE: tempHome,
      OPENCODE_CONFIG_DIR: sandboxDir
    });

    await runPowershell(path.join(SCRIPT_DIR, 'update-opencode-global.ps1'), '-Force', {
      ...process.env,
      USERPROFILE: tempHome,
      OPENCODE_CONFIG_DIR: sandboxDir
    });

    const backupRoot = path.join(sandboxDir, 'runtime', 'backups', 'managed');
    assert.ok(fs.existsSync(backupRoot), 'Central backup directory should exist');
    const backupDirs = fs.readdirSync(backupRoot);
    assert.ok(backupDirs.length > 0, 'Should have at least one backup timestamp directory');
  });

  it('backs up multiple modified files under one timestamp root with exact bytes', async () => {
    const agentsPath = path.join(sandboxDir, 'AGENTS.md');
    const commandPath = path.join(sandboxDir, 'commands', 'go.md');
    const agentsBefore = `${fs.readFileSync(agentsPath, 'utf8')}\nlocal-agents-change`;
    const commandBefore = `${fs.readFileSync(commandPath, 'utf8')}\nlocal-command-change`;
    fs.writeFileSync(agentsPath, agentsBefore, 'utf8');
    fs.writeFileSync(commandPath, commandBefore, 'utf8');
    const backupRoot = path.join(sandboxDir, 'runtime', 'backups', 'managed');
    const rootsBefore = new Set(fs.readdirSync(backupRoot));
    const result = await runPowershell(path.join(SCRIPT_DIR, 'update-opencode-global.ps1'), '-Confirm:$false', {
      ...process.env, USERPROFILE: tempHome, OPENCODE_CONFIG_DIR: sandboxDir
    });
    assert.strictEqual(result.err, null, `Update should succeed: ${result.stderr}`);
    const createdRoots = fs.readdirSync(backupRoot).filter(root => !rootsBefore.has(root));
    assert.strictEqual(createdRoots.length, 1, 'one update uses exactly one backup timestamp root');
    const root = path.join(backupRoot, createdRoots[0]);
    assert.strictEqual(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8'), agentsBefore);
    assert.strictEqual(fs.readFileSync(path.join(root, 'commands', 'go.md'), 'utf8'), commandBefore);
  });

  it('uses distinct collision-resistant backup operation roots for rapid modified updates', async () => {
    const backupRoot = path.join(sandboxDir, 'runtime', 'backups', 'managed');
    const agentsPath = path.join(sandboxDir, 'AGENTS.md');
    const rootsBefore = new Set(fs.readdirSync(backupRoot));
    const firstBytes = Buffer.from(`${fs.readFileSync(agentsPath, 'utf8')}\nrapid-one`, 'utf8');
    fs.writeFileSync(agentsPath, firstBytes);
    const first = await runPowershell(path.join(SCRIPT_DIR, 'update-opencode-global.ps1'), '-Confirm:$false', {
      ...process.env, USERPROFILE: tempHome, OPENCODE_CONFIG_DIR: sandboxDir
    });
    assert.strictEqual(first.err, null, first.stderr);
    const rootsAfterFirst = fs.readdirSync(backupRoot).filter(root => !rootsBefore.has(root));
    assert.strictEqual(rootsAfterFirst.length, 1);
    const secondBytes = Buffer.from(`${fs.readFileSync(agentsPath, 'utf8')}\nrapid-two`, 'utf8');
    fs.writeFileSync(agentsPath, secondBytes);
    const second = await runPowershell(path.join(SCRIPT_DIR, 'update-opencode-global.ps1'), '-Confirm:$false', {
      ...process.env, USERPROFILE: tempHome, OPENCODE_CONFIG_DIR: sandboxDir
    });
    assert.strictEqual(second.err, null, second.stderr);
    const rootsAfterSecond = fs.readdirSync(backupRoot).filter(root => !rootsBefore.has(root));
    assert.strictEqual(rootsAfterSecond.length, 2, 'rapid updates must not share/overwrite operation root');
    const [firstRoot, secondRoot] = rootsAfterSecond.sort();
    const contents = rootsAfterSecond.map(root => fs.readFileSync(path.join(backupRoot, root, 'AGENTS.md')));
    assert.ok(contents.some(bytes => bytes.equals(firstBytes)), 'first prior bytes preserved');
    assert.ok(contents.some(bytes => bytes.equals(secondBytes)), 'second prior bytes preserved');
  });
});

describe('sandbox-init-opencode-project', () => {
  let tempHome;
  let originalHome;
  let projectDir;
  let sandboxDir;

  before(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-sandbox-init-'));
    originalHome = process.env.USERPROFILE;
    projectDir = path.join(tempHome, 'test-project');
    sandboxDir = path.join(tempHome, '.config', 'opencode');
    fs.mkdirSync(projectDir);
    process.env.USERPROFILE = tempHome;
  });

  after(() => {
    if (tempHome && fs.existsSync(tempHome)) {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
    process.env.USERPROFILE = originalHome;
  });

  it('init does NOT create AGENTS.md by default', async () => {
    const result = await runPowershell(path.join(SCRIPT_DIR, 'init-opencode-project.ps1'), `-ProjectPath "${projectDir}"`, {
      ...process.env,
      USERPROFILE: tempHome,
      OPENCODE_CONFIG_DIR: sandboxDir
    });
    assert.strictEqual(result.err, null, `Init should succeed: ${result.stderr}`);
    assert.ok(!fs.existsSync(path.join(projectDir, 'AGENTS.md')), 'AGENTS.md should NOT be created');
  });

  it('init does NOT create bootstrap manifest by default', async () => {
    const result = await runPowershell(path.join(SCRIPT_DIR, 'init-opencode-project.ps1'), `-ProjectPath "${projectDir}"`, {
      ...process.env,
      USERPROFILE: tempHome,
      OPENCODE_CONFIG_DIR: sandboxDir
    });
    assert.strictEqual(result.err, null, `Init should succeed: ${result.stderr}`);
    assert.ok(!fs.existsSync(path.join(projectDir, '.opencode', 'bootstrap-manifest.json')), 'bootstrap-manifest.json should NOT be created');
  });

  it('init creates opencode.json', async () => {
    const result = await runPowershell(path.join(SCRIPT_DIR, 'init-opencode-project.ps1'), `-ProjectPath "${projectDir}"`, {
      ...process.env,
      USERPROFILE: tempHome,
      OPENCODE_CONFIG_DIR: sandboxDir
    });
    assert.strictEqual(result.err, null, `Init should succeed: ${result.stderr}`);
    assert.ok(fs.existsSync(path.join(projectDir, 'opencode.json')), 'opencode.json should be created');
  });

  it('init -IncludeBootstrapManifest creates bootstrap at correct path', async () => {
    const result = await runPowershell(path.join(SCRIPT_DIR, 'init-opencode-project.ps1'), `-ProjectPath "${projectDir}" -IncludeBootstrapManifest`, {
      ...process.env,
      USERPROFILE: tempHome,
      OPENCODE_CONFIG_DIR: sandboxDir
    });
    assert.strictEqual(result.err, null, `Init should succeed: ${result.stderr}`);
    assert.ok(fs.existsSync(path.join(projectDir, '.opencode', 'bootstrap-manifest.json')), 'bootstrap-manifest.json should be created');
    const manifest = JSON.parse(fs.readFileSync(path.join(projectDir, '.opencode', 'bootstrap-manifest.json'), 'utf8'));
    assert.ok(manifest.schema_version, 'Bootstrap manifest should have schema_version');
  });

  it('init -IncludeIntelligence creates intelligence structure', async () => {
    const result = await runPowershell(path.join(SCRIPT_DIR, 'init-opencode-project.ps1'), `-ProjectPath "${projectDir}" -IncludeIntelligence`, {
      ...process.env,
      USERPROFILE: tempHome,
      OPENCODE_CONFIG_DIR: sandboxDir
    });
    assert.strictEqual(result.err, null, `Init should succeed: ${result.stderr}`);
    assert.ok(fs.existsSync(path.join(projectDir, '.intelligence', 'manifest.json')), 'intelligence manifest should be created');
    assert.ok(fs.existsSync(path.join(projectDir, '.intelligence', 'index.json')), 'intelligence index should be created');
  });
});

describe('init-ai-env-docs-accuracy', () => {
  it('init-ai-env.md command includes required flags', () => {
    const content = fs.readFileSync(path.join(GLOBAL_ROOT, 'commands', 'init-ai-env.md'), 'utf8');
    assert.ok(content.includes('-IncludeIntelligence'), 'Should include -IncludeIntelligence');
    assert.ok(content.includes('-IncludeContracts'), 'Should include -IncludeContracts');
    assert.ok(content.includes('-IncludeBootstrapManifest'), 'Should include -IncludeBootstrapManifest');
  });

  it('init-ai-env.md states AGENTS.md is NOT created', () => {
    const content = fs.readFileSync(path.join(GLOBAL_ROOT, 'commands', 'init-ai-env.md'), 'utf8');
    assert.ok(content.toLowerCase().includes('/init'), 'Should mention /init');
    assert.ok(content.toLowerCase().includes('not created') || content.toLowerCase().includes('not created by this script'), 'Should state AGENTS.md not created');
  });

  it('init-ai-env.md mentions idempotency and Force', () => {
    const content = fs.readFileSync(path.join(GLOBAL_ROOT, 'commands', 'init-ai-env.md'), 'utf8');
    assert.ok(content.toLowerCase().includes('idempotent'), 'Should mention idempotency');
    assert.ok(content.includes('-Force'), 'Should mention -Force');
  });
});

describe('launcher-agent-mode-validation', () => {
  let tempHome;
  let originalHome;
  let projectDir;
  let sandboxDir;

  function resetProject(config) {
    fs.rmSync(path.join(projectDir, '.opencode', 'agents'), { recursive: true, force: true });
    fs.mkdirSync(path.join(projectDir, '.opencode', 'agents'), { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'opencode.json'), JSON.stringify(config, null, 2));
  }

  before(async () => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-sandbox-launcher-'));
    originalHome = process.env.USERPROFILE;
    projectDir = path.join(tempHome, 'test-project');
    sandboxDir = path.join(tempHome, '.config', 'opencode');
    fs.mkdirSync(projectDir);
    fs.mkdirSync(path.join(projectDir, '.opencode'));
    fs.mkdirSync(path.join(projectDir, '.opencode', 'agents'));
    process.env.USERPROFILE = tempHome;

    // Install runtime FIRST so launcher has its required files
    const installResult = await runPowershell(path.join(SCRIPT_DIR, 'install-opencode-global.ps1'), '', {
      ...process.env,
      USERPROFILE: tempHome,
      OPENCODE_CONFIG_DIR: sandboxDir
    });
    if (installResult.err) {
      throw new Error(`Failed to install runtime: ${installResult.stderr}`);
    }
  });

  after(() => {
    if (tempHome && fs.existsSync(tempHome)) {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
    process.env.USERPROFILE = originalHome;
  });

  it('launcher rejects invalid agent mode', async () => {
    fs.writeFileSync(path.join(projectDir, 'opencode.json'), JSON.stringify({
      agent: { testAgent: { model: 'test/model', mode: 'fast' } }
    }, null, 2));

    const result = await runPowershell(
      path.join(SCRIPT_DIR, 'opencode-launcher.ps1'),
      `go -TargetDir "${projectDir}" -DryRun`,
      { ...process.env, USERPROFILE: tempHome, OPENCODE_CONFIG_DIR: sandboxDir }
    );

    assert.ok(result.err !== null || result.stderr.includes('MODE_VALIDATION_FAILED'), 'Should reject invalid mode');
    assert.ok(result.stderr.includes('invalid mode') || result.stderr.includes('fast'), 'Should mention the invalid mode');
  });

  it('launcher accepts valid agent mode primary', async () => {
    fs.writeFileSync(path.join(projectDir, 'opencode.json'), JSON.stringify({
      agent: { testAgent: { model: 'test/model', mode: 'primary' } }
    }, null, 2));

    const result = await runPowershell(
      path.join(SCRIPT_DIR, 'opencode-launcher.ps1'),
      `go -TargetDir "${projectDir}" -DryRun`,
      { ...process.env, USERPROFILE: tempHome, OPENCODE_CONFIG_DIR: sandboxDir }
    );

    assert.strictEqual(result.err, null, `Valid mode should be accepted: ${result.stdout}${result.stderr}`);
    assert.ok(result.stdout.includes('[launcher]') || result.stdout.includes('Profile:'), 'Should produce routing output');
  });

  it('launcher accepts valid agent mode subagent', async () => {
    fs.writeFileSync(path.join(projectDir, 'opencode.json'), JSON.stringify({
      agent: { workerAgent: { model: 'test/model', mode: 'subagent' } }
    }, null, 2));

    const result = await runPowershell(
      path.join(SCRIPT_DIR, 'opencode-launcher.ps1'),
      `go -TargetDir "${projectDir}" -DryRun`,
      { ...process.env, USERPROFILE: tempHome, OPENCODE_CONFIG_DIR: sandboxDir }
    );

    assert.strictEqual(result.err, null, `Valid mode should be accepted: ${result.stdout}${result.stderr}`);
  });

  it('launcher accepts valid agent mode all', async () => {
    resetProject({ agent: { sharedAgent: { model: 'test/model', mode: 'all' } } });
    const result = await runPowershell(path.join(SCRIPT_DIR, 'opencode-launcher.ps1'), `go -TargetDir "${projectDir}" -DryRun`, {
      ...process.env, USERPROFILE: tempHome, OPENCODE_CONFIG_DIR: sandboxDir
    });
    assert.strictEqual(result.err, null, `all should be accepted: ${result.stderr}`);
  });

  it('launcher preserves JSONC URLs, escaped quotes, comments, and trailing commas', async () => {
    fs.rmSync(path.join(projectDir, '.opencode', 'agents'), { recursive: true, force: true });
    fs.unlinkSync(path.join(projectDir, 'opencode.json'));
    fs.writeFileSync(path.join(projectDir, 'opencode.jsonc'), `{
      // real comment
      "$schema": "https://example.test/config.json",
      "note": "escaped quote: \\\" and // is not a comment",
      "agent": { "jsoncAgent": { "model": "test/model", "mode": "primary", }, },
    }`, 'utf8');
    const result = await runPowershell(path.join(SCRIPT_DIR, 'opencode-launcher.ps1'), `go -TargetDir "${projectDir}" -DryRun`, {
      ...process.env, USERPROFILE: tempHome, OPENCODE_CONFIG_DIR: sandboxDir
    });
    assert.strictEqual(result.err, null, `Valid JSONC should parse: ${result.stderr}`);
  });

  it('launcher rejects orchestrator mode from JSON with agent, source, and valid values', async () => {
    resetProject({ agent: { jsonAgent: { model: 'test/model', mode: 'orchestrator' } } });
    const result = await runPowershell(path.join(SCRIPT_DIR, 'opencode-launcher.ps1'), `go -TargetDir "${projectDir}" -DryRun`, {
      ...process.env, USERPROFILE: tempHome, OPENCODE_CONFIG_DIR: sandboxDir
    });
    assert.ok(result.err, 'orchestrator mode should fail');
    assert.match(result.stderr, /jsonAgent.*orchestrator.*opencode\.json.*primary, subagent, all/i);
  });

  it('launcher rejects orchestrator mode from Markdown with agent, source, and valid values', async () => {
    resetProject({});
    fs.writeFileSync(path.join(projectDir, '.opencode', 'agents', 'markdown-agent.md'), '---\nmode: orchestrator\n---\n', 'utf8');
    const result = await runPowershell(path.join(SCRIPT_DIR, 'opencode-launcher.ps1'), `go -TargetDir "${projectDir}" -DryRun`, {
      ...process.env, USERPROFILE: tempHome, OPENCODE_CONFIG_DIR: sandboxDir
    });
    assert.ok(result.err, 'orchestrator mode should fail');
    assert.match(result.stderr, /markdown-agent.*orchestrator.*\.opencode\/agents\/markdown-agent\.md.*primary, subagent, all/i);
  });

  it('launcher rejects conflicting same-agent modes across JSON and Markdown', async () => {
    resetProject({ agent: { sharedAgent: { model: 'test/model', mode: 'primary' } } });
    fs.writeFileSync(path.join(projectDir, '.opencode', 'agents', 'sharedAgent.md'), '---\nmode: subagent\n---\n', 'utf8');
    const result = await runPowershell(path.join(SCRIPT_DIR, 'opencode-launcher.ps1'), `go -TargetDir "${projectDir}" -DryRun`, {
      ...process.env, USERPROFILE: tempHome, OPENCODE_CONFIG_DIR: sandboxDir
    });
    assert.ok(result.err, 'conflicting modes should fail');
    assert.match(result.stderr, /sharedAgent.*conflicting modes: primary, subagent.*(?:opencode\.json.*\.opencode\/agents\/sharedAgent\.md|\.opencode\/agents\/sharedAgent\.md.*opencode\.json)/i);
  });

  it('launcher works without node_modules dependency', async () => {
    assert.ok(fs.existsSync(path.join(sandboxDir, 'opencode.profiles', 'go.jsonc')), 'Profile should be installed');

    fs.writeFileSync(path.join(projectDir, 'opencode.json'), JSON.stringify({
      agent: { myAgent: { model: 'test/model', mode: 'primary' } }
    }, null, 2));

    const result = await runPowershell(
      path.join(SCRIPT_DIR, 'opencode-launcher.ps1'),
      `go -TargetDir "${projectDir}" -DryRun`,
      { ...process.env, USERPROFILE: tempHome, OPENCODE_CONFIG_DIR: sandboxDir }
    );

    assert.strictEqual(result.err, null, `Launcher should work: ${result.stdout}${result.stderr}`);
    assert.ok(result.stdout.includes('[launcher]'), 'Should produce launcher output');
  });

  it('launcher honors OPENCODE_CONFIG_DIR when it differs from USERPROFILE default', async () => {
    resetProject({ agent: { envAgent: { model: 'test/model', mode: 'primary' } } });
    const differentHome = path.join(tempHome, 'unrelated-user-home');
    const result = await runPowershell(path.join(SCRIPT_DIR, 'opencode-launcher.ps1'), `go -TargetDir "${projectDir}" -DryRun`, {
      ...process.env, USERPROFILE: differentHome, OPENCODE_CONFIG_DIR: sandboxDir
    });
    assert.strictEqual(result.err, null, `Launcher should use OPENCODE_CONFIG_DIR: ${result.stderr}`);
  });
});

describe('install-update-parity', () => {
  let tempHome;
  let originalHome;
  let sandboxDir;

  before(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-parity-'));
    originalHome = process.env.USERPROFILE;
    sandboxDir = path.join(tempHome, '.config', 'opencode');
    process.env.USERPROFILE = tempHome;
  });

  after(() => {
    if (tempHome && fs.existsSync(tempHome)) {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
    process.env.USERPROFILE = originalHome;
  });

  it('install and update share same inventory via manifest', async () => {
    const result = execSync(`pwsh -NoProfile -ExecutionPolicy Bypass -File "${path.join(DIST_DIR, 'resolve-runtime-manifest.ps1')}" -Action GetInventory`, {
      encoding: 'utf8',
      cwd: GLOBAL_ROOT
    });
    const sourceInventory = JSON.parse(result);

    await runPowershell(path.join(SCRIPT_DIR, 'install-opencode-global.ps1'), '', {
      ...process.env,
      USERPROFILE: tempHome,
      OPENCODE_CONFIG_DIR: sandboxDir
    });

    let missingCount = 0;
    for (const item of sourceInventory) {
      if (!fs.existsSync(path.join(sandboxDir, item.runtime))) {
        missingCount++;
      }
    }
    assert.strictEqual(missingCount, 0, `All ${sourceInventory.length} inventory items should be installed`);
  });
});

describe('sandbox-cleanup-runtime', () => {
  let tempRoot;
  let runtimeDir;

  before(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-cleanup-'));
    runtimeDir = path.join(tempRoot, 'runtime');
    fs.mkdirSync(path.join(runtimeDir, 'docs'), { recursive: true });
    fs.mkdirSync(path.join(runtimeDir, 'scripts'), { recursive: true });
    fs.mkdirSync(path.join(runtimeDir, 'distribution'), { recursive: true });
    fs.mkdirSync(path.join(runtimeDir, 'opencode.backups'), { recursive: true });
    fs.writeFileSync(path.join(runtimeDir, 'docs', 'legacy.md'), 'legacy', 'utf8');
    fs.writeFileSync(path.join(runtimeDir, 'distribution', 'runtime-manifest.json'), JSON.stringify({ categories: { runtime_scripts: { entries: [{ runtime: 'scripts/opencode-launcher.ps1' }] } } }), 'utf8');
    fs.writeFileSync(path.join(runtimeDir, 'scripts', 'opencode-launcher.ps1'), 'current', 'utf8');
    fs.writeFileSync(path.join(runtimeDir, 'scripts', 'opencode-launcher.ps1.bak'), 'managed-backup', 'utf8');
    fs.writeFileSync(path.join(runtimeDir, 'scripts', 'user-tool.ps1.bak'), 'unknown-backup', 'utf8');
    fs.writeFileSync(path.join(runtimeDir, 'opencode.backups', 'preserved.jsonc.bak-20260726-120000'), 'archive', 'utf8');
  });

  after(() => {
    if (tempRoot && fs.existsSync(tempRoot)) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('defaults to dry-run and scans adjacent backups without modifying files', async () => {
    const before = getAllFiles(runtimeDir).sort();
    const result = await runPowershell(path.join(SCRIPT_DIR, 'cleanup-runtime.ps1'), '', {
      ...process.env,
      OPENCODE_CONFIG_DIR: runtimeDir
    });

    assert.strictEqual(result.err, null, `Cleanup dry-run should succeed: ${result.stdout}${result.stderr}`);
    assert.ok(result.stdout.includes('[DRY RUN]'), 'Cleanup should default to dry-run');
    assert.ok(result.stdout.includes('scripts\\opencode-launcher.ps1.bak'), `Cleanup should report managed adjacent backup: ${result.stdout}`);
    assert.ok(!result.stdout.includes('[WOULD QUARANTINE] scripts\\user-tool.ps1.bak'), 'Cleanup preserves unknown adjacent backup');
    assert.ok(!result.stdout.includes('[WOULD QUARANTINE] opencode.backups'), 'Cleanup must not scan the protected user archive');
    assert.deepStrictEqual(getAllFiles(runtimeDir).sort(), before, 'Cleanup dry-run must not move or remove files');
  });

  it('Force quarantines only known legacy content and preserves protected state', async () => {
    const protectedPaths = [
      'credentials/token.txt', 'credential/token.txt', 'sessions/state.json', 'session/state.json',
      'cache/value', 'caches/value', 'logs/log.txt', 'node_modules/pkg/index.js',
      '.opencode/node_modules/pkg/index.js', '.opencode/credentials/token', 'opencode.backups/archive.bak',
      'runtime/backups/managed/keep.txt', 'bin/orchestration/keep.mjs', 'bin/environment/keep.mjs'
    ];
    for (const relative of protectedPaths) {
      const full = path.join(runtimeDir, relative);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, `protected:${relative}`, 'utf8');
    }
    fs.mkdirSync(path.join(runtimeDir, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(runtimeDir, 'docs', 'move-me.md'), 'legacy-content', 'utf8');
    const result = await runPowershell(path.join(SCRIPT_DIR, 'cleanup-runtime.ps1'), '-Force', {
      ...process.env, OPENCODE_CONFIG_DIR: runtimeDir
    });
    assert.strictEqual(result.err, null, `Applied cleanup should succeed: ${result.stderr}`);
    const backupBase = path.join(runtimeDir, 'runtime', 'backups');
    const roots = fs.readdirSync(backupBase).filter(name => name.startsWith('legacy-runtime-'));
    assert.strictEqual(roots.length, 1, 'known legacy files should use one quarantine root');
    const moved = path.join(backupBase, roots[0], 'docs', 'move-me.md');
    assert.strictEqual(fs.readFileSync(moved, 'utf8'), 'legacy-content', 'quarantine preserves relative path and bytes');
    assert.ok(!fs.existsSync(path.join(runtimeDir, 'docs', 'move-me.md')), 'legacy source is moved');
    assert.ok(!fs.existsSync(path.join(runtimeDir, 'scripts', 'opencode-launcher.ps1.bak')), `managed adjacent backup is quarantined: ${result.stdout}`);
    assert.strictEqual(fs.readFileSync(path.join(runtimeDir, 'scripts', 'user-tool.ps1.bak'), 'utf8'), 'unknown-backup', 'unknown adjacent backup remains');
    for (const relative of protectedPaths) {
      assert.strictEqual(fs.readFileSync(path.join(runtimeDir, relative), 'utf8'), `protected:${relative}`, `${relative} remains protected`);
    }
  });
});

describe('sandbox-installed-updater-source-root', () => {
  let tempHome;
  let originalHome;
  let sandboxDir;
  let installedUpdateScript;

  before(async () => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-srcroot-test-'));
    originalHome = process.env.USERPROFILE;
    sandboxDir = path.join(tempHome, '.config', 'opencode');
    process.env.USERPROFILE = tempHome;

    // Install runtime first
    const installResult = await runPowershell(path.join(SCRIPT_DIR, 'install-opencode-global.ps1'), '', {
      ...process.env,
      USERPROFILE: tempHome,
      OPENCODE_CONFIG_DIR: sandboxDir
    });
    if (installResult.err) {
      throw new Error(`Failed to install runtime: ${installResult.stderr}`);
    }

    // Path to the installed update script (in the sandbox runtime)
    installedUpdateScript = path.join(sandboxDir, 'scripts', 'update-opencode-global.ps1');
  });

  after(() => {
    if (tempHome && fs.existsSync(tempHome)) {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
    process.env.USERPROFILE = originalHome;
  });

  it('installed updater without SourceRoot fails fast with clear error', async () => {
    // Running the installed updater without SourceRoot should fail with clear message
    const result = await runPowershell(installedUpdateScript, '-DryRun', {
      ...process.env,
      USERPROFILE: tempHome,
      OPENCODE_CONFIG_DIR: sandboxDir
    });

    // Should fail
    assert.ok(result.err !== null, 'Should fail when SourceRoot is missing');
    assert.ok(result.stderr.includes('Source layout validation failed') ||
              result.stderr.includes('runtime-manifest.json') ||
              result.stderr.includes('SourceRoot'),
      `Error should mention SourceRoot requirement. Got: ${result.stderr}`);
  });

  it('installed doctor treats generator parity as packaged N/A rather than an issue', async () => {
    const installedDoctor = path.join(sandboxDir, 'scripts', 'doctor-opencode-global.ps1');
    const result = await runPowershell(installedDoctor, '', {
      ...process.env, USERPROFILE: tempHome, OPENCODE_CONFIG_DIR: sandboxDir
    });
    const output = `${result.stdout}${result.stderr}`;
    assert.match(output, /N\/A\/PACKAGED.*versioned validators/i);
    assert.ok(!/Validator drift detected/i.test(output), 'installed runtime must not run unavailable generator parity');
  });

  it('installed updater with SourceRoot succeeds with zero errors', async () => {
    // Running the installed updater WITH correct SourceRoot should succeed
    const result = await runPowershell(
      installedUpdateScript,
      `-SourceRoot "${GLOBAL_ROOT}" -DryRun -Confirm:` + '$false',
      {
        ...process.env,
        USERPROFILE: tempHome,
        OPENCODE_CONFIG_DIR: sandboxDir
      }
    );

    assert.strictEqual(result.err, null, `Updater with SourceRoot should succeed: ${result.stdout}${result.stderr}`);
    assert.ok(result.stdout.includes('[summary]'), 'Should show summary');
    assert.ok(result.stdout.includes('Errors:    0') || result.stdout.includes('Unchanged:'), 'Should show zero errors');
  });

  it('installed updater accepts OPENCODE_SOURCE_ROOT fallback', async () => {
    const result = await runPowershell(installedUpdateScript, '-DryRun -Confirm:$false', {
      ...process.env, USERPROFILE: tempHome, OPENCODE_CONFIG_DIR: sandboxDir, OPENCODE_SOURCE_ROOT: GLOBAL_ROOT
    });
    assert.strictEqual(result.err, null, `OPENCODE_SOURCE_ROOT fallback should work: ${result.stderr}`);
    assert.ok(result.stdout.includes('Errors:    0'));
  });

  it('source updater still works with implicit SourceRoot', async () => {
    // Running the source updater (not installed) should work without explicit SourceRoot
    const result = await runPowershell(
      path.join(SCRIPT_DIR, 'update-opencode-global.ps1'),
      `-DryRun -Confirm:` + '$false',
      {
        ...process.env,
        USERPROFILE: tempHome,
        OPENCODE_CONFIG_DIR: sandboxDir
      }
    );

    assert.strictEqual(result.err, null, `Source updater should work: ${result.stdout}${result.stderr}`);
    assert.ok(result.stdout.includes('[summary]'), 'Should show summary');
  });

  it('installed updater -SourceRoot DryRun makes zero modifications', async () => {
    const beforeFiles = getAllFiles(sandboxDir);

    const result = await runPowershell(
      installedUpdateScript,
      `-SourceRoot "${GLOBAL_ROOT}" -DryRun -Confirm:` + '$false',
      {
        ...process.env,
        USERPROFILE: tempHome,
        OPENCODE_CONFIG_DIR: sandboxDir
      }
    );

    assert.strictEqual(result.err, null, `Dry run should succeed: ${result.stdout}${result.stderr}`);
    const afterFiles = getAllFiles(sandboxDir);
    assert.deepStrictEqual(beforeFiles.sort(), afterFiles.sort(), 'DryRun should make zero modifications');
  });

  it('rejects SourceRoot equal to target runtime', async () => {
    const beforeFiles = getAllFiles(sandboxDir).sort();
    const result = await runPowershell(path.join(SCRIPT_DIR, 'update-opencode-global.ps1'), `-SourceRoot "${sandboxDir}" -DryRun`, {
      ...process.env, USERPROFILE: tempHome, OPENCODE_CONFIG_DIR: sandboxDir
    });
    assert.ok(result.err, 'source equal to target must fail');
    assert.match(`${result.stdout}${result.stderr}`, /SourceRoot cannot be the same as the target/i);
    assert.deepStrictEqual(getAllFiles(sandboxDir).sort(), beforeFiles, 'rejection must write nothing');
  });
});

describe('cross-session-wrapper-contract', () => {
  it('forwards doctor required paths and canonical approve-local-integration flag', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-cross-session-'));
    try {
      const cliDir = path.join(root, 'bin', 'orchestration');
      fs.mkdirSync(cliDir, { recursive: true });
      const capture = path.join(root, 'argv.json');
      fs.writeFileSync(path.join(cliDir, 'cross-session-cli.mjs'), `import fs from 'node:fs'; fs.writeFileSync(process.env.CAPTURE_PATH, JSON.stringify(process.argv.slice(2)));`, 'utf8');
      const args = `-Subcommand doctor -AiEnvHome "${root}/ai" -ProjectRoot "${root}/project" -EnvironmentManifest "${root}/environment.json" -ProjectManifest "${root}/project.json" -Spec "${root}/spec.md" -ApproveLocalIntegration`;
      const result = await runPowershell(path.join(SCRIPT_DIR, 'cross-session.ps1'), args, {
        ...process.env, OPENCODE_CONFIG_DIR: root, CAPTURE_PATH: capture
      });
      assert.strictEqual(result.err, null, result.stderr);
      const argv = JSON.parse(fs.readFileSync(capture, 'utf8'));
      for (const flag of ['--ai-env-home', '--project-root', '--environment-manifest', '--project-manifest', '--spec', '--approve-local-integration']) {
        assert.ok(argv.includes(flag), `forwards ${flag}`);
      }
      assert.ok(!argv.includes('--approve-protected-ref'), 'never forwards deprecated flag');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
