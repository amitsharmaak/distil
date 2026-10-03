---
topic: backlog
title: Product feedback from Amit: reading modes, reader controls hierarchy, keep/vault; Today vs Feed definition
date: 2026-10-03
time: 04:40
status: ongoing
branch: claude/backlog-reading-modes-feedback
---

## What changed

Three product ideas from Amit (2026-10-03) recorded as backlog items, plus one documentation
gap. **All three are ideas from Amit, not yet decided.** No design, scope or priority has been
agreed; each item is written as a standalone brief with the current-behaviour facts so a future
agent can start without re-investigating. The "Remaining backlog" list from
`2026-10-01-backlog-jev-deferred.md` is still open and is repeated at the end.

File references were checked on `main` at the time of writing; re-verify when picking an item
up.

### Item 1: Reading modes as standing filter pills on the Feed (idea, not decided)

**What Amit wants.** When consuming he wants to be in one mindset at a time (work only, research
only, fun only) without re-applying filters on every visit. He is also saving football articles,
which fit none of the current areas well. Proposed: a row of preset pills on the Feed (for
example Work / Research / Fun) that the user can customise (name, and which area / topic / source
filters each one bundles).

**Current behaviour.**

- Areas are a fixed list, `LIFE_AREAS = ["personal", "work", "learning", "updates"]`
  (`src/lib/types.ts:11`). One area per item, AI-assigned at capture, with a per-item manual
  override (`manual_area`, migration 0013). There is no settings UI to rename or add areas.
- The Filters sheet (`src/components/feed/feed-filters.tsx:214`) has a single-select Area control
  at lines 311–320.
- The only chips today are the removable active-filter chips in
  `src/components/feed/filter-bar.tsx:171–181`.
- All filter state lives in URL params parsed by `feedFilterState`
  (`src/lib/feed/feed-url.ts:70`): `q`, `source`, `contentType`, `priority`, `topic`, `site`,
  `area` (repeatable), `archive`, `sort`, `dateFrom`, `dateTo`, `read`.

**Natural hook.** A pill row in `FilterBar` next to the chips, applying a preset as URL
`FilterUpdates`. A "Fun" mode needs either a new area or a topic-based bundle, because no current
area means "fun".

**Open questions.**

- Per-user custom areas versus a fixed list.
- Where presets are stored (per user in the database, or local to the browser).
- Whether Today should respect the active mode, or only the Feed.

### Item 2: Reader controls hierarchy (idea, not decided)

**What Amit said.** "Summary / Original / Brief / Detailed appear on one line so they feel like
four different things; Brief/Detailed only appear when Summary is selected, so the hierarchy is
confusing."

**Current behaviour.** Two separate controls share one header row inside `AISummary`
(`src/components/feed/ai-summary-content.tsx:249`):

- Summary / Original is a `Tabs` with `TabsList variant="line"` (lines 379–387).
- Brief / Detailed is a `SegmentedControl` (lines 389–401), rendered only when
  `hasAISummary && viewMode === "ai"`.

**Proposed directions (none chosen).**

- Visually subordinate Brief / Detailed to the Summary tab: an indented or secondary row under
  the tab, or a small toggle inside the summary body.
- Fold both into one control: "Brief summary · Detailed summary · Original".

### Item 3: Keeping things to refer back to, a "vault" (idea, not decided)

**What Amit wants.** Marking an item read removes it from Today and the Feed, which is correct,
but he wants a place for things he will refer back to.

**Current behaviour.**

- Read items remain reachable by turning off "Unread only" in Filters
  (`src/lib/feed/quick-filters.ts:56–61`, keyboard shortcut `u`) or via Today's "Search
  everything" link, which sets `read=true`.
- Archive is a separate action in the reader overflow menu
  (`src/components/feed/reader-knowledge-controls.tsx:121–133`) with its own page `/archive`
  (`src/lib/feed/library-experiences.ts:37–43`).
- There is no favourites, saved or vault concept.
- Highlights and notes exist only inside each article's reader
  (`src/components/feed/reader-annotations.tsx:346–363`); no page collects them across articles.

**Proposed directions (none chosen).**

- A "Keep" or star action and a Kept page.
- A Highlights & Notes page across articles.
- Clarify Archive's role in the UI.

**Open questions.**

- Is Archive already the vault and only needs surfacing?
- One list, or several (kept items, highlights, notes)?

### Note: Today vs Feed definition (documentation gap, not a feature)

No doc sentence defines the intended difference between Today and the Feed. The current
behaviour is:

- Today shows the six highest-priority unread items plus the "Revisiting" strip
  (`src/lib/feed/today-selection.ts:13–26`).
- Priority base is high 90 / medium 50 / low 20, plus a recency tie-break
  `exp(-ageDays / 10) * 10` (`src/lib/feed/feed-query.ts:311–319, 431–435`). Old high-priority
  unread items therefore legitimately appear on Today.
- Because captures were all `medium` before triage, Today behaved like "six newest unread".

Amit asked whether that is the goal. This is a product decision to write down (for example in
`docs/user-guide.md`) once he decides; it also bears on item 1's question of whether Today
respects a reading mode.

### Remaining backlog (unchanged, each becomes its own topic when picked up)

- Reading modes as filter pills on the Feed (item 1 above, idea).
- Reader controls hierarchy (item 2 above, idea).
- Keep / vault and a cross-article highlights page (item 3 above, idea).
- Today vs Feed definition to document (note above, decision awaited).
- Capture priority score and junk-page check on flash-lite
  (`2026-10-01-backlog-jev-deferred.md`).
- Performance: the Vercel + Neon cold start (`2026-10-01-backlog-jev-deferred.md`).
- Phase 4 (mobile), only on Amit's decision.

## Verification

Docs only. `npm run state:check` and a Prettier check on this file passed locally. No code,
deploy, database or environment change.

## External resources

None touched.

## Next

- Amit decides whether any of items 1–3 is wanted, and answers the Today vs Feed question so it
  can be written into `docs/user-guide.md`.
- Amit picks the next backlog item; the agent starts it with `/start-task` under its own topic.
