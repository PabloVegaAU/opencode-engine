# OpenCode Global Runtime README

This directory (`~/.config/opencode`) contains the **active runtime installation** of OpenCode Global, not the distribution repository.

## Distribution vs Runtime

| Aspect | Distribution (GitHub) | Runtime (this directory) |
|--------|----------------------|-------------------------|
| Location | `C:\OpenCode\opencode-global-src` | `~/.config/opencode` |
| Purpose | Portable source code | Active installation |
| Contains | Source files, scripts, templates | Installed config, profiles, scripts |
| Versioned | Yes (Git) | Updated via `update-opencode-global.ps1` |

## What's Installed Here

- `opencode.jsonc` - Global configuration
- `opencode.profiles/` - Profile overlays (go, chatgpt-plus, mix, minimax-plus)
- `routing/` - Model routing matrix
- `scripts/` - Lifecycle scripts (install, update, doctor, certify, launcher)
- `commands/` - OpenCode command definitions
- `contracts/` - Schema contracts
- `AGENTS.md` - Global agent rules

## Documentation

- Distribution README: `C:\OpenCode\opencode-global-src\README.md`
- Installation docs: `C:\OpenCode\opencode-global-src\docs\INSTALLATION.md`

## Updating

To update the runtime from the distribution:

```powershell
cd C:\OpenCode\opencode-global-src
git pull
pwsh scripts\update-opencode-global.ps1
```
