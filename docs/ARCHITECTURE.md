# OpenCode Global Architecture

## Four-Layer Model

| Layer | Location | Responsibility |
|-------|----------|----------------|
| Distribution | GitHub `opencode-global` | Reusable, versioned source |
| Runtime Global | `~/.config/opencode` | Active installation per PC |
| Project | Projects | Project-specific agents, MCP, skills |
| Local State | User Profile | Credentials, sessions, caches |

## Principles

- Global never contains project-specific content
- Projects never contain credentials or secrets
- Installation is idempotent and non-destructive
- Updates only affect managed global files
