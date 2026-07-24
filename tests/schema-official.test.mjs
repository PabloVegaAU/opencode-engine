import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync } from 'fs';
import { parse } from 'jsonc-parser';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_URL = 'https://opencode.ai/config.json';
const CONFIG_PATH = resolve(__dirname, '../global/opencode.jsonc');

const ajv = new Ajv({
  allErrors: true,
  strict: false,
  validateSchema: false
});
addFormats(ajv, { mode: 'fast' });

function removeExternalRefs(obj, externalHosts = ['models.dev']) {
  if (Array.isArray(obj)) {
    return obj.map(item => removeExternalRefs(item, externalHosts));
  }
  if (obj && typeof obj === 'object') {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key === '$ref' && typeof value === 'string') {
        const needsReplacement = externalHosts.some(host => value.includes(host));
        if (needsReplacement) {
          result[key] = '#/$defs/Placeholder';
        } else {
          result[key] = value;
        }
      } else {
        result[key] = removeExternalRefs(value, externalHosts);
      }
    }
    return result;
  }
  return obj;
}

let schema;
try {
  const response = await fetch(SCHEMA_URL);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  schema = await response.json();
  console.log('✓ Successfully fetched official schema from opencode.ai');

  schema = removeExternalRefs(schema);
  if (!schema.$defs) schema.$defs = {};
  schema.$defs.Placeholder = { type: 'string' };
} catch (err) {
  console.error('✗ Failed to fetch official schema:', err.message);
  process.exit(1);
}

const validate = ajv.compile(schema);

let configText;
try {
  configText = readFileSync(CONFIG_PATH, 'utf-8');
} catch (err) {
  console.error('✗ Failed to read config file:', err.message);
  process.exit(1);
}

const errors = parse(configText);
const valid = validate(errors);

if (valid) {
  console.log('✓ global/opencode.jsonc passes validation');
} else {
  console.log('✗ global/opencode.jsonc has validation errors:');
  for (const err of validate.errors) {
    const path = err.instancePath || 'root';
    console.log(`  - ${path}: ${err.message}`);
  }
  process.exit(1);
}
