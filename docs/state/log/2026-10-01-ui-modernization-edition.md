---
topic: ui-modernization
title: Daily edition UI modernization — shared contract and implementation checkpoint
date: 2026-10-01
time: 08:15
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

Completed: current state/open topics and local instructions read; clean base verified; dedicated
worktree created; `npm ci` completed. No implementation checks or visual approval yet.

## External resources

None changed. Use a dedicated loopback PostgreSQL and only the registered test links/clearly
synthetic test fixtures for visual evidence. Never use Production data or credentials.

## Next

Capture baseline; execute A/B then C/D; re-run focused checks and present Today, Feed and reader
(summary/original/video) light/dark screenshots at 1440 and 390. Stop for Amit's direction
approval before E/F. Finish with full deterministic check and desktop/mobile E2E, final screenshot
matrix, and one unmerged PR.
