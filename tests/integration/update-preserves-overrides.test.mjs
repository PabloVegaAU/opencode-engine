import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { exec } from 'node:child_process';

const GLOBAL_ROOT = path.resolve(import.meta.dirname, '..', '..');
const INSTALL_SCRIPT = path.join(GLOBAL_ROOT, 'scripts', 'install-opencode-global.ps1');
const UPDATE_SCRIPT = path.join(GLOBAL_ROOT, 'scripts', 'update-opencode-global.ps1');

describe('update-preserves-overrides', () => {
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

  it('overwrites local modifications during update', async () => {
    const runScript = (scriptPath, extraArgs = '') => new Promise((resolve) => {
      exec(`pwsh -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}" ${extraArgs}`.trim(),
        { env: { ...process.env, USERPROFILE: tempHome } },
        (err, stdout, stderr) => resolve({ err, stdout, stderr })
      );
    });

    await runScript(INSTALL_SCRIPT);

    const configDir = path.join(tempHome, '.config', 'opencode');
    const agentsPath = path.join(configDir, 'AGENTS.md');

    const originalContent = fs.readFileSync(agentsPath, 'utf8');
    const modifiedContent = originalContent + '\n\n<!-- LOCAL MODIFICATION -->';

    fs.writeFileSync(agentsPath, modifiedContent, 'utf8');

    const updateResult = await runScript(UPDATE_SCRIPT, '-Confirm:$false');
    assert.strictEqual(updateResult.err, null, `Update should succeed: ${updateResult.stderr}`);

    const afterUpdateContent = fs.readFileSync(agentsPath, 'utf8');
    assert.ok(!afterUpdateContent.includes('<!-- LOCAL MODIFICATION -->'),
      'Update should overwrite local modification (backup should exist)');
    assert.ok(afterUpdateContent.includes(originalContent.trim().split('\n')[0]),
      'File should contain original content');
  });

  it('creates backup for modified files during update', async () => {
    const runScript = (scriptPath, extraArgs = '') => new Promise((resolve) => {
      exec(`pwsh -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}" ${extraArgs}`.trim(),
        { env: { ...process.env, USERPROFILE: tempHome } },
        (err, stdout, stderr) => resolve({ err, stdout, stderr })
      );
    });

    await runScript(INSTALL_SCRIPT);

    const configDir = path.join(tempHome, '.config', 'opencode');
    const agentsPath = path.join(configDir, 'AGENTS.md');

    const originalContent = fs.readFileSync(agentsPath, 'utf8');
    const modifiedContent = originalContent + '\n\n<!-- ANOTHER MOD -->';
    fs.writeFileSync(agentsPath, modifiedContent, 'utf8');

    const updateResult = await runScript(UPDATE_SCRIPT, '-Confirm:$false');
    assert.ok(updateResult.stdout.includes('[backup]'), 'Should create backup');

    const afterUpdateContent = fs.readFileSync(agentsPath, 'utf8');
    assert.ok(!afterUpdateContent.includes('<!-- ANOTHER MOD -->'),
      'Update should overwrite local modification');

    // Check for backup in centralized location: runtime/backups/managed/<timestamp>/
    const backupsRoot = path.join(configDir, 'runtime', 'backups', 'managed');
    let foundBackup = false;
    if (fs.existsSync(backupsRoot)) {
      const timestampDirs = fs.readdirSync(backupsRoot);
      for (const tsDir of timestampDirs) {
        const backupPath = path.join(backupsRoot, tsDir, 'AGENTS.md');
        if (fs.existsSync(backupPath)) {
          const backupContent = fs.readFileSync(backupPath, 'utf8');
          if (backupContent.includes('<!-- ANOTHER MOD -->')) {
            foundBackup = true;
            break;
          }
        }
      }
    }
    assert.ok(foundBackup, 'Should find backup in runtime/backups/managed/<timestamp>/');
  });
});