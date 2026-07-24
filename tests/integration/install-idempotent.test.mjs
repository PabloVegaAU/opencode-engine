import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { exec } from 'node:child_process';

const GLOBAL_ROOT = path.resolve(import.meta.dirname, '..', '..');
const SCRIPT_PATH = path.join(GLOBAL_ROOT, 'scripts', 'install-opencode-global.ps1');

describe('install-idempotent', () => {
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

  it('second run results in 0 changes', async () => {
    const runInstall = () => new Promise((resolve) => {
      exec(`pwsh -NoProfile -ExecutionPolicy Bypass -File "${SCRIPT_PATH}"`,
        { env: { ...process.env, USERPROFILE: tempHome } },
        (err, stdout, stderr) => resolve({ err, stdout, stderr })
      );
    });

    const firstResult = await runInstall();
    assert.strictEqual(firstResult.err, null, 'First run should succeed');

    const secondResult = await runInstall();
    assert.strictEqual(secondResult.err, null, 'Second run should succeed');

    const skipCount = (secondResult.stdout.match(/\[skip\]/g) || []).length;
    const installCount = (secondResult.stdout.match(/\[install\]/g) || []).length;

    assert.ok(skipCount > 0, 'Second run should skip existing files');
    assert.strictEqual(installCount, 0, 'Second run should not install any new files');
  });

  it('files remain unchanged after second run', async () => {
    const configDir = path.join(tempHome, '.config', 'opencode');
    const opencodeJsonc = path.join(configDir, 'opencode.jsonc');

    const firstContent = fs.readFileSync(opencodeJsonc, 'utf8');

    await new Promise((resolve) => {
      exec(`pwsh -NoProfile -ExecutionPolicy Bypass -File "${SCRIPT_PATH}"`,
        { env: { ...process.env, USERPROFILE: tempHome } },
        (err, stdout, stderr) => resolve({ err, stdout, stderr })
      );
    });

    const secondContent = fs.readFileSync(opencodeJsonc, 'utf8');
    assert.strictEqual(firstContent, secondContent, 'File content should be unchanged');
  });
});