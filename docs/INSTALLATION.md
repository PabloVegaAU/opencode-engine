# Installation Guide

## Prerequisites

- Git
- PowerShell 7+
- Node.js / pnpm
- OpenCode (`npm install -g opencode-ai`)

## Install OpenCode Global

```powershell
git clone <repo>/opencode-global.git C:\OpenCode\opencode-global-src
cd C:\OpenCode\opencode-global-src
pwsh .\scripts\install-opencode-global.ps1
opencode providers login
pwsh .\scripts\doctor-opencode-global.ps1
pwsh .\scripts\certify-opencode-global.ps1
```

## Update

```powershell
cd C:\OpenCode\opencode-global-src
git pull
pwsh .\scripts\update-opencode-global.ps1
```
