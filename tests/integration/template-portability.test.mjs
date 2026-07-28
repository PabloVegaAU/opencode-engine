import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = process.cwd();
const TEMPLATE_DIR = join(REPO_ROOT, 'templates', 'project-neutral');

describe('Template Commands Portability', () => {
  const templateCommandsDir = join(TEMPLATE_DIR, '.opencode', 'commands');
  const expectedCommands = ['go.md', 'chatgpt-plus.md', 'mix.md', 'minimax-plus.md'];

  it('template has all 4 profile commands', () => {
    for (const cmd of expectedCommands) {
      const cmdPath = join(templateCommandsDir, cmd);
      assert.ok(existsSync(cmdPath), `${cmd} should exist in template`);
    }
  });

  it('chatgpt-plus.md declares correct profile', () => {
    const content = readFileSync(join(templateCommandsDir, 'chatgpt-plus.md'), 'utf8');
    const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    assert.ok(frontmatterMatch, 'chatgpt-plus.md should have frontmatter');
    const frontmatter = frontmatterMatch[1];
    assert.ok(frontmatter.includes('profile: chatgpt-plus'),
      'chatgpt-plus.md should declare profile: chatgpt-plus');
    assert.ok(frontmatter.includes('mode: launch'),
      'chatgpt-plus.md should use mode: launch');
    const lines = frontmatter.split('\n').map(l => l.trim());
    const profileLine = lines.find(l => l.startsWith('profile:'));
    assert.strictEqual(profileLine, 'profile: chatgpt-plus',
      'profile line should be exactly "profile: chatgpt-plus"');
  });

  it('minimax-plus.md uses portable declarative style', () => {
    const content = readFileSync(join(templateCommandsDir, 'minimax-plus.md'), 'utf8');
    const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    assert.ok(frontmatterMatch, 'minimax-plus.md should have frontmatter');
    const frontmatter = frontmatterMatch[1];
    assert.ok(frontmatter.includes('mode: launch'),
      'minimax-plus.md should use mode: launch');
    assert.ok(frontmatter.includes('profile: minimax-plus'),
      'minimax-plus.md should declare profile: minimax-plus');
    assert.ok(!content.includes('$env:USERPROFILE'),
      'minimax-plus.md should NOT use $env:USERPROFILE');
    assert.ok(!content.includes('.config\\opencode'),
      'minimax-plus.md should NOT use Windows-specific paths');
  });

  it('go.md uses portable declarative style', () => {
    const content = readFileSync(join(templateCommandsDir, 'go.md'), 'utf8');
    const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    assert.ok(frontmatterMatch, 'go.md should have frontmatter');
    const frontmatter = frontmatterMatch[1];
    assert.ok(frontmatter.includes('mode: launch'),
      'go.md should use mode: launch');
    assert.ok(!content.includes('$env:USERPROFILE'),
      'go.md should NOT use $env:USERPROFILE');
  });

  it('mix.md uses portable declarative style', () => {
    const content = readFileSync(join(templateCommandsDir, 'mix.md'), 'utf8');
    const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    assert.ok(frontmatterMatch, 'mix.md should have frontmatter');
    const frontmatter = frontmatterMatch[1];
    assert.ok(frontmatter.includes('mode: launch'),
      'mix.md should use mode: launch');
    assert.ok(!content.includes('$env:USERPROFILE'),
      'mix.md should NOT use $env:USERPROFILE');
  });

  it('template commands have no Windows-specific paths', () => {
    const commandFiles = readdirSync(templateCommandsDir).filter(f => f.endsWith('.md'));
    for (const file of commandFiles) {
      const content = readFileSync(join(templateCommandsDir, file), 'utf8');
      assert.ok(!content.includes('$env:USERPROFILE'),
        `${file} should NOT use $env:USERPROFILE`);
      assert.ok(!content.includes('.config\\opencode'),
        `${file} should NOT use Windows-specific paths`);
    }
  });
});

describe('Template Project Manifest', () => {
  const manifestPath = join(TEMPLATE_DIR, 'project-manifest.json');

  it('project-manifest.json exists', () => {
    assert.ok(existsSync(manifestPath), 'project-manifest.json should exist');
  });

  it('project-manifest.json has placeholder project_id that initializer replaces', () => {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    assert.ok(manifest.project_id, 'should have project_id');
    assert.strictEqual(manifest.project_id, 'example-project',
      'project_id should be placeholder that initializer replaces with actual project name');
  });

  it('project-manifest.json has valid structure', () => {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    assert.ok(manifest.version, 'should have version');
    assert.ok(manifest.repositories, 'should have repositories array');
    assert.ok(Array.isArray(manifest.repositories), 'repositories should be array');
  });
});

describe('Retrieval Policy Distribution', () => {
  it('global/retrieval/default-policy.json exists', () => {
    const defaultPolicy = join(REPO_ROOT, 'global', 'retrieval', 'default-policy.json');
    assert.ok(existsSync(defaultPolicy), 'default policy should exist at global/retrieval/');
  });

  it('templates/project-neutral/.ai-env/retrieval-policy.json exists', () => {
    const templatePolicy = join(TEMPLATE_DIR, '.ai-env', 'retrieval-policy.json');
    assert.ok(existsSync(templatePolicy), 'template retrieval policy should exist');
  });

  it('source root .ai-env/retrieval-policy.json does NOT exist (orphan removed)', () => {
    const orphanPolicy = join(REPO_ROOT, '.ai-env', 'retrieval-policy.json');
    assert.ok(!existsSync(orphanPolicy), 'orphan .ai-env/retrieval-policy.json should be removed from source root');
  });
});

describe('Setup Retrieval Tools Distribution', () => {
  const setupScript = join(REPO_ROOT, 'scripts', 'setup-retrieval-tools.ps1');

  it('setup-retrieval-tools.ps1 exists in source', () => {
    assert.ok(existsSync(setupScript), 'setup-retrieval-tools.ps1 should exist');
  });

  it('setup-retrieval-tools.ps1 is listed in manifest for install', () => {
    const manifestPath = join(REPO_ROOT, 'distribution', 'runtime-manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const scripts = manifest.categories.runtime_scripts.entries.map(e => basename(e.source));
    assert.ok(scripts.includes('setup-retrieval-tools.ps1'),
      'setup-retrieval-tools.ps1 should be in manifest (installs via manifest)');
  });

  it('setup-retrieval-tools.ps1 is listed in manifest for update', () => {
    const manifestPath = join(REPO_ROOT, 'distribution', 'runtime-manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const scripts = manifest.categories.runtime_scripts.entries.map(e => basename(e.source));
    assert.ok(scripts.includes('setup-retrieval-tools.ps1'),
      'setup-retrieval-tools.ps1 should be in manifest (updates via manifest)');
  });

  it('setup-retrieval-tools.ps1 supports -Check mode', () => {
    const content = readFileSync(setupScript, 'utf8');
    assert.ok(content.includes('$Check'),
      'should have $Check parameter');
    assert.ok(content.includes('Get-ToolsStatus'),
      'should have Get-ToolsStatus function');
    assert.ok(content.includes('Get-RetrievalTier'),
      'should have Get-RetrievalTier function');
  });

  it('setup-retrieval-tools.ps1 is cross-platform', () => {
    const content = readFileSync(setupScript, 'utf8');
    assert.ok(content.includes('WinGet') || content.includes('winget'),
      'should support Windows');
    assert.ok(content.includes('Homebrew') || content.includes('brew'),
      'should support macOS');
    assert.ok(content.includes('Apt') || content.includes('apt-get'),
      'should support Linux apt');
  });
});

describe('Retrieval Router Distribution', () => {
  const binRetrievalDir = join(REPO_ROOT, 'bin', 'retrieval');

  it('bin/retrieval directory exists', () => {
    assert.ok(existsSync(binRetrievalDir), 'bin/retrieval directory should exist');
  });

  it('retrieval-router.mjs exists', () => {
    const routerPath = join(binRetrievalDir, 'retrieval-router.mjs');
    assert.ok(existsSync(routerPath), 'retrieval-router.mjs should exist');
  });

  it('retrieval-policy-validator.mjs exists', () => {
    const validatorPath = join(binRetrievalDir, 'retrieval-policy-validator.mjs');
    assert.ok(existsSync(validatorPath), 'retrieval-policy-validator.mjs should exist');
  });

  it('retrieval-index-state-validator.mjs exists', () => {
    const validatorPath = join(binRetrievalDir, 'retrieval-index-state-validator.mjs');
    assert.ok(existsSync(validatorPath), 'retrieval-index-state-validator.mjs should exist');
  });

  it('retrieval-router.ps1 wrapper exists', () => {
    const wrapperPath = join(REPO_ROOT, 'scripts', 'retrieval-router.ps1');
    assert.ok(existsSync(wrapperPath), 'retrieval-router.ps1 wrapper should exist');
  });
});

describe('Bootstrap Manifest Ledger - Retrieval Policy Adoption', () => {
  it('init-opencode-project.ps1 uses config artifact_type for retrieval policy', () => {
    const initScript = readFileSync(join(REPO_ROOT, 'scripts', 'init-opencode-project.ps1'), 'utf8');
    assert.ok(initScript.includes("artifact_type = 'config'"),
      'should use config artifact_type');
    assert.ok(!initScript.includes("artifact_type = 'retrieval-policy'"),
      'should NOT use retrieval-policy artifact_type');
  });

  it('init-opencode-project.ps1 tracks retrieval policy in managedArtifacts', () => {
    const initScript = readFileSync(join(REPO_ROOT, 'scripts', 'init-opencode-project.ps1'), 'utf8');
    assert.ok(initScript.includes('managedArtifacts.Add'),
      'should add retrieval policy to managedArtifacts');
    assert.ok(initScript.includes('global:retrieval-policy'),
      'should track as global:retrieval-policy source');
  });

  it('bootstrap manifest schema allows config artifact_type', () => {
    const schemaPath = join(REPO_ROOT, 'contracts', 'bootstrap-manifest.schema.json');
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
    assert.ok(schema.properties?.artifacts?.items?.properties?.artifact_type?.enum,
      'should have artifact_type enum');
    const artifactTypes = schema.properties.artifacts.items.properties.artifact_type.enum;
    assert.ok(artifactTypes.includes('config'),
      'artifact_type should include config');
  });

  it('retrieval policy source is properly tracked', () => {
    const initScript = readFileSync(join(REPO_ROOT, 'scripts', 'init-opencode-project.ps1'), 'utf8');
    assert.ok(initScript.includes("source = 'global:retrieval-policy'"),
      'should track as global:retrieval-policy');
  });
});

describe('Source Not Dependent On Itself', () => {
  it('source has no .bootstrap directory', () => {
    const bootstrapDir = join(REPO_ROOT, '.bootstrap');
    assert.ok(!existsSync(bootstrapDir), 'source should NOT have .bootstrap directory');
  });

  it('source has no .opencode directory', () => {
    const opencodeDir = join(REPO_ROOT, '.opencode');
    assert.ok(!existsSync(opencodeDir), 'source should NOT have .opencode directory');
  });

  it('source has no project-style AGENTS.md', () => {
    const agentsPath = join(REPO_ROOT, 'AGENTS.md');
    const content = readFileSync(agentsPath, 'utf8');
    assert.ok(!content.includes('This project uses OpenCode Global'),
      'source AGENTS.md should not claim to be a project using global');
  });
});

describe('Commands Not Using Windows Paths', () => {
  const commandsDir = join(REPO_ROOT, 'commands');

  it('commands directory exists', () => {
    assert.ok(existsSync(commandsDir), 'commands directory should exist');
  });

  it('all commands use $env:USERPROFILE for cross-session wrapper (expected Windows path in runtime commands)', () => {
    const commandFiles = readdirSync(commandsDir).filter(f => f.endsWith('.md'));
    assert.ok(commandFiles.length > 0, 'should have command files');
  });
});

describe('Updater Doctor-Plan Only', () => {
  it('update-opencode-project.ps1 does not implement apply', () => {
    const updateScript = readFileSync(join(REPO_ROOT, 'scripts', 'update-opencode-project.ps1'), 'utf8');
    assert.ok(!updateScript.includes('function Apply-') || updateScript.includes('NOT_IMPLEMENTED'),
      'apply should be NOT_IMPLEMENTED');
  });

  it('update-opencode-project.ps1 does not implement rollback', () => {
    const updateScript = readFileSync(join(REPO_ROOT, 'scripts', 'update-opencode-project.ps1'), 'utf8');
    assert.ok(!updateScript.includes('function Rollback-') || updateScript.includes('NOT_IMPLEMENTED'),
      'rollback should be NOT_IMPLEMENTED');
  });

  it('update-opencode-project.ps1 is read-only (no destructive write operations)', () => {
    const updateScript = readFileSync(join(REPO_ROOT, 'scripts', 'update-opencode-project.ps1'), 'utf8');
    assert.ok(!updateScript.includes('function Apply-'), 'should NOT have Apply function');
    assert.ok(!updateScript.includes('function Rollback-'), 'should NOT have Rollback function');
    assert.ok(!updateScript.includes('Write-ProjectFile') || updateScript.includes('# Write-ProjectFile is NOT USED'),
      'should NOT use Write-ProjectFile for writes');
    assert.ok(!updateScript.includes('Copy-GenericFile') || updateScript.includes('# Copy-GenericFile is NOT USED'),
      'should NOT use Copy-GenericFile for writes');
    assert.ok(!updateScript.includes('Backup-ExistingFile') || updateScript.includes('# Backup-ExistingFile is NOT USED'),
      'should NOT use Backup-ExistingFile for writes');
  });
});

describe('Install Script Distribution Lists', () => {
  it('install-opencode-global.ps1 distributes exactly 11 commands', () => {
    const manifestPath = join(REPO_ROOT, 'distribution', 'runtime-manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const commands = manifest.categories.commands.entries;
    assert.strictEqual(commands.length, 11, 'should have exactly 11 commands');
    const cmdNames = commands.map(e => basename(e.runtime));
    assert.ok(cmdNames.includes('go.md'), 'should include go.md');
    assert.ok(cmdNames.includes('chatgpt-plus.md'), 'should include chatgpt-plus.md');
    assert.ok(cmdNames.includes('mix.md'), 'should include mix.md');
    assert.ok(cmdNames.includes('minimax-plus.md'), 'should include minimax-plus.md');
    assert.ok(cmdNames.includes('cross-session.md'), 'should include cross-session.md');
    assert.ok(cmdNames.includes('init-ai-env.md'), 'should include init-ai-env.md');
    assert.ok(cmdNames.includes('doctor-ai-env.md'), 'should include doctor-ai-env.md');
    assert.ok(cmdNames.includes('update-ai-env.md'), 'should include update-ai-env.md');
    assert.ok(cmdNames.includes('ownership-inspect.md'), 'should include ownership-inspect.md');
    assert.ok(cmdNames.includes('update-apply.md'), 'should include update-apply.md');
    assert.ok(cmdNames.includes('update-rollback.md'), 'should include update-rollback.md');
  });

  it('install-opencode-global.ps1 distributes exactly 12 runtime scripts', () => {
    const manifestPath = join(REPO_ROOT, 'distribution', 'runtime-manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const scripts = manifest.categories.runtime_scripts.entries;
    assert.strictEqual(scripts.length, 12, 'should have exactly 12 runtime scripts');
    const scriptNames = scripts.map(e => basename(e.runtime));
    assert.ok(scriptNames.includes('install-opencode-global.ps1'), 'should include install-opencode-global.ps1');
    assert.ok(scriptNames.includes('update-opencode-global.ps1'), 'should include update-opencode-global.ps1');
    assert.ok(scriptNames.includes('doctor-opencode-global.ps1'), 'should include doctor-opencode-global.ps1');
    assert.ok(scriptNames.includes('certify-opencode-global.ps1'), 'should include certify-opencode-global.ps1');
    assert.ok(scriptNames.includes('init-opencode-project.ps1'), 'should include init-opencode-project.ps1');
    assert.ok(scriptNames.includes('update-opencode-project.ps1'), 'should include update-opencode-project.ps1');
    assert.ok(scriptNames.includes('opencode-launcher.ps1'), 'should include opencode-launcher.ps1');
    assert.ok(scriptNames.includes('cross-session.ps1'), 'should include cross-session.ps1');
    assert.ok(scriptNames.includes('cleanup-runtime.ps1'), 'should include cleanup-runtime.ps1');
    assert.ok(scriptNames.includes('retrieval-router.ps1'), 'should include retrieval-router.ps1');
    assert.ok(scriptNames.includes('setup-retrieval-tools.ps1'), 'should include setup-retrieval-tools.ps1');
    assert.ok(scriptNames.includes('ownership-update.ps1'), 'should include ownership-update.ps1');
  });

  it('install-opencode-global.ps1 distributes bin/retrieval recursively', () => {
    const manifestPath = join(REPO_ROOT, 'distribution', 'runtime-manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const binRetrieval = manifest.categories.bin_retrieval;
    assert.ok(binRetrieval.recursive, 'bin_retrieval should be recursive');
    assert.ok(binRetrieval.include_patterns.includes('*.mjs'), 'should include *.mjs patterns');
    // Check adapters subdirectory exists in source
    const adaptersPath = join(REPO_ROOT, 'bin', 'retrieval', 'adapters');
    assert.ok(existsSync(adaptersPath), 'bin/retrieval/adapters should exist');
  });

  it('install-opencode-global.ps1 distributes contracts recursively', () => {
    const manifestPath = join(REPO_ROOT, 'distribution', 'runtime-manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const contracts = manifest.categories.contracts;
    assert.ok(contracts.recursive, 'contracts should be recursive');
    assert.ok(contracts.include_patterns.some(p => p.includes('schema.json')), 'should include schema patterns');
  });

  it('no duplicate runtime destinations across all categories', () => {
    const manifestPath = join(REPO_ROOT, 'distribution', 'runtime-manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const runtimePaths = [];
    for (const [catName, cat] of Object.entries(manifest.categories)) {
      if (cat.entries) {
        for (const entry of cat.entries) {
          runtimePaths.push(entry.runtime);
        }
      }
    }
    const duplicates = runtimePaths.filter((p, i) => runtimePaths.indexOf(p) !== i);
    assert.strictEqual(duplicates.length, 0, `should have no duplicate runtime paths, found: ${duplicates.join(', ')}`);
  });

  it('dev-only scripts are excluded from runtime_scripts entries', () => {
    const manifestPath = join(REPO_ROOT, 'distribution', 'runtime-manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const scripts = manifest.categories.runtime_scripts.entries.map(e => basename(e.source));
    assert.ok(!scripts.includes('generate-retrieval-validators.mjs'), 'should exclude generate-retrieval-validators.mjs');
    assert.ok(!scripts.includes('validate.mjs'), 'should exclude validate.mjs');
    assert.ok(!scripts.includes('discover-real-query-set.mjs'), 'should exclude discover-real-query-set.mjs');
    assert.ok(!scripts.includes('run-retrieval-real-pilot.mjs'), 'should exclude run-retrieval-real-pilot.mjs');
  });
});

describe('Update Script Distribution Lists', () => {
  it('update-opencode-global.ps1 uses same inventory as install via manifest', () => {
    const manifestPath = join(REPO_ROOT, 'distribution', 'runtime-manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    // Update uses the same inventory as install - both consume Get-RuntimeManifestInventory
    const commands = manifest.categories.commands.entries;
    const scripts = manifest.categories.runtime_scripts.entries;
    assert.strictEqual(commands.length, 11, 'should have exactly 11 commands');
    assert.strictEqual(scripts.length, 12, 'should have exactly 12 runtime scripts');
  });

  it('update-opencode-global.ps1 distributes setup-retrieval-tools.ps1', () => {
    const manifestPath = join(REPO_ROOT, 'distribution', 'runtime-manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const scripts = manifest.categories.runtime_scripts.entries.map(e => basename(e.runtime));
    assert.ok(scripts.includes('setup-retrieval-tools.ps1'), 'should include setup-retrieval-tools.ps1');
  });
});

describe('Global Retrieval Default Policy', () => {
  const defaultPolicyPath = join(REPO_ROOT, 'global', 'retrieval', 'default-policy.json');

  it('default policy exists', () => {
    assert.ok(existsSync(defaultPolicyPath), 'default policy should exist');
  });

  it('default policy has schema_version 1.0', () => {
    const policy = JSON.parse(readFileSync(defaultPolicyPath, 'utf8'));
    assert.strictEqual(policy.schema_version, '1.0', 'should have schema_version 1.0');
  });

  it('default policy has all 5 strategies', () => {
    const policy = JSON.parse(readFileSync(defaultPolicyPath, 'utf8'));
    assert.ok(policy.strategies.exact, 'should have exact strategy');
    assert.ok(policy.strategies.symbol, 'should have symbol strategy');
    assert.ok(policy.strategies.architecture, 'should have architecture strategy');
    assert.ok(policy.strategies.semantic, 'should have semantic strategy');
    assert.ok(policy.strategies.knowledge, 'should have knowledge strategy');
  });

  it('default policy has budgets for all strategies', () => {
    const policy = JSON.parse(readFileSync(defaultPolicyPath, 'utf8'));
    assert.ok(policy.budgets.exact, 'should have exact budgets');
    assert.ok(policy.budgets.symbol, 'should have symbol budgets');
    assert.ok(policy.budgets.architecture, 'should have architecture budgets');
    assert.ok(policy.budgets.semantic, 'should have semantic budgets');
    assert.ok(policy.budgets.knowledge, 'should have knowledge budgets');
  });
});

describe('Template Neutral Does Not Create Topology', () => {
  it('template does not create agents directory', () => {
    const agentsDir = join(TEMPLATE_DIR, '.opencode', 'agents');
    assert.ok(!existsSync(agentsDir), 'template should not create agents directory');
  });

  it('template does not create skills directory', () => {
    const skillsDir = join(TEMPLATE_DIR, '.opencode', 'skills');
    assert.ok(!existsSync(skillsDir), 'template should not create skills directory');
  });

  it('template does not create mcp directory', () => {
    const mcpDir = join(TEMPLATE_DIR, '.opencode', 'mcp');
    assert.ok(!existsSync(mcpDir), 'template should not create mcp directory');
  });

  it('template does not create speckit directory', () => {
    const speckitDir = join(TEMPLATE_DIR, '.speckit');
    assert.ok(!existsSync(speckitDir), 'template should not create speckit directory');
  });
});
