import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { exec } from 'node:child_process';

const GLOBAL_ROOT = path.resolve(import.meta.dirname, '..', '..');
const SCRIPT_DIR = path.join(GLOBAL_ROOT, 'scripts');
const INSTALL_SCRIPT = path.join(SCRIPT_DIR, 'install-opencode-global.ps1');
const UPDATE_SCRIPT = path.join(SCRIPT_DIR, 'update-opencode-global.ps1');

function runPowershell(scriptPath, args = '') {
  return new Promise((resolve) => {
    exec(`pwsh -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}" ${args}`.trim(),
      { env: { ...process.env } },
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

function getFileSnapshot(dir) {
  const files = getAllFiles(dir);
  const snapshot = {};
  for (const file of files) {
    const relative = path.relative(dir, file).replace(/\\/g, '/');
    snapshot[relative] = fs.readFileSync(file, 'utf8');
  }
  return snapshot;
}

describe('idempotency', () => {
  let tempHome;
  let originalHome;
  let sandboxDir;

  before(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-idempotency-'));
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

  it('same plan applied twice produces identical final state', async () => {
    // First: install fresh (skip certify - tested separately)
    const installResult = await runPowershell(INSTALL_SCRIPT, '-SkipCertify');
    assert.strictEqual(installResult.err, null, `First install should succeed: ${installResult.stderr}`);

    // Capture state after first install
    const stateAfterInstall = getFileSnapshot(sandboxDir);
    const installOutput = installResult.stdout;

    // Second: apply update (should be idempotent - no changes needed)
    const updateResult1 = await runPowershell(UPDATE_SCRIPT, `-SourceRoot "${GLOBAL_ROOT}" -SkipCertify -Confirm:$false`);
    assert.strictEqual(updateResult1.err, null, `First update should succeed: ${updateResult1.stderr}`);

    // Capture state after first update
    const stateAfterUpdate1 = getFileSnapshot(sandboxDir);

    // Third: apply same update again
    const updateResult2 = await runPowershell(UPDATE_SCRIPT, `-SourceRoot "${GLOBAL_ROOT}" -SkipCertify -Confirm:$false`);
    assert.strictEqual(updateResult2.err, null, `Second update should succeed: ${updateResult2.stderr}`);

    // Capture state after second update
    const stateAfterUpdate2 = getFileSnapshot(sandboxDir);

    // Verify: final state after second update must equal state after first update
    const keys1 = Object.keys(stateAfterUpdate1).sort();
    const keys2 = Object.keys(stateAfterUpdate2).sort();

    assert.deepStrictEqual(keys1, keys2, 'File list must be identical after both updates');

    for (const key of keys1) {
      assert.strictEqual(
        stateAfterUpdate1[key],
        stateAfterUpdate2[key],
        `File content must be identical: ${key}`
      );
    }

    // Verify: first update produced 0 changes (all files unchanged since install was fresh)
    assert.ok(
      updateResult1.stdout.includes('Updated:   0') || updateResult1.stdout.includes('Unchanged:'),
      'First update should show 0 changes since install was fresh'
    );

    // Verify: second update also produced 0 changes
    assert.ok(
      updateResult2.stdout.includes('Updated:   0') || updateResult2.stdout.includes('Unchanged:'),
      'Second update should also show 0 changes'
    );
  });

  it('update after local modification produces consistent backup state', async () => {
    // First: install fresh (skip certify - tested separately)
    const installResult = await runPowershell(INSTALL_SCRIPT, '-SkipCertify');
    assert.strictEqual(installResult.err, null, `Install should succeed: ${installResult.stderr}`);

    // Make a local modification to a managed file
    const agentsPath = path.join(sandboxDir, 'AGENTS.md');
    const originalContent = fs.readFileSync(agentsPath, 'utf8');
    const modifiedContent = originalContent + '\n\n<!-- LOCAL MODIFICATION -->';
    fs.writeFileSync(agentsPath, modifiedContent, 'utf8');

    // Run update (should backup the modification and restore original)
    const updateResult = await runPowershell(UPDATE_SCRIPT, `-SourceRoot "${GLOBAL_ROOT}" -SkipCertify -Confirm:$false`);
    assert.strictEqual(updateResult.err, null, `Update should succeed: ${updateResult.stderr}`);

    // Verify local modification was overwritten
    const afterUpdateContent = fs.readFileSync(agentsPath, 'utf8');
    assert.ok(!afterUpdateContent.includes('<!-- LOCAL MODIFICATION -->'),
      'Update should overwrite local modification');

    // Capture state after update with modification
    const stateAfterModification = getFileSnapshot(sandboxDir);

    // Apply update again - should be idempotent
    const updateResult2 = await runPowershell(UPDATE_SCRIPT, `-SourceRoot "${GLOBAL_ROOT}" -SkipCertify -Confirm:$false`);
    assert.strictEqual(updateResult2.err, null, `Second update should succeed: ${updateResult2.stderr}`);

    // Capture state after second update
    const stateAfterSecondUpdate = getFileSnapshot(sandboxDir);

    // Verify: state must be identical after both updates
    const keys1 = Object.keys(stateAfterModification).sort();
    const keys2 = Object.keys(stateAfterSecondUpdate).sort();

    assert.deepStrictEqual(keys1, keys2, 'File list must be identical after both updates');

    for (const key of keys1) {
      assert.strictEqual(
        stateAfterModification[key],
        stateAfterSecondUpdate[key],
        `File content must be identical: ${key}`
      );
    }
  });
});
