# OpenCode Profiles

## Available Profiles

| Profile | Model | Use Case |
|---------|-------|----------|
| GO | opencode-go/qwen3.7-plus | General operations |
| CHATGPT-PLUS | openai/gpt-5.6-terra | High-capability tasks |
| MIX | Hybrid (GO + ChatGPT) | Balanced approach |
| MINIMAX-PLUS | minimax/MiniMax-M2.7 | Maximin subscription |

## Usage

```powershell
.\scripts\opencode-launcher.ps1 -Profile go -TargetDir C:\project
```

## Routing Matrix

The routing matrix in `global/opencode.profiles/model-matrix.json` defines per-role model assignments for each profile (source), or `routing/model-matrix.json` (installed).
