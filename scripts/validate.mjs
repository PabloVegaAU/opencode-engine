import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, isAbsolute, relative, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

const CREDENTIAL_PATTERNS = [
  /api[_-]?key["\s]*[:=]["\s]*[a-zA-Z0-9]{20,}/i,
  /secret[_\"]?[:=][\"\s]*[a-zA-Z0-9]{20,}/i,
  /password["\s]*[:=]["\s]*["'][^"']+["']/i,
  /bearer["\s]+[a-zA-Z0-9\-_]+\.[a-zA-Z0-9\-_]+\.[a-zA-Z0-9\-_]+/i,
  /ghp_[a-zA-Z0-9]{36,}/i,
  /sk-[a-zA-Z0-9]{48,}/i,
];

function findJsonFiles(dir, files = []) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      findJsonFiles(fullPath, files);
    } else if (/\.jsonc?$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

function stripJsoncComments(content) {
  let result = '';
  let i = 0;
  while (i < content.length) {
    if (content[i] === '"') {
      result += content[i++];
      while (i < content.length && content[i] !== '"') {
        if (content[i] === '\\') result += content[i++];
        result += content[i++];
      }
      if (i < content.length) result += content[i++];
    } else if (content[i] === '/' && content[i + 1] === '/') {
      while (i < content.length && content[i] !== '\n') i++;
    } else if (content[i] === '/' && content[i + 1] === '*') {
      i += 2;
      while (i < content.length && !(content[i] === '*' && content[i + 1] === '/')) i++;
      i += 2;
    } else {
      result += content[i++];
    }
  }
  return result;
}

function parseJsonContent(content, filePath) {
  const isJsonc = filePath.endsWith('.jsonc');
  if (isJsonc) {
    content = stripJsoncComments(content);
    content = content.replace(/,(\s*[}\]])/g, '$1');
  }
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function validateJsonSyntax(content, filePath) {
  const result = parseJsonContent(content, filePath);
  if (result === null) {
    console.error(`[FAIL] Invalid JSON syntax: ${filePath}`);
    return false;
  }
  console.log(`[PASS] JSON syntax valid: ${filePath}`);
  return true;
}

function validateNoAbsolutePaths(obj, path = '', filePath = '') {
  let valid = true;
  if (typeof obj === 'string') {
    if (isAbsolute(obj) && !obj.includes('node_modules')) {
      console.error(`[FAIL] Absolute path found at ${path} in ${filePath}: ${obj}`);
      valid = false;
    }
  } else if (Array.isArray(obj)) {
    obj.forEach((item, i) => {
      if (!validateNoAbsolutePaths(item, `${path}[${i}]`, filePath)) valid = false;
    });
  } else if (obj && typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj)) {
      if (!validateNoAbsolutePaths(value, `${path}.${key}`, filePath)) valid = false;
    }
  }
  return valid;
}

function validateNoCredentials(content, filePath) {
  for (const pattern of CREDENTIAL_PATTERNS) {
    if (pattern.test(content)) {
      console.error(`[FAIL] Potential credential pattern found in ${filePath}`);
      return false;
    }
  }
  return true;
}

function validateRoutingMatrix(schema) {
  if (!schema || typeof schema !== 'object') return true;
  if (schema.routingMatrix && Array.isArray(schema.routingMatrix)) {
    for (const route of schema.routingMatrix) {
      if (!route.condition || !route.target) {
        console.error(`[FAIL] Invalid routing matrix entry: missing condition or target`);
        return false;
      }
    }
  }
  return true;
}

function validateFile(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  let valid = true;

  if (!validateJsonSyntax(content, filePath)) return false;
  if (!validateNoCredentials(content, filePath)) return false;

  const parsed = parseJsonContent(content, filePath);
  if (parsed && typeof parsed === 'object') {
    if (!validateNoAbsolutePaths(parsed, '', filePath)) valid = false;
    if (basename(filePath) === 'routing.json' || basename(filePath) === 'routing.jsonc') {
      if (!validateRoutingMatrix(parsed)) valid = false;
    }
  }
  return valid;
}

function main() {
  console.log('Validating OpenCode Global configuration...\n');
  const jsonFiles = findJsonFiles(PROJECT_ROOT);
  let allValid = true;

  for (const file of jsonFiles) {
    if (!validateFile(file)) {
      allValid = false;
    }
  }

  console.log('\n' + (allValid ? 'All validations passed.' : 'Validation failed.'));
  process.exit(allValid ? 0 : 1);
}

main();
