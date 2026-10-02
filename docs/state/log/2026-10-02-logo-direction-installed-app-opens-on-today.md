---
topic: logo-direction
title: Installed app opened on Save instead of Today; start page fixed in PR 141
date: 2026-10-02
time: 15:30
status: in-progress
branch: claude/pwa-start-on-today
pr: 141
---

## What changed

Report from Amit: "distil pwa goes to the Save every time it opens and not the Today bottom nav
once it's saved as an app on iPhone." He wants the installed app to open on Today. This entry
continues the installed-app thread of `2026-10-02-logo-direction-mobile-and-installed-app.md`
(PR #140, merged as `1080444`), because the device step is the same reinstall.

Cause: `src/app/manifest.ts` still had `start_url: "/save"`, left from the time Distil was
capture-first. Today (`/`) has been the home of the app since Phase 2. The manifest had no `id`,
no `scope`, no `shortcuts` and no `share_target`.

Change, in [PR #141](https://github.com/amitsharmaak/distil/pull/141), not merged:

- `src/app/manifest.ts`: `start_url: "/"`, `scope: "/"`, `id: "/"`, and one `shortcuts` entry
  "Save a link" → `/save` (long-press or right-click on the app icon, where the platform supports
  it; iOS does not show manifest shortcuts).
- Decision on `id`: without `id`, Chrome derives the identity of an installed app from
  `start_url`, so changing `start_url` already makes this a different app for desktop Chrome and
  Android. Keeping the old identity would need `id: "/save"` for good, which ties the app to a
  page that is no longer its home. `id: "/"` equals what Chrome derives from the new `start_url`,
  so it adds no further change today, and it pins the identity so that a later `start_url` change
  (for example a tracking parameter) does not split installs again. Cost: an existing Chrome
  install keeps opening `/save` until it is uninstalled and installed again. Amit is the main
  installed user and reinstalls for the new icon anyway.
- `src/app/login/page.tsx`: the legacy password login fell back to `/save` when no valid `next`
  was given; it now falls back to `/`. An explicit, validated `next` is still honoured.
- `docs/onboarding.md` and `docs/iphone-shortcut.md`: the Home Screen steps said to install from
  `/save` and that the app opens on the save screen; they now say `https://distilai.app` and
  Today.

Looked at and left alone, because they already default to Today or are deliberate deep links:

- Hosted sign-in (`src/components/auth/sign-in-card.tsx`) goes to `next` or `/`; magic-link and
  sign-in completion (`src/lib/auth/magic-link.ts`) fall back to `/`; onboarding completion
  (`src/components/account/account-center.tsx`) goes to `/`.
- `appleWebApp` in `src/app/layout.tsx` sets only `capable`, the status bar style and the title;
  there is no Apple start setting. There is no service worker and no `launch_handler`.
- The extension connect page, the iPhone Shortcut and the Save entries in the navigation still
  target what they targeted.

Not changed, question for Amit: the manifest `name` is still "Distil — Personal Knowledge
Capture" and its `description` (also the page description in `src/app/layout.tsx`) is "Save
articles and turn them into focused, actionable insight." `AGENTS.md` and
`docs/design/brand-assets.md` give no approved replacement wording, so both were left. The page
title is already "Distil — Your AI Knowledge Companion".

## Verification

Local, on the branch:

- `npm run check`: pass, 269 suites / 2408 tests. `npm run build`: pass.
- New unit test in `src/components/brand/__tests__/brand-assets.unit.test.tsx` asserts `id`,
  `start_url`, `scope` and the Save shortcut. `src/app/login/__tests__/page.component.test.tsx`
  asserts that the default target after login is `/` for an absent or hostile `next`. The hosted
  sign-in default (`/`) was already asserted in `src/app/sign-in/__tests__/page.component.test.tsx`.
- `tests/e2e/save.spec.ts` ("publishes install metadata…" and "returns to a validated protected
  destination after login") on desktop Chromium against the Playwright-managed local server:
  2 pass. The served `/manifest.webmanifest` carries the new fields.
- Not verified: an iPhone Home Screen icon, an installed desktop Chrome or Android app, GitHub CI
  on the PR head and the Vercel Preview.

## External resources

Branch `claude/pwa-start-on-today` pushed and PR #141 opened with the `full-ci` label. The Vercel
Git integration builds a Preview on its own. No Production release, database access or other cloud
mutation.

## Next

- Amit: review and merge PR #141 when CI is green. The merge is a Production release and needs
  his authorization.
- Amit, after the release. One reinstall covers both the new icon (#140) and the Today start page:
  - iPhone: iOS stores the start page in the Home Screen icon when it is added, so the existing
    icon keeps opening Save. Delete the Distil icon, open `https://distilai.app` in Safari, then
    Share and "Add to Home Screen". Sign in once more inside the new app if asked.
  - Desktop Chrome: open the installed Distil app, choose ⋮ then "Uninstall Distil", open
    `https://distilai.app` in Chrome and install it again. The old install does not move to the
    new start page by itself, because the app identity changed from `/save` to `/`.
  - Android: uninstall and add it again, for the same reason.
- Amit decides whether the manifest `name` and the `description` get new wording; that is a
  separate small task.
- Still open from the previous entry: the app icon is the ivory "d" on the dark ink tile approved
  in #133. If Amit expected the blue mark as the app icon, that is a design decision for a new
  task.
