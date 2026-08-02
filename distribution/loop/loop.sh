#!/bin/bash
# Loop CLI launcher for Unix-like systems
# Usage: ./loop.sh --max-iterations 10 --approve-loop -- "your task"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNTIME_ROOT="${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}"
CLI_PATH="$RUNTIME_ROOT/bin/orchestration/loop-cli.mjs"

# Check if CLI exists
if [ ! -f "$CLI_PATH" ]; then
    echo "Error: Loop CLI not found at: $CLI_PATH" >&2
    echo "The loop command requires OpenCode 1.18.x or later." >&2
    exit 1
fi

# Execute via Node
exec node "$CLI_PATH" "$@"
