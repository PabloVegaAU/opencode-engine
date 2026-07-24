# Release History

## Version 0.3.1 - Initial Release

### What's Included

- **Global Neutral Configuration**: Security defaults, permissions, no absolute paths
- **Profile System**: 4 certified profiles (go, chatgpt-plus, minimax-plus, mix)
- **Model Routing Matrix**: Role-based routing in `global/opencode.profiles/model-matrix.json`
- **Lifecycle Scripts**:
  - `install-opencode-global.ps1` - Install to ~/.config/opencode
  - `update-opencode-global.ps1` - Update managed files
  - `doctor-opencode-global.ps1` - Diagnose installation
  - `certify-opencode-global.ps1` - Run certification tests
  - `init-opencode-project.ps1` - Initialize project shell
  - `opencode-launcher.ps1` - Launch with profile routing
- **12 Contract Schemas**: Bootstrap, Project Manifest, Mission Spec, Session, Profile, Security Policy, etc.
- **Project Templates**: Minimal opencode.json, AGENTS.md skeleton, bootstrap manifest
- **5 Test Suites**: Config validation, launcher logic, init project, security boundaries, profile routing

### Known Limitations

- No credentials or secrets in repository (by design)
- No absolute paths in configuration
- Cross-session orchestration requires OpenCode runtime (runtime-installed CLI)

## Versioning

OpenCode Global uses semantic versioning aligned with OpenCode releases.

## Certification

Before release:
1. Run all tests: `.\scripts\certify-opencode-global.ps1`
2. Verify in clean environment
3. Create git tag: `git tag v0.3.1`
4. Push: `git push --tags`

## Compatibility

Global v0.3.x is compatible with OpenCode 1.18.x
