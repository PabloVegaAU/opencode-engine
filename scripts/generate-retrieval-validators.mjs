#!/usr/bin/env node
/**
 * Generates standalone AJV validators for retrieval schemas.
 * These validators are self-contained and don't require AJV at runtime.
 *
 * --check mode: Regenerates validators in temp directory outside repo,
 * compares with versioned validators, deletes temp, exits non-zero on drift.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
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

const args = process.argv.slice(2);
const checkMode = args.includes('--check');

function getFileHash(filePath) {
  if (!existsSync(filePath)) return null;
  const content = readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex');
}

function generateValidator(schemaName, schemaFile, targetDir) {
  const schemaPath = join(schemaDir, schemaFile);
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

  const outputPath = join(targetDir, `${schemaName}-validator.mjs`);
  writeFileSync(outputPath, moduleCode, 'utf8');

  return outputPath;
}

if (checkMode) {
  const os = await import('os');
  const { randomUUID } = await import('crypto');

  const tempDir = os.tmpdir();
  const testDir = join(tempDir, `opencode-validator-check-${randomUUID()}`);
  mkdirSync(testDir, { recursive: true });

  let driftDetected = false;
  const driftDetails = [];

  try {
    for (const schema of schemas) {
      const tempOutput = join(testDir, `${schema.name}-validator.mjs`);
      generateValidator(schema.name, schema.file, testDir);

      const canonicalPath = join(outputDir, `${schema.name}-validator.mjs`);
      const tempHash = getFileHash(tempOutput);
      const canonicalHash = getFileHash(canonicalPath);

      if (tempHash !== canonicalHash) {
        driftDetected = true;
        driftDetails.push(`${schema.name}-validator.mjs: temp SHA256=${tempHash}, canonical SHA256=${canonicalHash}`);
      }
    }

    if (driftDetected) {
      console.error('VALIDATOR_DRIFT_DETECTED');
      for (const detail of driftDetails) {
        console.error(`  ${detail}`);
      }
      console.error('Run: node scripts/generate-retrieval-validators.mjs to regenerate');
      process.exitCode = 1;
    } else {
      console.log('VALIDATORS_OK');
      process.exitCode = 0;
    }
  } finally {
    rmSync(testDir, { recursive: true, force: true });
  }
} else {
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  for (const schema of schemas) {
    const outputPath = generateValidator(schema.name, schema.file, outputDir);
    console.log(`Generated: ${outputPath}`);
  }

  console.log('Done generating standalone validators.');
}
