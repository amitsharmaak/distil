# Client navigation performance — 2026-10-01

This change reduces repeated reads when moving between Today, Feed, Research, reports and Archive.
The implementation starts from `ec07a52` and incorporates main through `aa63baa`, including the
extension store package, orphan-job removal and retirement of the legacy Vercel alias. The separate
browser/connection-stall investigation remains deferred.

## Behavior and boundaries

- A verified-account, memory-only cache deduplicates reads and keeps existing content visible while
  stale data refreshes. Fresh windows are two minutes for Feed/Today, five for Research lists,
  suggestions and Archive, and thirty for report bodies and reader state/notes/annotations.
- Explicit Refresh updates earlier. Return, focus and reconnect can refresh stale content; ordinary
  lists and completed content have no interval polling. Active captures/research retain visible,
  online progress updates, with cancellation, no overlap and bounded retry backoff.
- Feed filter/search changes use native history without a server-component round trip. The server
  still owns ranking, search and pagination. Returning restores loaded pages and scroll position.
- Read/archive/area/priority changes optimistically update related views. Failed writes roll back
  only the affected item. Same-item writes serialize across components; successful writes resolve
  before background reconciliation so reader navigation does not wait for extra GETs.
- Initial Feed/Today server rendering stays in place. The reader loads state, notes and annotations
  in its existing tenant transaction, removing three mount-time API reads. Article HTML remains
  server-sanitized and delivered through Next's thirty-minute browser route cache; it is not
  duplicated into a separate JSON body cache. Summary generation, extraction and feedback refresh
  the reader route so mutations cannot leave old server-rendered props behind.
- Navigation intent warms routes and Research data; visible cards do not all prefetch at once.
  Next's existing `staleTimes.dynamic` and `static` settings retain visited route output for thirty
  minutes. The shorter data freshness windows above still trigger background API reads on return.
  This is browser route reuse, not server/CDN data caching. Account, session, token and admin APIs
  remain outside the content cache and re-read on mount. Sign-in/out uses full navigation and cache
  reset; authorization remains enforced on every API call.
- Sign-out, account changes and authorization failures cancel and clear cached data. Cross-tab
  signals contain only a nonce. Late reads from an earlier scope cannot repopulate the cache.
  Security-sensitive account/session/token operations keep their fresh-read policy.
- Inactive cache entries expire after 45 minutes and are bounded to 60. Data is not persisted to
  browser storage, so a full reload starts fresh. No CDN/private-response caching rules, database
  migrations, cloud configuration or Production data are changed.

## Verification and measurements

The companion [measurement artifact](client-navigation-2026-10-01.json) records before/after
production builds using a disposable local PostgreSQL database and a synthetic 12-item library.
Each route has three samples after a server warm-up, with a new browser context for every sample.
Desktop and phone-sized Chromium run without CPU or network throttling. These are controlled
local measurements, not Production latency or physical-iPhone first-open measurements.

| Route              | Desktop requests | Mobile requests | Desktop LCP (ms) | Mobile LCP (ms) |
| ------------------ | ---------------: | --------------: | ---------------: | --------------: |
| /                  |          27 → 17 |         32 → 16 |          44 → 48 |         40 → 44 |
| /feed              |          37 → 19 |         42 → 18 |          44 → 56 |         40 → 44 |
| /feed/[id]         |          30 → 23 |         27 → 22 |          48 → 32 |         52 → 28 |
| /settings          |          24 → 21 |         29 → 20 |          32 → 32 |         28 → 28 |
| /feed (processing) |          37 → 20 |         40 → 19 |          52 → 52 |         48 → 56 |

Before → after medians; mobile here means Chromium phone emulation. All 30 measured final
page loads returned HTTP 200 without redirects or browser console errors.

| Route          | Initial gzip JS before |    After |   Change |
| -------------- | ---------------------: | -------: | -------: |
| /              |               174.8 KB | 188.1 KB | +13.3 KB |
| /feed          |               196.4 KB | 210.6 KB | +14.2 KB |
| /feed/[id]     |               187.0 KB | 199.8 KB | +12.7 KB |
| /research      |               166.4 KB | 179.0 KB | +12.6 KB |
| /research/[id] |               177.8 KB | 189.5 KB | +11.7 KB |
| /settings      |               164.4 KB | 176.7 KB | +12.2 KB |
| /\_not-found   |               132.8 KB | 144.0 KB | +11.2 KB |

`/_not-found` represents the common chunks: about 11.2 KB of extra shared gzip JavaScript.
The baseline bundle budget is left intact; this explicit cache-library cost is recorded here.

Cached Research return samples were 8.2–10.7 ms on desktop Chromium, 8.6–9.3 ms on mobile
Chromium, and 5–6 ms on iPhone WebKit emulation, with no extra data reads while fresh.
These six local samples are click-to-heading observations, not a Production percentile.

The Research projection regression uses five reports containing deliberately large bodies and
sources; its card-only response is 1,408 decoded bytes, below the 5,000-byte target. The earlier
46.4 kB Production response used different report content and is not a like-for-like fixture.

Browser checks exercise repeated Research list/report navigation, back/forward, explicit refresh
failure with cached content retained, Feed pagination, scroll restoration and search/clear without
filter RSC requests. They run on desktop Chromium, mobile Chromium and iPhone WebKit emulation.
Data-request counts distinguish explicit refresh from fresh cached returns; delayed navigation
intent prefetches are not counted as filter-triggered route requests.

The cache library and helpers add compressed JavaScript. Request reductions and cached navigation
are the main gains; unthrottled local first-open paint timings vary by a few milliseconds and do
not establish a broad Production LCP improvement. Production click-to-content and request counts
must be compared after a separately authorized release. The deferred pre-request connection
stalls and hosting cold starts are not claimed fixed by this work.

## Route-cache decision

Holding an RSC response after advancing the browser clock by 301 seconds reproduced a real pause:
report JSON remained fresh, but Next left the previous page visible until the route returned.
A cache-aware loading boundary could not help because the router had also expired its route shell.
The installed Next version exposes `unstable_dynamicStaleTime`, but a built-app probe showed it
has no effect under this application's current router; activating its newer router would require
Cache Components and a broader rendering migration. Neither experiment is included.

The final implementation therefore extends the already-used, documented `staleTimes` settings.
It keeps canonical Next links/history and avoids introducing a second navigation state machine.
API data freshness is independent of this route lifetime: returning to a stale list renders its
cached rows and starts the required data refresh, while security-sensitive controls continue to
load fresh state. Browser regressions cover the old five-minute expiry boundary and fresh account
reads. Thirty minutes is still a finite route window; returns beyond it or after cache eviction
can require a new route response. Memory caching also cannot improve a browser restart by itself.
