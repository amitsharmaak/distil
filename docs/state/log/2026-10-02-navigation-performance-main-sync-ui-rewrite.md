---
topic: navigation-performance
title: PR 129 synced with main after the UI rewrite; cache re-applied; sign-out leaves by a document load
date: 2026-10-02
time: "12:20"
status: in-progress
branch: codex/client-navigation-performance
pr: 129
---

## What changed

Phase R7 of the [release plan](2026-10-01-release-train-open-prs-plan.md), up to but not
including the merge. `main` (`73e670e`: UI rewrite #132, capture triage #130, iPhone pairing #125,
logo #133) was merged into the branch twice, never rebased: `9ecd380` (22 conflicted files and one
modify/delete) and `78a990d` (#133, one sidebar hunk). The rule for every conflict was #132's
markup and structure with #129's data flow. Nothing was merged to `main`, labelled or deployed.

How the cache was re-applied onto #132's components:

- **Feed.** `feed-list.tsx` keeps the account cache (`["feed", key]`, two minutes), native-history
  filters, cached pagination and the bounded processing poll inside #132's `PageContainer` /
  `PageHeader` / `EmptyState`. The updated time and Refresh sit in the header meta.
  `content-card.tsx` is #132's wrapper over `story-card.tsx`.
- **`story-card.tsx`** (Feed and Today rows). The stretched link is `IntentLink`, so rows prefetch
  on hover, focus or touch only. Mark-read and the area control already write through
  `useItemMutation` (`mark-read-button.tsx`, `area-badge.tsx`).
- **Today.** `today-experience.tsx` keeps `useContentQuery` (`["today", key]`) and the
  stale-refresh notice; `TodayHeading` gained a `status` slot for the updated time and Refresh.
- **Reader.** `feed/[id]/page.tsx` still reads the note and annotations in its one tenant
  transaction. #132 split the old controls in two, so the server data now goes to both halves:
  `ReaderKnowledgeControls` (note) and, through `DetailActionBar`'s `initialReaderState`,
  `ReaderLibraryMenuItems` (archive, priority). Both read through the cache with the thirty-minute
  detail window and no mount GET; archive, priority, read and unread go through `useItemMutation`;
  note and annotation writes keep the write barrier and rollback. Summary generation keeps
  `contentMutationRequest`, Feed/Today invalidation and `router.refresh()`.
  `reader-experience.tsx` itself holds only display preferences and progress.
- **Research and Archive.** Cached queries (five minutes; reports thirty), refresh controls,
  `ResearchReportIntentLink` rows and the bounded stream/poll, inside #132's layout.
- **Shell and Settings.** Sidebar, topbar and mobile navigation use `IntentLink`; the sidebar takes
  `DistilLogo` from #133. Settings keeps `ResearchListIntentLink`. Account and token reads stay
  uncached, as before.
- **Server.** `feed-query.ts` is main's, unchanged. The diff against main under `src/lib` and
  `src/app/api` is only #129's: the Research list projection, route timing and the cache scope.
- **Skeletons.** `feed/[id]/loading.tsx` and `research/loading.tsx` now mirror the edition layout
  (`dcf3b91`).
- `dashboard/__tests__/priority-feed.component.test.tsx`: deletion accepted. The component has no
  successor and #129 had only changed its render wrapper, so there was nothing to port.
  `story-card` gained tests for intent prefetch and the shared mutation instead.

Nothing of #129's was dropped. One behaviour differs by design: see the sign-out change below.

### Sign-out and the router cache (`f990384`)

Question: with `experimental.staleTimes` at 1800 s, can Back after sign-out, or a second account
in the same tab, show the previous account's server-rendered pages?

- Documentation (`node_modules/next/dist/docs/01-app/`): `03-api-reference/04-functions/use-router.md`
  says `router.refresh()` "clears the Client Cache for the current route". The glossary's Client
  Cache entry says pages "are reused during browser back/forward navigation", and
  `05-config/01-next-config-js/staleTimes.md` says the setting does not change that. So the
  documentation does not promise that other visited routes are dropped.
- Observation: a production build (Next 16.3.4, Chromium and WebKit) with the old
  `router.replace("/sign-in")` + `router.refresh()` did **not** show the previous content on Back;
  each history entry was re-requested and redirected. That is undocumented behaviour, and it
  depends on the refresh completing.
- Since the documentation cannot rule it out, sign-out now announces the change (data cache and
  other tabs) and then replaces the document with `/sign-in` (`replaceFullPage` in
  `src/lib/browser-navigation.ts`, used by `account-center.tsx`). `ContentCacheProvider` also
  remembers the signed-in account a document first rendered for; a later server render for another
  account, or none, shows the session-changed notice and reloads the current URL instead of
  rendering the new account inside the old document. Sign-in already used a document load.
- Unchanged: the cross-tab clear and the 401/403 expiry still replace all content with the
  notice, whose only exit is a document load. They do not redirect on their own, to avoid a loop
  on a 403 that is not a session problem.

## Verification

All local, on `78a990d` plus this entry, with disposable local databases only.

- `npm run check`: 267 suites / 2,366 tests passed; typecheck, formatting and state checks passed;
  four existing lint warnings, zero errors.
- `npm run build` (`NODE_ENV=production`): passed. `/privacy` and `/sign-in` now build as dynamic
  routes, because the root layout reads request headers.
- `npm run test:integration` (Testcontainers): 15 suites / 75 tests passed.
- `npm run test:e2e` with `DISTIL_E2E_PRODUCTION=1` (the flag only makes the launcher run
  `next start` on `127.0.0.1:3100`; it never points at a hosted site) against a migrated local
  PostgreSQL in CI's configuration: 51 passed, 15 skipped across desktop Chromium, mobile Chromium
  and iPhone WebKit. All five `content-cache.spec.ts` tests ran in each project. The skipped tests
  need credentials (admin invitations, seeded keyboard flow, seeded sign-out).
- The credential-dependent specs were then run separately against a second disposable local
  database with a legacy session: `sign-out-cache.spec.ts` and `keyboard.spec.ts`, 15 passed and
  3 skipped (the three are the anywhere-variant of the sign-out test). The seeded sign-out test
  signs in, visits Today, Feed and a reader by client navigation, signs out, walks Back and Forward
  through every history entry and opens five protected routes: no previous content, every entry
  redirected. It also asserts `Cache-Control: no-store` on the private page. Hosted Neon Auth is
  not available locally, so that test fulfils the sign-out request itself and removes the cookie;
  it skips in CI. The document-load test runs everywhere.
- `npm run test:extension`: 13 passed.
- Screens checked in a production build at 1440 px and 430 px: Today, Feed, reader with its menu,
  Research, Archive, and both skeletons.

Not done: CI on the new head (it starts on push), any preview or Production check.

## External resources

GitHub branch push only. The disposable local PostgreSQL container created for these checks was
removed afterwards. No Vercel, Neon, environment, label or merge action.

## Next

- Amit or the release owner: confirm Quick and Full gates on the new head of PR 129, then follow
  R7's preview checks before any merge. The merge is a Production release and needs Amit's
  approval for that task.
- Checks that only a hosted environment can give:
  1. **Two-account isolation.** Sign in as A; visit Today, Feed, a reader, Research and Archive;
     sign out; press Back and Forward: no A content. Sign in as B in the same tab: only B's data.
     Repeat on iPhone Safari, whose back/forward cache was not exercised locally. With A open in
     two tabs, sign out in one: the other shows the session-changed notice.
  2. **Stale data.** A capture from web, extension or Shortcut appears within two minutes or on
     refocus; read, archive, area and priority changes show on every surface; a regenerated
     summary shows after leaving and returning. Changes from another device may take up to thirty
     minutes to reach an open reader.
  3. **Public pages.** `/privacy` and `/sign-in` load signed out and are now dynamic; check their
     response time and that a signed-in visit to `/privacy` does not disturb the session.
  4. Request counts and click-to-content time against the [measurements](../../perf/client-navigation-2026-10-01.md).
- Known limit: the 401/403 path shows the notice rather than redirecting. If a tab keeps an old
  account's page open while another account signs in elsewhere and storage events are blocked,
  that tab is corrected only on its next rejected request or reload.
