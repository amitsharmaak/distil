---
topic: backlog
title: S3, content_hash, P7 index question and auth-lookup item closed; orphan job types removed
date: 2026-10-01
time: 07:20
status: ongoing
branch: claude/remove-orphan-job-types
---

## What changed

This entry supersedes the "Remaining backlog" list in `2026-09-30-backlog-severity-3-sweep.md`.

**Dropped by Amit on 2026-10-01 (no code change)**

- **Adaptive summaries S3 (depth on demand)** is no longer planned. Do not re-propose it unless
  Amit asks.
- **`ai_summaries.content_hash` in the summary cache key** is closed. The column is written:
  `src/lib/ai/summarize.ts` stores a sha256 of the source text with every brief and detailed
  summary, but the read path in `generateSummary` does not compare it. The one known
  content-rewrite path, loading a YouTube transcript (`loadVideoTranscript` in
  `src/lib/phase2/video-transcript.ts`), already deletes the item's summaries so they regenerate.
  Checking the hash on read would add an item load and a re-hash to every cached summary read. The
  column stays; no migration. Do not re-propose this unless Amit asks.
- **P7 RLS/ordering index question** closed with no code change. Forced RLS plans each tenant table
  as a security-barrier subquery, so an ordered `items(user_id, created_at DESC, id DESC)` index
  cannot serve the feed's `ORDER BY … LIMIT`. Non-leakproof operators (`?|`, `?`, `@@`) are
  evaluated above the barrier, so topic GIN and FTS indexes are not used (checkpoint "Performance
  P7: indexes — 2026-09-17" in `docs/project-state.md`). The cost is a top-N sort or filter over
  one tenant's own rows, which is negligible at the current library size (a few dozen items).
  Fixing it would need a `SECURITY DEFINER` feed function or a policy-free read path, which weakens
  database-enforced isolation. Revisit only if feed or search queries show up as slow in timings,
  or a tenant nears ~5,000 items. Do not re-propose it otherwise.
- **`distil_resolve_auth_identity` lookup cost** closed as already fixed by P8 (`1d2831a`; topic
  `performance-p8-p11`, checkpoint "Performance P8: Neon HTTP proxy identity lookup —
  2026-09-30" in `docs/project-state.md`). P8 found that the indexed `SECURITY DEFINER` query took about 4–5 ms and that
  per-request connection setup was the real cost. It moved only the proxy lookup to Neon's HTTP
  driver (`src/lib/auth/neon-http-repository.ts`), and warm Preview samples came in at about
  7–27 ms, under the 30 ms target. The backlog line predated P8. The remaining
  first-request-after-suspend latency belongs to the cold-start item.

**Orphan job types removed (this branch)**

- **`regenerate_intelligence_summary`.** `POST /api/v1/items/:id/summaries/regenerate` published a
  `pending` intelligence artifact and enqueued this job, but no tenant job handler is registered for
  it in `src/lib/lifecycle/queue-runtime.ts` (and `src/lib/agent/job-worker.ts` has none either), so
  the artifact never completed. No UI called the route; the reader's "Regenerate summary" uses
  `/api/ai/summarize`, which is untouched. Deleted the route and its security test,
  `enqueueSummaryRegeneration` and `regenerateSummarySchema` from `src/lib/knowledge/service.ts`,
  and `parseKnowledgeBody` from `src/lib/knowledge/http.ts` (its only caller was the route).
  `KnowledgeServiceError` narrows to `ITEM_NOT_FOUND`/404, its only remaining use.
  `getItemIntelligence`, `intelligence-runtime.ts` and the `intelligence_artifacts` table stay.
- **`knowledge_backfill`.** Verified that nothing enqueues it at runtime:
  `scripts/run-knowledge-backfill.ts` (`npm run db:knowledge:backfill`) passes a no-op
  `jobs.enqueue` stub and runs batches inline, and `enqueueTenantKnowledgeBackfill`
  (`src/lib/knowledge/tenant-backfill.ts`) has no callers. Only the stale job-worker declaration
  was removed. The operator script, `src/lib/knowledge/jobs.ts`, the checkpoints table and its
  repository, and the matrix's `knowledge-backfill` search/AI path entry stay.
- Inventories updated with exact counts, assertions not loosened: `docs/authorization-matrix.json`
  (route entry and both job-worker entries removed, `expectedApiRouteFileCount` 91 → 90),
  `tests/fixtures/phase3/phase2-wave0-route-surfaces.json` (121 → 120 surfaces),
  `tests/harness/phase3-authorization-inventory.unit.test.ts` (90 route sources, 49 owner
  mutations), `tests/harness/authorization-matrix.unit.test.ts`. `docs/phase-3-ownership.md`
  gains a dated note under its finding about this worker. No migration and no data change.

**Remaining backlog (each becomes its own topic when picked up)**

- Classifier model (inline-search decision 12).
- Performance: the Vercel + Neon cold start.
- Capture diagnostics in Settings (admin-invitations phase I3).
- Housekeeping: stale local branches and the `jabra-evolve-mic-test` worktree.
- Housekeeping: the legacy alias `distil-pv-1850.vercel.app` (a Vercel change; needs Amit's
  authorization).
- Phase 4 (mobile), only on Amit's decision.

## Verification

Locally on this branch: `npm run check` passed, 252 suites / 2,086 tests, lint 0 errors
(5 baseline warnings), typecheck clean, state log check ok. `npm run test:phase3-isolation`
7 suites / 56 tests passed. `npm run audit:phase3-security` passed. `npm run test:integration` against disposable local
Testcontainers PostgreSQL: 13 suites / 60 tests passed. Not deployed; no cloud,
database or environment change.

## External resources

None.

## Next

- The orchestrator reviews the PR; Amit authorizes the merge (auto-deploys).
- Then Amit picks the next backlog item.
