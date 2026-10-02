---
topic: navigation-performance
title: PR 129 review fixes: no session notice in the acting tab; stale reader seeds never reused after a write
date: 2026-10-02
time: "12:40"
status: in-progress
branch: codex/client-navigation-performance
pr: 129
---

## What changed

Two findings from an independent review of head `40d28a1`, fixed in `4f2ce5d`. `main` was still
`73e670e`, so no further merge. Follows the [sync entry](2026-10-02-navigation-performance-main-sync-ui-rewrite.md).

- **Sign-in showed "Your session changed".** The sign-in card announced the account change before
  its full-page navigation, and the same-tab event replaced the whole page with the notice until
  the new document arrived. `announceAccountChange({ leaving: true })` is now used by the sign-in
  card and by sign-out: the acting tab clears its cache and stops reading, but keeps its page and
  goes straight to the destination (`/sign-in` on sign-out). Other tabs still receive the storage
  event and show the notice; 401/403 handling is unchanged. The notice's link is now "Continue"
  and reloads the current URL, so a browser that is signed in again gets that account's page and
  a signed-out one is redirected by the server.
- **Note and highlight overwrite: confirmed and fixed.** A reused reader route carries the seed it
  was rendered with, stamped with the server read time. Inside the thirty-minute window the seed
  counts as fresh, so once the query holding a newer local save had been evicted (60 inactive
  queries), the old seed came back as current and the next save would overwrite the newer note or
  highlights. The cache now remembers, per key and outside the evictable query cache, the server
  time of the seed that was current at a local write. A seed at or before that time is not used
  and the query reads from the server; later server renders are trusted again; unwritten seeds
  still mount without a request. Item state is covered the same way.

## Verification

Local, on `4f2ce5d`, disposable databases only (removed afterwards):

- `npm run check`: 267 suites / 2,373 tests passed; four existing lint warnings, zero errors.
- `npm run build`: passed.
- Production-build Playwright on three projects: `content-cache`, `sign-out-cache` and `smoke`,
  24 passed, 3 skipped; seeded `sign-out-cache` and `keyboard` with a legacy session, 15 passed,
  3 skipped. Skips are the two variants of the sign-out test excluding each other.
- New component tests: sign-in inside the real cache provider never renders the notice; sign-out
  likewise; another tab's notice continues by reload; a superseded seed is not reused after
  eviction (cache level and reader note); a later seed and an unwritten seed are.

Not re-run for this change: integration and extension suites (no server or extension code
changed). CI on the new head starts on push.

## External resources

GitHub branch push only.

## Next

Unchanged from the sync entry: confirm the gates on the new head, run the hosted checks listed
there, and wait for Amit's release approval.

Known follow-ups from the same review, not fixed here:

- (a) A document first loaded on a public path such as `/extension/connect` or `/privacy` gets no
  cache scope even when signed in. The first `router.refresh()` then remounts the app once, and
  that anonymous-to-account path does not reload the document.
- (b) Any 401 or 403 on a content write, including `ORIGIN_NOT_ALLOWED`, replaces every tab with
  the session notice.
- (c) `gcTime` of 45 minutes may also apply during server rendering and hold rendered feed
  payloads per warm instance. Unverified.
- (d) Error copy became "Unable to refresh (404/500)"; filter changes scroll to the top; marking
  read in an unread-only Feed removes the row after the refetch.
