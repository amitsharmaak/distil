---
topic: navigation-performance
title: Feed and Today cached navigation slice complete for integration
date: 2026-10-01
time: "07:29"
status: in-progress
branch: codex/perf-feed-today
---

## What changed

Implemented the bounded Feed and Today slice from the
[performance plan](2026-10-01-navigation-performance-implementation-plan.md). First-load server
data now carries its read timestamp into the account cache. Feed uses the exact
`["feed", feedFilterKey]` key and Today uses `["today", todayViewKey]`, both with the agreed
two-minute freshness window. Fresh remounts render from cache without another GET; stale data
remains visible through refresh errors; both surfaces show Refresh and the last update time.

Same-page search and filter changes use Next's documented native History API integration, keeping
URL/deep-link semantics and issuing the existing ranked Feed query without waiting for a new RSC
response. Feed keeps later pages in the cache, deduplicates overlapping page items, and retains them
through first-page refresh and remount. Keyboard mark-read uses the shared cross-cache optimistic
mutation helper. Processing status polling is limited to processing items and visible, online tabs;
it uses recursive non-overlapping requests, exponential failure backoff, aborts on cleanup, stops at
terminal status, and invalidates Feed and Today when processing finishes.

Native browser back/forward can restore scroll once the synchronously cached page has remounted.
This slice does not persist a separate scroll offset for an explicit sidebar/tab revisit; that path
still follows Next's normal link scroll behavior and remains an integration-browser check.

## Verification

Locally verified in `/Users/amitsharma/Projects/distil-perf-feed-today` after dependency install:

- Focused Jest: 5 suites, 55 tests passed. Coverage includes SSR timestamp handoff, fresh remounts
  with zero additional GETs, stale-error display, native-history filters, pagination deduplication
  and retention, optimistic keyboard read, and processing poll visibility/online/no-overlap/backoff/
  terminal/abort behavior.
- `npm run check:quick`: passed (`tsc --noEmit` plus the same 5 suites and 55 tests).
- ESLint over every file owned by this slice: passed with zero findings.
- `git diff --check`: passed before this checkpoint.
- Full `npm run lint` remains blocked by the integration owner's shared
  `src/lib/client-cache/content-cache.tsx` immutability finding at line 116. Existing baseline
  warnings remain unchanged. The integration owner is handling shared-cache lint and the final
  Quick gate.

No CI, browser integration, deployment or Production behavior was run or claimed here.

## External resources

None. No cloud, database, environment, deployment or Production resources changed.

## Next

The integration owner cherry-picks this branch's single implementation commit into
`codex/client-navigation-performance`, resolves the shared-cache lint finding, and runs the final
Quick gate plus browser back/forward scroll and warm-return request-count checks. Root opens the one
final PR. Main merge and release remain separate authorized steps.
