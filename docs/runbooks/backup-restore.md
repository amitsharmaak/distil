# Backup and restore runbook

## Wave 3 disposable Preview-clone rehearsal

This is an operator-driven rehearsal against disposable Neon branches and a disposable Vercel
Preview deployment. The repository deliberately does not create branches, restore backups, change
aliases, or discover credentials. Provider actions require an authenticated operator checkpoint;
the checked-in command produces a non-secret plan and verifies the final evidence fail-closed.

### Prerequisites and metadata

Use the exact reviewed release SHA and record the following opaque identifiers in a restricted JSON
file: `runId`, `releaseSha`, `primaryUserId`, `syntheticUserId`, `vercelProjectId`, `neonProjectId`,
`sourceBranchId`, `rehearsalBranchId`, `restoreBranchId`, `rollbackOwner`, and `pitrWindow`. The two
users and all three branches must be distinct. Do not record URLs, tokens, passwords, connection
strings, email addresses, row values, object keys, or export bodies.

The current worktree has no checked-in `.vercel/project.json`; resolve the Vercel project ID from
the authenticated project settings before the change window. Resolve Neon project, region, branch,
backup/PITR, and restore identifiers from the linked Preview integration. Confirm the source is the
accepted Preview branch and not Production. Production must remain disconnected.

Generate the plan without contacting either provider:

```bash
npm run rehearse:preview-clone -- \
  --input <restricted-path>/rehearsal-input.json \
  --output artifacts/preview-clone-rehearsal/<run-id>/plan.json
```

The output directory is ignored by Git and files are written mode `0600`. Review every operator
checkpoint. Keep `FEATURE_NEON_AUTH=false`, `FEATURE_CONNECTORS=false`, invitations/email/AI off,
and web, cron, queues, connectors, captures, and retries frozen. Use a direct unpooled connection
only for migrations; never substitute the pooled runtime URL.

### Rehearsal sequence

1. Record the source branch recovery point, migration ledgers/checksums, release SHA, region and
   object snapshot identifier. Record object count, total bytes and a stable aggregate hash for
   each synthetic tenant prefix. Preserve the source database branch, object snapshot and previous
   accepted Vercel deployment read-only until the rollback window closes.
2. Fork the source into the recorded disposable rehearsal branch. Point a disposable Preview
   deployment at that branch and an isolated private object namespace. Assert from provider
   settings that no database, Auth endpoint, cookie secret, object namespace, queue or callback
   origin is shared with Production.
3. With all writes frozen, apply one tenant stage at a time through `db:tenant:migrate`: `expand`,
   `backfill`, `contract`, then `lifecycle`. Before backfill, capture `tenant-before.json`; after
   backfill run `db:tenant:verify -- --stage after --baseline ...`. Contract must use the unchanged
   before report. Preserve stdout/stderr and query the `distil_tenant_migrations` ledger without
   storing the connection URL.
4. Seed two synthetic users with distinctive non-sensitive canaries. Run bidirectional isolation,
   export request/idempotent redelivery/download, and hash/size verification. Inject one object-store
   outage after the export job is claimed; prove the durable retry uses the same job and completes
   once. A cross-tenant status or download probe must remain an indistinguishable `404`.
5. For the second synthetic user, request then cancel deletion inside the grace period and prove
   access returns without restoring revoked sessions/tokens/connectors. Request deletion again,
   advance only the isolated test clock, then inject failures after object deletion and provider-auth
   purge boundaries. Prove retry resumes from durable state and is idempotent. Run
   `account:verify-purge` through the separately privileged control-plane URL and independently list
   the tenant object prefix. Both must report zero, auth purge must be true, and the tombstone must
   exist before deletion is accepted.
6. Restore the recorded database recovery point and matching object snapshot into the distinct
   restore branch, still with all traffic/workers disabled. Capture a fresh tenant report and ledger;
   compare their fingerprints/checksums with the recovery point. Replay every independently retained
   deletion tombstone newer than the recovery point, and prove no deleted synthetic identity, row,
   object, session or queued job is resurrected.
7. Rehearse rollback by routing the disposable Preview deployment to the previously accepted
   application SHA and preserved source branch. Do not run down migrations. Run health, A/B
   isolation, durable capture, export/download and deletion-status smoke checks, then route back to
   the rehearsal deployment or destroy disposable resources after evidence review.

### Evidence acceptance

Assemble a content-free `evidence.json` matching the plan: exact release SHA; false feature flags;
three branch IDs; source/restored invariant fingerprints and migration ledgers; bidirectional
isolation; export retry/hash/cross-tenant results; deletion retry plus zero rows/objects/auth purge
and tombstone; tombstone replay; and rollback SHA/branch/smoke result. Validate it offline:

```bash
npm run rehearse:preview-clone -- \
  --input <restricted-path>/rehearsal-input.json \
  --verify artifacts/preview-clone-rehearsal/<run-id>/evidence.json
```

The validator rejects branch reuse, dataset or ledger drift, incomplete lifecycle/purge evidence,
and a rollback that does not name a distinct prior application SHA plus the preserved source branch.
Only a `passed: true` result, reviewed provider screenshots/log references, and dual owner sign-off
close the rehearsal gate. A generated plan alone is not execution evidence.

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
