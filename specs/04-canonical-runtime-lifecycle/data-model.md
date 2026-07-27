# Data Model: Canonical Runtime Lifecycle

## Runtime Manifest

- `manifest_version`: manifest contract version.
- `categories`: named groups of managed artifacts.
- `entries`: explicit source/runtime path pairs.
- `recursive_trees`: recursively mapped source/runtime directories with exclusions.
- `dev_only`: source tools intentionally excluded from runtime.
- `install_requires`: critical source paths required before writes begin.

## Managed Artifact

- `category_key`: stable inventory category.
- `source`: path relative to the selected source root.
- `runtime`: path relative to the runtime root.
- `type`: explicit entry, recursive tree, or recursive pattern.

## Central Backup

- `timestamp`: update operation timestamp.
- `relative_path`: original runtime-relative path.
- `content`: exact pre-update managed file.

## Legacy Quarantine

- `timestamp`: cleanup operation timestamp.
- `relative_path`: original runtime-relative path.
- `item_type`: file or directory.
- `content`: moved legacy artifact, preserving recoverability.
