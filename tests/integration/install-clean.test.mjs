import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { exec } from 'node:child_process';

const GLOBAL_ROOT = path.resolve(import.meta.dirname, '../..');
const SCRIPT_PATH = path.join(GLOBAL_ROOT, 'scripts', 'install-opencode-global.ps1');

describe('install-clean', () => {
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

  it('creates files in correct locations', async () => {
    const result = await new Promise((resolve, reject) => {
      exec(`pwsh -NoProfile -ExecutionPolicy Bypass -File "${SCRIPT_PATH}"`, 
        { env: { ...process.env, USERPROFILE: tempHome } },
        (err, stdout, stderr) => resolve({ err, stdout, stderr })
      );
    });

    assert.strictEqual(result.err, null, `Script should run without error: ${result.stderr}`);

    const configDir = path.join(tempHome, '.config', 'opencode');
    assert.ok(fs.existsSync(path.join(configDir, 'opencode.jsonc')), 'opencode.jsonc should exist');
    assert.ok(fs.existsSync(path.join(configDir, 'opencode.profiles', 'go.jsonc')), 'go.jsonc should exist');
    assert.ok(fs.existsSync(path.join(configDir, 'opencode.profiles', 'chatgpt-plus.jsonc')), 'chatgpt-plus.jsonc should exist');
    assert.ok(fs.existsSync(path.join(configDir, 'opencode.profiles', 'mix.jsonc')), 'mix.jsonc should exist');
    assert.ok(fs.existsSync(path.join(configDir, 'opencode.profiles', 'minimax-plus.jsonc')), 'minimax-plus.jsonc should exist');
    assert.ok(fs.existsSync(path.join(configDir, 'routing', 'model-matrix.json')), 'model-matrix.json should exist');
    assert.ok(fs.existsSync(path.join(configDir, 'routing', 'model-matrix.schema.json')), 'model-matrix.schema.json should exist');
    assert.ok(fs.existsSync(path.join(configDir, 'AGENTS.md')), 'AGENTS.md should exist');
    assert.ok(fs.existsSync(path.join(configDir, 'scripts', 'install-opencode-global.ps1')), 'install script should exist');
  });

  it('installs all contract schemas', async () => {
    const configDir = path.join(tempHome, '.config', 'opencode');
    const contractsDir = path.join(configDir, 'contracts');

    const expectedContracts = [
      'bootstrap-manifest.schema.json',
      'manifest.schema.json',
      'session.schema.json',
      'index.schema.json',
      'graph.schema.json'
    ];

    for (const contract of expectedContracts) {
      assert.ok(fs.existsSync(path.join(contractsDir, contract)), `${contract} should exist`);
    }
  });

  it('does not create files outside target directory', async () => {
    const configDir = path.join(tempHome, '.config', 'opencode');

    const outsideMarker = path.join(tempHome, 'opencode.jsonc');
    const outsideProfiles = path.join(tempHome, 'opencode.profiles');
    const outsideScripts = path.join(tempHome, 'scripts');

    assert.ok(!fs.existsSync(outsideMarker), 'Should not create opencode.jsonc outside .config/opencode');
    assert.ok(!fs.existsSync(outsideProfiles), 'Should not create opencode.profiles outside .config/opencode');
    assert.ok(!fs.existsSync(outsideScripts), 'Should not create scripts outside .config/opencode');

    assert.ok(fs.existsSync(path.join(configDir, 'scripts')), 'Scripts should be inside config dir');
  });
});