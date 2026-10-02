---
topic: logo-direction
title: Logo missing on phones and in the installed app after #133; fix in PR 140
date: 2026-10-02
time: 14:55
status: in-progress
branch: claude/logo-mobile-and-installed-app
pr: 140
---

## What changed

Report from Amit after the logo release (#133, squash `73e670e`): the new logo does not show in
the mobile app or in the Chrome "save as app" install. The desktop sidebar was correct. Fix is in
[PR #140](https://github.com/amitsharmaak/distil/pull/140), commit `d27e468`, not merged.

What was wrong, by reading of the report:

- **A. Phone-width chrome: real.** `src/components/layout/topbar.tsx` rendered the word "distil"
  as serif text, the follow-up left open in `2026-10-02-logo-direction-sync-after-ui-rewrite.md`.
  Below `md` the sidebar is hidden, so the signed-in phone layout showed no logo at all. Invite,
  reset-password and access-denied had no logo either, unlike sign-in and login. The bottom
  navigation and the reader header carry no brand; onboarding sits inside the shell. No funnel
  artwork or `BrandMark` reference remains in `src`. There are no loading or error pages.
- **B. Installed-app assets: already correct.** Each icon file on the branch was viewed and is the
  new mark (ivory "d" on the ink tile; full-bleed for maskable and Apple). The live Production
  files are byte-identical (SHA-256) to the repository: `/icons/icon-192.png`,
  `/icons/icon-512.png`, `/icons/icon-maskable-512.png`, `/icons/apple-touch-icon.png`,
  `/favicon.ico`, `/icon.svg`. The live manifest lists 192 and 512 `any` plus 512 `maskable`, with
  `theme_color` `#172329` and `background_color` `#f6f3ed`. Every page links a 180 px
  `apple-touch-icon` and sets `apple-mobile-web-app-title`. All of these are served with
  `cache-control: public, max-age=0, must-revalidate`, so no immutable cache pins an old image.
  Root `/apple-touch-icon.png` and `/apple-icon.png` redirect to `/sign-in`; that is harmless
  because the link tag names the icon, and it was left alone.
- **C. Caching: the cause of the installed-app report.** #133 replaced the icon files under the
  URLs that had served the funnel. An installed app keeps the icon captured at install time and
  looks again only when the manifest names a different icon URL; iOS never refreshes a Home
  Screen icon.

What changed:

- The phone top bar renders `DistilLogo` (the 28 px lockup, as in the sidebar) inside the
  existing "Distil home" link. Invite, reset-password (both steps) and access-denied show the
  logo above the heading, as sign-in does.
- `npm run brand:generate` also writes `src/components/brand/icon-version.ts`, a hash of the four
  web icon files (24 generated assets, was 23). `src/app/manifest.ts` and the icon metadata in
  `src/app/layout.tsx` append it as `?v=<hash>`, so the URLs change whenever the artwork changes.
  The icon files themselves did not change.
- Tests: the top bar component test asserts the inline SVG; a unit test asserts that every
  manifest icon URL is versioned and points at a generated file; `tests/e2e/smoke.spec.ts`
  asserts that the manifest icons resolve and that the phone top bar shows the logo.
- Nothing added branches on the client: the logo is static inline SVG and the version is a
  build-time constant.

## Verification

Local, on the branch:

- `npm run check`: pass, 269 suites / 2385 tests. `npm run build`: pass. `npm run brand:check`:
  24 assets match.
- `tests/e2e/smoke.spec.ts` on desktop Chromium, mobile Chromium and mobile WebKit against an
  isolated local server on port 3217 (temporary SQLite, no provider keys, no remote database):
  11 pass, 1 skipped (the top bar assertion on desktop, where the sidebar replaces it).
- Seen rendered at 390 px in light and dark: the Today top bar, sign-in, login, invite,
  reset-password and access-denied; sign-in and access-denied at 1280 px. No hydration messages
  in the console. The server was stopped afterwards.
- Production was read with unauthenticated GETs of public static files only, on 2026-10-02 about
  14:30 UTC.
- Not verified: a real installed Chrome app, an iPhone or Android Home Screen icon, GitHub CI on
  the PR head and the Vercel Preview.

## External resources

Branch `claude/logo-mobile-and-installed-app` pushed and PR #140 opened with the `full-ci` label.
The Vercel Git integration builds a Preview on its own. No Production release, database access or
other cloud mutation.

## Next

- Amit: review and merge PR #140 when CI is green. The merge is a Production release and needs
  his authorization.
- Amit, after the release, to see the new icon at once:
  - Desktop Chrome: open the installed Distil app, choose ⋮ then "Uninstall Distil", open
    `https://distilai.app` in Chrome and install it again. Chrome may also update the icon by
    itself within about a day of the app being opened; reinstalling is the certain route.
  - iPhone: delete the Distil icon from the Home Screen, open `https://distilai.app` in Safari,
    then Share and "Add to Home Screen".
  - Android: if the icon is unchanged after a day, uninstall and add it again.
- The app icon is the ivory "d" on the dark ink tile approved in #133. The blue "d" with the
  wordmark is the in-app lockup. If Amit expected the blue mark as the app icon, that is a design
  decision for a new task.
