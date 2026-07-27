# Speckit Analysis Remediation Record

| Finding | Closure | Verification |
|---|---|---|
| F-01 | One `ShouldProcess` approval covers backup and replacement. | update backup tests |
| F-02 | Manifest schema accepts direct, tree, and recursive categories; AJV test added. | sandbox manifest schema test |
| F-03 | Install/update preflight validates inventory, source roots, requirements, destinations, and source snapshots. | incomplete/tampered source tests |
| F-04 / F-07 | One update timestamp roots all managed backups. | exact multi-file backup test |
| F-05 | Central cleanup protection predicate guards state, archives, dependencies, and optional capabilities. | applied cleanup protection test |
| F-06 / F-13 | Launcher validates all allowed modes, invalid/conflicting JSON/Markdown modes, and string-aware JSONC edge cases. | behavioral launcher tests |
| F-08 / F-12 / F-15 | Operational evidence and traceability requirements documented and captured with working-tree fingerprints. | evidence template, attributed evidence record, and traceability matrix |
| F-09 / F-10 / F-11 | `OPENCODE_CONFIG_DIR` behavior tested; retrieval policy remains opt-in. | sandbox launcher/init tests |
| F-14 | Architecture describes source-relative to runtime-relative mapping. | ARCHITECTURE.md |
| H-01 | Managed backup roots use collision-resistant UTC-millisecond plus GUID operation IDs and refuse an existing root. | rapid consecutive update backup test |
| M-01 | Cross-session wrapper forwards only `--approve-local-integration`; deprecated PowerShell alias never reaches the CLI. | fake runtime CLI argv test |
| M-02 | Cleanup quarantines adjacent backups only for manifest-managed or explicitly documented legacy originals. | managed/unknown backup dry-run and Force tests |
| M-03 / M-04 / H-02 | Evidence attribution fields and operational task statuses distinguish certification, Git review, and capture tasks without immutable-commit claims. | traceability and evidence template |
| L-01 / L-02 | Dry-run snapshot expectations and SC/FR task mappings are explicit. | sandbox and traceability tests |

Residual limitation: install/update capture immutable source bytes before approval, so source mutation cannot produce a mixed source snapshot. Destination replacement is still not rollback-transactional: an I/O failure after earlier destination replacements may require restoring their centralized backups.
