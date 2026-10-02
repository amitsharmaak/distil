---
topic: navigation-performance
title: Production navigation diagnosis and proposed client caching policy
date: 2026-10-01
time: 03:25
status: planned
branch: codex/production-navigation-diagnostics
---

## What changed

Diagnosis and implementation proposal only, requested after Amit noticed Research reloads on
every sidebar visit and reported general sluggishness. No application code, dependency, database,
environment variable or deployment changed. This entry is the canonical report and restart point.

Worktree: `/Users/amitsharma/Projects/distil-perf-diagnostics`, branched from freshly fetched
`origin/main` `b2213d9bc2cf01ca49f9d93bc0cc9214b43626c3`. The main checkout was clean but older
(`df294d9`); it and the other agents' worktrees were left untouched. This session owns only this
new entry. Codex is the diagnosis owner; no implementation or integration owner is assigned yet.

The earlier P8–P11 plan is closed in `2026-09-30-performance-p8-p11.md`. Its HTTP auth lookup,
60-second page-session cache and optimistic Feed controls already exist. This proposal addresses
the remaining navigation/data-cache behavior rather than repeating those changes.

## Live evidence

Measured on 2026-10-01, approximately 03:14–03:25 UTC, in Amit's existing signed-in Chrome tab
at `https://distilai.app`. DevTools Network had **Disable cache unchecked** and **No throttling**.
Used ordinary navigation, completed report viewing and normal reloads. No research was started,
no captures submitted and no content/settings/account mutations were deliberately performed.
The separate Codex browser was signed out, so authenticated measurements used Chrome.

Values below are individual samples, not population percentiles. Route/API figures are Network
durations; sums describe a sequential request path, not independently measured render time.
Only the values explicitly called LCP came from DevTools Performance. The viewport was desktop
with docked DevTools. No cold-cache mobile run or full CPU profile was recorded. Browser extension,
connection and instrumentation effects have not been isolated.

| Scenario                                          | Observed result                                                                                   | Interpretation                                                                                |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| First measured Research visit in the existing tab | Route 1.51 s, then list 1.42 s; suggestions 982 ms in parallel with list                          | About 2.95 s on the route-then-list request path                                              |
| Research list request timing detail               | Queued at 1.53 s, response starts near 2.95 s; server wait 1.41 s, download 11.35 ms              | Payload is oversized, but waiting dominates this sample                                       |
| Repeated Research visits                          | Route/list pairs: 342/750 ms, 534/675 ms, 224/627 ms                                              | About 0.85–1.21 s before the reports response; list and suggestions requested again each time |
| Research after a normal full app reload           | Route 943 ms, list 711 ms, suggestions 408 ms                                                     | Refetch behavior survives reloading the old tab                                               |
| Research revisit after that reload                | Route 543 ms, list 421 ms, suggestions 622 ms                                                     | Again two data calls; route was HTTP 304 but still took a network round trip                  |
| Research payload                                  | Five report rows, 46.4 kB decoded / about 18.7–18.8 kB transferred                                | List API includes full report bodies and sources that the cards do not render                 |
| Idle Research                                     | No requests during a 37-second observation after settling                                         | The Research list is not continuously polling                                                 |
| Settings after app reload                         | Route 1.16 s, then capture-token metadata 466 ms and account 798 ms                               | Another route-then-client-fetch sequence                                                      |
| Settings revisit                                  | Route 507 ms, capture-token metadata 339 ms, account 642 ms                                       | Repeated small responses still incur network/authentication overhead                          |
| Normal Today reload                               | Document 1.50 s; DOMContentLoaded 1.53 s; load 1.58 s                                             | Existing static assets mostly came from disk cache                                            |
| That document's timing                            | 130 ms stalled, 1.25 s server wait, 124 ms download; proxy total 447 ms                           | Proxy provider 249 ms, account lookup 196 ms; page/server remainder not fully attributed      |
| Warm navigation to Today                          | Soft-navigation LCP 0.77 s, CLS 0                                                                 | Measured paint on one warm return, not a fresh-page LCP                                       |
| Slow Today navigation                             | Total 18.59 s; **17.76 s Stalled before sending**, then 646 ms server wait                        | Cannot attribute the whole pause to application/database processing                           |
| Completed report open                             | Route 10.65 s, including **10.01 s Stalled**, then report API 445 ms; soft-navigation LCP 11.23 s | Report body was 30.9 kB decoded; no active-research stream was involved                       |
| Second Today reload                               | Document 11.00 s / LCP 11.08 s; **10.01 s Stalled**, 138 ms connection setup, 795 ms server wait  | Reproduced a large pre-request stall on app opening                                           |

The repeated 10–18-second pauses are a separate finding from the deterministic refetch pattern.
“Stalled” is Chrome's timing category; it does not establish whether the underlying cause is a
browser connection pool, extension, local proxy/network, transport negotiation or instrumentation.
Do not label these as Neon cold starts. The observed proxy totals on these slow samples were
approximately 426–456 ms, including provider checks of 230–250 ms and account lookups of 195–205 ms.

One initial Research visit logged 18 requests including route/data requests, static metadata and
prefetches. On the fresh app run, four visible report links generated two RSC prefetch requests
each, plus one more report prefetch: nine requests without opening a report. Feed also prefetched
individual item routes. These were small responses, but each protected request crosses the proxy.
This establishes request fan-out; it does not prove that prefetch contention caused the stalls.

## Causes confirmed in current code

1. **No shared application data cache.** `src/app/research/page.tsx:50–92` starts with empty arrays
   and loading state, then fetches list and suggestions in a mount effect. Completed report pages
   also start with `report = null` and fetch in an effect
   (`src/app/research/[id]/page.tsx:118–180`). Archive has the same pattern in
   `src/components/phase2/library-experiences.tsx`. Package dependencies include neither SWR nor
   TanStack Query. Navigation can discard component state even when route code is cached.
2. **Route caching does not cache these API results.** `next.config.ts:42` already specifies
   `staleTimes: { dynamic: 30, static: 300 }`. Those are Next page-segment cache settings, not a
   policy for arbitrary client `fetch`. Warm Research clicks still sent RSC requests in this
   session, including rapid return navigation. Simply increasing one number is not a complete fix.
3. **Research list overfetches.** `src/app/api/ai/research/list/route.ts:8–17` reads up to 50 full
   reports and spreads each complete record into JSON. `src/lib/postgres/repositories.ts:919`
   uses `SELECT *`. The UI only needs id, linked item id, query, status and dates. Preserve the
   existing stale-run handling when introducing a summary projection.
4. **Prefetch policy does not match current usage.** Research, Save and Settings explicitly set
   `prefetch: false` in `src/components/layout/sidebar.tsx:22–27`, as an intentional P10 decision
   to reduce first-load requests. Report and article links still use default prefetch. Research
   should now receive intent-based warming because Amit actively switches to it, while card
   prefetch should be bounded. Blanket prefetching every destination would restore the earlier cost.
5. **Feed/Today retain server work on navigation.** Their initial render uses `loadPageData` and
   one tenant transaction. Filter changes use `router.replace`; Feed's existing optimistic
   controls keep old results visible, but only component state retains the result/page cursor.
   A client cache alone will not make navigation instant if the page still blocks on a fresh RSC
   render. Route delivery and cached data display must be designed and tested together.
6. **Each avoided API call also avoids authentication work.**
   `src/lib/auth/neon-server.ts:134–144` permits the signed session cache only for ordinary page
   reads, excluding every `/api/*` request and `/account`. This is intentional. Research list and
   suggestions therefore independently incur fresh provider checks and tenant reads. Their route
   handlers lack the existing `withRequestMetrics` wrapper, so exact API auth-vs-DB attribution
   was not available in DevTools.
7. **Polling is limited, but can be refined.** Feed polls item statuses every 3 seconds only while
   displayed items are processing; it has no visibility guard or in-flight exclusion. Active
   research uses SSE, with a 3-second client polling fallback. The SSE endpoint itself reads the
   report from the database once a second until terminal status or its 50-second deadline.
   Completed research and ordinary Today/Research lists do not need polling. Capture receipts
   already check visibility/focus and use a timeout loop.
8. **Other avoidable waterfalls.** Reader state, note and annotations load through separate APIs
   after server-rendered article data. Account Center loads deletion status, then account, then
   sessions/usage/exports. These are code findings, not fully timed live paths in this run.

## Recommended behavior

Use one stable, account-scoped in-memory query cache mounted above page navigation. Prefer
TanStack Query for request deduplication, stale data display, invalidation and mutation rollback;
set its defaults deliberately rather than accepting automatic stale-on-mount behavior.

| Data                                                                | Proposed fresh window      | What happens when revisiting                                    |
| ------------------------------------------------------------------- | -------------------------- | --------------------------------------------------------------- |
| Today and Feed, keyed by full filters/search/cursor                 | 2 minutes                  | Show cached items immediately; no data request while fresh      |
| Research list, suggestions, Archive                                 | 5 minutes                  | Show cached rows immediately; no interval polling               |
| Completed research and article content                              | 30 minutes                 | Reuse loaded content; invalidate on changes/regeneration        |
| Ordinary display preferences                                        | 15 minutes                 | Reuse cached preferences and update immediately after saving    |
| Running research / pending captures                                 | While the task is active   | Visible-page progress updates only; stop on terminal status     |
| Sessions, credentials, invitations, deletion/reauthentication state | Separate fresh-read policy | Keep authorization and sensitive actions verified by the server |

These are proposed defaults, not implemented settings. Staleness means “may refresh on a return,
focus or reconnect,” not “start a timer that refetches forever.” Keep stale rows on screen while
one deduplicated background request runs. Add a visible Refresh action and last-updated indicator;
normal browser reload also fetches current data. Prefer this hybrid to manual-only updates, which
could hide captures made on the phone until the user remembers to refresh.

For same-session mutations, update affected cached views immediately and reconcile with the
server: mark read, archive/restore, change area/priority, save content, start/complete research,
dismiss suggestions and regenerate summaries. Failed writes roll back. Do not treat locally
filtered loaded rows as complete search results: preserve server ranking, pagination and the URL
as the filter source of truth. Preserve loaded pages, scroll position and selected filters.

Cache keys include the verified account and all result-defining parameters. Clear cached data on
logout/account switch and authorization failure, cancel in-flight work, and prevent an old account's
late response from repopulating a new session. Coordinate logout across browser tabs. Keep tenant
authorization/RLS and private API response rules intact; a public CDN cache is not the solution.
Start with memory only. It speeds tab navigation but does not survive a full browser/PWA restart.
Durable browser persistence needs its own boot/auth/version/expiry design and is a later option if
relaunch measurements justify it.

## Implementation order and acceptance

**First slice: Research and the cache foundation.**

- Add the stable query provider and account reset boundary. Migrate Research list/suggestions and
  completed reports; add Refresh and preserve cached content during revalidation/errors.
- Add a repository summary projection and slim the list response. Consider returning suggestions
  alongside the list in one authenticated, tenant-bound read to remove the second auth pass. Do not
  indiscriminately change the shared `listReports` port: proactive research also uses it.
- Warm the Research route and its data together on hover/keyboard focus/touch intent; verify that
  a cached return is not still gated by an RSC request. Investigate the observed route-cache misses
  before changing global TTLs. Add a loading boundary for actual first visits.
- Add timing wrappers to Research list/detail/suggestions so subsequent traces separate auth, DB,
  transfer and rendering. Keep metrics free of content, identifiers and credentials.
- Acceptance: repeat visit within 5 minutes displays rows within a target of 100 ms, with zero
  Research data API calls; an expired return displays cached rows then performs one refresh per
  needed query; a five-report representative fixture has a summary payload below 5 kB decoded.

**Second slice: Feed/Today/Archive and reader continuity.**

- Hydrate the same cache from the existing initial server result without an immediate duplicate
  request. Make subsequent tab/filter visits able to display their cached result without waiting
  for a new server render. Preserve deep links, browser back/forward and server-ranked search.
- Wire mutation invalidation across Today, Feed, Archive and reader data, including capture and
  research completion. Cache paginated results with their cursor and scroll state.
- Limit article/report prefetch to likely next destinations and intent. Avoid prefetching every
  visible item through authentication. Hydrate cheap reader metadata together where appropriate;
  lazy-load expensive optional controls when opened.
- Acceptance: cached tabs target under 100 ms to usable existing content; filter controls respond
  within 100 ms; stale-refresh errors keep existing content visible; no fresh-window duplicate
  requests; no stale mutation resurrection or cross-account display.

**Third slice: long pauses, first opening and active-job efficiency.**

- Reproduce the 10-second stalls outside this instrumented tab: fresh browser session/profile,
  then another device/network as needed. Separate Stalled/DNS/connect/TTFB/download before
  attributing to Vercel, Neon or Chrome. Do not disable extensions or change cloud settings as part
  of an unapproved diagnostic workaround.
- Measure cold and warm first openings on desktop and iPhone, including LCP/INP/CLS and a CPU
  trace. A reasonable warm-start LCP target is under 1.5 s; these are targets, not current SLOs.
- Give active-task polling visibility/offline guards, no overlap and a bounded backoff. Use small
  status projections; refresh full content once at completion. Preserve progress feedback.
- Revisit infrastructure only if measured server phases dominate after request elimination. P11's
  recorded decision retained Neon Free suspension and Vercel Fluid Compute; it is not permission
  to alter either. This run did not independently inspect current cloud settings.

Tests should exercise fresh/stale/remount behavior, deduplication, explicit refresh, visible-only
active polling, optimistic rollback, pagination restoration, late responses and account isolation.
Run the repository Quick gate before a code PR; add relevant auth/tenant tests and the Full gate
if the implementation crosses those boundaries. Repeat the same production navigation sequence
after an authorized release and compare request counts plus paint time, not only API duration.

Reference semantics checked against installed Next 16.3.4 documentation under
`node_modules/next/dist/docs/` (`staleTimes.md`, `prefetching.md`) and the official
[Next cache configuration](https://nextjs.org/docs/app/api-reference/config/next-config-js/staleTimes)
and [TanStack Query defaults](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults).

## Verification

- `npm ci --no-audit --no-fund` succeeded in this isolated worktree before writing the entry.
- `npm run build` succeeded on unmodified `b2213d9` with no hosted environment configured. Hosted
  auth activation preflight was skipped locally; this is not a production auth verification.
- `npm run perf:bundle` succeeded without changing the committed baseline. Gzip first-load JS:
  shared 132.8 KiB, Today 175.0 KiB, Feed 196.7 KiB, Research 166.6 KiB, report 178.0 KiB,
  Settings 164.2 KiB. Route growth against the committed baseline was about 0–6.4 KiB. These are
  local build measurements, not a byte-for-byte verification of the deployed bundles.
- Production `/api/health` returned 200/ok with `cache-control: no-store`, edge `bom1` and function
  region `sin1`. GitHub recorded Production deployment 6775218235 at `b2213d9` as successful and
  its quality-gate checks as successful. The live asset URL referenced deployment
  `dpl_GHEAdNAiBJs1S1Y6VrgqkJQxRZpH`. Custom-domain/legacy-alias SHA equivalence was not
  independently verified through Vercel management APIs.
- No deterministic application test suite was rerun for this documentation-only change.
  `npx prettier --check` for this entry, `npm run state:check` (31 entries / 15 topics) and
  `git diff --check` passed.

## External resources

Read-only diagnostics against `distilai.app` through normal user navigation, its health endpoint,
and GitHub deployment/check metadata. No Vercel/Neon configuration changes, release, AI job,
invitation or data deletion. No HAR, report content, cookies or credentials saved to the repository.

## Next

Diagnosis is complete; the proposed implementation is unstarted. Start the first slice in a new
task/worktree from freshly fetched `origin/main`, run `npm ci` and read this entry plus current
state. Decide the concrete provider/auth-boundary wiring before editing, then carry the shared
cache and Research changes through focused checks and a reviewable PR. No deployment approval
was requested or granted by this diagnostics task. Add a new entry under `navigation-performance`
after implementation; do not edit this checkpoint once integrated.
