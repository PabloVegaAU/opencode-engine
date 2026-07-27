# Patterns: v0.6.0

## Atomic Apply Pattern

```
1. Create backup manifest
2. Snapshot all artifacts
3. Execute operations in order:
   a. Create new files (temp rename)
   b. Update existing files
   c. Delete removed files
4. On any failure:
   a. Mark run as failed
   b. Invoke rollback
   c. Restore from backup
   d. Mark run as rolled_back
5. On success:
   a. Mark run as completed
   b. Record journal entry
```

## Ownership Classification Pattern

```
1. For each artifact path:
   a. Match against policy rules (glob patterns)
   b. First match wins
   c. No match → default_category
2. Validate: each artifact has exactly one category
3. Flag any external category for review
```

## Rollback Pattern

```
1. Read backup manifest
2. For each backed artifact:
   a. Restore to original path
3. For each created artifact:
   a. Remove file
4. Mark allocation as rolled_back
5. Emit audit event
```

## Sanitized Journal Entry

```
{
  "event_type": "update_apply",
  "run_id": "uuid (no path info)",
  "operation_count": 5,
  "status": "completed | rolled_back | failed",
  "duration_ms": 1234,
  "blocked_count": 0,
  "timestamp": "ISO8601"
}
```

No secrets, no absolute paths, no file contents.
