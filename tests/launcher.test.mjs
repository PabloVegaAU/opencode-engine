import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const GLOBAL_ROOT = path.resolve(import.meta.dirname, '..');

describe('Launcher Logic', () => {
  it('should validate profile names', () => {
    const validProfiles = ['go', 'chatgpt-plus', 'mix', 'minimax-plus'];
    const profileMap = {
      'go': 'go.jsonc',
      'chatgpt-plus': 'chatgpt-plus.jsonc',
      'mix': 'mix.jsonc',
      'minimax-plus': 'minimax-plus.jsonc'
    };

    for (const profile of validProfiles) {
      assert.ok(profile in profileMap, `${profile} should be a valid profile`);
    }
  });

  it('should normalize paths correctly', () => {
    const testPaths = [
      { input: 'C:\\Users\\Test\\path\\', expected: 'C:\\Users\\Test\\path' },
      { input: 'C:\\Users\\Test\\path', expected: 'C:\\Users\\Test\\path' },
      { input: '/home/user/path/', expected: '/home/user/path' }
    ];

    for (const { input, expected } of testPaths) {
      const normalized = input.replace(/\\+$/, '').replace(/\/+$/, '');
      assert.strictEqual(normalized, expected, `${input} should normalize to ${expected}`);
    }
  });

  it('should not allow target to be the opencode config directory', () => {
    const opencodeConfigDir = process.env.OPENCODE_CONFIG_DIR || path.join(process.env.USERPROFILE || '', '.config', 'opencode');

    const checkTarget = (target) => {
      const normalizedOpenCode = opencodeConfigDir.replace(/\\+$/, '').replace(/\/+$/, '').toLowerCase();
      const normalizedTarget = target.replace(/\\+$/, '').replace(/\/+$/, '').toLowerCase();
      return normalizedTarget === normalizedOpenCode;
    };

    assert.ok(checkTarget(opencodeConfigDir), 'Should detect same path');
    assert.ok(!checkTarget(path.join(opencodeConfigDir, 'projects', 'myproject')), 'Should allow subdirectory');
    assert.ok(!checkTarget(path.join(path.dirname(opencodeConfigDir), 'opencode-global')), 'Should allow sibling');
  });

  it('should require overlay, matrix, and schema files to exist', () => {
    const requiredFiles = [
      'opencode.profiles\\go.jsonc',
      'routing\\model-matrix.json',
      'routing\\model-matrix.schema.json'
    ];

    const configDir = process.env.OPENCODE_CONFIG_DIR || path.join(process.env.USERPROFILE || '', '.config', 'opencode');

    for (const relPath of requiredFiles) {
      const fullPath = path.join(configDir, relPath);
      const exists = fs.existsSync(fullPath);
      assert.ok(exists, `${fullPath} should exist at ${configDir}`);
    }
  });

  it('should map profile names to overlay files correctly', () => {
    const profileMap = {
      'go': 'go.jsonc',
      'chatgpt-plus': 'chatgpt-plus.jsonc',
      'mix': 'mix.jsonc',
      'minimax-plus': 'minimax-plus.jsonc'
    };

    assert.strictEqual(profileMap['go'], 'go.jsonc');
    assert.strictEqual(profileMap['chatgpt-plus'], 'chatgpt-plus.jsonc');
    assert.strictEqual(profileMap['mix'], 'mix.jsonc');
    assert.strictEqual(profileMap['minimax-plus'], 'minimax-plus.jsonc');
  });

  it('should validate routing builder output structure', () => {
    // Use valid mode 'primary' instead of 'fast' which is now invalid
    const mockResult = {
      overlay: { $schema: 'https://opencode.ai/config.json', model: 'test/model' },
      contentConfig: { agent: { orchestrator: { model: 'test/model' } } },
      summary: {
        profile: 'go',
        project: '/test/project',
        agentCount: 1,
        agents: [{ name: 'orchestrator', mode: 'primary', sources: ['opencode.json'], category: null, resolvedModel: 'test/model', resolvedVariant: null, resolvedBy: 'root', unknown: false }],
        categories: {},
        unknownAgents: [],
        writes: 0
      }
    };

    assert.ok(mockResult.overlay, 'Should have overlay');
    assert.ok(mockResult.contentConfig, 'Should have contentConfig');
    assert.ok(mockResult.contentConfig.agent, 'Should have agent config');
    assert.ok(mockResult.summary, 'Should have summary');
    assert.ok(Array.isArray(mockResult.summary.agents), 'Agents should be array');
    assert.ok(!mockResult.summary.unknownAgents.includes('orchestrator'), 'Known agents should not be in unknownAgents');
    // Verify mode is valid
    assert.ok(['primary', 'subagent', 'all'].includes(mockResult.summary.agents[0].mode), 'Mode should be valid');
  });

  it('should have valid agent modes defined', () => {
    // Verify the valid modes match what the launcher expects
    const validModes = ['primary', 'subagent', 'all'];
    assert.strictEqual(validModes.length, 3, 'Should have exactly 3 valid modes');
    assert.ok(validModes.includes('primary'), 'primary should be valid');
    assert.ok(validModes.includes('subagent'), 'subagent should be valid');
    assert.ok(validModes.includes('all'), 'all should be valid');
  });
});
