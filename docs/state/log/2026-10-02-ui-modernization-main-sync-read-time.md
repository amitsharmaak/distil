---
topic: ui-modernization
title: Daily edition UI — synced with main after #130 and fixed the feed read-time query
date: 2026-10-02
time: 08:40
status: in-progress
branch: codex/ui-modernization
pr: 132
---

## What changed

Release-train phase R5 preparation (`2026-10-01-release-train-open-prs-plan.md`), done by Claude
Code from a detached checkout of the PR head; the Codex worktree was not touched. The PR is not
merged.

1. **Synced with main** (`cc7a924`, a merge, not a rebase). Main now carries #130 (capture
   triage) and the docs PRs. #125 had not merged, so `capture/token-settings.tsx` did not conflict
   yet.
   - `src/components/capture/capture-diagnostics.tsx`: one conflict, in the imports. Kept this
     branch's `StatusBadge` restyle and #130's `CAPTURE_JUNK_ERROR_CODE` import. #130's button
     label ("Save anyway" for a junk-rejected capture) merged cleanly into the restyled button.
   - `src/lib/feed/__tests__/feed-query.unit.test.ts` merged textually, but one of #130's new
     assertions expected the rank reason `Item priority: medium`, which this branch deliberately
     stopped printing. The assertion now expects the reasons this branch produces (`a89707e`).
     The scores that test checks are unchanged. Amit or Codex should confirm that dropping the
     bucket reason is still intended now that triage sets the bucket.
2. **Feed read-time regression fixed** (`44f9756`). The feed projection computed
   `reading_minutes` from `char_length(full_content)` in the SELECT list of the ranked
   `ORDER BY … LIMIT` query, so PostgreSQL de-TOASTed every matching body before the sort. The
   ranked query now carries the body only as an unread reference (`feed_body`) and an outer
   SELECT over the limited page computes the estimate and re-applies the order. The outer list
   does not return the body. `ai_priority_score` reaches the client through the summary columns;
   the ranking and affinity expressions still read `i.ai_priority_score` inside the inner query.

   Measured on a local PostgreSQL by the session that wrote the fix (not re-measured in this
   one): before this branch 24 ms at 5,000 items and 156 ms at 20,000; with the estimate in the
   ranked SELECT 622 ms and 2,552 ms (non-parallel plan); with the fix about 28 ms.

## Verification

Run locally on `a89707e` on 2026-10-02:

- `npm run check`: pass (255 suites, 2,227 tests).
- `npm run test:integration` (Testcontainers PostgreSQL): pass, 13 suites, 61 tests, including
  the 8 feed-query integration tests.
- `npm run build`: pass.

Not run: Playwright e2e and extension suites, visual checks, the preview walk in R5 step 4. The
full CI gate (`full-ci` label) runs on the push and had not been observed when this was written.

## External resources

None. The integration containers were created and removed by Testcontainers.

## Next

- Watch the full gate on PR #132 for the pushed head.
- After #125 merges, sync again. `src/components/capture/token-settings.tsx` will conflict: this
  branch replaced the local `formatDate` with the one from `@/lib/format`, muted the key icon and
  the issued-token panel, and added `min-h-11 min-w-11` touch targets to every button. Keep those
  and re-skin #125's additions to match.
- Amit walks the preview (R5 step 4) and authorizes the merge as a Production release.
