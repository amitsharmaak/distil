---
topic: digest-cron
title: Nightly digest cron removed
date: 2026-09-30
time: 20:00
status: merged
branch: claude/pending-tasks-summary-48f300
pr: 107
---

## What changed

The 02:00 UTC cron in `vercel.json` scheduled `GET /api/cron/digests`, which enqueued one
`digest_run` tenant job per active user; `src/lib/lifecycle/queue-runtime.ts` never registered a
handler, so `src/lib/jobs/tenant-runtime.ts` completed each job as "No tenant handler registered"
and no digest was ever produced. Amit chose in chat on 2026-09-30 to stop enqueuing rather than
build digests. Removed: the `crons` block, the route and its contract test, the durable-queue
mirror `src/lib/digests/runtime.ts` with its unit test, and the callerless `enqueueDigest` helper.
`docs/authorization-matrix.json` drops the route and the `digest-cron` worker
(`expectedApiRouteFileCount` 88 → 87); the route-surface fixture, authorization tests and the
neon-proxy security test follow. The digest tables, store, preferences and the inline
`POST /api/v1/digests/run` are unchanged. No schema or cloud change.

## Verification

Locally on the branch before the merge with `main`: `npm run check` lint 0 errors, `tsc --noEmit`
clean, 242 suites / 1,991 tests passed; `npm run audit:phase3-security` passed. The merge with
`main` is re-checked by CI on PR #107. Not deployed until the squash merge (release pin
`unpinned`).

## External resources

None changed. `CRON_SECRET` in Vercel Production is read by nothing once this merges.

## Next

- Amit may delete `CRON_SECRET` from Vercel Production (cloud change, his call).
- Still enqueued without a handler, separate decisions: `regenerate_intelligence_summary`
  (behind `POST /api/v1/items/:id/summaries/regenerate`, which therefore creates a pending
  artifact that never completes) and `knowledge_backfill` (operator script only). The `backlog`
  topic still lists all three job types; its next entry should drop `digest_run`.
- `vercel.json` is also edited by PR #111 (`ignoreCommand`); whichever merges second needs a
  trivial re-merge of that file.
