---
description: Run a public cross-session orchestration subcommand from a Mission Spec
agent: build
---

Run the public cross-session CLI with explicit arguments only. Do not improvise. Do not pass provider, model, agent, session IDs, branches, or secrets through this command. Model, agent, and variant must arrive through the runtime argument flags of the CLI; the Project Manifest never carries them.

**Compatible with OpenCode 1.18.x+.**

## Entry Points

There are three ways to invoke the CLI:

| Entry point | Syntax | Use when |
|-------------|--------|----------|
| `cross-session.bat` | Unix-style `--flag value` | Familiar with Unix CLI tools (recommended) |
| `cross-session.ps1` | PowerShell style `-Flag value` | Native PowerShell |
| CLI direct | `node path/to/cross-session-cli.mjs` | Scripting, CI/CD pipelines |

**`cross-session.bat`** (recommended — Unix-style):

```bat
:: From any directory (translates --flag to -Flag automatically)
C:\path\to\cross-session.bat --subcommand mission-status --project-root C:\whatsapp-sales-kit-ai-env --mission ses-7004a784

:: With approve flag
C:\path\to\cross-session.bat --subcommand mission-run --project-root C:\whatsapp-sales-kit-ai-env --mission ses-7004a784 --approve-local-integration
```

**`cross-session.ps1`** (PowerShell-style):

```powershell
& "$env:USERPROFILE\.config\opencode\scripts\cross-session.ps1" -Subcommand mission-status -ProjectRoot 'C:\whatsapp-sales-kit-ai-env' -Mission ses-7004a784
```

**Direct CLI** (requires full absolute path):

```powershell
node "C:\Users\VegaValverde\.config\opencode\bin\orchestration\cross-session-cli.mjs" recovery-plan --project-root C:\whatsapp-sales-kit-ai-env --operation-id ses-7004a784
```

## Subcommands

Pick exactly one and forward the required arguments:

- `doctor` — `--ai-env-home <abs> --project-root <abs> --environment-manifest <abs> --project-manifest <abs> --spec <abs>`
- `mission-create` — adds `--operation-id <id> --at <utc>`
- `mission-status` — no extra flags
- `task-plan` — adds `--operation-id <id> --task-key <key>`
- `task-run` — adds `--operation-id <id> --task-key <key>`
- `integration-preflight` — adds `--operation-id <id> --task-key <key>` (read-only)
- `integration-apply` — adds `--operation-id <id> --task-key <key> --target-repository-id <id> --target-ref <ref> --expected-target-commit <oid> --approve-local-integration`
- `recovery-plan` — no extra flags
- `recovery-apply` — adds `--operation-id <id> --approve-local-integration`
- `mission-run` — adds `--operation-id <id> --approve-local-integration`; stops at blocked/failed/recovery_required
- `mission-loop` — adds `--operation-id <id> --approve-local-integration [--max-iterations N] [--poll-interval N] [--timeout N]`; runs `mission-run` repeatedly until all tasks complete or limits reached

### `mission-loop` Subcommand

Runs `mission-run` in a loop until all tasks are completed or limits are reached.

**Parameters:**

| Flag | Default | Description |
|------|---------|-------------|
| `--operation-id` / `--mission` | required | Operation ID of the mission |
| `--max-iterations` | 10 | Maximum number of iterations |
| `--poll-interval` | 5 | Seconds between iterations (for future async polling) |
| `--timeout` | 300 | Maximum seconds before timeout |

**Exit statuses:**

| Status | Meaning |
|--------|---------|
| `all_completed` | All tasks completed successfully |
| `blocked` | A task is blocked |
| `failed` | A task failed |
| `no_ready_tasks` | No ready tasks (dependencies not met) |
| `max_iterations_reached` | Reached max iterations without completing |
| `timeout` | Exceeded time limit |
| `error` | An error occurred |

**Example:**

```bat
:: Run loop until all tasks complete or 10 iterations
cross-session.bat --subcommand mission-loop --project-root C:\whatsapp-sales-kit-ai-env --mission my-mission

:: With custom limits
cross-session.bat --subcommand mission-loop --project-root C:\whatsapp-sales-kit-ai-env --mission my-mission --max-iterations 20 --timeout 600
```

```powershell
# PowerShell style
& "$env:USERPROFILE\.config\opencode\scripts\cross-session.ps1" -Subcommand mission-loop -ProjectRoot 'C:\whatsapp-sales-kit-ai-env' -Mission my-mission -MaxIterations 20 -Timeout 600
```

## File Locations

| File | Source | Runtime | AI Environments |
|------|--------|---------|----------------|
| CLI | `bin/orchestration/cross-session-cli.mjs` | `~/.config/opencode/bin/orchestration/` | `.opencode/bin/orchestration/` |
| Wrapper | `scripts/cross-session.ps1` | `~/.config/opencode/scripts/` | `.opencode/scripts/` |
| Launcher | `scripts/cross-session.bat` | `~/.config/opencode/scripts/` | `.opencode/scripts/` |

The CLI never pushes, merges to main, or modifies remotes.
