# Orchestration

OpenCode Global supports cross-session orchestration as an **OPTIONAL** capability.

**Note:** Cross-session orchestration is NOT distributed with opencode-global. It requires the full OpenCode runtime installation at `$env:USERPROFILE\.config\opencode\bin\orchestration\cross-session-cli.mjs`. If the runtime CLI is not present, the wrapper script (`scripts/cross-session.ps1`) will report a warning but opencode-global remains fully functional.

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

## See Also

- Global command: `commands/cross-session.md`
- Runtime CLI: `$env:USERPROFILE\.config\opencode\bin\orchestration\cross-session-cli.mjs`
- Wrapper script: `scripts/cross-session.ps1` (convenience wrapper, requires runtime CLI)
