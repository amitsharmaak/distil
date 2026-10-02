---
topic: logo-direction
title: Logo branch synced with main after the UI rewrite (#132); BrandMark removed
date: 2026-10-02
time: 11:52
status: in-progress
branch: codex/logo-direction
pr: 133
---

## What changed

Phase R6 of `2026-10-01-release-train-open-prs-plan.md`: `origin/main` at `e23b8fe` (the UI
rewrite, #132) was merged into `codex/logo-direction` (merge commit `487b233`, no rebase). #132
had added its own `src/components/layout/brand-mark.tsx`, the old gradient funnel. The rule
applied everywhere: keep #132's layout, spacing and class conventions; render the approved
`DistilLogo` as the mark.

- `src/app/login/page.tsx`: #132's `PageContainer` and `PageHeader` are kept; `BrandMark` is
  replaced by `DistilLogo` at the reviewed 40 px height.
- `src/components/auth/sign-in-card.tsx`: #132's `PageHeader` is kept; the logo from #133 sits
  above it.
- `src/components/layout/sidebar.tsx`: #132's shell (`distil-sidebar`, `data-collapsed`, the
  `h-20` brand row) is kept. The funnel and the adjacent text "distil" are replaced by one
  `DistilLogo` (full lockup expanded, `compact` when collapsed) at 28 px.
- The sidebar test asserts an inline SVG, height 28 and both lockup paths.
- `src/components/layout/brand-mark.tsx` is deleted in follow-up commit `3c2cd81`. It had no test
  of its own, and no other file referenced `BrandMark`.
- `package.json` and the lockfile merged without conflict (`sharp` pin and the `brand:*` scripts
  kept); `npm install --package-lock-only` produced no change.
- #132 did not touch `src/app/manifest.ts` or the extension's popup and options files, so #133's
  theme colours and extension styling stand unchanged. Headings beside the logo use #132's
  `PageHeader` typography. The lockup's wordmark is outlined artwork and uses no font.

Not changed: the mobile top bar (`src/components/layout/topbar.tsx`) from #132 shows the word
"distil" as serif text, not the funnel, so it was left as is. See Next.

## Verification

All local, on the merged tree:

- `npm run check`: pass, 261 suites / 2299 tests. `npm run build`: pass.
- `npm run brand:check`: all 23 assets match.
- `npm run test:extension`: 13/13 pass.
- `npm run test:e2e` (desktop Chromium, mobile Chromium, mobile WebKit; isolated dev server, no
  hosted database or provider keys): 33 pass, 12 skipped by their own preconditions, 0 fail.
- Seen rendered on a local dev server with no database: `/login`, `/sign-in` (light and dark)
  and the sidebar expanded and collapsed (light). The server was stopped afterwards.
- Not checked: GitHub CI on the new head, the Vercel Preview, installed PWA and iOS/Android
  icons, and the extension in a real browser profile.

## External resources

None mutated. The branch was pushed to `origin/codex/logo-direction` with a plain push. PR #133
remains a draft; its labels and state were not changed. No Production release, no database
access and no Chrome Web Store upload.

## Next

- Amit: add `full-ci`, mark #133 ready and squash-merge when CI is green (a Production release
  needing his authorization), then do the Production eyeball check listed under R6.
- Amit: after the release, `npm run extension:pack` and the Chrome Web Store upload. The
  extension version is still 2.0.0; bump it only if 2.0.0 was already uploaded.
- Decision for Amit: whether the mobile top bar's text "distil" should become the `DistilLogo`
  lockup. It is a small follow-up and also changes one assertion in the top bar test.
