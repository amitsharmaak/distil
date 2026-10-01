---
topic: collections-removal
title: Collections tables dropped on Production (stage drop-collections applied)
date: 2026-10-01
status: released
branch: claude/collections-drop-production
---

## What changed

Amit authorized applying the `drop-collections` tenant stage to Production on 2026-10-01, after
PR #114 (`f277a37`) and PR #115 (`b2213d9`) were deployed. The Vercel dashboard showed `b2213d9`
as the newest Ready Production deployment, so the code-first order held.

Amit ran each command himself; the agent's session was not given Production database access. The
owner connection came from a temporary gitignored env file loaded with `--env-file` and was never
printed.

1. Read-only count before the stage: `collections` 0 rows, `collection_items` 0 rows. No backup
   was needed.
2. `npm run db:tenant:migrate -- --stage drop-collections --amit-user-id <ledger owner>` →
   notices `deleting 0 collection_items row(s)` and `deleting 0 collections row(s)`, then
   `Applied drop-collections: 0014_drop_collections.sql`. The first attempt used a different user
   id and failed the ledger owner check before any change; the stage needs the owner recorded for
   every earlier stage (`3844a094-2018-4118-83f4-874e7081568d`, see `docs/project-state.md`).
3. Read-only check after: both `to_regclass('public.collections')` and
   `to_regclass('public.collection_items')` are null.

## Verification

- Production: Today and Feed load at `https://distilai.app` with items and no console errors,
  checked in Chrome after the stage.
- The idempotent re-run (expected "Verified") was not recorded.

## External resources

Neon `distil-production` branch: tables `collections` and `collection_items` and their
`tenant_api` views dropped; ledger row `drop-collections` added. No Vercel change.
