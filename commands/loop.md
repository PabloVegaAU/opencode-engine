---
description: Execute tasks in a continuous loop without step/query limits
agent: orchestrator
---

# Loop Command — OpenCode

Execute a task in continuous loop mode, avoiding step and query limits while maintaining safety boundaries.

**Compatible with OpenCode 1.18.x+.**

## Overview

The `loop` command allows long-running agentic workflows to execute continuously without hitting session step limits. It provides:

- **Configurable iterations** — Set min/max iterations to control loop duration
- **Convergence detection** — Automatically exit when no progress is being made
- **Checkpoint system** — Pause at intervals for human-in-the-loop oversight
- **Doom loop protection** — Security boundary to prevent runaway execution
- **Mission integration** — Link loops to missions for state tracking

## Usage

```bat
:: Basic loop
opencode loop -- "Implement feature X"

:: With mission tracking
opencode loop --mission my-feature --max-iterations 50 -- "Implement feature X"

:: With checkpoints every 5 iterations
opencode loop --checkpoint-every 5 -- "Refactor codebase"

:: Bypass doom_loop security
opencode loop --approve-loop -- "Long-running task"
```

```powershell
# PowerShell style
opencode loop -- "Implement feature X"
opencode loop --mission my-feature --max-iterations 50 -- "Implement feature X"
opencode loop --checkpoint-every 5 -- "Refactor codebase"
opencode loop --approve-loop -- "Long-running task"
```

## Parameters

| Flag | Short | Default | Description |
|------|-------|---------|-------------|
| `--mission` | `-m` | null | Link loop to mission for state tracking |
| `--max-iterations` | `-n` | 20 | Maximum loop iterations (hard limit) |
| `--min-iterations` | | 3 | Minimum iterations before convergence check |
| `--timeout` | `-t` | 300 | Maximum seconds before timeout |
| `--checkpoint-every` | | 0 | Pause every N iterations (0 = disabled) |
| `--approve-loop` | | false | Bypass doom_loop security check |
| `--agent` | | general | Agent to use for execution |
| `--model` | | null | Specific model to use |
| `--project-root` | | cwd | Project root directory |

## Exit Codes

| Status | Exit Code | Meaning |
|--------|-----------|---------|
| `all_completed` | 0 | All tasks/mission completed successfully |
| `converged` | 0 | No progress detected, early exit |
| `max_iterations_reached` | 1 | Reached max iterations without completing |
| `timeout` | 124 | Exceeded time limit |
| `blocked` | 2 | A task is blocked |
| `failed` | 3 | A task failed |
| `no_ready_tasks` | 4 | No ready tasks (dependencies not met) |
| `user_aborted` | 5 | User cancelled at checkpoint |
| `error` | 1 | General error |

## Convergence Detection

The loop automatically detects when no progress is being made:

1. Tracks task state hash on each iteration
2. Maintains history of last 3 states
3. If all states in history are identical AND min-iterations reached → convergence detected
4. Loop exits early with status `converged`

This prevents premature exit when tasks are legitimately waiting for external input.

## Doom Loop Protection

The `doom_loop` permission in `opencode.jsonc` provides a security boundary:

```jsonc
{
  "permission": {
    "doom_loop": "deny"  // Default - blocks loop execution
  }
}
```

| Setting | Behavior |
|---------|----------|
| `deny` (default) | Blocks loop unless `--approve-loop` provided |
| `warn` | Allows execution but logs warning each iteration |
| `allow` | Full execution without warnings |

### Bypass with --approve-loop

```bat
:: With doom_loop=deny, requires explicit approval
opencode loop --approve-loop -- "Long-running task"
```

## Mission Integration

Link loops to missions for persistent state tracking:

```bat
:: Create mission first
opencode mission-create --name my-task --at 2024-01-01T00:00:00Z

:: Run loop linked to mission
opencode loop --mission my-task --max-iterations 50 -- "Implement feature X"
```

Mission progress is updated on each iteration:
- `current_iteration`: Current iteration number
- `last_status`: Loop status (running, converged, etc.)
- `converged`: Boolean indicating convergence
- `total_time`: Total execution time
- `completed_count`: Number of completed iterations

## Checkpoint System

When `--checkpoint-every N` is set, the loop pauses after every N iterations:

```
[LOOP] === CHECKPOINT ===
[LOOP] Iteration: 5/20
[LOOP] Elapsed: 120.5s
[LOOP] Progress: 4 completed
Continue loop? [y/n]
```

- `y`: Resume loop from next iteration
- `n`: Exit with `user_aborted` status

## Examples

### Long Feature Implementation

```bat
:: Implement a large feature over multiple iterations
opencode loop --mission feature-auth --max-iterations 100 --min-iterations 10 --checkpoint-every 25 -- "Implement complete authentication system with OAuth, MFA, and session management"
```

### Codebase Refactoring

```bat
:: Refactor with safety checkpoints
opencode loop --mission refactor-api --max-iterations 50 --checkpoint-every 10 --approve-loop -- "Refactor all API endpoints to use consistent error handling and logging"
```

### Research Task

```bat
:: Research with convergence detection
opencode loop --max-iterations 20 --min-iterations 5 --timeout 600 -- "Research and document all microservices dependencies in the codebase"
```

## Integration with Speckit

The loop command integrates with the Speckit workflow:

```bat
:: Execute speckit-implement in loop mode
opencode loop --mission speckit-feature --max-iterations 30 --checkpoint-every 10 --approve-loop -- "Load speckit-implement skill. Execute implementation plan at specs/feature-x/tasks.md phase by phase. Report progress after each task."
```

## Technical Details

### State Persistence

- Loop state is persisted to mission file on each iteration
- State survives session termination
- Resume capability via `--continue` flag (future)

### Agent Execution

- Uses `opencode run` internally with `--auto` for non-interactive mode
- Supports `--fork` for background execution (future)
- Model and agent passed through to underlying execution

### Timeout Handling

- Global timeout checked before each iteration
- Individual iteration time tracked separately
- Timeout exit code: 124 (standard Unix convention)

## See Also

- [Mission Spec](./cross-session.md) — Mission infrastructure
- [Speckit Workflow](../.specify/README.md) — Spec → Plan → Tasks → Implement
- [Permission System](../global/opencode.jsonc) — doom_loop configuration
