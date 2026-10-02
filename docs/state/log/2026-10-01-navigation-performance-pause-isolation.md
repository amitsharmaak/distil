---
topic: navigation-performance
title: Long-pause isolation finds intermittent idle HTTP2 connection failure
date: 2026-10-01
time: 06:00
status: in-progress
branch: codex/production-navigation-diagnostics
---

## What changed

Amit asked to isolate the multi-second pauses before implementing the caching proposal. This
checkpoint extends [the original diagnosis](2026-10-01-navigation-performance-diagnosis.md),
committed as `967514c`. That entry remains the detailed app/cache plan.

**The dominant delay in the recorded Chrome freezes precedes the request reaching the app. An
independent public-static-file probe also reproduced a failure of an idle HTTP/2 connection while
a fresh connection succeeded.** Connection reuse is now the leading explanation for the extreme
pauses. The failing component along the device/network/Vercel edge path is not identified yet;
we have not captured the original Chrome failure at the connection-event level.

Added `scripts/perf/connection-reuse.mjs`, a read-only diagnostic that makes four GET requests to
the public static `/logo.svg`: a reused and fresh HTTP/2 connection, initially and after 30 seconds
idle. It prints timings, status, protocol, public edge address and safe error codes, never response
bodies or credentials. Each request has a 12-second deadline. Optional `--keepalive` sends a PING
every five seconds during the idle gap as a control. It is not part of the app, CI, or a proposed
production keepalive/polling change. Codex owns this script and this new checkpoint only.

## Evidence

Production requests below were measured on this Mac during the 05:19–06:00 UTC diagnostic window,
2026-10-01. These are small diagnostic samples, not latency percentiles or a load test.

### Earlier authenticated Chrome traces

These are observations from this same task's earlier run, preserved in `967514c`, not newly
reproduced authenticated traces in this follow-up:

| Navigation             | Total   | Before sending                                | Waiting for response |
| ---------------------- | ------- | --------------------------------------------- | -------------------- |
| Today reload           | 11.00 s | 10.01 s Stalled, then 138 ms connection setup | 795 ms               |
| Completed report route | 10.65 s | 10.01 s Stalled, then 43 ms connection setup  | 595 ms               |
| Today soft navigation  | 18.59 s | 17.76 s Stalled, then 139 ms connection setup | 646 ms               |

The app's proxy timing on the slow samples was about 426–456 ms. The full 10–18 seconds should
not be attributed to Neon, authentication, React rendering, or report generation. Those parts
still contribute to normal navigation latency and need the previously proposed caching work.

### Independent transport controls in this follow-up

| Test                                                                                | Result                                                                                    | Interpretation                                                                  |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Nine fresh curl HTTP/2 connections across health, static logo, sign-in              | All 200; total 197–360 ms, median 304 ms                                                  | Fresh transport generally fast during this window                               |
| Same nine fresh requests forced to HTTP/1.1                                         | All 200; total 193–413 ms, median 299 ms                                                  | No persistent protocol-wide or origin outage                                    |
| Reused Node HTTP/2 health connection, 15-second gaps, paired with fresh curl HTTP/2 | Four reused responses 182–303 ms; fresh responses 296–334 ms; post-connect PINGs 57–62 ms | Reuse can be healthy; failure is intermittent                                   |
| Reused Node HTTP/2 static logo after 30 seconds idle                                | No response headers or PING reply; **12,003 ms timeout**                                  | Reproduced without app JavaScript, auth, or database work                       |
| Fresh curl HTTP/2 static logo at the same moment                                    | **77 ms**, 200                                                                            | Origin/static resource remained reachable while old connection was unusable     |
| Another request on that old connection after another 30 seconds                     | Ended without headers after 2,959 ms; session closed; pending PINGs cancelled             | Old session still unusable; fresh control was 79 ms                             |
| Separate static test with PING every five seconds                                   | After 30 seconds, reused request **27 ms**, fresh control 81 ms; PINGs 17–24 ms           | Consistent with idle loss, but a single passing control does not prove a remedy |
| Checked-in script, fresh and reused clients both Node HTTP/2, no keepalive          | Initial 93/94 ms; after 30 seconds reused 30 ms, fresh 78 ms; all 200                     | Important healthy repeat: there is no proven deterministic 30-second threshold  |

The checked-in script's healthy repeat connected both clients to the same public edge address.
Its `--keepalive` mode also passed: initial reused/fresh responses were 81/91 ms and responses
after the idle gap were 46/90 ms, with periodic PING replies in 16–19 ms. These runs verify the
script's two modes, not a statistically established reduction in failure rate.
The earlier temporary failed probe did not record peer addresses, so edge-address differences
cannot be excluded as a variable. The final prototype control used curl for the fresh connection;
the checked-in script removes the Node-versus-curl TLS/client difference.

An initial exploratory health probe also had a final request still pending at its global deadline,
about 9.5 seconds into that request. Its cleanup then threw an invalid-session error. That run is
not treated as a successful response or precise 10-second timeout measurement; the subsequent
bounded static test is the usable failure evidence.

Static logo responses were Vercel cache HITs; `/api/health` was 200 through `bom1` to `sin1`.
Current source excludes `.svg` from the proxy matcher; the health route does not query the DB.
No enabled system-proxy flags or standard shell proxy variable names were found. This does not
exclude a VPN, transparent proxy, router/NAT, ISP or another network intermediary.

## Interpretation and remaining attribution

1. **Confirmed failure class outside the app:** an existing idle HTTP/2 connection can become
   unusable while a new connection retrieves the same static resource quickly. Disabling research
   polling or optimizing SQL cannot repair that transport failure.
2. **Leading explanation for the Chrome trace, not a confirmed Chrome event:** Chromium's current
   [HTTP/2 implementation](https://chromium.googlesource.com/chromium/src/+/HEAD/net/spdy/spdy_session.cc)
   has a 10-second hung-connection interval and closes a failed PING with `ERR_HTTP2_PING_FAILED`.
   This matches the two 10.01-second stalls followed by new connection setup, but duration alone
   is not proof that those requests hit that exact code path. The successful protocol of those
   earlier Chrome requests was not recorded.
3. **Still unresolved:** local OS/network path versus edge idle-connection handling; reproducibility
   by edge address and network; whether all user-reported pauses have this cause. No extension-only
   explanation can account for the independent Node failure, but Chrome can have additional issues.
4. **Separate app problem remains:** repeated route-then-data fetching and empty loading states
   make normal navigation slower and expose users to more network failures. Continue the cache,
   route-delivery and bounded-prefetch plan once the transport evidence has a clear disposition.

## Verification and boundaries

- Re-fetched `origin/main`, still `b2213d9bc2cf01ca49f9d93bc0cc9214b43626c3`; the owned worktree
  was clean at `967514c` before these additions. Main checkout and other worktrees untouched.
- Local diagnostic script: syntax check, focused ESLint and live default/control execution.
  No app runtime changes; no broad app tests or rebuild required for this diagnostic-only addition.
- Formatting and state-log validation run before commit. CI, deployment identity and the legacy
  alias were not re-verified in this follow-up; earlier release evidence remains in the prior entry.
- Ordinary read-only production GETs only. No production settings, dependencies, data, environment,
  browser extensions, network configuration or deployment changed.
- A fresh signed-in tab was opened, but browser-control/DevTools attachment problems prevented a
  clean comparable trace. Do not count its tool-call duration as page latency.
- Chrome's internal `chrome://net-export/` page was blocked by the browser automation security
  policy. No workaround was attempted. No NetLog, raw HAR, cookies or captured content saved.

## Next

1. **Amit + diagnosis owner: network A/B.** Run from this worktree:
   `node scripts/perf/connection-reuse.mjs`, then the same command with `--keepalive`. Repeat the
   default command on a phone hotspot, keeping the Mac/client otherwise the same. A single passing
   repeat cannot clear an intermittent fault; compare a few bounded trials and record edge address.
   If failures track the normal network, investigate its VPN/router/ISP path. If they recur on
   independent networks and cluster by edge, prepare the sanitized timings for Vercel support.
   The pending user question asks whether the pauses also occur on the phone; it was unanswered
   when this checkpoint was written.
2. **Manual Chrome capture if needed.** Following Chromium's
   [NetLog instructions](https://new.chromium.org/for-testers/providing-network-details/), Amit opens
   `chrome://net-export/`, keeps the default private-information stripping, starts logging locally,
   reproduces one pause, then stops. Do not enable raw bytes/cookies or upload to a public viewer.
   The diagnosis owner inspects only the relevant origin and dependency events locally, looking for
   PING sent without ACK, `ERR_HTTP2_PING_FAILED`, socket closure and replacement connection timing.
   This is the missing link between the Chrome freeze and the independent connection experiment.
3. **Only if transport is healthy during a visible freeze:** record Chrome Performance around the
   same click. Split click-to-request, connection stall/setup, request-to-first-byte, download and
   response-to-paint. Use long tasks to identify main-thread blocks; correlate existing Server-Timing
   for server waits. Research GET handlers need the existing request-metrics wrapper for fuller
   auth/DB attribution; navigation marks/long-task sampling are not currently implemented.
4. Resume the cache implementation plan in the prior entry. Do not use background polling or a
   permanent ping loop as the production workaround, or change HTTP settings without evidence and
   task-specific authorization. No merge/deployment has been requested.
