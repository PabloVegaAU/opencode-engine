---
description: Run a public cross-session orchestration subcommand from a Mission Spec
agent: build
---

Run the public cross-session CLI with explicit arguments only. Do not improvise. Do not pass provider, model, agent, session IDs, branches, or secrets through this command. Model, agent, and variant must arrive through the runtime argument flags of the CLI; the Project Manifest never carries them.

Pick exactly one of these subcommands and forward the required arguments:

- `doctor` — `--ai-env-home <abs> --project-root <abs> --environment-manifest <abs> --project-manifest <abs> --spec <abs>`
- `mission-create` — adds `--operation-id <id> --at <utc>`
- `mission-status` — no extra flags beyond the four path flags
- `task-plan` — adds `--operation-id <id> --at <utc> --task-key <key> [--model --agent --variant --title]`
- `task-run` — adds `--operation-id <id> --at <utc> --task-key <key>` and the optional runtime flags
- `integration-preflight` — adds `--operation-id <id> --at <utc> --task-key <key>` and is strictly read-only
- `integration-apply` — adds `--operation-id <id> --at <utc> --task-key <key> --target-repository-id <id> --target-ref <ref> --expected-target-commit <oid|zero-oid> [--approve-local-integration]`
- `recovery-plan` — adds `--at <utc>`
- `recovery-apply` — adds `--operation-id <id> --at <utc>`
- `mission-run` — sequential writer execution with DAG; stops at conflict, failed, interrupted, blocked, recovery_required

`doctor` requires all five path arguments: `--ai-env-home`, `--project-root`, `--environment-manifest`, `--project-manifest`, and `--spec`. Set `AI_ENV_HOME` before invoking the wrapper when the default `-AiEnvHome $env:AI_ENV_HOME` is used:

```powershell
$env:AI_ENV_HOME = '<absolute-ai-environment-home>'
```

Invoke the PowerShell wrapper:

```powershell
& "$env:USERPROFILE\.config\opencode\scripts\cross-session.ps1" `
  -Subcommand <subcommand> `
  -AiEnvHome <absolute> `
  -ProjectRoot <absolute> `
  -EnvironmentManifest <absolute> `
  -ProjectManifest <absolute> `
  -Spec <absolute> `
  -OperationId <id> `
  -At <utc> `
  -TaskKey <key> `
  -TargetRepositoryId <repository-id> `
  -TargetRef <refs/heads/branch> `
  -ExpectedTargetCommit <40-hex-or-zero-oid> `
  -ApproveLocalIntegration:$true
```

The CLI never pushes, merges to main, or modifies remotes.
