---
topic: ui-modernization
title: UI audit and edition-style redesign plan (U1–U5); Codex prompt ready
date: 2026-10-01
status: planned
branch: claude/distil-ui-modernization-7680e2
---

## What changed

Docs only. Amit asked for a full review of the UI, which "fits the purpose but is starting to look
dated", modelled on modern news-digest and reading apps, and for a prompt Codex can execute. The
brief is to build on what exists and replace outright only what is stale. This entry records the
audit, the design direction, the plan (U1–U5) and the Codex prompt. No code changed.

How the audit was done: every product surface was viewed on Production (`distilai.app`, desktop
1440 px, dark theme, view-only) and on an isolated local instance seeded from
`docs/test-links/links.json` (light theme, 375 px phone), and the UI source was read
(`src/app/globals.css`, `src/components/layout/**`, `feed/**`, `phase2/**`, `src/app/feed/[id]`,
`research/**`, `settings`, `save`).

## Findings

### What works and stays

- Newsreader for reading text, the warm paper palette with one blue accent, and the calm tone.
- The summary structure in the reader (lead, named sections, bullets, quotes).
- The research report page (`/research/[id]`): large serif title, a "sections · min read ·
  sources" line, TL;DR callout, on-this-page rail. It is the best screen in the app and the model
  for the reader.
- Keyboard shortcuts, URL-as-state filters, server-rendered first page, the Filters sheet, safe-area
  handling, focus rings, 44 px touch targets, reduced-motion support.

### What makes it look dated

1. **Dashboard chrome around a reading product.** A fixed 256 px near-black sidebar stays black in
   light mode beside a paper-coloured page. A 56 px top bar holds only today's date and a theme
   toggle that the sidebar already has. On a phone the top bar is an empty strip with one icon.
2. **No imagery.** The capture worker stores `items.thumbnail_url` (og:image, YouTube, X), but the
   feed query leaves it out (`ContentItemSummary` omits it and a unit test asserts its absence) and
   no card or reader header renders it. Every list is text in bordered boxes.
3. **No hierarchy between stories.** Every Today card carries the full lead plus three or four
   bullets, so 1440×900 shows about one and a half stories and a phone shows less than one. Every
   Feed card is the same size. There is no lead story and no quick-scan density.
4. **System language on cards.** Capture method as the source ("Extension", "Manual", "Link"); a
   "medium" priority pill on nearly every item; "Why now: Item priority: medium"; "TL;DR" and "Key
   Points" headings leaking into Feed excerpts, which are cut mid-word (`stripMarkdown().slice()`
   in `content-card.tsx`); titles keeping " | TechCrunch" and " - YouTube" suffixes; X posts all
   titled "<author> on X"; video items repeating the title as the body.
5. **No layout system.** Content width is 3xl on Today, full-bleed on Feed (180-character serif
   lines at 1150 px), 2xl in the reader, 3xl to 5xl on Research. Page titles are serif 3xl bold
   (Today), sans 2xl bold (Feed, Research), serif 2xl semibold (Settings), serif display (Save).
   Arbitrary sizes: `text-[11px]` ×24, `text-[10px]` ×15, `text-[13px]` ×10.
6. **Reader hierarchy is inverted.** The title is `text-xl font-medium` (20 px) above 19 px body
   text. No hero image, read time or progress (`items.reading_progress` exists and the item-state
   API returns it; nothing shows it). Five 11 px pill toggles plus Regenerate sit between the title
   and the text. A ♦ ornament divides header and body. The bottom bar is seven unlabelled 16 px
   icons and wraps to two rows at 375 px. Highlights, note, "Archive item" and a native `<select>`
   for priority are stacked under the article. No text-size or width settings.
7. **Colour bypasses the tokens.** Raw palette classes for sources, priorities and statuses
   (`text-green-600` ×11, plus red, amber, purple, orange, blue). Unread is a blue left stripe plus
   a hover shadow.
8. **Type.** Outfit (geometric) at 10–13 px gives the template feel. `--font-mono` points at
   `--font-geist-mono`, which `layout.tsx` never loads.
9. **First-paint flicker.** The sidebar logo and the theme toggle label render wrong for a moment
   on navigation (logo missing, "Dark mode" shown while dark).
10. **Stale code.** Components with no non-test importer: `dashboard/priority-feed`,
    `dashboard/activity-timeline`, `dashboard/stats-overview`, `brief/insight-card`,
    `sources/publisher-card`, `notifications/notification-panel`, `feed/reader-view`,
    `feed/feedback-buttons`, `phase2/reader-knowledge-prototype`. `sourceIcons`/`sourceLabels` are
    defined twice with different labels (`lib/constants.ts`, `app/feed/[id]/page.tsx`).
    `KnowledgeItem` is still the "temporary Phase 2 contract" and has no image, author, time or
    area.
11. **Secondary surfaces.** Research list rows are padded cards with lowercase "failed/completed"
    pills, and failed rows say "Completed <date>". Dates are `DD/MM/YYYY` in Settings and "Sep 30,
    2026" elsewhere. Loading states are the text "Loading…"; empty states are dashed boxes.

## Direction: a daily edition, not a dashboard

| Reference                   | What to take                                                                                                                       |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Apple News (Today)          | Date-led masthead, one lead story with image, then mixed density; publisher name as the kicker; almost no badges                   |
| Kindle web/app reader       | Chrome recedes while reading; an "Aa" menu for text size, width and font; a progress indicator                                     |
| Readwise Reader, Matter     | The closest product analogues: list rows with a right-hand thumbnail and read time, summary at the top of the document, notes rail |
| Substack/Medium article top | Kicker, large title, byline · date · read time, hero image                                                                         |
| Axios, NYT "The Morning"    | An edition has a size ("6 stories · 14 min") and an end ("You're caught up")                                                       |
| `/research/[id]` (in-repo)  | Already implements the article header, meta line, TL;DR callout and side rail; reuse it for the reader                             |

Decisions built into the plan (change them in the prompt before running it if you disagree):

- Desktop keeps a left sidebar, on the page background with a hairline border, no dark slab; the
  desktop top bar goes; the date moves into Today's masthead.
- Newsreader stays for headlines and reading. Geist replaces Outfit for UI text and Geist Mono is
  loaded so `font-mono` resolves.
- Palette stays. Blue is for links, focus, the unread dot and the primary button only. Status
  colours become semantic tokens.
- Cards show the publisher, never the capture method; priority appears only when it is high.
- Thumbnails are used where captured; items without one render as a text-only variant.
- The mobile tab bar keeps its four tabs; where Research lives on mobile is a product decision and
  is out of scope.

## Plan

One task, one branch, one PR, executed by an orchestrator with parallel sub-agents.

- **U1 Foundations and shell.** Type scale and semantic colour tokens in `globals.css`; fonts;
  light sidebar; no desktop top bar; compact mobile header; shared `PageHeader`, three page
  containers (reading, list, wide), `StatusBadge`, `EmptyState`, `SegmentedControl`; fix the
  first-paint flicker.
- **U2 Card data.** Add `thumbnail_url` to the feed list query and types (update the unit test that
  asserts its absence); one display module for `displayTitle`, `publisherLabel`, `cardExcerpt` and
  read time; suppress the generic "Item priority" reason. No migration, no `full_content` in list
  payloads.
- **U3 Today and Feed.** One `StoryCard` with lead, standard and compact variants replaces
  `TodayItem` and `ContentCard`. Today becomes an edition: masthead, lead story, standard cards,
  compact rows, a "Worth revisiting" strip, an end marker. Feed becomes a constrained-width list
  with right-hand thumbnails.
- **U4 Reader.** Research-style header with hero image; Summary/Original tabs; Brief/Detailed as a
  secondary control; Regenerate and rare actions in an overflow menu; progress bar; "Aa" display
  settings in `localStorage`; a one-row action bar with a labelled primary action; highlights and
  note in a right rail on wide screens.
- **U5 Secondary surfaces and cleanup.** Research list, Save, Settings, Account, auth pages on the
  shared primitives; one date formatter; skeletons; delete the unused components.

A design checkpoint follows U3 and U4: screenshots of Today, Feed and the reader go to Amit before
U5.

## Codex prompt

```text
You are the orchestrator for one task in the Distil repo: turn the UI from a dashboard into a
"daily edition" reading product. Build on the existing code. Routes, data flow, API contracts,
keyboard shortcuts and server rendering stay; components are restyled or restructured in place.
Replace outright only what is listed under "Replace outright".

BEFORE ANYTHING
- Read AGENTS.md and run `npm run state`. If docs/state/log/2026-10-01-ui-modernization-audit.md
  is on main, read it (fuller audit); this prompt is sufficient without it.
- This is Next.js 16 with breaking changes. Read the relevant guide in node_modules/next/dist/docs/
  before writing framework-specific code.
- Branch codex/ui-modernization from current origin/main in your own worktree. One branch, one
  PR, one state-log entry (topic: ui-modernization).
- Run locally per docs/runbooks/local-development.md and seed content with the links in
  docs/test-links/links.json. Never put Production content in screenshots, files or output.

WHAT IS WRONG TODAY (verify each against current main before acting)
1. Chrome: fixed near-black 256px sidebar even in light mode; a 56px top bar holding only the
   date and a second theme toggle; on phones the top bar is an empty strip.
2. No imagery: items.thumbnail_url is captured but excluded from the feed query and never
   rendered.
3. No hierarchy: every Today card shows the full lead plus bullets (about 1.5 stories per desktop
   screen, under 1 per phone screen); every Feed card is identical and full-bleed.
4. System language on cards: capture method as source ("Extension", "Manual", "Link"), a "medium"
   pill on almost everything, "Why now: Item priority: medium", "TL;DR"/"Key Points" leaking into
   excerpts cut mid-word, titles with " | Site" / " - YouTube" suffixes, video items repeating the
   title as body.
5. No layout system: five content widths, four page-title styles, about 50 arbitrary text-[Npx].
6. Reader: title (text-xl) smaller than the body; no hero image, read time or progress; five 11px
   pill toggles above the text; a ♦ ornament; a 7-icon unlabelled action bar that wraps at 375px;
   notes, archive and a native <select> stacked under the article; no display settings.
7. Raw palette classes (text-green-600 etc.) instead of tokens; unread shown as a left stripe.
8. Outfit at 10–13px for UI; --font-mono points at a font that is never loaded.
9. Logo and theme-toggle flicker on first paint.
10. Unused components and duplicated source constants.

DESIGN DIRECTION
References: Apple News Today (date masthead, lead story, mixed density, publisher as kicker);
Kindle reader (chrome recedes, "Aa" settings, progress); Readwise Reader and Matter (list rows
with right-hand thumbnail and read time, summary on top, notes rail); Substack/Medium article
header; and this repo's own /research/[id] page, which already has the header, meta line, TL;DR
callout and side rail the reader should share.

Decisions already made; do not reopen them:
- Desktop keeps a left sidebar, on the page background with a hairline border (no dark slab in
  light mode), about 220px, still collapsible. Remove the desktop top bar; the date moves into
  Today's masthead; one theme toggle, in the sidebar. Phones get a compact header (wordmark and
  page title) above the existing four-tab bar; do not change which tabs exist.
- Newsreader stays for headlines and reading text. Replace Outfit with Geist for UI text and load
  Geist Mono so font-mono resolves.
- Keep the warm paper palette and single blue accent. Blue is only for links, focus, the unread
  dot and primary buttons. Add semantic status tokens (success, warning, danger, info) for both
  themes.
- Cards show the publisher (publication, else hostname), never the capture method. Priority is
  shown only when high, as quiet text.
- Use the captured thumbnail where present; otherwise a text-only variant. No placeholder art.

WORK
Wave 0 (you): set up, confirm the findings, and write the shared contract into the state-log
entry: token names, the type scale, the three containers (reading ~68ch, list, wide), and the
props of PageHeader, StoryCard, StatusBadge, EmptyState, SegmentedControl and the display helpers.

Wave 1 (two sub-agents in parallel)
A. Foundations and shell. Owns src/app/globals.css, src/app/layout.tsx,
   src/components/layout/**, new primitives in src/components/ui/**. Type scale and tokens, fonts,
   light sidebar, no desktop top bar, compact mobile header, PageHeader, containers, StatusBadge,
   EmptyState, SegmentedControl, flicker fix. Move the .distil-reader rules into
   src/app/reader.css (sub-agent D owns that file afterwards).
B. Card data. Owns src/lib/feed/**, src/lib/types.ts, src/lib/format.ts, a new
   src/lib/display.ts, src/components/phase2/types.ts. Add thumbnail_url to the feed list SELECT
   and types and update the unit test that asserts its absence. Add displayTitle (strips site
   suffixes), publisherLabel, cardExcerpt (the brief's lead sentence via toSummaryDigest, cut at
   a word boundary, never a heading word) and read time (SQL-derived from content length, or the
   existing duration for video). Drop the generic "Item priority: …" reason. No migration; no
   full_content in list payloads.

Wave 2 (two sub-agents in parallel, after A and B merge into the branch)
C. Today and Feed. Owns src/components/phase2/today-*.tsx, src/components/feed/content-card.tsx,
   feed-list.tsx, filter-bar.tsx, feed-filters.tsx, area-badge.tsx, a new story-card.tsx. One
   StoryCard with lead, standard and compact variants. Today: masthead (date, "N stories · M
   min"), the first priority item as lead with image, lead and up to three points; the next four
   as standard cards (title, two-line excerpt, thumbnail); the rest as compact rows; "Worth
   revisiting" as a strip; an end-of-edition marker. Feed: list container, rows with right-hand
   thumbnail, compact view = same row without excerpt. Unread = heavier title plus a dot. The area
   control stays reachable by pointer, keyboard (`a`) and touch but reads as a quiet kicker.
D. Reader. Owns src/app/feed/[id]/page.tsx, src/app/reader.css, src/components/feed/ai-summary*,
   detail-action-bar*, reader-area-badge, video-*, src/components/phase2/reader-*. Header as on
   /research/[id]: kicker (publisher · area), title at display size, byline · date · read time,
   hero image. Tabs "Summary | Original"; Brief/Detailed as a secondary segmented control;
   Regenerate, copy link, open original, deep research, archive and priority in an overflow menu
   (shadcn, no native select). A thin scroll-progress bar. An "Aa" popover (text size, line
   width, serif or sans) stored in localStorage and applied through CSS variables. Action bar on
   one row at 360px: previous, next, a labelled "Mark read" primary, like, dislike, more.
   Highlights and note in a right rail at xl and above, under the text otherwise. Video items
   show the description or a summary call-to-action, not the title again. Remove the ornament.

CHECKPOINT: stop and show Amit screenshots of Today, Feed and the reader (summary, original,
video) in light and dark at 1440 and 390 wide. Continue when he approves the direction.

Wave 3 (two sub-agents in parallel)
E. Secondary surfaces. Owns src/app/research/**, src/components/research/**, src/app/save/**,
   src/components/capture/**, src/app/settings/**, src/components/settings/**,
   src/components/account/**, and the sign-in, invite, reset-password, onboarding and
   access-denied pages. Move them onto PageHeader, the containers, StatusBadge and EmptyState;
   research list as rows with sentence-case status and no "Completed" date on failed runs; one
   date formatter in src/lib/format.ts; skeletons instead of "Loading…".
F. Cleanup. Delete components with no non-test importer (confirm each with grep first) and their
   tests: dashboard/priority-feed, dashboard/activity-timeline, dashboard/stats-overview,
   brief/insight-card, sources/publisher-card, notifications/notification-panel,
   feed/reader-view, feed/feedback-buttons, phase2/reader-knowledge-prototype. Remove the
   duplicate source constants.

Wave 4 (you): integrate, review every diff, run the checks yourself, take the screenshots, write
the state-log entry, open the PR.

REPLACE OUTRIGHT
The desktop top bar; TodayItem and ContentCard (replaced by StoryCard); the reader header,
ornament, pill controls and action-bar layout; priority pills and capture-method labels on cards;
"Loading…" text and dashed empty boxes; the unused components above.

GUARDRAILS
- No route, API, schema or migration change. The only data change is the feed list query in B.
- Keep: server-rendered first page on / and /feed; URL-as-state filters; every FEATURE_* flag;
  data-row, data-item-id, data-search-input and data-load-more; every shortcut in the help
  dialog; every aria-label, role and aria-keyshortcuts unless its test changes in the same
  commit.
- Remote images are plain <img> with loading="lazy", decoding="async",
  referrerPolicy="no-referrer", a fixed aspect-ratio box, and hidden on error. No next/image
  remote patterns, image proxy or third-party favicon service.
- No new runtime dependencies beyond next/font families and shadcn primitives added with
  `npx shadcn@latest add`.
- Server-only modules are never imported from client components; environment variables only
  through src/lib/config.ts.
- No folder moves or mass renames. Tests are updated, not deleted, except those of deleted
  components.
- WCAG AA contrast in both themes, 44px touch targets, visible focus, reduced motion respected.
- Sub-agents own non-overlapping files as listed; you verify and merge their work into the one
  branch. Do not trust a sub-agent's "done" without re-running the checks.

ACCEPTANCE
1. No text-[Npx] in src/app or src/components outside components/ui; no raw palette utilities
   ((text|bg|border)-(red|green|amber|orange|purple|blue)-NNN) outside the token definitions.
2. Every page uses PageHeader and one of the three containers.
3. Today shows at least four headlines above the fold at 1440×900 and at least three at 390×844.
4. No card shows "TL;DR", markdown remnants, a mid-word cut, a " | Site" title suffix, a capture
   method or a medium/low priority.
5. Items with a thumbnail show it in Today, Feed and the reader header; items without one render
   cleanly; images cause no layout shift.
6. Reader at 360px: one-row action bar, title clearly larger than body, progress visible, "Aa"
   settings survive a reload.
7. Light sidebar in light mode, no desktop top bar, no logo or theme flicker on first paint.
8. `npm run check` passes. `npm run test:e2e` passes on the desktop and mobile projects,
   including tests/e2e/keyboard.spec.ts.
9. Before/after screenshots (seeded test links only) in the PR: Today, Feed, reader (summary,
   original, video), Research list and report, Save, Settings; light and dark; 1440 and 390.

FINISH
Add docs/state/log/<date>-ui-modernization-<slug>.md with what changed, checks run and results,
and what is unfinished. Open one PR. Do not merge: merging to main deploys to Production while
the release pin is unpinned, and that needs Amit's go-ahead for this task.
```

## Verification

- Locally verified: the findings above against Production as served on 2026-10-01 (view-only: no
  item state, setting or filter preference was changed) and against this branch's source at
  `4d06290`.
- The local instance used a throwaway PostgreSQL container created for this audit
  (`distil-ui-audit-postgres`, loopback port 5439), provisioned with `scripts/local-db-reset.ts`
  and seeded with three links from `docs/test-links/links.json` plus one public essay (a fifth
  capture failed). The shared `distil-local-postgres` database was not modified.
- Not run: `npm run check` (docs-only change; `npm run state:check` and Prettier pass on this
  file).

## External resources

None changed. Production was read through a signed-in browser session only.

## Next

- Amit reviews the direction and the built-in decisions, edits the prompt if he disagrees with
  any, and gives it to Codex as one task.
- Codex stops at the checkpoint after the Today, Feed and reader work for a direction review, and
  again before merging.
- This entry ships as a docs-only PR from `claude/distil-ui-modernization-7680e2`. Codex can read
  it once that PR is merged; the prompt works without it.
- The audit container can be removed with `docker rm -f distil-ui-audit-postgres`.
