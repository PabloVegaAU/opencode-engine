# Orchestration

OpenCode Global supports cross-session orchestration as an **OPTIONAL** capability.

**Note:** Cross-session orchestration is distributed via opencode-global. The CLI and wrappers are synced to runtime (`~/.config/opencode`) and each AI environment. If the runtime CLI is not present, the wrapper script will report a warning but opencode-global remains fully functional.

## Entry Points

There are two ways to invoke the CLI:

| Entry point | Syntax | Use when |
|-------------|--------|----------|
| `cross-session.bat` | Unix-style `--flag value` | Familiar with Unix CLI tools |
| `cross-session.ps1` | PowerShell style `-Flag value` | Native PowerShell |
| CLI direct | `node path/to/cross-session-cli.mjs` | Scripting, requires full path |

## Commands

- `doctor` - Diagnose installation
- `mission-create` - Create mission spec
- `mission-status` - Check mission status
- `task-plan` - Plan tasks
- `task-run` - Execute tasks
- `integration-preflight` - Check integration readiness
- `integration-apply` - Apply integration
- `recovery-plan` - Plan recovery
- `recovery-apply` - Apply recovery
- `mission-run` - Sequential writer execution with DAG

## File Locations

| File | Source | Runtime | AI Environments |
|------|--------|---------|------------------|
| CLI | `bin/orchestration/cross-session-cli.mjs` | `~/.config/opencode/bin/orchestration/` | `.opencode/bin/orchestration/` |
| Wrapper | `scripts/cross-session.ps1` | `~/.config/opencode/scripts/` | `.opencode/scripts/` |
| Batch launcher | `scripts/cross-session.bat` | `~/.config/opencode/scripts/` | `.opencode/scripts/` |
| Command def | `commands/cross-session.md` | — | `.opencode/commands/` |

## See Also

- Global command: `commands/cross-session.md`
- CLI (source): `bin/orchestration/cross-session-cli.mjs`
- Wrapper (PowerShell): `scripts/cross-session.ps1`
- Launcher (batch): `scripts/cross-session.bat`
