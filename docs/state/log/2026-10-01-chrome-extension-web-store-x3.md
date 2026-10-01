---
topic: chrome-extension-web-store
title: X3 store package, privacy page and listing text ready; store submission is Amit's
date: 2026-10-01
time: 08:03
status: in-progress
branch: claude/x3-web-store
---

## What changed

X3 (unlisted Chrome Web Store listing), code side, per the X1–X3 plan:

- `npm run extension:pack` (`scripts/pack-extension.ts`) writes
  `dist/distil-extension-<version>.zip` without dependencies. It validates the manifest and the
  files it references, and the store build drops the manifest `key` and the localhost origins.
  Docs and `store-assets/` stay out of the zip. `/dist/` is gitignored.
- Public `/privacy` page (`src/app/privacy/page.tsx`), without the app shell: what the extension
  sends (URL, title, selected text, only on save), what it stores locally, AI processing by
  third-party providers, hosting, and export and deletion. Added to the Neon proxy public paths, the
  authorization matrix (19 pages) and the Neon CSRF digest fixture.
- `browser-extension/STORE.md`: listing text, single purpose, per-permission justifications, data
  usage answers, reviewer notes and the screenshot list. `store-assets/promo-small-440x280.png`
  rendered from `public/logo.svg`.
- The extension icons (previously plain purple squares) are rendered from `public/logo.svg`.
  `browser-extension/README.md` now describes the 2.0 sign-in flow and packing; it still described
  pasting a capture token.

This entry's `time` is 08:03 so it sorts after the 08:02 entry; it was written at about 07:05 UTC.

## Verification

- `npm run check` (2091 tests), `test:phase3-isolation`, `audit:phase3-security` and the 13
  extension tests pass. The pack tests read the zip back with an independent parser and check that
  repacking gives identical bytes; `unzip -t` reports no errors.
- The unzipped store build loads in Playwright Chromium: the service worker starts, the manifest has
  no `key` and only the `distilai.app` host permission, and the popup renders. As expected, Chrome
  gives it an id other than the development id.
- `/privacy` renders signed out on the local dev server at desktop and phone widths, with no console
  errors.

## External resources

None. Nothing was uploaded to the Chrome Web Store.

## Next

- Amit merges this PR so `https://distilai.app/privacy` is live.
- Amit creates the Chrome Web Store developer account (one-time fee), captures the screenshots
  listed in `STORE.md`, uploads `dist/distil-extension-2.0.0.zip`, fills the listing from
  `STORE.md`, sets visibility to Unlisted and submits for review.
- After the first upload: add the store item id to `DISTIL_EXTENSION_IDS` and deploy before
  testers install. After approval: link the store page from the README and the Settings card.
- If review asks for test credentials, that means an invitation and is Amit's decision.
