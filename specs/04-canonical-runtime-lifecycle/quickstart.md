# Quickstart: Canonical Runtime Lifecycle

```powershell
# Validate source
pnpm validate
pnpm test

# Preview installation/update from source
pwsh .\scripts\install-opencode-global.ps1 -DryRun
pwsh .\scripts\update-opencode-global.ps1 -DryRun -Confirm:$false

# Update from an installed updater
pwsh "$env:USERPROFILE\.config\opencode\scripts\update-opencode-global.ps1" `
  -SourceRoot "C:\path\to\opencode-global-src" `
  -DryRun `
  -Confirm:$false

# Preview cleanup (default is dry-run)
pwsh .\scripts\cleanup-runtime.ps1

# Initialize a project without creating agents
pwsh .\scripts\init-opencode-project.ps1 `
  -ProjectPath "C:\path\to\project" `
  -IncludeIntelligence `
  -IncludeContracts `
  -IncludeBootstrapManifest

# Create/improve AGENTS.md separately inside OpenCode
/init
```
