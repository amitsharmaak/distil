---
topic: client-navigation-performance
title: Research, archive, and reader client caches implemented
date: 2026-10-01
time: 07:28
status: in-progress
branch: codex/perf-client-research
---

## What changed

Research reports, research suggestions, completed report details, and the archive now use the
account-scoped content cache. Fresh revisits reuse cached envelopes, stale revisits retain visible
content during one refresh, and explicit refresh controls show the last update time. Research
streaming runs only while visible and online, falls back to non-overlapping polling with backoff,
and performs one final detail refresh on completion. Archive restores update the archive cache
optimistically and reconcile item-bearing views. The first bounded implementation commit is
`0fdf14b`.

The reader state, note, and annotation controls now hydrate the same cache from server-rendered
props without mount GETs. State changes use the shared item mutation coordinator, while note and
annotation writes update their exact detail keys with rollback on failure. Cached edits therefore
survive a remount carrying older server props. Annotation anchor reconciliation remains active.

## Verification

Locally verified in `/Users/amitsharma/Projects/distil-perf-client-research`:

- Research and Archive focused suites passed: 3 suites, 32 tests.
- Reader controls, annotations, and server reader-page focused suites passed: 3 suites, 17 tests.
- Reader `npm run check:quick` passed: TypeScript and 3 changed suites, 17 tests. Owned-file ESLint,
  Prettier, `npm run state:check`, and `git diff --check` also passed.

No CI, hosted environment, deployment, or production resource was checked or changed.

## External resources

None.

## Next

The integration owner should cherry-pick the reader-cache commit after `0fdf14b`, retain the
root-owned cache lifecycle, mutation, SSE, and public-config integration fixes, then run the
combined deterministic gate and authorized local browser measurements. One final PR remains; no
push, PR, merge, or deployment was performed from this branch.
