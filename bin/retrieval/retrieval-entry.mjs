/**
 * Retrieval Entry - OpenCode Global v0.5.0
 *
 * Provides execute and batch entry points for retrieval.
 * Uses existing router logic for plan building, then calls engine for execution.
 * Does NOT duplicate classification, policy loading, capability detection, or budgets.
 *
 * CLI Entry: Accepts --cli-input-json with versioned envelope for execute or batch.
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname, resolve as pathResolve, relative as pathRelative } from 'path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';
import { createWriteStream, unlinkSync, renameSync } from 'fs';
import { randomUUID } from 'crypto';
import { tmpdir } from 'os';
import { mkdirSync } from 'fs';

import {
  buildPlan,
  loadPolicy,
  resolveIntent,
  INTENTS,
  detectCapabilities,
  getGitInfo,
  getIndexState
} from './retrieval-router.mjs';

import { executePlan } from './execution-engine.mjs';
import { executeBatch } from './execute-batch.mjs';
import { validateProjectManifest } from './contract-validation.mjs';

const REASON_CODES = {
  EXECUTION_REJECTED_FALLBACK_TO_PLAN: 'EXECUTION_REJECTED_FALLBACK_TO_PLAN',
  NO_PROJECT_MANIFEST: 'NO_PROJECT_MANIFEST',
  PROJECT_NOT_ADOPTED: 'PROJECT_NOT_ADOPTED',
  INVALID_INPUT: 'INVALID_INPUT',
  INTERNAL_ERROR: 'INTERNAL_ERROR'
};

const EXECUTABLE_PROVIDERS = new Set(['ripgrep', 'git_grep', 'filesystem']);
const PLAN_ONLY_PROVIDERS = new Set(['lsp', 'codebase-memory', 'semantic']);

const CLI_VERSION = '1.0';

const EXIT_CODES = {
  SUCCESS: 0,
  INVALID_INPUT: 1,
  PROJECT_NOT_ADOPTED: 2,
  MANIFEST_ABSENT_OR_INVALID: 3,
  PREFLIGHT_BLOCKED: 4,
  INTERNAL_ERROR: 5
};

function getModuleDir() {
  try {
    return dirname(fileURLToPath(import.meta.url));
  } catch {
    return process.cwd();
  }
}

function getCanonicalManifestPath(projectRoot) {
  const candidates = [
    join(projectRoot, 'project-manifest.json'),
    join(projectRoot, '.opencode', 'project-manifest.json')
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function loadAndValidateManifest(manifestPath) {
  if (!manifestPath || !existsSync(manifestPath)) {
    return { valid: false, error: 'Manifest not found', manifest: null };
  }

  try {
    const content = readFileSync(manifestPath, 'utf8');
    const manifest = JSON.parse(content);
    const validation = validateProjectManifest(manifest);

    if (!validation.valid) {
      return { valid: false, error: `Invalid manifest: ${validation.error}`, manifest: null };
    }

    return { valid: true, error: null, manifest };
  } catch (e) {
    return { valid: false, error: `Cannot read manifest: ${e.message}`, manifest: null };
  }
}

function isProjectAdopted(projectRoot) {
  const policyPath = join(projectRoot, '.ai-env', 'retrieval-policy.json');
  const manifestPath = getCanonicalManifestPath(projectRoot);
  return existsSync(policyPath) && manifestPath !== null;
}

function getProviderForStrategy(strategy, policy, capabilities) {
  if (!policy || !policy.strategies) return null;
  const cfg = policy.strategies[strategy];
  if (!cfg || !cfg.enabled) return null;
  return cfg.provider || null;
}

function isProviderAvailable(provider, capabilities) {
  if (!provider) return false;
  if (provider === 'ripgrep') return capabilities.ripgrep?.state === 'available';
  if (provider === 'git_grep') return capabilities.git_grep?.state === 'available';
  if (provider === 'filesystem') return true;
  if (PLAN_ONLY_PROVIDERS.has(provider)) {
    const cap = capabilities[provider];
    return cap && cap.state === 'available';
  }
  return false;
}

function findExecutableFallback(strategy, declaredFallbacks, capabilities) {
  if (!declaredFallbacks || !Array.isArray(declaredFallbacks)) {
    return null;
  }

  for (const fb of declaredFallbacks) {
    const fbProvider = typeof fb === 'string' ? fb : fb.provider;
    if (EXECUTABLE_PROVIDERS.has(fbProvider) && isProviderAvailable(fbProvider, capabilities)) {
      return fbProvider;
    }
  }
  return null;
}

function canExecuteProvider(provider, capabilities) {
  if (!provider) return false;
  if (EXECUTABLE_PROVIDERS.has(provider)) return isProviderAvailable(provider, capabilities);
  if (PLAN_ONLY_PROVIDERS.has(provider)) return false;
  return false;
}

export async function executeQuery(query, projectRoot, intent = INTENTS.AUTO, options = {}) {
  const projectPolicyPath = join(projectRoot, '.ai-env', 'retrieval-policy.json');
  const policy = loadPolicy(projectPolicyPath);

  if (!policy || !policy.enabled) {
    return {
      success: false,
      error: 'PROJECT_NOT_ADOPTED',
      reasons: [REASON_CODES.PROJECT_NOT_ADOPTED],
      result: null
    };
  }

  const resolved = resolveIntent(intent, query, policy, detectCapabilities());
  if (!resolved || !resolved.enabled) {
    return {
      success: false,
      error: 'PROJECT_NOT_ADOPTED',
      reasons: [REASON_CODES.PROJECT_NOT_ADOPTED],
      result: null
    };
  }

  const manifestPath = getCanonicalManifestPath(projectRoot);
  const manifestResult = loadAndValidateManifest(manifestPath);

  if (!manifestResult.valid || !manifestResult.manifest) {
    return {
      success: false,
      error: manifestResult.error || 'NO_PROJECT_MANIFEST',
      reasons: [REASON_CODES.NO_PROJECT_MANIFEST],
      result: null
    };
  }

  const basePlan = buildPlan(query, projectRoot, policy, intent);

  if (!basePlan.enabled || basePlan.error) {
    return {
      success: false,
      error: basePlan.error || 'PLAN_BUILD_FAILED',
      reasons: [REASON_CODES.EXECUTION_REJECTED_FALLBACK_TO_PLAN],
      result: null
    };
  }

  if (PLAN_ONLY_PROVIDERS.has(basePlan.provider)) {
    const fallbackProvider = findExecutableFallback(basePlan.strategy, basePlan.fallbacks, detectCapabilities());

    if (fallbackProvider) {
      basePlan.provider = fallbackProvider;
      basePlan.warnings = basePlan.warnings || [];
      basePlan.warnings.push('PROVIDER_FALLBACK_TO_' + fallbackProvider.toUpperCase());
    } else {
      return {
        success: false,
        error: 'PROVIDER_NOT_EXECUTABLE',
        reasons: [REASON_CODES.EXECUTION_REJECTED_FALLBACK_TO_PLAN],
        result: null
      };
    }
  }

  if (!canExecuteProvider(basePlan.provider, detectCapabilities())) {
    return {
      success: false,
      error: 'NO_EXECUTABLE_PROVIDER',
      reasons: [REASON_CODES.EXECUTION_REJECTED_FALLBACK_TO_PLAN],
      result: null
    };
  }

  basePlan.query = query;

  const manifestDir = dirname(manifestPath);

  const execOptions = {
    manifest: manifestResult.manifest,
    manifestDir,
    indexState: options.indexState || null,
    adapterOverrides: options.adapterOverrides || {}
  };

  const result = await executePlan(basePlan, execOptions);

  return result;
}

export async function executeBatchQueries(requests, options = {}) {
  if (!Array.isArray(requests)) {
    return {
      success: false,
      error: 'INVALID_REQUESTS',
      reasons: ['INVALID_REQUESTS'],
      results: []
    };
  }

  if (requests.length === 0) {
    return {
      success: true,
      batch_id: null,
      results: [],
      summary: { total_plans: 0, successful: 0, failed: 0 },
      reasons: []
    };
  }

  const firstRequest = requests[0];
  const firstProjectRoot = firstRequest.projectRoot;

  const firstPolicyPath = join(firstProjectRoot, '.ai-env', 'retrieval-policy.json');
  const firstPolicy = loadPolicy(firstPolicyPath);

  if (!firstPolicy || !firstPolicy.enabled) {
    return {
      success: false,
      error: 'PROJECT_NOT_ADOPTED',
      reasons: [REASON_CODES.PROJECT_NOT_ADOPTED],
      results: requests.map(() => ({
        success: false,
        error: 'PROJECT_NOT_ADOPTED',
        reasons: [REASON_CODES.PROJECT_NOT_ADOPTED],
        result: null
      }))
    };
  }

  const firstManifestPath = getCanonicalManifestPath(firstProjectRoot);
  const firstManifestResult = loadAndValidateManifest(firstManifestPath);

  if (!firstManifestResult.valid || !firstManifestResult.manifest) {
    return {
      success: false,
      error: firstManifestResult.error || 'NO_PROJECT_MANIFEST',
      reasons: [REASON_CODES.NO_PROJECT_MANIFEST],
      results: requests.map(() => ({
        success: false,
        error: firstManifestResult.error || 'NO_PROJECT_MANIFEST',
        reasons: [REASON_CODES.NO_PROJECT_MANIFEST],
        result: null
      }))
    };
  }

  const sharedManifest = firstManifestResult.manifest;
  const sharedManifestDir = dirname(firstManifestPath);

  const plans = [];
  const results = [];

  for (const req of requests) {
    const query = req.query;
    const projectRoot = req.projectRoot;
    const intent = req.intent || INTENTS.AUTO;

    if (projectRoot !== firstProjectRoot) {
      results.push({
        success: false,
        error: 'BATCH_MUST_USE_SAME_PROJECT',
        reasons: ['BATCH_MUST_USE_SAME_PROJECT'],
        result: null
      });
      plans.push(null);
      continue;
    }

    const projectPolicyPath = join(projectRoot, '.ai-env', 'retrieval-policy.json');
    const policy = loadPolicy(projectPolicyPath);

    if (!policy || !policy.enabled) {
      results.push({
        success: false,
        error: 'PROJECT_NOT_ADOPTED',
        reasons: [REASON_CODES.PROJECT_NOT_ADOPTED],
        result: null
      });
      plans.push(null);
      continue;
    }

    const basePlan = buildPlan(query, projectRoot, policy, intent);

    if (!basePlan.enabled || basePlan.error) {
      results.push({
        success: false,
        error: basePlan.error || 'PLAN_BUILD_FAILED',
        reasons: [REASON_CODES.EXECUTION_REJECTED_FALLBACK_TO_PLAN],
        result: null
      });
      plans.push(null);
      continue;
    }

    if (PLAN_ONLY_PROVIDERS.has(basePlan.provider)) {
      const fallbackProvider = findExecutableFallback(basePlan.strategy, basePlan.fallbacks, detectCapabilities());

      if (fallbackProvider) {
        basePlan.provider = fallbackProvider;
        basePlan.warnings = basePlan.warnings || [];
        basePlan.warnings.push('PROVIDER_FALLBACK_TO_' + fallbackProvider.toUpperCase());
      } else {
        results.push({
          success: false,
          error: 'PROVIDER_NOT_EXECUTABLE',
          reasons: [REASON_CODES.EXECUTION_REJECTED_FALLBACK_TO_PLAN],
          result: null
        });
        plans.push(null);
        continue;
      }
    }

    if (!canExecuteProvider(basePlan.provider, detectCapabilities())) {
      results.push({
        success: false,
        error: 'NO_EXECUTABLE_PROVIDER',
        reasons: [REASON_CODES.EXECUTION_REJECTED_FALLBACK_TO_PLAN],
        result: null
      });
      plans.push(null);
      continue;
    }

    basePlan.query = query;
    plans.push(basePlan);
    results.push({ success: true, error: null, reasons: [], result: null });
  }

  const validPlans = plans.filter(p => p !== null);

  if (validPlans.length === 0) {
    return {
      success: false,
      error: 'NO_VALID_PLANS',
      results
    };
  }

  const batchResults = await executeBatch(validPlans, {
    manifest: sharedManifest,
    manifestDir: sharedManifestDir,
    adapterOverrides: options.adapterOverrides || {}
  });

  let resultIndex = 0;
  const finalResults = [];

  for (let i = 0; i < results.length; i++) {
    if (results[i].success) {
      finalResults.push(batchResults.results[resultIndex]);
      resultIndex++;
    } else {
      finalResults.push(results[i]);
    }
  }

  return {
    success: batchResults.success,
    batch_id: batchResults.batch_id,
    results: finalResults,
    summary: batchResults.summary,
    reasons: batchResults.reasons
  };
}

function getRuntimeDir() {
  const configDir = process.env.OPENCODE_CONFIG_DIR ||
    process.env.XDG_CONFIG_HOME ||
    join(process.env.HOME || process.env.USERPROFILE || '', '.config', 'opencode');
  return configDir;
}

function getTrustedTraceDir() {
  return join(getRuntimeDir(), 'retrieval');
}

function isPathInsideTrustedDir(filePath, trustedDir) {
  const absPath = filePath.replace(/\\/g, '/');
  const absTrusted = trustedDir.replace(/\\/g, '/');
  const rel = absPath.replace(absTrusted, '');
  return rel === '' || rel.startsWith('/');
}

function validateTracePath(tracePath, projectRoot) {
  const trustedDir = getTrustedTraceDir();

  try {
    const absTracePath = pathResolve(tracePath);
    const absTrusted = pathResolve(trustedDir);
    const absProject = pathResolve(projectRoot);

    const relToTrusted = pathRelative(absTrusted, absTracePath);
    const relToProject = pathRelative(absProject, absTracePath);

    if (relToTrusted.startsWith('..') || absTracePath === absTrusted) {
      return { valid: false, error: 'Path outside trusted trace dir' };
    }

    if (!relToProject.startsWith('..') && !absTracePath.startsWith(absProject)) {
      return { valid: false, error: 'Path inside project root' };
    }

    if (relToProject !== absTracePath && !relToProject.startsWith('..')) {
      return { valid: false, error: 'Path inside project root' };
    }

    const pathParts = tracePath.replace(/\\/g, '/').split('/');
    if (pathParts.some(p => p === '..')) {
      return { valid: false, error: 'Path contains traversal' };
    }

    return { valid: true };
  } catch (e) {
    return { valid: false, error: 'Invalid path' };
  }
}

async function writeTraceFile(trace, tracePath, projectRoot) {
  const trustedDir = getTrustedTraceDir();
  if (!existsSync(trustedDir)) {
    mkdirSync(trustedDir, { recursive: true });
  }

  const validation = validateTracePath(tracePath, projectRoot);
  if (!validation.valid) {
    throw new Error(`Invalid trace path: ${validation.error}`);
  }

  const tmpPath = join(tmpdir(), `trace-${randomUUID()}.json`);
  const writeStream = createWriteStream(tmpPath, { encoding: 'utf8' });

  return new Promise((resolve, reject) => {
    writeStream.write(JSON.stringify(trace, null, 2), () => {
      writeStream.end();
    });

    writeStream.on('finish', () => {
      try {
        renameSync(tmpPath, tracePath);
        resolve();
      } catch (e) {
        unlinkSync(tmpPath);
        reject(e);
      }
    });

    writeStream.on('error', (e) => {
      unlinkSync(tmpPath);
      reject(e);
    });
  });
}

async function writeMetricsFile(metrics, metricsPath, projectRoot) {
  const trustedDir = getTrustedTraceDir();
  if (!existsSync(trustedDir)) {
    mkdirSync(trustedDir, { recursive: true });
  }

  const validation = validateTracePath(metricsPath, projectRoot);
  if (!validation.valid) {
    throw new Error(`Invalid metrics path: ${validation.error}`);
  }

  const tmpPath = join(tmpdir(), `metrics-${randomUUID()}.json`);
  const writeStream = createWriteStream(tmpPath, { encoding: 'utf8' });

  return new Promise((resolve, reject) => {
    writeStream.write(JSON.stringify(metrics, null, 2), () => {
      writeStream.end();
    });

    writeStream.on('finish', () => {
      try {
        renameSync(tmpPath, metricsPath);
        resolve();
      } catch (e) {
        unlinkSync(tmpPath);
        reject(e);
      }
    });

    writeStream.on('error', (e) => {
      unlinkSync(tmpPath);
      reject(e);
    });
  });
}

function validateCliEnvelope(envelope) {
  if (!envelope || typeof envelope !== 'object') {
    return { valid: false, error: 'Envelope must be an object' };
  }

  if (envelope.cli_version !== CLI_VERSION) {
    return { valid: false, error: `Unsupported cli_version: ${envelope.cli_version}` };
  }

  if (!['execute', 'batch'].includes(envelope.mode)) {
    return { valid: false, error: `Invalid mode: ${envelope.mode}` };
  }

  if (!envelope.input || typeof envelope.input !== 'object') {
    return { valid: false, error: 'Missing or invalid input' };
  }

  if (envelope.mode === 'execute') {
    if (typeof envelope.input.query !== 'string') {
      return { valid: false, error: 'query must be a string' };
    }
    if (typeof envelope.input.project_root !== 'string') {
      return { valid: false, error: 'project_root must be a string' };
    }
  }

  if (envelope.mode === 'batch') {
    if (!Array.isArray(envelope.input.plans)) {
      return { valid: false, error: 'plans must be an array' };
    }
    if (envelope.input.plans.length === 0) {
      return { valid: false, error: 'plans array cannot be empty' };
    }
    for (const plan of envelope.input.plans) {
      if (typeof plan.query !== 'string') {
        return { valid: false, error: 'Each plan must have a query string' };
      }
    }
  }

  return { valid: true };
}

function mapErrorToExitCode(error, reasons) {
  if (error === 'PROJECT_NOT_ADOPTED') return EXIT_CODES.PROJECT_NOT_ADOPTED;
  if (error === 'Manifest not found' || error === 'NO_PROJECT_MANIFEST') return EXIT_CODES.MANIFEST_ABSENT_OR_INVALID;
  if (error && error.includes && error.includes('PREFLIGHT')) return EXIT_CODES.PREFLIGHT_BLOCKED;
  if (reasons && reasons.includes && reasons.includes('EXECUTION_REJECTED_FALLBACK_TO_PLAN')) return EXIT_CODES.PREFLIGHT_BLOCKED;
  return EXIT_CODES.INTERNAL_ERROR;
}

async function handleExecuteMode(envelope) {
  const { query, project_root, intent } = envelope.input;
  const options = envelope.options || {};
  const maxFallbacks = options?.max_fallbacks ?? 1;
  const progressiveDisclosure = options?.progressive_disclosure ?? false;
  const tracePath = options?.trace_path || options?.write_trace || null;
  const metricsPath = options?.write_metrics || null;

  const execOptions = {
    maxFallbacks,
    progressiveDisclosure,
    tracePath,
    metricsPath
  };

  const result = await executeQuery(query, project_root, intent || INTENTS.AUTO, execOptions);

  const response = {
    success: result.success,
    error: result.error || null,
    reasons: result.reasons || [],
    result: result.result || null,
    trace: result.trace || null,
    metrics: result.metrics || null
  };

  if (tracePath && result.trace) {
    try {
      await writeTraceFile(result.trace, tracePath, project_root);
    } catch (e) {
      console.error(`Failed to write trace: ${e.message}`);
    }
  }

  if (metricsPath && result.metrics) {
    try {
      await writeMetricsFile(result.metrics, metricsPath, project_root);
    } catch (e) {
      console.error(`Failed to write metrics: ${e.message}`);
    }
  }

  return response;
}

async function handleBatchMode(envelope) {
  const { plans } = envelope.input;
  const options = envelope.options || {};
  const maxFallbacks = options?.max_fallbacks ?? 1;
  const progressiveDisclosure = options?.progressive_disclosure ?? false;
  const tracePath = options?.trace_path || options?.write_trace || null;
  const metricsPath = options?.write_metrics || null;

  const requests = plans.map(plan => ({
    query: plan.query,
    projectRoot: plan.project_root,
    intent: plan.intent || INTENTS.AUTO
  }));

  const batchOptions = {
    maxFallbacks,
    progressiveDisclosure,
    tracePath,
    metricsPath
  };

  const result = await executeBatchQueries(requests, batchOptions);

  const response = {
    success: result.success,
    error: result.error || null,
    reasons: result.reasons || [],
    batch_id: result.batch_id || null,
    results: result.results || [],
    summary: result.summary || null
  };

  if (tracePath) {
    try {
      const combinedTrace = {
        schema_version: '1.0',
        trace_id: result.batch_id || randomUUID(),
        started_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
        phases: {},
        events: [],
        logical_calls: [],
        provider_processes: [],
        focused_reads: []
      };

      for (const r of result.results || []) {
        if (r.trace) {
          combinedTrace.events.push(...(r.trace.events || []));
          combinedTrace.provider_processes.push(...(r.trace.provider_processes || []));
        }
      }

      const batchProjectRoot = requests.length > 0 ? requests[0].projectRoot : process.cwd();
      await writeTraceFile(combinedTrace, tracePath, batchProjectRoot);
    } catch (e) {
      console.error(`Failed to write trace: ${e.message}`);
    }
  }

  return response;
}

async function cliMain(args) {
  let cliInput = null;
  let cliInputFile = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cli-input-json' && i + 1 < args.length) {
      cliInputFile = args[++i];
    }
  }

  if (!cliInputFile) {
    console.error('Error: --cli-input-json is required');
    process.exit(EXIT_CODES.INVALID_INPUT);
  }

  let inputStr;
  if (cliInputFile === '-') {
    inputStr = await new Promise((resolve, reject) => {
      let data = '';
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', chunk => { data += chunk; });
      process.stdin.on('end', () => resolve(data));
      process.stdin.on('error', reject);
    });
  } else {
    if (!existsSync(cliInputFile)) {
      console.error(`Error: Input file not found: ${cliInputFile}`);
      process.exit(EXIT_CODES.INVALID_INPUT);
    }
    inputStr = readFileSync(cliInputFile, 'utf8');
  }

  if (!inputStr || inputStr.trim() === '') {
    console.error('Error: Empty input');
    process.exit(EXIT_CODES.INVALID_INPUT);
  }

  let envelope;
  try {
    envelope = JSON.parse(inputStr);
  } catch {
    console.error('Error: Invalid JSON');
    process.exit(EXIT_CODES.INVALID_INPUT);
  }

  const validation = validateCliEnvelope(envelope);
  if (!validation.valid) {
    console.error(`Error: ${validation.error}`);
    process.exit(EXIT_CODES.INVALID_INPUT);
  }

  let result;
  try {
    if (envelope.mode === 'execute') {
      result = await handleExecuteMode(envelope);
    } else if (envelope.mode === 'batch') {
      result = await handleBatchMode(envelope);
    } else {
      console.error(`Error: Invalid mode: ${envelope.mode}`);
      process.exit(EXIT_CODES.INVALID_INPUT);
    }
  } catch (e) {
    console.error(`Error: Internal error: ${e.message}`);
    process.exit(EXIT_CODES.INTERNAL_ERROR);
  }

  if (!result.success) {
    const exitCode = mapErrorToExitCode(result.error, result.reasons);
    console.log(JSON.stringify(result));
    process.exit(exitCode);
  }

  console.log(JSON.stringify(result));
  process.exit(EXIT_CODES.SUCCESS);
}

function isRunAsCli() {
  try {
    const argv1 = process.argv[1] || '';
    const currentFile = import.meta.url.replace(/\\/g, '/').replace(/^file:\/\//, '');
    const argv1Normalized = argv1.replace(/\\/g, '/').replace(/^file:\/\//, '');
    return currentFile === argv1Normalized || argv1.includes('retrieval-entry.mjs');
  } catch {
    return false;
  }
}

if (isRunAsCli()) {
  cliMain(process.argv.slice(2)).catch(e => {
    console.error(`Error: ${e.message}`);
    process.exit(EXIT_CODES.INTERNAL_ERROR);
  });
}
