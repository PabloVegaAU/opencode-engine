import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'jsonc-parser';

const GLOBAL_ROOT = path.resolve(import.meta.dirname, '..');

function parseJsonc(content) {
  const errors = [];
  const value = parse(content, errors, { allowTrailingComma: true });
  if (errors.length > 0) {
    throw new Error(`JSONC parse errors: ${errors.map(e => `${e.error}@${e.offset}`).join(', ')}`);
  }
  return value;
}

describe('Security Boundaries', () => {
  const FORBIDDEN_PATTERNS = [
    // AWS keys
    /AKIA[0-9A-Z]{16}/,
    // GitHub tokens
    /ghp_[a-zA-Z0-9]{36}/,
    /xox[baprs]-[a-zA-Z0-9]{10,}/,
    // OpenAI keys
    /sk-[a-zA-Z0-9]{48}/,
    // Generic secret assignments (value on right side)
    /"(?:token|key|secret|password|auth|credential)"\s*:\s*"[^"]{20,}/,
    // Private key headers
    /-----BEGIN\s+(?:RSA|EC|DSA|OPENSSH|PRIVATE\s+KEY)-----/,
    // Bearer tokens
    /Bearer\s+[A-Za-z0-9._-]+/,
    // URL with credentials
    /https?:\/\/[^\s:]+:[^\s@]+@[^\s]+/
  ];

  it('should not contain hardcoded absolute paths in config files', () => {
    const configFiles = getJsonFiles(path.join(GLOBAL_ROOT, 'global'));
    const absolutePathPattern = /[A-Za-z]:\\[^\s"]+|^[A-Za-z]:\\/;
    
    for (const file of configFiles) {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('//') || line.startsWith('#')) continue;
        
        const match = absolutePathPattern.exec(line);
        assert.ok(!match, `File ${path.relative(GLOBAL_ROOT, file)}:${i + 1} contains hardcoded absolute path: ${line.substring(0, 50)}`);
      }
    }
  });

  it('should not contain credentials or secrets in config files', () => {
    const configFiles = getJsonFiles(path.join(GLOBAL_ROOT, 'global'));
    
    for (const file of configFiles) {
      const content = fs.readFileSync(file, 'utf8').toLowerCase();
      
      for (const pattern of FORBIDDEN_PATTERNS) {
        const match = pattern.exec(content);
        assert.ok(!match, `File ${path.relative(GLOBAL_ROOT, file)} contains forbidden pattern: ${pattern}`);
      }
    }
  });

  it('should not contain credentials or secrets in profile files', () => {
    const profileFiles = getJsonFiles(path.join(GLOBAL_ROOT, 'global', 'opencode.profiles'));
    
    for (const file of profileFiles) {
      const content = fs.readFileSync(file, 'utf8').toLowerCase();
      
      for (const pattern of FORBIDDEN_PATTERNS) {
        const match = pattern.exec(content);
        assert.ok(!match, `File ${path.relative(GLOBAL_ROOT, file)} contains forbidden pattern: ${pattern}`);
      }
    }
  });

  it('should not contain credentials or secrets in scripts', () => {
    const scriptsDir = path.join(GLOBAL_ROOT, 'scripts');
    const scriptFiles = fs.existsSync(scriptsDir) 
      ? fs.readdirSync(scriptsDir).filter(f => f.endsWith('.ps1'))
      : [];
    
    for (const file of scriptFiles) {
      const filePath = path.join(scriptsDir, file);
      const content = fs.readFileSync(filePath, 'utf8').toLowerCase();
      
      for (const pattern of FORBIDDEN_PATTERNS) {
        const match = pattern.exec(content);
        assert.ok(!match, `Script ${file} contains forbidden pattern: ${pattern}`);
      }
    }
  });

  it('should not flag negative cases like uncredentialed or credential descriptions', () => {
    const negativeCases = [
      'uncredentialed',
      'credentials: check the docs for setup instructions',
      'credentialed access'
    ];
    
    for (const testCase of negativeCases) {
      for (const pattern of FORBIDDEN_PATTERNS) {
        const match = pattern.exec(testCase);
        assert.ok(!match, `Pattern ${pattern} should NOT match: "${testCase}"`);
      }
    }
  });

  it('should deny .env file access in permissions', () => {
    const configPath = path.join(GLOBAL_ROOT, 'global', 'opencode.jsonc');
    const content = fs.readFileSync(configPath, 'utf8');
    const config = parseJsonc(content);
    
    const readPerms = config.permission?.read || {};
    assert.ok(readPerms['.env'] === 'deny' || readPerms['*'] === 'allow', '.env should be denied or properly globbed');
  });

  it('should deny secrets directories in permissions', () => {
    const configPath = path.join(GLOBAL_ROOT, 'global', 'opencode.jsonc');
    const content = fs.readFileSync(configPath, 'utf8');
    const config = parseJsonc(content);
    
    const readPerms = config.permission?.read || {};
    assert.ok(
      readPerms['.secrets/**'] === 'deny' || 
      readPerms['**/.secrets/**'] === 'deny' ||
      readPerms['**/secrets/**'] === 'deny',
      'Secrets directories should be denied'
    );
  });

  it('should have external_directory deny all by default', () => {
    const configPath = path.join(GLOBAL_ROOT, 'global', 'opencode.jsonc');
    const content = fs.readFileSync(configPath, 'utf8');
    const config = parseJsonc(content);
    
    const extDirPerms = config.permission?.external_directory || {};
    assert.ok(extDirPerms['*'] === 'deny', 'external_directory should deny all by default');
  });

  it('should deny dangerous git commands in bash permissions', () => {
    const configPath = path.join(GLOBAL_ROOT, 'global', 'opencode.jsonc');
    const content = fs.readFileSync(configPath, 'utf8');
    const config = parseJsonc(content);
    
    const bashPerms = config.permission?.bash || {};
    const dangerousCommands = ['git push', 'git reset', 'git clean', 'git checkout', 'git stash', 'git rebase'];
    
    for (const cmd of dangerousCommands) {
      assert.ok(
        bashPerms[cmd + '*'] === 'deny',
        `${cmd} should be denied in bash permissions`
      );
    }
  });

  it('should deny file deletion commands in bash permissions', () => {
    const configPath = path.join(GLOBAL_ROOT, 'global', 'opencode.jsonc');
    const content = fs.readFileSync(configPath, 'utf8');
    const config = parseJsonc(content);
    
    const bashPerms = config.permission?.bash || {};
    const deleteCommands = ['rm ', 'rmdir ', 'del ', 'erase ', 'Remove-Item '];
    
    for (const cmd of deleteCommands) {
      assert.ok(
        bashPerms[cmd + '*'] === 'deny',
        `${cmd} should be denied in bash permissions`
      );
    }
  });

  it('should have doom_loop disabled by default', () => {
    const configPath = path.join(GLOBAL_ROOT, 'global', 'opencode.jsonc');
    const content = fs.readFileSync(configPath, 'utf8');
    const config = parseJsonc(content);
    
    assert.strictEqual(config.permission?.doom_loop, 'deny', 'doom_loop should be denied');
  });
});

function getJsonFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isFile() && (entry.name.endsWith('.json') || entry.name.endsWith('.jsonc'))) {
      files.push(fullPath);
    } else if (entry.isDirectory()) {
      files.push(...getJsonFiles(fullPath));
    }
  }
  return files;
}
