---
topic: navigation-performance
title: App performance implementation plan; connection investigation deferred
date: 2026-10-01
time: 06:05
status: planned
branch: codex/production-navigation-diagnostics
---

## Decision and scope

Amit said to drop the long-pause investigation for now and asked for the performance enhancement
plan. Stop connection probes, hotspot requests and NetLog follow-ups unless he resumes them.
The evidence and diagnostic script at `2042008` remain available; this is a deferral, not a fix.

The detailed app/cache design remains in
[the original diagnosis](2026-10-01-navigation-performance-diagnosis.md). This checkpoint updates
its execution order: the transport investigation is no longer part of the proposed third slice.
Application implementation remains unstarted; this turn records the plan only.

## Proposed implementation

1. **Shared cache and Research first.** Use a stable, account-scoped TanStack Query provider with
   deliberate freshness, retention, retry and refetch settings. Cache list, suggestions and completed
   reports across route remounts; show stale data during one deduplicated refresh. Add explicit
   Refresh and update time. Slim list records to card fields and add server-phase timing. Warm the
   Research route and its data together on navigation intent; prove cached display is not blocked
   by another route response. Preserve running-job progress and current authorization checks.
2. **Feed, Today, Archive and reader continuity.** Seed the shared cache from first-load SSR without
   duplicate hydration fetches. The current Feed page awaits server data on every route/filter
   navigation, so this slice must address route delivery as well as API caching. Keep first-load
   SSR, deep links, URL-driven filters and server-ranked/paginated search; make subsequent cached
   navigation usable immediately. Preserve scroll/pages and update related views immediately for
   read/archive/area/save/research mutations, with rollback on failed writes. Bound card prefetch.
3. **Opening speed and active work.** Measure first-open critical path on desktop and iPhone;
   parallelize independent reads and defer nonessential controls/work identified by the trace.
   Keep progress streaming for active research; fallback/status polling runs only for active work
   while visible and online, with no overlap/backoff and a stop at completion. Completed content and
   ordinary lists have no interval polling. Assess durable on-device snapshots separately only if
   measured restart performance justifies them; the initial memory cache does not survive restart.

Suggested fresh windows: Today/Feed two minutes; Research lists/suggestions/Archive five minutes;
completed reports/articles thirty minutes; ordinary display preferences fifteen minutes. On a
stale return, focus or reconnect, show existing content and refresh in the background. Explicit
Refresh and successful local writes can update earlier. These are freshness windows, not polling
intervals. Set cache retention separately so inactive queries survive useful return navigation,
with bounds for large reader bodies and search variants.

Cache keys include the verified account and complete query parameters. Clear/cancel on logout,
account switch and authorization failures; reject late results from an earlier session and
coordinate logout across tabs. Keep sessions, credentials and sensitive account actions outside
the ordinary display-data freshness policy. No shared public caching of personal data.

## Acceptance and verification

- Cached returns target under 100 ms to existing usable content and no data API calls while fresh.
- Stale returns retain existing content, with at most one refresh per required query.
- Same-session actions update all affected screens without stale rows reappearing.
- The representative five-report list targets below 5 kB decoded (earlier measured 46.4 kB).
- First-open improvement is measured separately from navigation; warm-open LCP target under 1.5 s
  under a recorded device/network condition, not a promise for every cold start/network.
- Test remount/fresh/stale/refresh, deduplication, mutation rollback, pagination/back, account
  transitions and active-job visibility. Run Quick gate per code PR; add Full gate when auth/tenant
  boundaries are changed. Compare production click-to-content and request counts after release.

Re-read current worktree Research mount effects, Feed server data path, root layout and sidebar;
checked official TanStack defaults and Next caching guidance. No application code changed in this
turn. Format, state validation and diff checks apply to this new checkpoint only. No CI, deployment
or cloud configuration was changed or newly verified.

## Next

Present this three-slice plan to Amit. Recommended first implementation is shared cache plus
Research, followed by Feed/Today/Archive. On implementation start, branch from fresh `origin/main`
in a new owned worktree, run `npm ci`, read this entry and the detailed original diagnosis, and
resolve the provider/session reset and route-cache integration before editing. Keep changes in
reviewable slices with before/after evidence. Merge/deployment requires task-specific authorization.
Do not resume the connection investigation as a prerequisite for this app work.
