---
topic: navigation-performance
title: Feed and Today polling and history regressions corrected
date: 2026-10-01
time: "07:34"
status: in-progress
branch: codex/perf-feed-today
---

## What changed

Followed the integration review of the Feed/Today slice with two bounded correctness fixes. The
processing-status poll now has an explicit in-flight guard, aborts a request when the tab becomes
hidden or offline, leaves no polling timer active while polling is disallowed, ignores responses
from an aborted request, and resumes only after an in-flight request has settled. A terminal result
still stops the poll and triggers the existing Feed/Today invalidation.

Feed and Today pending native-history navigation now records its origin and becomes acknowledged
when Next reports the target URL. The acknowledged record can continue supplying the previous view
while the target query loads, but it no longer overrides a later browser or external history change.
This fixes the A to B to browser-back-to-A case on both surfaces.

## Verification

Locally verified in `/Users/amitsharma/Projects/distil-perf-feed-today`:

- `npm run check:quick`: passed, 5 suites and 58 tests.
- Targeted ESLint over all six changed implementation/test files: passed with zero findings.
- A deferred status GET test proves visibility events abort the old request and cannot overlap a
  resumed request. Hidden startup schedules no poll timer.
- Feed and Today regression tests observe URL B, then return to URL A and assert A's cached filters
  and data win without an extra GET.
- `git diff --check`: passed before this checkpoint.

No CI, browser integration, deployment, Production or external resources were touched.

## External resources

None.

## Next

The integration owner cherry-picks this corrective commit after integrated Feed/Today commit
`08e6ba7`, runs the final shared Quick gate and browser navigation checks, then continues the single
PR. Main merge and release remain separate authorized steps.
