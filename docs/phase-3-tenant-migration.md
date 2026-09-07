# Phase 3 tenant migration verification contract

This tooling prepares the single-user PostgreSQL data for the later Phase 3
expand/backfill/verify/contract migration. It is safe to merge before the Phase 2 freeze because it
is read-only: it does not add `user_id`, create users, mutate rows, change authentication, or change
repository/runtime behavior.

The checked-in source of truth is
`src/lib/postgres/tenant-migration/manifest.ts`. It classifies all 36 Phase 1/2 application tables as
tenant-bearing and classifies `distil_migrations` as control data. The verifier rejects any
unclassified base table in an application schema and any unclassified JSONB column.

## Guarantees and limits

Every report records:

- all discovered, tenant-bearing, and control tables;
- per-table row counts and stable whole-row checksums, excluding only the future `user_id` column;
- separate hashes for high-value content, identity, token, queue, and provenance columns;
- whether `user_id` exists, plus null and non-Amit owner counts when it does;
- relational orphan counts, uniqueness collision groups/rows, queue state by status/type, and known
  references stored inside JSON;
- a deterministic invariant fingerprint used to compare the frozen before/after datasets.

The MD5 values inside table reports are non-secret change detectors, not cryptographic security
proofs. The report-wide manifest and invariant fingerprints use SHA-256. No raw content, token,
credential, or database URL is written to a report.

`rehearsal` is deliberately a read-only projection. It calculates the same projected assignment to
the supplied Amit UUID twice and requires matching fingerprints. It proves that the manifest and
verification plan are deterministic and idempotent; it does not pretend that unimplemented DDL or
backfill SQL has run.

## Commands safe before the freeze

Use a newly generated, permanent account UUID for Amit. The tool accepts only an explicit RFC 4122
UUID argument. It never derives ownership from an email address, the signed single-user session, a
token, or an environment variable.

Validate the manifest and view the complete plan without connecting to PostgreSQL:

```bash
npm run db:tenant:verify -- --amit-user-id <AMIT_USER_UUID> --dry-run
```

Run the read-only two-pass rehearsal against a non-production database through the direct migration
connection:

```bash
DATABASE_MIGRATION_URL='<direct-non-production-url>' \
  npm run db:tenant:verify -- \
  --amit-user-id <AMIT_USER_UUID> \
  --stage rehearsal \
  --output artifacts/tenant-migration/rehearsal.json
```

The command sets the PostgreSQL session to read-only and UTC. The output file is created with mode
`0600` through an atomic replacement. A failed invariant produces a report where possible and exits
non-zero; a schema classification failure exits non-zero before table data is queried.

The `artifacts/` directory is ignored by Git. Do not commit reports: counts and operational metadata
may still be sensitive even though row values are never included.

## Exact integration prerequisites

Do not start the real cutover until all of these are true:

1. The Phase 2 release is accepted and its database schema is stable. Run unit, integration,
   security, E2E, build, backup/restore, and migration gates on the exact release commit.
2. A supported account system has allocated Amit's permanent `users.id` UUID. Record the UUID in the
   approved operator channel; do not infer it from email and do not allow the migration to create a
   replacement UUID on retry.
3. The future expand migration and this manifest are updated in the same integration commit. Add
   every new application table and JSONB column to the manifest. The migration must add nullable
   UUID ownership first; it must not add `NOT NULL`, scoped uniqueness, or ownership foreign keys
   before the backfill verifies.
4. Every later repository/worker/queue/search/AI contract knows the tenant explicitly. Dual-write or
   Phase 3-only code must be present but disabled until after contract verification. This branch does
   not provide that behavior.
5. A recent restore has been tested. PITR/backup, rollback owner, direct unpooled migration URL,
   statement timeout, lock timeout, batch size, and maintenance window are written into the operator
   change record.
6. Stable writes are frozen. Pause web mutations, capture clients, connector sync, cron, digest
   dispatch, job consumers, and retries. Confirm that no worker holds an in-flight lease. Record the
   queue state rather than deleting queued work.

## Cutover sequence after integration

The real integration branch must implement and review the missing expand, backfill, and contract
migrations before these commands are used in production.

1. Freeze writes and workers, then apply the **expand** migration. Insert or verify exactly one Amit
   user row with the approved UUID. Add nullable `user_id uuid` columns and supporting indexes only.
2. Take the canonical pre-backfill report after expansion, while `user_id` is still nullable:

   ```bash
   DATABASE_MIGRATION_URL='<direct-production-url>' \
     npm run db:tenant:verify -- \
     --amit-user-id <AMIT_USER_UUID> \
     --stage before \
     --output <restricted-path>/tenant-before.json
   ```

3. Run the reviewed idempotent backfill in bounded transactions. Every assignment must use the exact
   supplied UUID and the equivalent of `WHERE user_id IS NULL`. Abort if any non-null owner differs.
   Backfill direct rows and durable queue/checkpoint rows; do not rewrite embedded item/content/artifact
   references merely to add ownership.
4. Run after verification using the unchanged manifest and immutable before report:

   ```bash
   DATABASE_MIGRATION_URL='<direct-production-url>' \
     npm run db:tenant:verify -- \
     --amit-user-id <AMIT_USER_UUID> \
     --stage after \
     --baseline <restricted-path>/tenant-before.json \
     --output <restricted-path>/tenant-after.json
   ```

   This must pass with zero null/wrong owners, relational or JSON-reference orphans, and uniqueness
   collisions. It also requires unchanged row counts, stable/high-value hashes, reference counts,
   and queue state between the frozen reports.

5. Only after the comparison passes, apply the **contract** migration: ownership foreign keys,
   tenant-scoped unique constraints/indexes, `NOT NULL`, any RLS policy, and removal of obsolete
   global uniqueness. Deploy tenant-scoped repositories, caches, jobs, search, AI context, auth,
   export/deletion, and adversarial cross-tenant tests together.
6. Smoke test as Amit and a separate synthetic user, verify zero cross-tenant access, resume workers
   before write traffic, then unfreeze clients. Preserve both reports and migration logs with the
   change record.

If an after check fails, keep writes frozen. Do not force the contract migration or edit the baseline
to make it pass. Restore/roll back according to the reviewed migration plan, diagnose the named
table/check, and rerun from a clean pre-cutover state.

## Maintaining the classification

For every new table, decide explicitly whether it is tenant-bearing or control data. Tenant-bearing
entries need a stable identity, high-value columns, every direct relationship, every uniqueness rule
that will become tenant-scoped, and queue metadata where applicable. Every JSONB column needs either
declared JSON paths for embedded Distil identifiers or a specific explanation of why it contains no
tenant references.

The manifest test compares the classification with every exported Drizzle table. Live discovery is
the stronger gate: SQL-created tables not represented in Drizzle still fail as
`UNCLASSIFIED_TABLE`.
