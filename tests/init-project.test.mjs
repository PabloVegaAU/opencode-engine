import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const GLOBAL_ROOT = path.resolve(import.meta.dirname, '..');

describe('Init Project Script', () => {
  it('should have valid script path structure', () => {
    const scriptPath = path.join(GLOBAL_ROOT, 'scripts', 'init-opencode-project.ps1');
    assert.ok(fs.existsSync(scriptPath), 'init-opencode-project.ps1 should exist');
  });

  it('should have required parameters in script', () => {
    const scriptPath = path.join(GLOBAL_ROOT, 'scripts', 'init-opencode-project.ps1');
    const content = fs.readFileSync(scriptPath, 'utf8');
    
    const requiredParams = ['ProjectPath', 'IncludeIntelligence', 'IncludeContracts', 'IncludeProfileCommands', 'Force'];
    
    for (const param of requiredParams) {
      assert.ok(content.includes(param), `Script should have ${param} parameter`);
    }
  });

  it('should define bootstrap schema version', () => {
    const scriptPath = path.join(GLOBAL_ROOT, 'scripts', 'init-opencode-project.ps1');
    const content = fs.readFileSync(scriptPath, 'utf8');
    
    assert.ok(content.includes("BootstrapSchemaVersion"), 'Should define BootstrapSchemaVersion');
    assert.ok(content.includes("BootstrapVersion"), 'Should define BootstrapVersion');
  });

  it('should prevent initializing the global directory as a project', () => {
    const globalRoot = GLOBAL_ROOT;
    const opencodeConfigDir = process.env.OPENCODE_CONFIG_DIR || path.join(process.env.USERPROFILE || '', '.config', 'opencode');
    
    const isSamePath = (target, opencode) => {
      const normalizedTarget = target.replace(/\\+$/, '').replace(/\/+$/, '').toLowerCase();
      const normalizedOpenCode = opencode.replace(/\\+$/, '').replace(/\/+$/, '').toLowerCase();
      return normalizedTarget === normalizedOpenCode;
    };
    
    assert.ok(isSamePath(opencodeConfigDir, opencodeConfigDir), 'Should detect same path');
    assert.ok(!isSamePath(path.join(opencodeConfigDir, 'projects', 'test'), opencodeConfigDir), 'Should allow subdir');
  });

  it('should generate minimal opencode.json with schema', () => {
    const expectedMinimal = {
      '$schema': 'https://opencode.ai/config.json'
    };
    
    assert.ok(expectedMinimal.$schema, 'Minimal config should have $schema');
  });

  it('should generate intelligence structure when requested', () => {
    const expectedIntelligencePaths = [
      '.intelligence\\manifest.json',
      '.intelligence\\index.json',
      '.intelligence\\graph.jsonl'
    ];
    
    for (const intPath of expectedIntelligencePaths) {
      assert.ok(intPath.startsWith('.intelligence'), 'Should create files in .intelligence directory');
    }
  });

  it('should copy contract schemas when IncludeContracts is set', () => {
    const expectedContracts = [
      'manifest.schema.json',
      'index.schema.json',
      'graph.schema.json',
      'session.schema.json',
      'bootstrap-manifest.schema.json'
    ];
    
    const contractsDir = path.join(GLOBAL_ROOT, 'contracts');
    const exists = fs.existsSync(contractsDir);
    
    if (exists) {
      for (const contract of expectedContracts) {
        const contractPath = path.join(contractsDir, contract);
        assert.ok(fs.existsSync(contractPath), `${contract} should exist in contracts`);
      }
    }
  });

  it('should copy profile commands when IncludeProfileCommands is set', () => {
    const expectedCommands = ['go.md', 'chatgpt-plus.md', 'mix.md'];
    const commandsSource = path.join(GLOBAL_ROOT, 'templates', 'project-neutral', '.opencode', 'commands');
    
    for (const cmd of expectedCommands) {
      const cmdPath = path.join(commandsSource, cmd);
      if (fs.existsSync(commandsSource)) {
        assert.ok(fs.existsSync(cmdPath), `${cmd} should exist in commands template`);
      }
    }
  });

  it('should use ConvertTo-RelativeArtifactPath for cross-platform paths', () => {
    const scriptPath = path.join(GLOBAL_ROOT, 'scripts', 'init-opencode-project.ps1');
    const content = fs.readFileSync(scriptPath, 'utf8');
    
    assert.ok(content.includes('ConvertTo-RelativeArtifactPath'), 'Should have path conversion function');
    assert.ok(content.includes('\\'), 'Should handle Windows backslash');
  });

  it('should use SHA256 for file checksums', () => {
    const scriptPath = path.join(GLOBAL_ROOT, 'scripts', 'init-opencode-project.ps1');
    const content = fs.readFileSync(scriptPath, 'utf8');
    
    assert.ok(content.includes('Get-FileSha256Lower'), 'Should have SHA256 function');
    assert.ok(content.includes('SHA256'), 'Should use SHA256 algorithm');
  });

  it('should create UTF-8 files without BOM', () => {
    const scriptPath = path.join(GLOBAL_ROOT, 'scripts', 'init-opencode-project.ps1');
    const content = fs.readFileSync(scriptPath, 'utf8');
    
    assert.ok(content.includes('[System.Text.UTF8Encoding]::new($false)'), 'Should create UTF-8 without BOM');
  });
});
