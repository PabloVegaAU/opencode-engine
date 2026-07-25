#!/usr/bin/env node
/**
 * Generates standalone AJV validators for retrieval schemas.
 * These validators are self-contained and don't require AJV at runtime.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import ajvStandalone from 'ajv/dist/standalone/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '..');

const schemaDir = join(REPO_ROOT, 'contracts');
const outputDir = join(REPO_ROOT, 'bin', 'retrieval');

const schemas = [
  { name: 'retrieval-policy', file: 'retrieval-policy.schema.json' },
  { name: 'retrieval-index-state', file: 'retrieval-index-state.schema.json' }
];

if (!existsSync(outputDir)) {
  mkdirSync(outputDir, { recursive: true });
}

for (const schema of schemas) {
  const schemaPath = join(schemaDir, schema.file);
  const schemaContent = readFileSync(schemaPath, 'utf8');
  const schemaObj = JSON.parse(schemaContent);

  const ajv = new Ajv({
    strict: false,
    allErrors: true,
    code: { source: true, esm: true }
  });
  addFormats(ajv);

  const validate = ajv.compile(schemaObj);
  const moduleCode = ajvStandalone(ajv, validate);

  const outputPath = join(outputDir, `${schema.name}-validator.mjs`);
  writeFileSync(outputPath, moduleCode, 'utf8');

  console.log(`Generated: ${outputPath}`);
}

console.log('Done generating standalone validators.');
