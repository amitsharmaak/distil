---
topic: client-navigation-performance
title: Reader startup data and route loading boundary implemented
date: 2026-10-01
time: 07:12
status: in-progress
branch: codex/perf-reader-startup
---

## What changed

The reader server page now loads the note and annotations inside its existing tenant transaction
and derives the initial reader state from the tenant-bound item. The annotation and knowledge
controls accept that initial data, eliminating their three mount-time GET requests while retaining
the existing API-loading path for reuse outside the server page. A reader-route loading boundary
provides immediate layout feedback while a dynamic reader response is in flight. Mutation APIs,
content sanitization, and tenant-scoped repository access are unchanged.

## Verification

Locally verified in `/Users/amitsharma/Projects/distil-perf-reader-startup`:

- `npm run check:quick` passed: TypeScript and 3 changed suites, 15 tests.
- `npm run check` passed: lint with zero errors and 4 pre-existing warnings, TypeScript, and all
  251 deterministic suites (2,084 tests).
- Focused API-fallback and server-initial-prop component tests passed. They verify zero mount
  fetches with initial data, retained fallback GETs and mutations, and that missing items or a
  disabled knowledge UI do not query notes or annotations.

No browser timing, hosted environment, CI, or deployment was checked.

## External resources

None.

## Next

The client-navigation performance integration owner should review and integrate this branch with
the shared navigation cache work, run the combined checks, then measure reader navigation in the
authorized local browser pass. No PR, push, merge, or deployment has been performed from this
branch.
