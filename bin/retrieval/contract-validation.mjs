/**
 * Contract Validation - OpenCode Global v0.5.0
 * AJV-based validation for execution contracts.
 */

import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTRACTS_DIR = join(__dirname, '..', '..', 'contracts');

const ajv = new Ajv({ allErrors: true, strict: false, verbose: true });
addFormats(ajv);

const SCHEMAS = {
  'retrieval-plan-base': JSON.parse(readFileSync(join(CONTRACTS_DIR, 'retrieval-plan-base.schema.json'), 'utf8')),
  'retrieval-execution-plan': JSON.parse(readFileSync(join(CONTRACTS_DIR, 'retrieval-execution-plan.schema.json'), 'utf8')),
  'retrieval-execution-result': JSON.parse(readFileSync(join(CONTRACTS_DIR, 'retrieval-execution-result.schema.json'), 'utf8')),
  'retrieval-execution-trace': JSON.parse(readFileSync(join(CONTRACTS_DIR, 'retrieval-execution-trace.schema.json'), 'utf8')),
  'retrieval-execution-metrics': JSON.parse(readFileSync(join(CONTRACTS_DIR, 'retrieval-execution-metrics.schema.json'), 'utf8')),
  'retrieval-execution-reason-codes': JSON.parse(readFileSync(join(CONTRACTS_DIR, 'retrieval-execution-reason-codes.schema.json'), 'utf8')),
  'repository-state': JSON.parse(readFileSync(join(CONTRACTS_DIR, 'repository-state.schema.json'), 'utf8')),
  'project-manifest': JSON.parse(readFileSync(join(CONTRACTS_DIR, 'project-manifest.schema.json'), 'utf8'))
};

for (const [name, schema] of Object.entries(SCHEMAS)) {
  ajv.addSchema(schema, name);
}

export function validateBasePlan(plan) {
  const validate = ajv.getSchema('retrieval-plan-base');
  const valid = validate(plan);
  if (!valid) {
    return { valid: false, errors: validate.errors };
  }
  return { valid: true, errors: [] };
}

export function validateExecutionPlan(plan) {
  const validate = ajv.getSchema('retrieval-execution-plan');
  const valid = validate(plan);
  if (!valid) {
    return { valid: false, errors: validate.errors };
  }
  return { valid: true, errors: [] };
}

export function validateResult(result) {
  const validate = ajv.getSchema('retrieval-execution-result');
  const valid = validate(result);
  if (!valid) {
    return { valid: false, errors: validate.errors };
  }
  return { valid: true, errors: [] };
}

export function validateTrace(trace) {
  const validate = ajv.getSchema('retrieval-execution-trace');
  const valid = validate(trace);
  if (!valid) {
    return { valid: false, errors: validate.errors };
  }
  return { valid: true, errors: [] };
}

export function validateMetrics(metrics) {
  const validate = ajv.getSchema('retrieval-execution-metrics');
  const valid = validate(metrics);
  if (!valid) {
    return { valid: false, errors: validate.errors };
  }
  return { valid: true, errors: [] };
}

export function validateRepositoryState(state) {
  const validate = ajv.getSchema('repository-state');
  const valid = validate(state);
  if (!valid) {
    return { valid: false, errors: validate.errors };
  }
  return { valid: true, errors: [] };
}

export function validateProjectManifest(manifest) {
  const validate = ajv.getSchema('project-manifest');
  const valid = validate(manifest);
  if (!valid) {
    return { valid: false, errors: validate.errors };
  }
  return { valid: true, errors: [] };
}

export function getReasonCodeEnum() {
  return SCHEMAS['retrieval-execution-reason-codes'].enum;
}

export { SCHEMAS, ajv };
