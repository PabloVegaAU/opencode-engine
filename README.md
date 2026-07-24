# OpenCode Global

Neutral, portable OpenCode configuration for use across multiple computers and projects.

## Overview

OpenCode Global provides:
- Neutral security defaults and permissions
- Certified profile configurations (GO, CHATGPT-PLUS, MIX, MINIMAX-PLUS)
- Model routing matrix with per-role assignments
- Lifecycle scripts (install, update, doctor, certify)
- Project initialization templates
- Contract schemas for validation

## Quick Start

```powershell
# Clone this repository
git clone <repo>/opencode-global.git C:\OpenCode\opencode-global-src

# Install
cd C:\OpenCode\opencode-global-src
pwsh .\scripts\install-opencode-global.ps1

# Authenticate
opencode providers login

# Diagnose
pwsh .\scripts\doctor-opencode-global.ps1

# Certify
pwsh .\scripts\certify-opencode-global.ps1
```

## Usage with Projects

```powershell
# Initialize a project
pwsh .\scripts\init-opencode-project.ps1 C:\my-project -IncludeIntelligence -IncludeContracts

# Launch with profile
pwsh .\scripts\opencode-launcher.ps1 -Profile go -TargetDir C:\my-project
```

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for details.

## Profiles

| Profile | Primary Model |
|---------|---------------|
| GO | opencode-go/qwen3.7-plus |
| CHATGPT-PLUS | openai/gpt-5.6-terra |
| MIX | Hybrid routing (GO + ChatGPT) |
| MINIMAX-PLUS | minimax/MiniMax-M2.7 |

See [docs/PROFILES.md](docs/PROFILES.md) for details.

## Security

Never commit credentials, tokens, or secrets. See [docs/SECURITY.md](docs/SECURITY.md).

## License

MIT
