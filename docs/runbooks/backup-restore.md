# Backup and restore runbook

## Backup readiness

- Record the exact release SHA, migration-ledger checksums, direct unpooled migration endpoint
  identifier, Neon branch/project/region, PITR window, backup timestamp and rollback owner. Do not
  store connection strings or credentials in the record.
- Inventory private objects by environment and tenant-derived prefix, retaining only counts, byte
  totals and hashes in operational evidence. The fake/local adapter is not a production backup.
- Retain deletion tombstones/audit receipts in an independent immutable control-plane store before
  enabling real accounts.
- Test restore regularly; an advertised provider backup is not evidence of an application restore.

## Single-tenant restore

1. Restore the database and matching object snapshot into an isolated environment with web traffic,
   cron, queues, connectors, email and AI disabled.
2. Resolve the target by an approved opaque internal user UUID. Never select by email or infer Amit.
3. Export the restored tenant through the allowlisted lifecycle snapshot and compare dataset/object
   counts and hashes with the approved recovery point.
4. Check the independent deletion ledger. If a later tombstone exists, purge instead of restoring.
5. Re-encrypt/re-key any restored credentials, invalidate sessions/tokens, and use synthetic users
   for the first smoke test.
6. Copy data to the destination only with reviewed tenant-stamped import tooling. Verify zero foreign
   owner rows and run two-tenant canaries before traffic.

## Full restore

1. Restore into a new isolated Neon branch/environment. Do not overwrite the damaged environment.
2. Keep `FEATURE_NEON_AUTH=false`, connectors/invitations disabled, and workers stopped.
3. Verify migration ledgers/checksums, role ownership, grants, restricted runtime role, forced RLS,
   tenant views and transaction-local context cleanup.
4. Reconcile all relational table counts/checksums and object counts/hashes. Replay every deletion
   tombstone newer than the restore point before any queue or user traffic.
5. Mark stale/running leases recoverable without executing them. Resume one tenant-scoped worker
   class at a time and confirm envelope ownership before allowing retries.
6. Run A/B isolation, export/download, cancellation/deletion, capture durability and degraded-AI
   smoke tests on the exact restore SHA.
7. Promote DNS/traffic only after security and product owners sign the evidence. Preserve the old
   environment read-only until the rollback window closes.
