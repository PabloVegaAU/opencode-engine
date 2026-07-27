# Lifecycle Operational Evidence Template

Use this template only after an operator executes a real runtime or representative-project command. Do not include proprietary project content, credentials, paths beyond approved placeholders, or raw configuration. This record does not claim a commit is immutable.

Attribution fields for each evidence row: base commit SHA, tracked binary-diff SHA256, lifecycle untracked-file-manifest SHA256, and runtime-manifest SHA256. Record the command used to calculate each value and the sanitized evidence location.

| Task | Timestamp (UTC) | Command (sanitized) | Exit code | Sanitized result | Evidence location |
|---|---|---|---:|---|---|
| T026 installed runtime verification | | `<installed>/scripts/update-opencode-global.ps1 -SourceRoot <source> -DryRun -Confirm:$false` | | | |
| T027 representative launcher dry run | | `opencode-launcher.ps1 <profile> -TargetDir <project> -DryRun` | | | |
| T028 representative doctor | | `doctor-opencode-global.ps1` | | | |
| T029 final certification | | `certify-opencode-global.ps1` | | | |
| T030 final Git review | | `git status --short; git diff --check; git diff --stat` | | | |
| T032 installed-runtime/certification evidence capture | | Record sanitized T026/T029 command results | | | |
| T033 representative-project evidence capture | | Record sanitized T027/T028 command results | | | |

Evidence is an operational record, not proof until independently reviewed.

Suggested attribution commands (run and record results only after operator approval):

```powershell
git rev-parse HEAD
git diff --binary | Get-FileHash -Algorithm SHA256
Get-ChildItem specs/04-canonical-runtime-lifecycle -Recurse -File | Sort-Object FullName | Get-FileHash -Algorithm SHA256
Get-FileHash distribution/runtime-manifest.json -Algorithm SHA256
```
