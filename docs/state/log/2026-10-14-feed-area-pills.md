---
topic: feed-area-pills
title: Reading-mode pills on the Feed; Personal area widened to sports and entertainment
date: 2026-10-14
status: in-progress
branch: claude/feed-area-pills-43260d
---

## What changed

Executes item 1 of `2026-10-03-backlog-reading-modes-feedback.md` (reading modes as standing
filter pills) with the decisions Amit took on 2026-10-14:

- **Areas stay fixed at four.** No custom areas, no user-defined presets. A reading mode _is_ an
  area: the pills are All · Personal · Work · Learning · Updates.
- **"Fun" content belongs under Personal.** The classifier's Personal definition now includes the
  sports, entertainment and interests Amit follows for enjoyment (football articles, match
  reports, club and player news, films, music, television, games), even when they read like news
  or explain something. A digest that merely lists headlines (a match-day round-up) stays Updates,
  as the Updates rule already read. Prompt version `area-v1` → `area-v2` (still not stored).
  **Existing items were not reclassified**; the per-item correction remains the fix.
- **One pill row, on the Feed only.** Directly under the Feed header row. Today and Archive are
  unchanged: Today keeps the same `FilterBar` and its area chip.
- **Remembered per browser.** The last chosen area is kept in `localStorage` under
  `distil.feed.area`. Opening the Feed with no `area` in the URL navigates to the remembered
  area, so the URL stays the single source of truth; a URL that names an area wins. Choosing All,
  or Clear, forgets it. Storage access is wrapped in try/catch; without storage the URL still
  works.

Implementation:

- `src/components/feed/area-pills.tsx` (new): `AreaPills`, a `radiogroup` named "Reading mode"
  built from `AREA_OPTIONS`, arrow-key roving like `SegmentedControl`, the bar's `pillClass` and
  `rowClass` (one horizontally scrolling row, no wrapping, fits 360px). `useAreaShortcuts` binds
  `1`–`5` to the pills in row order (group "Reading mode", scope `list`), the same digit pattern
  Settings uses for its tabs.
- `src/lib/feed/area-memory.ts` (new): `readRememberedArea` / `rememberArea`.
- `src/lib/feed/quick-filters.ts`: `activeFilterChips(state, { includeArea })`; the Feed passes
  `false` because the pill row already shows the area. `CLEAR_ALL_FILTERS` unchanged.
- `src/components/feed/filter-bar.tsx`: new `areaPills` slot rendered between the header row and
  the chips; when present the area chip is dropped; `pillClass` and `rowClass` exported.
- `src/components/feed/feed-list.tsx`: renders the pills, writes `area` through the existing
  `replaceFilters` (native history, pending-navigation placeholder), remembers the area whenever
  an update touches `area`, and on mount applies the remembered area when the URL has none.
- `src/lib/prompts/classify-area.ts`: Personal definition and version as above.
- Docs: "Reading modes" in `docs/user-guide.md` (plus the `1`–`5` row in the shortcuts table);
  `docs/intelligence-layer.md` §3.3 and the prompt-version tables.
- Tests: `area-pills.component.test.tsx`, `area-memory.unit.test.ts`,
  `quick-filters.unit.test.ts` (new); `filter-bar`, `feed-list` and `classify-area` suites
  extended (pill select, sheet sync both ways, remembered on next open, All and Clear forget,
  digit shortcuts, chip change, Personal definition).

## Verification

Locally verified on this branch (2026-10-14):

- `npm run check` (lint incl. Prettier and `state:check`, typecheck, jest): exit 0, 274 suites / 2451 tests (the three new suites included; `main` had 271 / 2428).
- Docker loop: private PostgreSQL `feed-area-pills-postgres` on 127.0.0.1:5443, provisioned with
  `scripts/local-db-reset.ts`, four captures saved through `/save`; dev server on :3104 (this
  branch) and :3105 (a throwaway detached checkout of `origin/main` for the "before" shots).
  Checked in the built-in browser at desktop width and at 360px: the pill row sits under the header row; Work
  pill → URL `?area=work`, list narrowed, Filters badge 1, sheet's Area control shows Work, no
  area chip; Learning chosen in the sheet → Learning pill checked, `distil.feed.area`
  = `learning`; All → `/feed`, storage cleared; `4` / `1` keys pick Learning / All; opening
  `/feed` with a remembered area navigates to `?area=<area>`, and stays on `/feed` after All.
  At 360px (Playwright, `deviceScaleFactor` 2) the row measures 360/360 px: one row, all five
  pills visible, no wrap and no scroll. Before/after PNGs (gitignored) in
  `dist/feed-area-pills/` and `~/Downloads/feed-area-pills/`:
  `feed-header-{desktop,phone360}-{before,after}.png`. The `Failed to fetch RSC payload for /`
  console error seen once on the dev server is the Today prefetch during an inline capture, not
  this change.
- Not run: integration, e2e and extension suites (no database, query or extension change).

Not deployed. Merging is a Production release and needs Amit's authorization.

## External resources

none

## Next

1. Amit: review the PR (before/after screenshots in the description) and merge when CI is green;
   the merge is a Production release and needs his authorization.
2. Amit, after the deploy, on `distilai.app`: open the Feed, pick Work, go to Today and back, the
   Feed should open on Work; pick All, reload, it opens on All. Save a football article and check
   it lands in Personal; a wrong area is still fixed with the per-item area menu.
3. Later, if wanted: a one-off reclassification of items currently in Updates or Learning that
   are really sports or entertainment. That is a separate task (the backfill job exists in
   `src/lib/jobs/area-backfill.ts`); it was deliberately not run here.
