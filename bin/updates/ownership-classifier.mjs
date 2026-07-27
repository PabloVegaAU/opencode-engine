/**
 * Ownership Classifier - OpenCode Global v0.5.0
 *
 * Scans an adopted environment and classifies artifacts according to
 * ownership policy rules, producing a classification map.
 */

import { readFileSync, existsSync, readdirSync, lstatSync } from 'node:fs';
import { join, relative, posix, isAbsolute, resolve } from 'node:path';

/**
 * Valid ownership categories
 */
export const OWNERSHIP_CATEGORIES = {
  GLOBAL_MANAGED: 'global-managed',
  PROJECT_OWNED: 'project-owned',
  GLOBAL_MANAGED_LOCAL_OVERRIDE: 'global-managed-local-override',
  GENERATED_RUNTIME: 'generated-runtime',
  EXTERNAL: 'external'
};

/**
 * Scans a directory recursively and returns all file paths.
 * @param {string} dirPath - Directory to scan
 * @param {string} rootPath - Root path for computing relative paths
 * @returns {string[]} Array of file paths relative to root
 */
function scanDirectory(dirPath, rootPath) {
  const files = [];

  try {
    const entries = readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);

      try {
        if (entry.isSymbolicLink() || (lstatSync(fullPath).isReparsePoint && lstatSync(fullPath).isReparsePoint())) {
          continue;
        } else if (entry.isDirectory()) {
          const childFiles = scanDirectory(fullPath, rootPath);
          files.push(...childFiles);
        } else if (entry.isFile()) {
          const relativePath = relative(rootPath, fullPath);
          // Normalize to forward slashes for consistency
          files.push(posix.normalize(relativePath));
        }
      } catch {
        // Skip files/directories we can't access
      }
    }
  } catch {
    // Skip directories we can't read
  }

  return files;
}

/**
 * Matches a path against a glob pattern.
 * Supports basic glob patterns: **, *, ?
 * @param {string} path - Path to match
 * @param {string} pattern - Glob pattern
 * @returns {boolean} True if path matches pattern
 */
function matchGlob(path, pattern) {
  // Convert glob pattern to regex
  const regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')  // Escape special regex chars except glob chars
    .replace(/\*\*/g, '{{DOUBLE_STAR}}')    // Placeholder for **
    .replace(/\*/g, '[^/]*')               // * matches anything except /
    .replace(/\?/g, '.')                   // ? matches single char
    .replace(/\{\{DOUBLE_STAR\}\}/g, '.*'); // ** matches anything including /

  try {
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(path);
  } catch {
    return false;
  }
}

/**
 * Loads ownership policy from a JSON file.
 * @param {string} policyPath - Path to policy file
 * @returns {object|null} Parsed policy or null
 */
function loadPolicy(policyPath) {
  if (!policyPath || !existsSync(policyPath)) {
    return null;
  }

  try {
    const content = readFileSync(policyPath, 'utf8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Determines if a category is blocked by the policy.
 * @param {string} category - Category to check
 * @param {string[]} blockedCategories - List of blocked categories
 * @returns {boolean} True if category is blocked
 */
function isCategoryBlocked(category, blockedCategories = []) {
  return blockedCategories.includes(category);
}

/**
 * Classifies a single file path against the policy rules.
 * @param {string} filePath - Relative file path
 * @param {object} policy - Ownership policy object
 * @returns {string|null} Category or null if unclassified
 */
function classifyFile(filePath, policy) {
  if (!policy || !policy.rules || !Array.isArray(policy.rules)) {
    return null;
  }

  for (const rule of policy.rules) {
    if (!rule.path_pattern || !rule.category) {
      continue;
    }

    const category = rule.category;

    // Skip blocked categories
    if (isCategoryBlocked(category, policy.blocked_categories)) {
      continue;
    }

    if (matchGlob(filePath, rule.path_pattern)) {
      return category;
    }
  }

  return null;
}

/**
 * Classifies artifacts in an environment according to ownership policy.
 *
 * @param {string} environmentPath - Path to the adopted environment to scan
 * @param {string} policyPath - Path to the ownership-policy.schema.json file
 * @returns {object} Classification result with:
 *   - classification_map: Map of artifact_path → ownership_category
 *   - unclassified: Array of paths that didn't match any rule
 *   - policy_version: Version from the policy
 *   - default_category: Default category applied
 */
export function classifyEnvironment(environmentPath, policyPath) {
  const result = {
    classification_map: {},
    unclassified: [],
    policy_version: null,
    default_category: null,
    error: null
  };

  // Validate environment path
  if (!environmentPath) {
    result.error = 'environmentPath is required';
    return result;
  }

  if (!existsSync(environmentPath)) {
    result.error = `environment path does not exist: ${environmentPath}`;
    return result;
  }

  // Load and validate policy
  const policy = loadPolicy(policyPath);

  if (!policy) {
    result.error = `failed to load policy from: ${policyPath}`;
    return result;
  }

  result.policy_version = policy.version || null;
  result.default_category = policy.default_category || OWNERSHIP_CATEGORIES.PROJECT_OWNED;

  // Scan the environment directory
  const files = scanDirectory(environmentPath, environmentPath);

  // Classify each file
  for (const filePath of files) {
    const category = classifyFile(filePath, policy);

    if (category !== null) {
      result.classification_map[filePath] = category;
    } else {
      result.classification_map[filePath] = result.default_category;
      result.unclassified.push(filePath);
    }
  }

  return result;
}

/**
 * Main entry point for CLI usage.
 */
export async function main() {
  const args = process.argv.slice(2);
  let environmentPath = null;
  let policyPath = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--environment' && i + 1 < args.length) {
      environmentPath = args[++i];
    } else if (args[i] === '--policy' && i + 1 < args.length) {
      policyPath = args[++i];
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`Usage: node ownership-classifier.mjs --environment <path> --policy <path>`);
      console.log('');
      console.log('Options:');
      console.log('  --environment <path>  Path to the adopted environment to scan');
      console.log('  --policy <path>        Path to ownership-policy.schema.json');
      console.log('  --help, -h             Show this help message');
      process.exit(0);
    }
  }

  if (!environmentPath) {
    console.error('Error: --environment is required');
    process.exit(1);
  }

  if (!policyPath) {
    console.error('Error: --policy is required');
    process.exit(1);
  }

  const result = classifyEnvironment(environmentPath, policyPath);

  if (result.error) {
    console.error(`Error: ${result.error}`);
    process.exit(1);
  }

  console.log(JSON.stringify(result, null, 2));
}

/**
 * Check if running directly (not imported as a module)
 */
function isRunDirectly() {
  try {
    const argv1Path = process.argv[1]?.replace(/\\/g, '/');
    if (!argv1Path) return false;
    const argv1Url = 'file://' + (argv1Path.match(/^\/[a-z]:/i) ? argv1Path : '/' + argv1Path);
    return import.meta.url === argv1Url;
  } catch {
    return false;
  }
}

if (isRunDirectly()) {
  main();
}
