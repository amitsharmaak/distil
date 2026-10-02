---
topic: navigation-performance
title: Fix-forward for the Today hydration mismatch after PR 129, and the dark theme it dropped
date: 2026-10-02
time: "13:05"
status: in-progress
branch: claude/fix-updated-time-hydration
---

## What changed

A Production regression from PR 129 (`bbad825`), fixed on a new branch from `main`. Not merged
and not deployed by this task.

**Regression.** On `distilai.app`, every load of Today logged React error #418 (hydration text
mismatch), and a reader with the dark theme stored got a light page with no class on `<html>`.
Settings, which has no "Updated" control, was unaffected.

**Cause.**

- Today and Feed are server-rendered with data, so their cache is seeded on the server and the
  new "Updated 6:15 PM" label was rendered there too. It was formatted with `toLocaleTimeString`
  during render (`today-experience.tsx` and `feed-list.tsx`, the `updatedLabel` helpers): in UTC
  and the server's locale on the server, in the reader's timezone and locale in the browser. The
  two strings differ for anyone outside UTC, so hydration failed and React re-created the root on
  the client. Research, Archive and the report page used the same helper but have no data during
  server rendering, so they showed "Not updated yet" on both sides and did not fail.
- The theme class is set on `<html>` by the inline script in `src/app/layout.tsx` before
  hydration; React is given no `className` for `<html>`. When React mounts `<html>` on the client
  (which it does when it re-creates the root) it removes every attribute that is not one of its
  props, so `dark` was dropped. `ThemeProvider` reads the theme from that class and so reported
  light. The hydration error was the trigger; the theme had no defence against any root re-render.

**Why the gates missed it.** Two reasons, both needed. CI runs the server and the browser in the
same timezone, so a time formatted on both sides is identical. And CI's browser tests have no
signed-in user, so Today and Feed are not server-rendered with data there at all; the label is
"Not updated yet" on both sides. The local checks before the merge ran the server and the browser
on one machine, with the same result.

**Fix.**

- `src/components/ui/updated-time.tsx`: the server and the first client render emit the same
  placeholder of reserved width; the local time fills it after hydration (`useSyncExternalStore`).
  Client-side navigations render the time at once. Today, Feed, Archive, Research and the report
  page use it; the five `updatedLabel` helpers are gone.
- `src/components/layout/theme-provider.tsx`: the stored theme is re-applied to `<html>` in a
  layout effect when the provider mounts and whenever the class is changed from outside, so the
  theme survives a root re-render whatever caused it. Where storage is unreadable the class is
  left alone.
- Nothing else that PR 129 added differs between server and client render: no `typeof window`
  branches or random ids were found in its components. Noted and not changed: `TodayHeading`
  (from the UI rewrite) formats today's date in UTC, which is hydration-safe but shows the UTC
  date; `timeAgo` and the iPhone card's dates only render client-fetched data.

**Tests.**

- `tests/support/hydration.tsx` server-renders with one clock and hydrates with another, which is
  what Production does and a single test process cannot otherwise show.
- Component tests: `UpdatedTime`; Today and Feed server-rendered with data
  (`server-hydration.component.test.tsx`); the theme guard.
- `tests/e2e/smoke.spec.ts` gained a test that runs the browser in `Asia/Kolkata` / `en-IN`
  with the dark theme stored, visits Today, Feed, a reader, Research, Archive and Settings, fails
  on any hydration error in the console and requires `<html>` to keep `dark`. The e2e launcher
  now pins the server to UTC. With the local database and session the pages are server-rendered
  with data as in Production; in CI the test runs against empty islands, so there it guards the
  theme and other mismatches but would not have caught this one. The component tests are the CI
  guard for this exact fault.

## Verification

Local only, production build (`next start`), disposable local PostgreSQL (removed afterwards).

- Fails before, passes after. With `main`'s source and the new tests: the component tests fail
  with "Hydration failed because the server rendered text didn't match the client"; the smoke
  test fails on `/` with "Minified React error #418 ... args[]=text" in Chromium and WebKit, and
  `<html>` ends with no class. With only the theme guard applied, the mismatch still occurs but
  `<html>` keeps `dark`. With the full fix both pass.
- `npm run check`: 269 suites / 2,382 tests passed; four existing lint warnings, zero errors.
- `npm run build`: passed.
- `npm run test:e2e` in CI's configuration with `DISTIL_E2E_PRODUCTION=1`: 54 passed, 15 skipped.
- Seeded run (legacy session, server in UTC, browser in Asia/Kolkata) on three projects: the new
  smoke test, `sign-out-cache` and `keyboard`: 18 passed, 3 skipped.

Not done: CI on the pull request (started by the push), any check on a hosted deployment.

## External resources

GitHub branch, pull request and the `full-ci` label only.

## Next

- Amit: review and merge the pull request; the merge is a Production release. Afterwards, on
  `distilai.app` with the dark theme stored and a non-UTC timezone: no #418 in the console on
  Today and Feed, `<html class="dark">` stays, and "Updated" shows the local time.
- Follow-up worth its own task: give CI's browser tests a signed-in user and seeded data, so
  server-rendered surfaces are exercised there rather than only locally.
