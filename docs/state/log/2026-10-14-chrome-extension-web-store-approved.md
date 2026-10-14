---
topic: chrome-extension-web-store
title: Store build approved, installed and verified; the "slow feed" is the 2-minute client cache
date: 2026-10-14
status: in-progress
branch: claude/distil-feed-ingestion-sorting-da1d37
---

## What changed

This entry follows `2026-10-02-chrome-extension-web-store-submitted.md` and records three
things from one session with Amit: the Chrome Web Store build is approved and works; the delay
Amit sees between saving and the Feed is not ingestion; and the extension's keyboard shortcut
exists but is only assigned on a fresh install. One code change, authorized by Amit in the
session on 2026-10-14 after the install was verified:

- `DISTIL_EXTENSION_INSTALL_URL` (`src/lib/extension/constants.ts`) now carries the store id
  `malhlcmmheemmdebmjpgliligpjlnama` instead of the development id. The connect page's "Install
  the extension" link and anything else that reads the constant now reach the Unlisted listing.
  `DISTIL_EXTENSION_IDS` is unchanged, so unpacked builds still connect.
- `docs/onboarding.md` §3 describes the store install and the sign-in handoff instead of "Load
  unpacked" plus a pasted capture token; `browser-extension/README.md` points users at the
  listing and keeps the unpacked steps for development.

### Store build approved and verified (Amit, 2026-10-14)

- Google approved Web Store item `malhlcmmheemmdebmjpgliligpjlnama` (Unlisted, version 2.0.0).
- Amit removed the unpacked development build first. The connect page hands the sign-in token to
  the first reachable id in `DISTIL_EXTENSION_IDS` (`src/lib/extension/handoff.ts`), and the
  development id comes first, so a still-installed development build would have taken the token.
- Installed from the store link, signed in through "Sign in to Distil" → "Connect this browser",
  saved a page, and the page arrived. Reported by Amit; Claude cannot read the Web Store or
  `chrome://` pages, so the install was not independently observed.
- The shortcut was pre-assigned on this install (Cmd+Shift+S). On the old development build it
  showed "Not set": Chrome applies `suggested_key` only when an extension is first installed, and
  that build predated the May change (`68526867`) that added the command. A manual assignment
  survives updates.

### Ingestion timing for an X post is seconds, not minutes

Amit asked how long `https://x.com/geoffintech/status/2110015920907194553` took. Read from the
capture receipt on Production through Amit's signed-in Chrome session (`GET /api/v1/captures`,
read only):

- accepted `2026-10-14T06:13:05.777Z`, ready `2026-10-14T06:13:12.374Z`: 6.6 s, one attempt.
- The other recent receipts sit between 5 and 12 s. The item row is inserted as `ready` before
  the brief summary and area classification run (`src/lib/capture/worker.ts`), so Feed
  visibility never waits on the AI calls.

The perceived delay is client-side. The Feed list is held in the browser for
`CACHE_FRESHNESS.feed` = 120 s (`src/lib/client-cache/content-cache.tsx`); refetch on window
focus is on but TanStack skips it while the data is younger than that. Saving from the extension
and switching back to an already-open Distil tab therefore shows a list up to 2 minutes old, and
nothing on the page invalidates it (the extension cannot reach the tab's cache). Next's router
cache (`experimental.staleTimes` 1800 s) does the same for client navigations to the Feed.
Candidate fixes, not started: a near-zero stale window for the feed key so focus refetches, or
a visible-tab poll for new captures like the existing 3-second processing poll.

### Feed sort: ranked by default, so a fresh save lands mid-list

The Feed already offers For you (default), Recent and Priority in the Filters sheet
(`src/components/feed/feed-filters.tsx`). Amit is undecided between "see where my save went" and
"important first". Options discussed, decision deferred by Amit to a later session together
with the open Today-vs-Feed definition (`2026-10-03-backlog-reading-modes-feedback.md`):

1. Keep the ranked default and add a "Just saved" strip above the ranked list for items captured
   in the last few minutes (smaller change).
2. Make Recent the Feed default and leave ranking to Today (settles Today vs Feed).

## Verification

- Production read only: `GET https://distilai.app/api/v1/captures?limit=100` in Amit's Chrome
  session on 2026-10-14. No capture, item or setting was changed.
- Store install, sign-in, save and shortcut: reported by Amit on 2026-10-14 (not independently
  observed, see above).
- Locally: `npm run lint`, `npm run typecheck` and the connect page tests pass with the
  constant change (results in the pull request). Not yet deployed at the time of writing; the
  merge is the release.
- No package, environment variable, Vercel or Neon setting changed.

## External resources

- Chrome Web Store item `malhlcmmheemmdebmjpgliligpjlnama`: approved, Unlisted, version 2.0.0.
- Production capture receipts for Amit's account, read once; no identifiers recorded beyond the
  one URL Amit asked about.

## Next

1. Amit: merge the pull request. The merge is a Production release (the install link changes);
   Amit authorized the change in the session, the merge is his to do. Afterwards, on
   `distilai.app/extension/connect` in a browser without the extension, the "Install the
   extension" link should open the store listing.
2. Share the Unlisted store link with invitees, with `docs/onboarding.md` §3 as the steps.
3. Feed freshness after a save: its own task when Amit picks it (candidate fixes above).
4. Feed default sort and the Today-vs-Feed definition: Amit decides in a later session.
5. Revisit the trader declaration if Distil becomes a commercial product (unchanged).
