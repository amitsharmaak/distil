---
topic: collections-removal
title: Collections tables dropped from the schema (stage drop-collections, awaiting Production)
date: 2026-09-30
status: in-progress
branch: claude/collections-table-drop
time: 23:00
---

## What changed

Amit approved starting the table drop on 2026-09-30. This branch adds tenant stage
`drop-collections` (`src/lib/postgres/tenant-migrations/0014_drop_collections.sql`). It extends
`distil_tenant_migrations_stage_check`, records both tables' row counts with `RAISE NOTICE`, drops
the `tenant_api.collection_items` and `tenant_api.collections` views, then `collection_items` and
`collections` (their RLS policies, indexes, constraints and grants go with them). It is idempotent
(`IF EXISTS`, `to_regclass` guard) and runs inside the ledger transaction. Rollback is a restore
from a backup or lifecycle export only.

Removed from the schema and code: `collections` and `collectionItems` in `schema.ts`, the two
manifest classifications, the `collections` and `collection-items` export datasets in
`lifecycle-repositories.ts` (25 datasets remain), and both entries in
`docs/authorization-matrix.json`. Account deletion needs no change (it relies on `ON DELETE
CASCADE` from `users`). The stage is registered in the migrator, the `migrate-tenant.ts` usage
text, `local-db-reset.ts`, `AGENTS.md` and the backup-restore runbook.

Two decisions:

- **Manifest `retiredTables`.** The verifier fails any public table missing from the manifest, and
  stages `expand` to `contract` still create these tables on a fresh database. The manifest
  therefore keeps a `retiredTables` list that the verifier tolerates whether or not the tables
  exist. They are not tenant-bearing for snapshots or RLS expectations.
- **Event types left alone.** `'collection_added'` and `'collection_removed'` stay in
  `item_events_event_type_check` (0002). Historical rows may carry them, narrowing the constraint
  needs a validating scan for no benefit, and it was not clearly safe to test against Production
  data. Historical migrations 0002 and 0005–0008 are unedited.

Coordination: the `admin-invitations` branch (`claude/admin-invitations-i1-i3`) may also add tenant
migration 0014 and a new stage. Whichever PR merges second renumbers its migration file, its
`STAGE_FILE` entry and stage order, and rebases the `distil_tenant_migrations_stage_check` list (the
constraint is rewritten in full by each stage), plus the stage-list assertions in
`tests/harness/migration-invariants.unit.test.ts`.

## Verification

Locally verified (Docker Postgres on loopback only; no Production, Neon or Vercel access):

- `npm run check` (lint, typecheck, 242 suites / 1996 tests), `npm run test:phase3-isolation`
  (7 suites, 53 tests) and `npm run audit:phase3-security` pass.
- `npm run test:integration` passes all 12 suites against a scratch database.
- Reset at stage `life-areas`, seeded two tenants with one collection and one membership each,
  applied `--stage drop-collections`: notices reported 2 `collection_items` and 2 `collections`
  rows, both tables and both views were gone, and no `collection*` policies remained. Re-running
  the CLI reported "Verified" (ledger no-op). Running the raw SQL again outside the ledger was a
  no-op with notices. A full `db:local:reset` applies every stage including the new one.
- After the stage, `tenant_api.items` as `distil_runtime` returns only the caller's row for each of
  two tenants.

Not verified: any Production state, the deploy, or lifecycle export against Production data.

## External resources

None touched. Local Docker Postgres only.

## Next

Production steps for Amit (each needs his go-ahead for this task):

1. After the PR merges and deploys, read-only count of both tables as the owner role (no writes):
   `SELECT (SELECT count(*) FROM collections) AS collections, (SELECT count(*) FROM collection_items) AS collection_items;`
   Record the two numbers here by value only.
2. If either is non-zero and Amit wants to keep the data, take a lifecycle export or a Neon branch
   backup first (`docs/runbooks/backup-restore.md`). Note that after the code deploys, the export no
   longer includes these tables, so take the export BEFORE merging if the data matters.
3. Apply the stage with the owner connection and Amit's user id:
   `npm run db:tenant:migrate -- --stage drop-collections --amit-user-id <uuid>`
   The notices print the row counts it deletes. Re-running reports "Verified".
4. Confirm the two tables and views are gone and the Feed still loads.

Deploy order: code first, then the stage. The code in this PR stops reading the tables, and the
running Production code (since `0a1e350`) already does not use them, so code-first is safe on its
own. Stage-first is only safe if the old export code is no longer deployed: a lifecycle export from
the previous build selects from the dropped tables and would fail. If Amit wants the export as a
backup, take it before the merge deploys or use a Neon branch instead.
