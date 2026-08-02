# Loop Command Distribution Package

This package contains the `opencode loop` command for continuous agentic execution.

## Files

| File | Description |
|------|-------------|
| `loop-cli.mjs` | Main Node.js CLI implementation |
| `loop.ps1` | PowerShell entry point |
| `loop.bat` | Windows batch entry point |
| `loop.sh` | Unix shell entry point |

## Installation

### For Users (via OpenCode Global)

The loop command is installed automatically with `opencode-global`. Access via:

```powershell
# PowerShell
& "$env:USERPROFILE\.config\opencode\scripts\loop.ps1" -MaxIterations 20 --approve-loop -- "your task"

# Or use the batch file
opencode-global\scripts\loop.bat --max-iterations 20 --approve-loop -- "your task"
```

### For Developers

Copy files to your `~/.config/opencode/bin/orchestration/` directory:

```powershell
Copy-Item loop-cli.mjs ~/.config/opencode/bin/orchestration/
Copy-Item loop.ps1 ~/.config/opencode/scripts/
Copy-Item loop.bat ~/.config/opencode/scripts/
```

## Usage

```powershell
# Basic loop
.\loop.ps1 -MaxIterations 10 --approve-loop -- "Implement feature X"

# With checkpoint every 5 iterations
.\loop.ps1 -CheckpointEvery 5 --approve-loop -- "Refactor codebase"

# With mission tracking
.\loop.ps1 -Mission my-task -MaxIterations 50 --approve-loop -- "Long task"
```

## Requirements

- Node.js 18+
- OpenCode runtime
- `opencode` command in PATH (for agent execution)

## Documentation

See [loop.md](../../commands/loop.md) for full documentation.
