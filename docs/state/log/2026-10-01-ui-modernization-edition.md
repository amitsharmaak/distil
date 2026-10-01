---
topic: ui-modernization
title: Daily edition UI modernization — text-first reader revision for review
date: 2026-10-01
time: 09:11
status: in-progress
branch: codex/ui-modernization
---

## Scope and ownership

Base: `aa63baa9df4cd257eb914075c6097ecbc2665ae3` (`origin/main`, freshly fetched).
One branch and PR; root Codex integrates and verifies. No merge or Production deployment.
The user requires a visual approval checkpoint after Wave 2, before secondary surfaces/cleanup.
Root owns this single task entry, local fixture setup, screenshots and cross-surface integration.
Sub-agents edit disjoint files in the task worktree; root alone commits their integrated work.

- A, Wave 1: globals/layout, layout components, shared UI primitives; move reader CSS, then
  hand its ownership to D.
- B, Wave 1: feed queries/mapping, types, format/display helpers and associated tests.
- C, Wave 2: Today, Feed, StoryCard, filters/area controls and associated tests.
- D, Wave 2: reader page/CSS, summary/video/actions/knowledge components and associated tests.
- E/F, Wave 3: secondary surfaces and confirmed unused-component cleanup respectively, after
  Amit approves the screenshots. Root handles gaps outside their ownership lists.

## Shared design contract

**Amit's reader principle (revision after first review):** minimize clutter while consuming
information. Today and Feed retain their blended imagery; the reader follows Safari Reader's
text-first direction. One centered text column, no captured hero image, no persistent sidebar or
notes rail. Original inline images remain when part of the content; video playback and
notes/highlights open on demand. This explicitly supersedes the original reader-hero and xl-rail
requirements, while retaining card imagery and existing functionality.

Warm paper and existing blue primary remain. Semantic CSS variables and Tailwind colors:
`success`, `success-foreground`, `success-muted`; `warning`, `warning-foreground`,
`warning-muted`; `danger`, `danger-foreground`, `danger-muted`; `info`, `info-foreground`,
`info-muted`. Each status color is readable on the page; `*-muted` is the tinted badge surface;
`*-foreground` is readable on that tinted surface. Both light and dark define every token.
Blue is reserved for links, focus, unread and primary actions. Sidebar uses page background.

Fonts: Newsreader (`font-serif`) for headlines and reading; Geist (`font-sans`) for UI;
Geist Mono (`font-mono`) for keyboard/code. Type scale: `text-xs` (12) for supporting metadata,
`text-sm` (14) for controls/meta, `text-base` (16) for UI body, `text-lg` (18) for row headlines,
`text-xl` (20) for section heads, `text-2xl` (24) for story heads. Shared `text-page-title`
fluid 30–40px and `text-display` fluid 32–48px. No arbitrary `text-[Npx]` outside UI primitives.
Reader text defaults to 19px through reader CSS variables. Controls use at least 44px targets.

Three container classes: `distil-container-reading` (68ch), `distil-container-list` (960px),
`distil-container-wide` (1200px), all centered and width 100%. `PageContainer` in
`components/ui/page-header.tsx` accepts `size: "reading" | "list" | "wide"`, `className`,
`children` and div HTML attributes. Reader width controls refine its reading column only.

Shared component props (optional unless stated required):

- `PageHeader` (`ui/page-header.tsx`): required `title: ReactNode`; `eyebrow`, `description`,
  `meta`, `actions`: ReactNode; `className`, `titleClassName`: string; `display: boolean`.
  Renders exactly one h1; use `eyebrow` for date/publisher and `meta` for counts/byline.
- `StatusBadge` (`ui/status-badge.tsx`): required `children`; `tone: "neutral" | "success" |
"warning" | "danger" | "info"` (default neutral); span HTML attributes.
- `EmptyState` (`ui/empty-state.tsx`): required `title: string`; `description`, `action`,
  `icon`: ReactNode; `className: string`. Solid hairline or open space, no dashed box.
- `SegmentedControl<T extends string>` (`ui/segmented-control.tsx`): required `value: T`,
  `onValueChange(value: T)`, `options: {value: T; label: ReactNode; disabled?: boolean}[]`,
  `aria-label: string`; `className: string`. Accessible radiogroup with arrow-key behavior.
- `StoryCard` (`feed/story-card.tsx`): required `item: ContentItem | KnowledgeItem`;
  `variant: "lead" | "standard" | "compact"` (default standard), `className: string`,
  `filter: string`, `onMarkRead(id, read)`, `areaOpen: boolean`, `onAreaOpenChange(open)`.
  Owns `data-row`, `data-item-id`, publisher/headline/excerpt/image/read time; callers may
  wrap it in an li but must not duplicate the navigation row marker. No capture-method labels.
  All images: plain img, lazy/async/no-referrer, fixed aspect ratio, hidden on error.

Client-safe `lib/display.ts` helpers:

- `displayTitle(item: Pick<ContentItem, "title" | "url"> & Partial<ContentItem>): string`
  strips matching publisher/hostname suffixes, including YouTube, with readable fallback.
- `publisherLabel(item: {publication?: string; url?: string}): string` publication then hostname.
- `cardExcerpt(item: Partial<ContentItem>, maxLength = 180): string` derives brief lead via
  `toSummaryDigest`, strips headings/markdown, trims on words, suppresses title-only video text.
- `readingMinutes(item: Partial<ContentItem>): number` uses list `readingMinutes` from SQL,
  duration for video, or detail text length, with a minimum of one for nonempty content.
- `readTimeLabel(item: Partial<ContentItem>): string` uses video duration or `N min read`.
- `formatDate(value: string | Date, options?: Intl.DateTimeFormatOptions): string` in format.ts.

`ContentItem.readingMinutes?: number` and `KnowledgeItem` optional thumbnailUrl, readingMinutes,
duration, url, publication, author, createdAt, contentType, priority, area, aiArea, aiSummary.
KnowledgeItem retains its existing required fields and href. Feed query alone adds thumbnail_url
and SQL-derived reading_minutes; no broad repository projection change, full_content payload,
API route, schema, migration, feature flag or URL filter/SSR change.

## Findings verified against base

Code confirms the 256px dark light-mode sidebar, duplicate desktop topbar/theme toggle, missing
feed thumbnail projection, full digests on every Today item, raw capture labels and priority
pills, arbitrary small text and palette classes, reader title/ornament/pill/action layout, unloaded
mono font, and duplicated source constants. Theme-dependent label markup starts from a light
server snapshot; first-paint visuals remain to be checked in browser. Unused imports will be
confirmed per component before Wave 3 deletes anything. Audit PR #128 exists on another branch;
the audit file is absent from this base main. The user's attached brief is the task scope.

## Verification

Wave 1 integrated as `382d659`: editorial shell/primitives/fonts/tokens and feed-only display metadata.
Root independently ran typecheck and 11 focused suites (120 tests), all passed. B also ran eight
feed-query integration cases in a disposable Testcontainers PostgreSQL, all passed. A reported
semantic badge contrast of 5.72–8.21:1; root browser accessibility results follow below.

Baseline capture: 36 combinations (nine surfaces, light/dark, 1440/390), plus full-page versions,
under local ignored `test-results/ui-modernization/before/`. No browser page errors. Today fit two
headlines at 1440×900 and one at 390×844. Settings overflowed at 390px in both themes; E owns the fix.
Seven of eight registered links captured locally, with six real thumbnails. Brief/detailed summaries
and two research reports are deterministic local fixtures; meeting-note body/title were replaced
with synthetic content before the final baseline capture. No provider keys or Production data.

Wave 2 implementation is complete in this checkpoint commit: Today has a lead, four standard
stories, compact remainder and revisit strip; Feed uses shared story rows and publisher/read-time
metadata. Reader has the larger header, fixed-ratio hero/video poster, Summary/Original tabs,
Brief/Detailed control, persistent Aa settings, progress, one-row actions and notes/highlights rail.
Read-time policy is identical between list SQL metadata and detail fallback. Excerpts omit
label-only TL;DR introductions. URL filters, SSR, flags, API paths and shortcut handlers remain.

Root verification at the Wave 2 checkpoint:

- `npm run check`: passed, 256 suites / 2,140 deterministic tests; TypeScript and formatting
  passed, ESLint has five pre-existing warnings and zero errors.
- Browser axe WCAG A/AA: no violations across all 20 checkpoint view/theme/width combinations;
  no horizontal overflow. Final screenshots report no page errors.
- Today: five complete headlines at 1440×900 and three at 390×844, excluding the fixed phone
  tab bar. Feed: four and three respectively.
- 360px reader interaction smoke: all action targets at least 44×44, one row; title 32px versus
  body 19px; Aa size/width/typeface survived reload; Summary/Original and Brief/Detailed
  shortcuts, overflow actions, progress, note persistence/deletion and poster-to-player passed.
- Desktop/phone keyboard smoke passed: Today → Feed, row navigation, area menu, open reader,
  return, help and search focus. This is a checkpoint smoke, not the final `test:e2e` run.
- Final official desktop/mobile Playwright suite, including `tests/e2e/keyboard.spec.ts`, remains
  pending for Wave 4, after secondary surfaces and cleanup.

Visual evidence: `test-results/ui-modernization/checkpoint/` has Today, Feed and reader
summary/original/video, both themes at 1440×900 and 390×844 (20 viewport screenshots plus full-page
versions). `gallery.html` in its parent is the before/after review, served locally at
`http://localhost:3303/gallery.html`. `checks.json`, `card-inspection.json`,
`reader-inspection.json` and `keyboard-inspection.json` hold the local measurements. Baseline and
checkpoint evidence are ignored local artifacts, retained in this worktree for final PR evidence.

## Reader revision after visual feedback

First checkpoint: `d80dceb`. Amit approved the imagery on the larger discovery pages and asked
for a Safari Reader-like, uncluttered consumption view. The revision in this checkpoint removes
article heroes, collapses video playback behind a compact control, and centers the text at all
widths. Notes/highlights sit behind a disclosure after the article and open automatically on text
selection. Summary/Original and Brief/Detailed share one understated toolbar. The reader shell
hides desktop navigation by default; the existing `[` shortcut reveals/hides it. Back and theme
controls scroll away. Today and Feed retain their approved design.

Root re-ran `npm run check`: 256 suites / 2,141 tests passed, including TypeScript/formatting and
zero lint errors (five pre-existing warnings). Re-ran 12 reader axe/overflow combinations (three
views, two themes, two widths): no violations or horizontal overflow. Browser interaction checks
passed for sidebar shortcut, 360px action targets/row, persistent Aa settings, summary shortcuts,
overflow actions, progress, collapsed/reopened notes with save/reload/delete, and on-demand video.
Reader agent's scoped 36 tests additionally check inline original-image preservation, no hero,
selection-triggered notes, and unloading the video on collapse.

Revised screenshots replace the 12 reader views under `checkpoint/`; `first-checkpoint/` preserves
the first presented design. The gallery now defaults to reader summary and allows comparison
against either the first design or the original app. Reader inspection and screenshot scripts
remain local ignored artifacts. Official final E2E remains pending for Wave 4.

## External resources

No hosted resources changed. Dedicated Docker container `distil-ui-modernization-postgres`, bound
only to loopback port 5440. Preview at `http://localhost:3302`; baseline server has stopped after
screenshots. Local-only generated environment lives in ignored `.env.local`. Registered public URLs
were fetched through the existing capture pipeline. Screenshot/seed scripts and evidence live in
ignored `test-results/ui-modernization/`; no credentials in the state log or artifacts.

## Next

**Paused for review of the revised reader at the user-requested Wave 2 checkpoint.** No E/F work, PR, push, merge or
Production deployment yet. The task is unfinished.

1. Review the revised text-first reader with Amit. Today and Feed are accepted; continue with
   E/F once he approves the revised reader direction.
2. Resume in `/Users/amitsharma/Projects/distil-ui-modernization` on `codex/ui-modernization`.
   Run `npm run state`, verify git status/HEAD and that the owned Docker container (5440), preview
   (3302) and gallery (3303) are running. Do not reseed unless needed; scripts live in
   `test-results/ui-modernization/`. To restart preview: `npm run dev -- --webpack --port 3302`.
   To restart gallery: `python3 -m http.server 3303 --bind 127.0.0.1 --directory
test-results/ui-modernization`.
3. Launch E and F with the ownership from the user's brief. E modernizes secondary surfaces,
   including the known phone Settings overflow. F confirms importers before deleting the listed
   unused components and their tests. Root handles remaining page/container/type/token gaps.
4. Root reviews every diff, runs final `npm run check` and `npm run test:e2e` on desktop/mobile
   (including the local PostgreSQL keyboard flow). Use an isolated empty local test database so
   registered remote-image fixtures do not conflict with the E2E network guard.
5. Capture the full nine-surface, two-theme, two-width after matrix, prepare before/after PR
   evidence, update this single entry and open one PR. Do not merge without task-specific approval.
