---
topic: navigation-performance
title: Client performance plan implemented and locally verified; one combined PR
date: 2026-10-01
time: "08:07"
status: in-progress
branch: codex/client-navigation-performance
---

## What changed

Completed the three-slice [implementation plan](2026-10-01-navigation-performance-implementation-plan.md)
in one integration worktree. Root integrated the Research server, Research/Archive/reader client,
Feed/Today and navigation sub-agent slices; all decisions, commits and merges returned to root.
No sub-agent opened a PR, pushed, merged main or deployed. Application implementation is complete
at `fe0c99f911588311dbc5a89e97035910c197ad99` (before this evidence-only checkpoint).

Started from main `ec07a52`, then incorporated `571ab0f` and `aa63baa`: extension store package,
orphan-job removal and legacy-alias retirement. Unrelated main checkout/worktrees were preserved.

- Added account-scoped TanStack caching with explicit freshness, stale refresh, cancellation,
  deduplication, bounded retention and session reset, including cross-tab logout and late reads.
- Cached Feed/Today/Research/Archive, restored list pages/scroll, and removed filter RSC navigation.
  Kept initial SSR, server search/ranking and tenant authorization. Reader metadata now arrives in
  its existing server transaction instead of three mount-time reads.
- Reduced Research list records to card fields, added safe route timing, limited prefetch to
  navigation intent, and restricted polling to visible/online active work with no overlap/backoff.
- Unified optimistic read/archive/area/priority changes and rollback across views. Serialized
  same-item writes across components, cancelled old refreshes, and let confirmed writes resolve
  before background reconciliation. Captures, summaries, extraction and feedback also invalidate
  affected cache/reader output.
- Extended the existing Next browser route cache to thirty minutes so the data cache can mount
  immediately on a return. Data freshness stays two/five/thirty minutes by type. A held-response
  experiment showed loading boundaries and Next's per-page stale-time export could not fix route
  expiry under this router; those experiments were fully reverted. Security-sensitive APIs still
  re-read on mount and enforce current authorization. No new router or Cache Components migration.

[Measurements and design trade-offs](../../perf/client-navigation-2026-10-01.md) include machine-readable
before/after evidence. The separate browser/connection-stall investigation remains deferred.

## Verification

Locally verified against the final application code:

- `npm run check`: 258 suites / 2,146 tests passed, typecheck and formatting/state checks passed;
  five pre-existing lint warnings, zero errors.
- `npm run build`: passed.
- Production browser checks for cache, smoke/accessibility and keyboard behavior: 27 passed across
  desktop Chromium, mobile Chromium and iPhone WebKit; six tests requiring local seeded-reader
  credentials skipped. Expired-list tests hold refresh responses while cached content stays
  visible without new RSC calls; Settings still re-reads account authorization on each return.
- Actual PostgreSQL-backed local production-build measurements: 30 final loads, all HTTP 200,
  no redirects or console errors. Three samples per route/device after a server warm-up, fresh
  browser context each time. Feed requests fell 37→19 desktop and 42→18 mobile Chromium emulation;
  Today fell 27→17 and 32→16. Cached Research returns measured 5–11 ms in local fixtures.
- Five-report projection fixture: 1,408 decoded bytes (target below 5,000).
- Route bundle measurement: approximately +11.2 KB shared gzip JS; route increases 11–15 KB.
  This is an explicit trade-off, not a claim that every first paint improved. Local measurements
  are not Production latency or physical-iPhone first-open evidence.

CI is an external PR gate, separate from these local results; the final report and PR checks
provide its live status. Main merge, deployment and Production acceptance have not occurred.

## External resources

No Production, Neon, Vercel settings, release pin, migration, invitation or real data was changed.
Package registry and GitHub reads; local disposable PostgreSQL/Playwright used synthetic data.
Root will push this branch and open exactly one combined PR with the `full-ci` label.

## Next

Root remains the integration/release owner. Resolve the PR by branch with
`gh pr view codex/client-navigation-performance`, inspect exact-head Quick/Full/Vercel checks,
and keep all questions and any merge action in this task. Merge/deployment requires Amit's
separate release instruction. After release, compare Production navigation/request counts and
health at `distilai.app`; do not restart the deferred connection investigation without direction.
The old Vercel alias is retired on current main and is no longer a release gate.
