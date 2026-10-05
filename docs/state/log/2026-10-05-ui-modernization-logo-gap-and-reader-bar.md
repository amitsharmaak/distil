---
topic: ui-modernization
title: Lockup gap widened to 24 units, sidebar mark aligned, Mark read made a secondary action
date: 2026-10-05
time: 08:40
status: in-progress
branch: claude/logo-gap-and-reader-bar
---

## What changed

Two small UI decisions Amit took on 2026-10-05, one PR, two commits.

1. **Lockup gap 16 → 24 units** (`brand: widen lockup gap to 24 units and align sidebar mark`).
   The gap is defined once, in `src/components/brand/artwork.ts`: the wordmark's box now starts at
   `WORDMARK_OFFSET = 104` (was 96 inside `WORDMARK_TRANSFORM`). Measured from the rendered path
   bounds (sharp, 20 px per unit): the mark's ink ends at x=80.0, the wordmark's ink begins at
   x=104.2, so the visible gap is 24.2 units, 0.233 × the 104-unit mark height (it was 16.2
   units, 0.156). That is 6.5 px at the 28 px sidebar/topbar size and 9.3 px at the 40 px
   sign-in size. `LOCKUP_WIDTH` and the viewBox follow: 316.87 × 104 (was 308.87); the component
   renders 85.3 px wide at 28 px tall (was 83.2). `npm run brand:generate` rewrote five files:
   `public/brand/distil-logo.svg`, `distil-logo-light.svg`, `distil-logo-mono.svg`,
   `browser-extension/brand.svg` and `browser-extension/store-assets/promo-small-440x280.png`.
   The three mark-only SVGs, the app-icon SVGs, every PNG/ICO icon and `icon-version.ts` are
   byte-identical (checksums compared before and after). `docs/design/brand-assets.html`
   references the SVGs by path, so it shows the new lockup without a change.
   Sidebar (`src/components/layout/sidebar.tsx`): expanded, the brand row is `px-5` so the mark's
   ink starts at x=20.2 px, on the nav icons' left edge (nav `px-2` + row `px-3` = 20; it was
   16.2, 4 px left). Collapsed, the row is `justify-center px-0`, so the compact mark's centre is
   at 31.5 px, the same as the icons' centre in the 64 px rail (it was 30.0, inset by `px-4`).
   Measured with `getBoundingClientRect` in Chromium at 1280 × 800.
2. **Mark read is a secondary action** (`feat(reader): make Mark read a secondary action with r
hint`), `src/components/feed/detail-action-bar-content.tsx`. The filled primary button
   (113 × 44 px, `bg-primary`) is now a `variant="ghost"` button at the siblings' 44 px height,
   `text-muted-foreground` like the thumbs, with the check icon, the "Mark read" label and a
   `Kbd` hint `r` that is `hidden pointer-fine:inline-flex` (desktop only; the touch render has
   no hint). It is 139 × 44 px with the hint, 113 × 44 px without. When the item is read the
   button becomes "Mark unread" with a filled success `CircleCheck` and `text-success`, and
   clicking it calls the existing `handleMarkUnread` (same path as Shift+U); `aria-keyshortcuts`
   switches between `r` and `Shift+U`. The overflow menu keeps its Mark as unread item. The
   `useItemMutation` wiring from #129 and its tests are unchanged; the `r` shortcut
   (`reader.markRead`) marks read and advances, as before.
   The "indicator pill" under the label in Amit's phone screenshot is not a DOM element: at
   390 px width `elementFromPoint` 4 px below the button finds only the bar's flex row, the
   button has two children (icon and text), and nothing renders under it. It is the iOS home
   indicator, which sits in the `pb-safe` inset under whatever is centred in the bar. Kept, as
   it is OS chrome.

## Verification

Run locally on 2026-10-05 in the task worktree:

- `npm run check`: pass (269 suites, 2,420 tests).
- `npm run build`: pass.
- Playwright `tests/e2e/keyboard.spec.ts` and `smoke.spec.ts` on desktop-chromium and
  mobile-chromium against a dev server on port 3177 backed by a throwaway `postgres:16-alpine`
  container on port 5447 (`distil-ui-polish-postgres`, removed afterwards): 12 passed, 1 skipped,
  and 3 smoke failures that are the environment, not the change (that server had legacy
  password auth on, so the unauthenticated smoke tests landed on the sign-in page). Rerun of
  `smoke.spec.ts` the CI way (`DISTIL_TEST_MODE=1`, Playwright-launched server, both projects):
  7 passed, 1 skipped.
- Jest: `brand-assets.unit.test.tsx` gained a lockup-gap test that reads the rendered ink bounds
  (mark right edge 80, gap 24); `sidebar.component.test.tsx` asserts the 85.31 px lockup width,
  the `px-5` expanded row and the centred collapsed row; `detail-action-bar.component.test.tsx`
  asserts the ghost variant, the `r` hint, the toggle to Mark unread and back.
- Before/after PNGs (gitignored) in `dist/ui-polish/`: `sidebar-{expanded,collapsed}-{light,dark}-{before,after}.png`,
  `reader-bar-{unread,read}-{light,dark}-{before,after}.png`, `reader-bar-unread-phone-after.png`.

Not re-checked: CI, Production.

## External resources

None. The throwaway container was local and is removed.

## Next

- Amit reviews the PR (label `full-ci`), looks at the before/after PNGs and the Vercel preview,
  and decides whether the green "Mark unread" read state is the accent he wants or whether the
  label should stay muted with only the check coloured.
- Merging is a Production release and needs his authorization. Nothing deploys until then.
