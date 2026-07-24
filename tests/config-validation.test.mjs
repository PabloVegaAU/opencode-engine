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

describe('Config Validation', () => {
  it('should have valid JSONC syntax in global opencode.jsonc', () => {
    const configPath = path.join(GLOBAL_ROOT, 'global', 'opencode.jsonc');
    assert.ok(fs.existsSync(configPath), 'global opencode.jsonc should exist');
    
    const content = fs.readFileSync(configPath, 'utf8');
    assert.doesNotThrow(() => parseJsonc(content), 'opencode.jsonc should be valid JSON');
    
    const value = parseJsonc(content);
    assert.ok(typeof value === 'object' && value !== null, 'Parsed value should be an object');
  });

  it('should have valid JSONC syntax in profile overlay files', () => {
    const profilesDir = path.join(GLOBAL_ROOT, 'global', 'opencode.profiles');
    const overlayFiles = ['go.jsonc', 'chatgpt-plus.jsonc', 'mix.jsonc', 'minimax-plus.jsonc'];
    
    for (const file of overlayFiles) {
      const filePath = path.join(profilesDir, file);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        assert.doesNotThrow(() => parseJsonc(content), `${file} should be valid JSON`);
      }
    }
  });

  it('should have valid JSON in model-matrix.json', () => {
    const matrixPath = path.join(GLOBAL_ROOT, 'global', 'opencode.profiles', 'model-matrix.json');
    assert.ok(fs.existsSync(matrixPath), 'model-matrix.json should exist');
    
    const content = fs.readFileSync(matrixPath, 'utf8');
    let parsed;
    
    assert.doesNotThrow(() => {
      parsed = JSON.parse(content);
    }, 'model-matrix.json should be valid JSON');
    
    assert.ok(parsed, 'Should parse to a value');
    assert.ok(typeof parsed === 'object', 'Should be an object');
  });

  it('should have valid JSON in model-matrix.schema.json', () => {
    const schemaPath = path.join(GLOBAL_ROOT, 'global', 'opencode.profiles', 'model-matrix.schema.json');
    assert.ok(fs.existsSync(schemaPath), 'model-matrix.schema.json should exist');
    
    const content = fs.readFileSync(schemaPath, 'utf8');
    let parsed;
    
    assert.doesNotThrow(() => {
      parsed = JSON.parse(content);
    }, 'model-matrix.schema.json should be valid JSON');
    
    assert.ok(parsed, 'Should parse to a value');
    assert.strictEqual(parsed.$schema, 'http://json-schema.org/draft-07/schema#', 'Should have correct JSON Schema dialect');
    assert.ok(parsed.$defs, 'Should have $defs for schema references');
  });

  it('should have required schema fields in opencode.jsonc', () => {
    const configPath = path.join(GLOBAL_ROOT, 'global', 'opencode.jsonc');
    const content = fs.readFileSync(configPath, 'utf8');
    const config = parseJsonc(content);
    
    assert.ok(config.$schema, 'Should have $schema field');
    assert.ok(config.permission, 'Should have permission field');
    assert.ok(config.permission.read, 'Should have permission.read field');
    assert.ok(config.permission.edit, 'Should have permission.edit field');
    assert.ok(config.permission.bash, 'Should have permission.bash field');
  });

  it('should have valid permission structure', () => {
    const configPath = path.join(GLOBAL_ROOT, 'global', 'opencode.jsonc');
    const content = fs.readFileSync(configPath, 'utf8');
    const config = parseJsonc(content);
    
    const permissionTypes = ['read', 'edit', 'external_directory', 'bash'];
    
    for (const permType of permissionTypes) {
      assert.ok(config.permission[permType] !== undefined, `Should have permission.${permType}`);
    }
    
    assert.ok(typeof config.permission.skill === 'string' || config.permission.skill === 'allow' || config.permission.skill === 'deny',
      'permission.skill should be a string value');
  });
});
