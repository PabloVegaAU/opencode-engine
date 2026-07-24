# Security Guidelines

## Never Commit

- Credentials or tokens
- .env files
- auth.json
- Session state
- Cache files
- Logs

## Path Rules

- Global config must not contain absolute paths
- Project configs must use relative paths
- External directories must be explicit allow-listed

## Verification

Run `.\scripts\doctor-opencode-global.ps1` to check for security issues.
