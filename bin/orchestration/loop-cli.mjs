#!/usr/bin/node
/**
 * Loop CLI - Native loop command for OpenCode
 * 
 * Executes a prompt/agent task iteratively with configurable:
 * - min-iterations: Minimum iterations before convergence check
 * - max-iterations: Maximum iterations (hard limit)
 * - timeout: Maximum time in seconds
 * - checkpoint-every: Pause for user input every N iterations
 * - approve-loop: Bypass doom_loop security check
 * - agent: Which agent to use (default: orchestrator)
 * 
 * Integrates with:
 * - Agent system for actual execution
 * - Session management for state persistence
 * - Permission system for doom_loop
 */

import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

// ============================================================================
// Constants
// ============================================================================

const SUBCOMMANDS = ['loop'];
const LOOP_EXIT_CODES = {
  all_completed: 0,
  converged: 0,
  max_iterations_reached: 1,
  timeout: 124,
  blocked: 2,
  failed: 3,
  no_ready_tasks: 4,
  user_aborted: 5,
  error: 1
};

const DEFAULT_MAX_ITERATIONS = 20;
const DEFAULT_MIN_ITERATIONS = 3;
const DEFAULT_TIMEOUT = 300;
const DEFAULT_CHECKPOINT_EVERY = 0;
const CONVERGENCE_THRESHOLD = 3;

// ============================================================================
// Utility Functions
// ============================================================================

class CliError extends Error {}

function parseArgs(args) {
  const result = {};
  let foundSeparator = false;
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    // Handle -- separator (everything after is prompt/positional)
    if (arg === '--') {
      foundSeparator = true;
      continue;
    }
    
    if (foundSeparator) {
      // Everything after -- is positional/prompt
      if (!result._) result._ = [];
      result._.push(arg);
      continue;
    }
    
    if (!arg.startsWith('-')) {
      // Collect positional arguments before --
      if (!result._) result._ = [];
      result._.push(arg);
      continue;
    }
    
    const key = arg.replace(/^-{1,2}/, '');
    // Handle special aliases
    if (key === 'm') { result.mission = args[++i]; continue; }
    if (key === 'n') { result['max-iterations'] = parseInt(args[++i], 10); continue; }
    if (key === 't') { result.timeout = parseInt(args[++i], 10); continue; }
    if (args[i + 1] && !args[i + 1].startsWith('-')) result[key] = args[++i];
    else result[key] = true;
  }
  return result;
}

function now() { return new Date().toISOString(); }
function fail(message) { throw new CliError(message); }
function required(opts, name) { if (!opts[name] || opts[name] === true) fail(`--${name} is required`); return opts[name]; }

function projectRoot(opts) {
  const root = resolve(opts['project-root'] || process.cwd());
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    fail(`Project root not found or not a directory: ${root}`);
  }
  return root;
}

function findConfig(root) {
  // Search for opencode.jsonc in common locations
  const candidates = [
    join(root, 'opencode.jsonc'),
    join(root, '.opencode', 'opencode.jsonc'),
    join(root, '.opencode', 'config', 'opencode.jsonc')
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function readConfig(root) {
  const configPath = findConfig(root);
  if (!configPath) return { doom_loop: 'deny', permission: {} };
  
  try {
    const content = readFileSync(configPath, 'utf8');
    // Simple JSONC parsing (strip comments)
    const stripped = content
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    return JSON.parse(stripped);
  } catch (error) {
    return { doom_loop: 'deny', permission: {} };
  }
}

function getDoomLoopSetting(config) {
  // Check permission.doom_loop first, then doom_loop directly
  if (config.permission?.doom_loop) return config.permission.doom_loop;
  if (config.doom_loop) return config.doom_loop;
  return 'deny';
}

function validateDoomLoop(config, approveLoop) {
  const setting = getDoomLoopSetting(config);
  
  if (setting === 'allow' || setting === 'warn') {
    return { allowed: true, warning: setting === 'warn' };
  }
  
  // deny or unknown
  if (approveLoop) {
    return { allowed: true, warning: true, bypassed: true };
  }
  
  return { allowed: false };
}

// ============================================================================
// Agent Execution
// ============================================================================

function executeAgent(prompt, options = {}) {
  return new Promise((resolve, reject) => {
    const {
      agent = 'general',
      model = null,
      projectRoot: root,
      sessionId = null,
      continueSession = false
    } = options;

    // Build opencode command
    let cmd = 'opencode';
    const args = ['run', prompt];
    
    if (agent) args.push('--agent', agent);
    if (model) args.push('--model', model);
    if (continueSession && sessionId) {
      args.push('--continue', '--session', sessionId, '--fork');
    }
    args.push('--auto');

    const child = spawn(cmd, args, {
      cwd: root,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
      env: { ...process.env }
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      resolve({
        exitCode: code,
        stdout,
        stderr,
        sessionId // Would need to parse from output
      });
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}

// ============================================================================
// Mission Integration
// ============================================================================

function loadMission(root, operationId) {
  const path = join(root, '.opencode', 'missions', `${operationId}.json}`);
  if (!existsSync(path)) return null;
  
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function updateMissionProgress(root, operationId, iteration, status, data = {}) {
  const path = join(root, '.opencode', 'missions', `${operationId}.json`);
  if (!existsSync(path)) return;

  try {
    const mission = JSON.parse(readFileSync(path, 'utf8'));
    mission.loop_state = {
      ...mission.loop_state,
      current_iteration: iteration,
      last_status: status,
      last_update: now(),
      ...data
    };
    writeFileSync(path, JSON.stringify(mission, null, 2), 'utf8');
  } catch {
    // Non-fatal
  }
}

// ============================================================================
// Convergence Detection
// ============================================================================

function computeStateHash(state) {
  return JSON.stringify({
    completed: state.completed || 0,
    pending: state.pending || 0,
    blocked: state.blocked || 0,
    failed: state.failed || 0
  });
}

function detectConvergence(stateHistory, minIterations, currentIteration) {
  if (currentIteration < minIterations) return false;
  if (stateHistory.length < CONVERGENCE_THRESHOLD) return false;
  
  // All states in history are identical
  const unique = new Set(stateHistory);
  return unique.size === 1;
}

// ============================================================================
// Main Loop Logic
// ============================================================================

async function executeLoop(opts) {
  const {
    prompt,
    mission: missionId,
    'max-iterations': maxIterations = DEFAULT_MAX_ITERATIONS,
    'min-iterations': minIterations = DEFAULT_MIN_ITERATIONS,
    timeout = DEFAULT_TIMEOUT,
    'checkpoint-every': checkpointEvery = DEFAULT_CHECKPOINT_EVERY,
    'approve-loop': approveLoop = false,
    agent = 'general',
    model = null,
    'project-root': projectRootOpt
  } = opts;

  const root = projectRoot(projectRootOpt ? { 'project-root': projectRootOpt } : {});
  const config = readConfig(root);
  
  // Check doom_loop permission
  const doomCheck = validateDoomLoop(config, approveLoop);
  if (!doomCheck.allowed) {
    return {
      ok: false,
      error: 'Loop mode is blocked by doom_loop=deny permission',
      hint: 'Use --approve-loop flag to bypass (requires explicit user intent)',
      exit_code: LOOP_EXIT_CODES.error
    };
  }

  const warnings = [];
  if (doomCheck.warning) {
    warnings.push(`doom_loop=${getDoomLoopSetting(config)} - loop execution allowed with warnings`);
  }
  if (doomCheck.bypassed) {
    warnings.push('--approve-loop bypasses doom_loop security');
  }

  const startTime = Date.now();
  const iterations = [];
  const stateHistory = [];
  
  let sessionId = null;
  let converged = false;
  let exitStatus = 'max_iterations_reached';

  console.error(`[LOOP] Starting loop execution`);
  console.error(`[LOOP] Prompt: ${prompt?.substring(0, 100)}...`);
  console.error(`[LOOP] Max iterations: ${maxIterations}, Min for convergence: ${minIterations}`);
  console.error(`[LOOP] Timeout: ${timeout}s, Checkpoint every: ${checkpointEvery || 'disabled'}`);
  console.error(`[LOOP] Agent: ${agent}`);
  if (warnings.length) warnings.forEach(w => console.error(`[LOOP] WARNING: ${w}`));

  // Main loop
  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    const iterationStart = Date.now();

    // Check timeout
    const elapsed = (Date.now() - startTime) / 1000;
    if (elapsed >= timeout) {
      console.error(`[LOOP] Timeout exceeded (${elapsed.toFixed(1)}s)`);
      exitStatus = 'timeout';
      break;
    }

    // Build task description
    const taskPrompt = iteration === 1 
      ? prompt 
      : `Continue: ${prompt}`;

    console.error(`[LOOP] [ITERATION ${iteration}/${maxIterations}] Starting...`);

    try {
      // Execute agent
      const result = await executeAgent(taskPrompt, {
        agent,
        model,
        projectRoot: root,
        sessionId,
        continueSession: iteration > 1
      });

      if (result.exitCode !== 0) {
        console.error(`[LOOP] [ITERATION ${iteration}] Agent exited with code ${result.exitCode}`);
        iterations.push({
          iteration,
          status: 'error',
          exitCode: result.exitCode,
          elapsed: (Date.now() - iterationStart) / 1000
        });
        
        // Check if mission task completed successfully
        const mission = missionId ? loadMission(root, missionId) : null;
        if (mission) {
          const readyTask = mission.tasks?.find(t => t.status === 'pending');
          if (readyTask) {
            readyTask.status = 'completed';
            readyTask.completed_at = now();
            // Update mission file would go here
          }
        }
      } else {
        console.error(`[LOOP] [ITERATION ${iteration}] Completed successfully`);
        iterations.push({
          iteration,
          status: 'completed',
          elapsed: (Date.now() - iterationStart) / 1000
        });
      }

      sessionId = result.sessionId || sessionId;

    } catch (error) {
      console.error(`[LOOP] [ITERATION ${iteration}] Error: ${error.message}`);
      iterations.push({
        iteration,
        status: 'error',
        error: error.message,
        elapsed: (Date.now() - iterationStart) / 1000
      });
      exitStatus = 'error';
      break;
    }

    // Update mission progress if linked
    if (missionId) {
      updateMissionProgress(root, missionId, iteration, 'running');
    }

    // Checkpoint pause
    if (checkpointEvery > 0 && iteration > 1 && (iteration - 1) % checkpointEvery === 0) {
      console.error(`[LOOP] === CHECKPOINT ===`);
      console.error(`[LOOP] Iteration: ${iteration}/${maxIterations}`);
      console.error(`[LOOP] Elapsed: ${elapsed.toFixed(1)}s`);
      console.error(`[LOOP] Progress: ${iterations.filter(i => i.status === 'completed').length} completed`);
      
      // In interactive mode, would prompt user here
      // For now, continue automatically
      console.error(`[LOOP] Auto-continuing (checkpoint prompt disabled in CLI mode)`);
    }

    // Check for all completed (if linked to mission)
    if (missionId) {
      const mission = loadMission(root, missionId);
      if (mission && mission.tasks?.every(t => t.status === 'completed')) {
        console.error(`[LOOP] All mission tasks completed!`);
        exitStatus = 'all_completed';
        break;
      }
    }

    // Update state history for convergence
    const currentState = {
      completed: iterations.filter(i => i.status === 'completed').length,
      pending: maxIterations - iteration,
      blocked: 0,
      failed: iterations.filter(i => i.status === 'error').length
    };
    stateHistory.push(computeStateHash(currentState));
    if (stateHistory.length > CONVERGENCE_THRESHOLD) {
      stateHistory.shift();
    }

    // Check convergence
    if (detectConvergence(stateHistory, minIterations, iteration)) {
      console.error(`[LOOP] CONVERGENCE DETECTED: No changes for ${CONVERGENCE_THRESHOLD} iterations`);
      console.error(`[LOOP] Early exit (min-iterations=${minIterations} reached)`);
      exitStatus = 'converged';
      converged = true;
      break;
    }

    console.error(`[LOOP] [ITERATION ${iteration}] Completed in ${((Date.now() - iterationStart) / 1000).toFixed(1)}s`);
  }

  // Final summary
  const totalTime = (Date.now() - startTime) / 1000;
  const completedIterations = iterations.filter(i => i.status === 'completed').length;

  console.error(`[LOOP] === Loop Complete ===`);
  console.error(`[LOOP] Total iterations: ${iterations.length}`);
  console.error(`[LOOP] Completed: ${completedIterations}`);
  console.error(`[LOOP] Total time: ${totalTime.toFixed(1)}s`);
  console.error(`[LOOP] Exit status: ${exitStatus}`);

  // Update mission with final state
  if (missionId) {
    updateMissionProgress(root, missionId, iterations.length, exitStatus, {
      converged,
      total_time: totalTime,
      completed_count: completedIterations
    });
  }

  return {
    ok: true,
    command: 'loop',
    iterations: iterations.length,
    completed: completedIterations,
    status: exitStatus,
    converged,
    elapsed_seconds: Math.round(totalTime),
    warnings,
    iteration_log: iterations
  };
}

// ============================================================================
// CLI Entry Point
// ============================================================================

function printHelp() {
  console.log(`
opencode loop - Execute tasks in a continuous loop

USAGE:
    opencode loop [options] -- <prompt>

OPTIONS:
    --mission, -m <id>         Link loop to a mission for state tracking
    --max-iterations, -n <n>   Maximum iterations (default: 20)
    --min-iterations <n>      Minimum iterations before convergence check (default: 3)
    --timeout, -t <seconds>     Maximum time in seconds (default: 300)
    --checkpoint-every <n>     Pause every N iterations for user input (default: disabled)
    --approve-loop              Bypass doom_loop security check
    --agent <name>              Agent to use (default: general)
    --model <provider/model>    Model to use
    --project-root <path>       Project root directory

EXIT CODES:
    0   all_completed, converged
    1   max_iterations_reached, error
    124 timeout
    2   blocked
    3   failed
    4   no_ready_tasks
    5   user_aborted

EXAMPLES:
    # Simple loop
    opencode loop "Implement feature X"

    # Loop with mission tracking
    opencode loop --mission my-feature --max-iterations 50 "Implement feature X"

    # Loop with checkpoints every 5 iterations
    opencode loop --checkpoint-every 5 "Refactor codebase"

    # Bypass doom_loop security
    opencode loop --approve-loop "Long-running task"
`);
}

async function main() {
  const args = process.argv.slice(2);
  
  // Handle help
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }

  // Parse arguments
  const opts = parseArgs(args);
  
  // Handle positional (prompt)
  let prompt = null;
  if (opts._ && opts._.length > 0) {
    // Join all positional args as prompt
    prompt = opts._.join(' ');
  }

  // Validate
  if (!prompt) {
    fail('Prompt is required. Usage: opencode loop -- <prompt>');
  }

  // Execute loop
  const result = await executeLoop({
    ...opts,
    prompt
  });

  // Output JSON result
  console.log(JSON.stringify(result, null, 2));

  // Set exit code
  process.exitCode = LOOP_EXIT_CODES[result.status] ?? 1;
}

main().catch(error => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
