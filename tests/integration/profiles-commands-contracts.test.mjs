import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { exec } from 'node:child_process';

const GLOBAL_ROOT = path.resolve(import.meta.dirname, '..', '..');
const SCRIPT_PATH = path.join(GLOBAL_ROOT, 'scripts', 'install-opencode-global.ps1');

describe('profiles-commands-contracts', () => {
  let tempHome;
  let originalHome;

  before(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-test-home-'));
    originalHome = process.env.USERPROFILE;
    process.env.USERPROFILE = tempHome;
  });

  after(() => {
    if (tempHome && fs.existsSync(tempHome)) {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
    process.env.USERPROFILE = originalHome;
  });

  before(async () => {
    await new Promise((resolve) => {
      exec(`pwsh -NoProfile -ExecutionPolicy Bypass -File "${SCRIPT_PATH}"`,
        { env: { ...process.env, USERPROFILE: tempHome } },
        (err, stdout, stderr) => resolve({ err, stdout, stderr })
      );
    });
  });

  it('installs 4 profile files', () => {
    const configDir = path.join(tempHome, '.config', 'opencode');
    const profilesDir = path.join(configDir, 'opencode.profiles');

    const expectedProfiles = [
      'go.jsonc',
      'chatgpt-plus.jsonc',
      'mix.jsonc',
      'minimax-plus.jsonc'
    ];

    for (const profile of expectedProfiles) {
      const profilePath = path.join(profilesDir, profile);
      assert.ok(fs.existsSync(profilePath), `${profile} should exist`);
    }

    const actualFiles = fs.readdirSync(profilesDir).filter(f => f.endsWith('.jsonc'));
    assert.strictEqual(actualFiles.length, 4, 'Should have exactly 4 profile files');
  });

  it('installs routing/model-matrix.json', () => {
    const configDir = path.join(tempHome, '.config', 'opencode');
    const matrixPath = path.join(configDir, 'routing', 'model-matrix.json');

    assert.ok(fs.existsSync(matrixPath), 'model-matrix.json should exist');

    const content = fs.readFileSync(matrixPath, 'utf8');
    assert.doesNotThrow(() => JSON.parse(content), 'model-matrix.json should be valid JSON');
  });

  it('installs 8 canonical commands', () => {
    const configDir = path.join(tempHome, '.config', 'opencode');
    const commandsDir = path.join(configDir, 'commands');

    const expectedCommands = [
      'go.md',
      'chatgpt-plus.md',
      'mix.md',
      'minimax-plus.md',
      'cross-session.md',
      'init-ai-env.md',
      'doctor-ai-env.md',
      'update-ai-env.md'
    ];

    assert.ok(fs.existsSync(commandsDir), 'Commands directory should be created by install');
    for (const cmd of expectedCommands) {
      assert.ok(fs.existsSync(path.join(commandsDir, cmd)), `${cmd} should be installed`);
    }
  });

  it('installs the 5 core contract schema files', () => {
    const configDir = path.join(tempHome, '.config', 'opencode');
    const contractsDir = path.join(configDir, 'contracts');

    const expectedContracts = [
      'bootstrap-manifest.schema.json',
      'manifest.schema.json',
      'session.schema.json',
      'index.schema.json',
      'graph.schema.json'
    ];

    const actualFiles = fs.readdirSync(contractsDir).filter(f => f.endsWith('.json'));
    assert.ok(actualFiles.length >= expectedContracts.length,
      `Should have at least ${expectedContracts.length} contracts, found ${actualFiles.length}`);

    for (const contract of expectedContracts) {
      const contractPath = path.join(contractsDir, contract);
      assert.ok(fs.existsSync(contractPath), `${contract} should exist`);
    }
  });

  it('contract files are valid JSON', () => {
    const configDir = path.join(tempHome, '.config', 'opencode');
    const contractsDir = path.join(configDir, 'contracts');

    const contractFiles = fs.readdirSync(contractsDir).filter(f => f.endsWith('.json'));

    for (const file of contractFiles) {
      const filePath = path.join(contractsDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      assert.doesNotThrow(() => JSON.parse(content), `${file} should be valid JSON`);
    }
  });
});