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

describe('Profile Routing', () => {
  it('should have valid model-matrix.json structure', () => {
    const matrixPath = path.join(GLOBAL_ROOT, 'global', 'opencode.profiles', 'model-matrix.json');
    assert.ok(fs.existsSync(matrixPath), 'model-matrix.json should exist');
    
    const content = fs.readFileSync(matrixPath, 'utf8');
    const matrix = JSON.parse(content);
    
    assert.ok(matrix.$schema, 'Should have $schema');
    assert.ok(matrix.profiles, 'Should have profiles');
    assert.strictEqual(typeof matrix.profiles, 'object', 'profiles should be an object');
  });

  it('should have required profile names', () => {
    const matrixPath = path.join(GLOBAL_ROOT, 'global', 'opencode.profiles', 'model-matrix.json');
    const content = fs.readFileSync(matrixPath, 'utf8');
    const matrix = JSON.parse(content);
    
    const requiredProfiles = ['go', 'chatgpt-plus', 'mix', 'minimax-plus'];
    
    for (const profile of requiredProfiles) {
      assert.ok(profile in matrix.profiles, `Should have ${profile} profile`);
    }
  });

  it('should have required roles in each profile', () => {
    const matrixPath = path.join(GLOBAL_ROOT, 'global', 'opencode.profiles', 'model-matrix.json');
    const content = fs.readFileSync(matrixPath, 'utf8');
    const matrix = JSON.parse(content);
    
    const requiredRoles = ['orchestrator', 'explorer', 'qa', 'researcher', 'planner', 'dev', 'infra', 'architect_pro', 'review_pro'];
    
    for (const [profileName, profile] of Object.entries(matrix.profiles)) {
      for (const role of requiredRoles) {
        assert.ok(role in profile.roles, `${profileName} should have ${role} role`);
      }
    }
  });

  it('should have required categories in each profile', () => {
    const matrixPath = path.join(GLOBAL_ROOT, 'global', 'opencode.profiles', 'model-matrix.json');
    const content = fs.readFileSync(matrixPath, 'utf8');
    const matrix = JSON.parse(content);
    
    for (const [profileName, profile] of Object.entries(matrix.profiles)) {
      assert.ok(profile.categories, `${profileName} should have categories`);
      assert.ok('hybrid-content' in profile.categories, `${profileName} should have hybrid-content category`);
    }
  });

  it('should have valid model format in each role (provider/model)', () => {
    const matrixPath = path.join(GLOBAL_ROOT, 'global', 'opencode.profiles', 'model-matrix.json');
    const content = fs.readFileSync(matrixPath, 'utf8');
    const matrix = JSON.parse(content);
    
    const modelPattern = /^[^/]+\/.+$/;
    
    for (const [profileName, profile] of Object.entries(matrix.profiles)) {
      assert.ok(modelPattern.test(profile.model), `${profileName} should have valid model format`);
      assert.ok(modelPattern.test(profile.small_model), `${profileName} should have valid small_model format`);
      
      for (const [roleName, assignment] of Object.entries(profile.roles)) {
        assert.ok(modelPattern.test(assignment.model), `${profileName}.${roleName} should have valid model format`);
        
        if (assignment.variant) {
          assert.strictEqual(typeof assignment.variant, 'string', `${profileName}.${roleName}.variant should be string`);
          assert.ok(assignment.variant.length > 0, `${profileName}.${roleName}.variant should not be empty`);
        }
      }
    }
  });

  it('should have valid model-matrix.schema.json structure', () => {
    const schemaPath = path.join(GLOBAL_ROOT, 'global', 'opencode.profiles', 'model-matrix.schema.json');
    assert.ok(fs.existsSync(schemaPath), 'model-matrix.schema.json should exist');
    
    const content = fs.readFileSync(schemaPath, 'utf8');
    const schema = JSON.parse(content);
    
    assert.strictEqual(schema.$schema, 'http://json-schema.org/draft-07/schema#', 'Should use JSON Schema draft-07');
    assert.ok(schema.$defs, 'Should have $defs');
    assert.ok(schema.$defs.assignment, 'Should have assignment definition');
    assert.ok(schema.$defs.profile, 'Should have profile definition');
  });

  it('should validate against schema structure', () => {
    const schemaPath = path.join(GLOBAL_ROOT, 'global', 'opencode.profiles', 'model-matrix.schema.json');
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    
    assert.strictEqual(schema.type, 'object', 'Schema should define object type');
    assert.deepStrictEqual(schema.required, ['profiles'], 'profiles should be required');
    assert.strictEqual(schema.additionalProperties, false, 'Should not allow additional properties');
  });

  it('should have valid profile overlay files', () => {
    const profilesDir = path.join(GLOBAL_ROOT, 'global', 'opencode.profiles');
    const overlayFiles = ['go.jsonc', 'chatgpt-plus.jsonc', 'mix.jsonc', 'minimax-plus.jsonc'];
    
    const requiredKeys = ['$schema', 'model', 'small_model'];
    
    for (const file of overlayFiles) {
      const filePath = path.join(profilesDir, file);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        const overlay = parseJsonc(content);
        
        for (const key of requiredKeys) {
          assert.ok(key in overlay, `${file} should have ${key}`);
        }
      }
    }
  });

  it('should not allow additional properties in overlay files', () => {
    const profilesDir = path.join(GLOBAL_ROOT, 'global', 'opencode.profiles');
    const overlayFiles = ['go.jsonc', 'chatgpt-plus.jsonc', 'mix.jsonc', 'minimax-plus.jsonc'];
    
    const allowedKeys = ['$schema', 'model', 'small_model'];
    
    for (const file of overlayFiles) {
      const filePath = path.join(profilesDir, file);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        const overlay = parseJsonc(content);
        const keys = Object.keys(overlay).sort();
        
        assert.deepStrictEqual(keys, allowedKeys, `${file} should only have allowed keys`);
      }
    }
  });

  it('should have consistent model format across profiles', () => {
    const matrixPath = path.join(GLOBAL_ROOT, 'global', 'opencode.profiles', 'model-matrix.json');
    const content = fs.readFileSync(matrixPath, 'utf8');
    const matrix = JSON.parse(content);
    
    const modelPattern = /^[^/]+\/.+$/;
    
    for (const [profileName, profile] of Object.entries(matrix.profiles)) {
      const rootModelValid = modelPattern.test(profile.model);
      const smallModelValid = modelPattern.test(profile.small_model);
      
      assert.ok(rootModelValid, `${profileName} root model should match provider/model format`);
      assert.ok(smallModelValid, `${profileName} small_model should match provider/model format`);
    }
  });

  it('should have non-empty model strings', () => {
    const matrixPath = path.join(GLOBAL_ROOT, 'global', 'opencode.profiles', 'model-matrix.json');
    const content = fs.readFileSync(matrixPath, 'utf8');
    const matrix = JSON.parse(content);
    
    for (const [profileName, profile] of Object.entries(matrix.profiles)) {
      assert.ok(profile.model && profile.model.length > 0, `${profileName} should have non-empty model`);
      assert.ok(profile.small_model && profile.small_model.length > 0, `${profileName} should have non-empty small_model`);
    }
  });
});
