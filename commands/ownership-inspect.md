---
description: Inspect artifact ownership classification for an environment
agent: build
---

Inspect and display the ownership classification map for an adopted environment. This command scans the specified environment path and classifies each artifact according to the global ownership policy.

**Usage:**
```powershell
node "$env:USERPROFILE\.config\opencode\bin\updates\ownership-classifier.mjs" --environment <path> --policy "$env:USERPROFILE\.config\opencode\contracts\ownership-policy.schema.json"
```

**Parameters:**
- `--environment <path>` - Path to the adopted environment to scan (required)
- `--policy <path>` - Path to the ownership policy schema (required)

**What it displays:**
- `classification_map` - Mapping of each artifact path to its ownership category
- `unclassified` - Files that didn't match any policy rule (assigned to default category)
- `policy_version` - Version of the ownership policy used
- `default_category` - Default category applied to unclassified files

**Ownership Categories:**
- `global-managed` - Artifacts owned and managed by OpenCode Global
- `project-owned` - Artifacts owned by the project
- `global-managed-local-override` - Global artifacts with project-specific overrides
- `generated-runtime` - Runtime-generated artifacts
- `external` - External/third-party artifacts (blocked by policy)

**Example:**
```powershell
node "$env:USERPROFILE\.config\opencode\bin\updates\ownership-classifier.mjs" --environment "C:\MyProject" --policy "$env:USERPROFILE\.config\opencode\contracts\ownership-policy.schema.json"
```

This produces a JSON classification map showing how each file in the environment is classified according to ownership policy rules.
