/**
 * Retrieval Doctor - Pure Check Functions
 * v0.5.0 Phase 6 - Read-only diagnostics for retrieval execution infrastructure.
 * All functions are pure checks that do not modify filesystem.
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createHash } from 'crypto';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '../..');

export const REQUIRED_EXECUTION_MODULES = [
  'retrieval-entry.mjs',
  'execution-engine.mjs',
  'execute-batch.mjs'
];

export const REQUIRED_ADAPTERS = [
  'ripgrep.mjs',
  'git-grep.mjs',
  'filesystem.mjs'
];

export const REQUIRED_EXECUTION_CONTRACTS = [
  'retrieval-execution-plan.schema.json',
  'retrieval-execution-result.schema.json',
  'retrieval-execution-trace.schema.json',
  'retrieval-execution-metrics.schema.json',
  'retrieval-execution-reason-codes.schema.json',
  'retrieval-plan-base.schema.json',
  'repository-state.schema.json'
];

export const REQUIRED_POLICY_VALIDATOR = 'retrieval-policy-validator.mjs';

export const REQUIRED_WRAPPER = 'retrieval-router.ps1';

export function checkModuleSyntax(modulePath, repoRoot = REPO_ROOT) {
  const fullPath = join(repoRoot, 'bin', 'retrieval', modulePath);
  if (!existsSync(fullPath)) {
    return { valid: false, error: `Module not found: ${modulePath}` };
  }
  const result = spawnSync('node', ['--check', fullPath], {
    encoding: 'utf8',
    timeout: 10000
  });
  if (result.status === 0) {
    return { valid: true, syntaxOk: true };
  }
  return { valid: false, error: result.stderr || `Syntax check failed (exit ${result.status})` };
}

export function checkModuleEsmImport(modulePath, repoRoot = REPO_ROOT) {
  const fullPath = join(repoRoot, 'bin', 'retrieval', modulePath);
  if (!existsSync(fullPath)) {
    return { valid: false, error: `Module not found: ${modulePath}` };
  }
  const moduleUrl = pathToFileURL(fullPath).href;
  const loaderScript = `
import { pathToFileURL } from 'url';
const moduleUrl = ${JSON.stringify(moduleUrl)};
try {
  await import(moduleUrl);
  console.log('IMPORT_OK');
} catch (err) {
  console.error('IMPORT_FAILED:' + err.message);
  process.exitCode = 1;
}
`;
  const result = spawnSync('node', ['--input-type=module', '-e', loaderScript], {
    encoding: 'utf8',
    timeout: 15000,
    cwd: repoRoot,
    env: { ...process.env, NODE_OPTIONS: '' }
  });
  if (result.stdout && result.stdout.includes('IMPORT_OK')) {
    return { valid: true, importOk: true };
  }
  const errorMsg = (result.stderr || result.stdout || 'Import failed').trim();
  return { valid: false, error: errorMsg };
}

export function checkJsonSchema(schemaPath, repoRoot = REPO_ROOT) {
  const fullPath = join(repoRoot, 'contracts', schemaPath);
  if (!existsSync(fullPath)) {
    return { valid: false, error: `Schema not found: ${schemaPath}` };
  }
  try {
    const content = readFileSync(fullPath, 'utf8');
    JSON.parse(content);
    return { valid: true, parseable: true };
  } catch (err) {
    return { valid: false, error: err.message, parseable: false };
  }
}

export function checkAllJsonSchemas(repoRoot = REPO_ROOT) {
  const results = [];
  const allContracts = [
    ...REQUIRED_EXECUTION_CONTRACTS,
    'retrieval-policy.schema.json',
    'retrieval-index-state.schema.json'
  ];
  for (const contract of allContracts) {
    results.push({ contract, ...checkJsonSchema(contract, repoRoot) });
  }
  return results;
}

export function checkValidatorEquivalence(repoRoot = REPO_ROOT) {
  return {
    valid: false,
    error: 'Validator equivalence must be checked via generate-retrieval-validators.mjs --check'
  };
}

export function checkWrapperSecurity(wrapperPath, repoRoot = REPO_ROOT) {
  if (!wrapperPath) {
    wrapperPath = join(repoRoot, 'scripts', 'retrieval-router.ps1');
  }
  const forbidden = [
    { pattern: 'Invoke-Expression', description: 'dynamic code execution' },
    { pattern: 'cmd /c', description: 'shell command invocation' },
    { pattern: 'powershell -Command', description: 'inline PowerShell command' },
    { pattern: 'UseShellExecute = $true', description: 'shell execution enabled' }
  ];

  const concatenationPatterns = [
    { pattern: /\$args\s*\+/, description: 'argument concatenation' },
    { pattern: /\$\w+\s*\+\s*\$/, description: 'variable concatenation for commands' }
  ];

  try {
    if (!existsSync(wrapperPath)) {
      return { valid: false, error: 'Wrapper script not found' };
    }

    const content = readFileSync(wrapperPath, 'utf8');
    const issues = [];

    for (const item of forbidden) {
      if (content.includes(item.pattern)) {
        issues.push(`Found ${item.description}: ${item.pattern}`);
      }
    }

    for (const item of concatenationPatterns) {
      if (content.match(item.pattern)) {
        issues.push(`Found ${item.description}: ${item.pattern}`);
      }
    }

    if (issues.length > 0) {
      return { valid: false, issues };
    }

    const hasArgumentList = content.includes('ArgumentList.Add');
    return { valid: true, usesArgumentList: hasArgumentList };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

export function checkModuleImportsWithoutExecution(repoRoot = REPO_ROOT) {
  const results = [];
  for (const module of REQUIRED_EXECUTION_MODULES) {
    const fullPath = join(repoRoot, 'bin', 'retrieval', module);
    if (!existsSync(fullPath)) {
      results.push({ module, valid: false, error: 'not found' });
      continue;
    }
    const syntaxResult = checkModuleSyntax(module, repoRoot);
    const importResult = checkModuleEsmImport(module, repoRoot);
    results.push({
      module,
      valid: syntaxResult.valid && importResult.valid,
      syntaxOk: syntaxResult.syntaxOk || false,
      importOk: importResult.importOk || false,
      error: importResult.error
    });
  }
  return results;
}

export function checkAdapterImports(repoRoot = REPO_ROOT) {
  const results = [];
  for (const adapter of REQUIRED_ADAPTERS) {
    const fullPath = join(repoRoot, 'bin', 'retrieval', 'adapters', adapter);
    if (!existsSync(fullPath)) {
      results.push({ adapter, valid: false, error: 'not found' });
      continue;
    }
    const syntaxResult = checkModuleSyntax(`adapters/${adapter}`, repoRoot);
    results.push({
      adapter,
      valid: syntaxResult.valid,
      syntaxOk: syntaxResult.syntaxOk || false
    });
  }
  return results;
}

export function checkFilesReadable(files, repoRoot = REPO_ROOT) {
  const results = [];
  for (const file of files) {
    const fullPath = join(repoRoot, file);
    try {
      if (!existsSync(fullPath)) {
        results.push({ file, readable: false, error: 'not found' });
        continue;
      }
      readFileSync(fullPath, 'utf8');
      results.push({ file, readable: true });
    } catch (err) {
      results.push({ file, readable: false, error: err.message });
    }
  }
  return results;
}

export function getFileHash(filePath) {
  if (!existsSync(filePath)) return null;
  const content = readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex');
}

export function getRetrievalFilesystemState(repoRoot = REPO_ROOT) {
  return {
    entry: join(repoRoot, 'bin', 'retrieval', 'retrieval-entry.mjs'),
    engine: join(repoRoot, 'bin', 'retrieval', 'execution-engine.mjs'),
    batch: join(repoRoot, 'bin', 'retrieval', 'execute-batch.mjs'),
    wrapper: join(repoRoot, 'scripts', 'retrieval-router.ps1'),
    validator: join(repoRoot, 'bin', 'retrieval', 'retrieval-policy-validator.mjs'),
    adapters: {
      ripgrep: join(repoRoot, 'bin', 'retrieval', 'adapters', 'ripgrep.mjs'),
      gitGrep: join(repoRoot, 'bin', 'retrieval', 'adapters', 'git-grep.mjs'),
      filesystem: join(repoRoot, 'bin', 'retrieval', 'adapters', 'filesystem.mjs')
    },
    contracts: REQUIRED_EXECUTION_CONTRACTS.map(c => join(repoRoot, 'contracts', c))
  };
}

export function getToolPaths() {
  const nodeCmd = spawnSync('node', ['--version'], { encoding: 'utf8' });
  const nodePath = spawnSync('node', ['-e', 'console.log(require("path").resolve(process.execPath))'], { encoding: 'utf8' }).stdout.trim();

  const pwshCmd = spawnSync('pwsh', ['--version'], { encoding: 'utf8' });
  const pwshPath = spawnSync('pwsh', ['-NoProfile', '-Command', '(Get-Command pwsh).Source'], { encoding: 'utf8' }).stdout.trim();

  const gitPath = spawnSync('git', ['--version'], { encoding: 'utf8' });
  const gitCmdPath = spawnSync('git', ['-C', '.', 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).status === 0
    ? spawnSync('git', ['-C', '.', 'rev-parse', '--git-dir'], { encoding: 'utf8' }).stdout.trim().replace('.git', '')
    : null;

  const rgPath = spawnSync('rg', ['--version'], { encoding: 'utf8' });

  return {
    node: nodePath || null,
    pwsh: pwshPath || null,
    git: gitCmdPath || null,
    ripgrep: rgPath.status === 0 ? rgPath.stdout.trim().split('\n')[0] : null
  };
}
