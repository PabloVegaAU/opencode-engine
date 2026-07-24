import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { exec } from 'node:child_process';

const GLOBAL_ROOT = path.resolve(import.meta.dirname, '..', '..');
const SCRIPT_PATH = path.join(GLOBAL_ROOT, 'scripts', 'install-opencode-global.ps1');

describe('dryrun-zero-writes', () => {
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

  it('creates no files with -DryRun', async () => {
    const result = await new Promise((resolve) => {
      exec(`pwsh -NoProfile -ExecutionPolicy Bypass -File "${SCRIPT_PATH}" -DryRun`,
        { env: { ...process.env, USERPROFILE: tempHome } },
        (err, stdout, stderr) => resolve({ err, stdout, stderr })
      );
    });

    assert.strictEqual(result.err, null, `Dry run should succeed: ${result.stderr}`);
    assert.ok(result.stdout.includes('Dry run complete'), 'Should output dry run complete');

    const configDir = path.join(tempHome, '.config', 'opencode');
    const opencodeJsonc = path.join(configDir, 'opencode.jsonc');
    assert.ok(!fs.existsSync(opencodeJsonc), 'opencode.jsonc should not be created in dry run');

    const markers = ['[would install]', '[would install]'];
    const hasInstallMarkers = markers.some(m => result.stdout.includes(m));
    assert.ok(hasInstallMarkers, 'Dry run should show what would be installed');
  });

  it('creates no files with -WhatIf', async () => {
    const result = await new Promise((resolve) => {
      exec(`pwsh -NoProfile -ExecutionPolicy Bypass -File "${SCRIPT_PATH}" -WhatIf`,
        { env: { ...process.env, USERPROFILE: tempHome } },
        (err, stdout, stderr) => resolve({ err, stdout, stderr })
      );
    });

    const configDir = path.join(tempHome, '.config', 'opencode');
    const opencodeJsonc = path.join(configDir, 'opencode.jsonc');
    assert.ok(!fs.existsSync(opencodeJsonc), 'opencode.jsonc should not be created with -WhatIf');
  });
});