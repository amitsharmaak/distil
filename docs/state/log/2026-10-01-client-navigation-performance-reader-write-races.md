---
topic: client-navigation-performance
title: Reader cache writes serialized with stale refreshes
date: 2026-10-01
time: 07:34
status: in-progress
branch: codex/perf-client-research
---

## What changed

Reader note saves and deletes, and annotation creates, updates, re-anchors, and deletes, now cancel
an already-running detail refresh before reading or changing the shared cache. Each operation holds
the cache write barrier through its server mutation and final cache update, so a transport that
ignores abort cannot apply an older response after a successful write. Optimistic delete rollback
now snapshots cache state after cancellation. Commit `0287b7f` implements the race fix. Commit
`2122b97` routes reader note and annotation writes through the shared mutation request helper so
401 and 403 responses expire account-scoped content; integration must include root helper commit
`28b8f31` first.

The server reader page records when its tenant read completes and passes that timestamp as
`initialDataUpdatedAt` for state, note, and annotations. A reused older server payload can therefore
be recognized as stale after cache eviction, while a newly rendered payload remains fresh and
avoids a mount request.

## Verification

Locally verified in `/Users/amitsharma/Projects/distil-perf-client-research`:

- Focused reader controls, annotations, and server page suites passed: 3 suites, 22 tests.
- `npm run check:quick` passed: TypeScript and 3 changed suites, 22 tests.
- `npm run lint` passed with zero errors and the four existing baseline warnings; Prettier and the
  state-log validator passed.
- `git diff --check` passed before the implementation commit.

No CI, hosted environment, deployment, or production resource was checked or changed.

## External resources

None.

## Next

The integration owner should cherry-pick `0287b7f` and this checkpoint commit after the integrated
reader-cache slice, then run the combined deterministic gate and authorized local browser
measurements. One final PR remains; no push, PR, merge, or deployment was performed from this
branch.
