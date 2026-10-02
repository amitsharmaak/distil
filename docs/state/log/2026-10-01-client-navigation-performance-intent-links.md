---
topic: client-navigation-performance
title: Intent-only route and Research data prefetch implemented
date: 2026-10-01
time: 07:26
status: in-progress
branch: codex/perf-reader-startup
---

## What changed

Added a shared canonical Next Link wrapper that disables viewport prefetch and starts route
prefetch only after user intent: a 100 ms hover, keyboard focus, or touch start. The helper cancels
cursor transit, suppresses duplicate intent for 30 seconds in a bounded 64-entry map, and skips
prefetch while the document is hidden, the browser is offline, or data saver is enabled. Sidebar,
mobile navigation, Feed cards, and Today links now use it without changing their hrefs or native
Next navigation behavior.

The Research variants also warm the account-scoped list, suggestions, or one report query using
the agreed `research/list`, `research/suggestions`, and `research/report/:id` cache families. The
sidebar uses the list warmer; the integration owner will wire the report variant into its
concurrently changed Research page. Added a Research route loading skeleton. No idle warming,
router replacement, global TTL change, or persistent tab tree was added.

## Verification

Locally verified in `/Users/amitsharma/Projects/distil-perf-reader-startup`:

- Changed-source ESLint passed with zero findings; `npm run typecheck` passed.
- Intent-link and affected navigation component tests passed: 8 suites, 39 tests.
- `npm run check:quick` passed: 10 changed suites, 73 tests.
- The full deterministic Jest run passed: 253 suites, 2,097 tests.
- Tests cover no render/viewport fanout, 100 ms hover debounce and cancellation, bounded duplicate
  suppression, immediate focus/touch intent, hidden/offline/data-saver suppression, canonical
  link behavior, and exact Research cache keys, URLs, and freshness.

`npm run check` was attempted but this branch's cherry-picked cache foundation stopped lint on its
pre-existing `react-hooks/immutability` finding in `content-cache.tsx`. The integration owner fixed
that independently in `974bb3c`; this bounded commit does not modify the shared cache foundation.
No browser timing, hosted environment, CI, or deployment was checked here.

## External resources

None.

## Next

The integration owner should integrate this commit with `974bb3c`, use
`ResearchReportIntentLink` for report rows and `ResearchListIntentLink` for the mobile Research
entry, then complete the combined browser request-count and navigation timing pass. No PR, push,
merge, or deployment has been performed from this branch.
