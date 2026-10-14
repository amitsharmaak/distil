---
topic: today-edition
title: Today is a daily edition: 7-day window, fill from older unread, manual high overrides
date: 2026-10-14
status: in-progress
branch: claude/today-edition-009116
pr: 151
---

## What changed

Closes the "Today vs Feed definition" gap recorded in
`2026-10-03-backlog-reading-modes-feedback.md`. Until now Today was one feed query (unread,
`sort=priority`, limit 6) with no date bound: a priority queue that drained only when the reader
acted, so old high-scored items crowded out new captures.

**Decision (Amit, 2026-10-14): Today is a daily edition.** The best of what was saved in the last
7 days, ranked by score. When fewer than six unread items from the last 7 days exist, older unread
items fill the remaining places by score and are visibly marked as fill. An item with manual
priority high qualifies at any age until it is read or archived, and sits above the windowed
items because the ranking already treats manual priority as absolute. Revisiting is unchanged.
The Feed is unchanged.

Implementation, one PR on this branch:

- **Feed query layer** (`src/lib/feed/feed-query.ts`): new `FeedQuery.recentWindowDays`. The SQL
  score gains `RECENT_WINDOW_TIER` (10 000) for rows with `manual_priority='high'` or
  `created_at` within the window, so one ordered query returns the window first and the fill after
  it, and the keyset cursor stays a plain score comparison. `explainFeedRank` mirrors it
  (`inRecentWindow`, `components.recentWindowBoost`) and puts the edition's line first in
  `reasons`: "Saved in the last 7 days", "Older, still unread" (or "Saved more than 7 days ago"
  for a read item) and "Marked high priority · stays on Today until read". `recent` and
  `relevance` sorts ignore the option.
- **Query contract** (`src/lib/feed/feed-params.ts`): `recentDays` (1–90) parsed by the same
  schema the API and the page use; `TODAY_FEED_QUERY` in `today-selection.ts` sends
  `recentDays=7` (`TODAY_WINDOW_DAYS`). Filtered Today, "Search everything" and the Feed do not
  send it.
- **Today cards** (`src/components/phase2/today-prototype.tsx`): the Priority Reading cards now
  print the first ranking reason under the story, as the Worth Revisiting strip already did, so
  the fill is visible. Legacy "Item priority:" lines stay hidden.
- **Docs:** `docs/user-guide.md` gains "Today and the Feed" (the definition in three sentences;
  it is also Q5's labelling rule). `docs/intelligence-layer.md` §3.4 S4 records the decision, the
  tier and points Q5 at the guide sentence.

## Verification

Locally verified on this branch (worktree `.claude/worktrees/today-edition-009116`, fresh
`npm ci`):

- Unit: `src/lib/feed/__tests__/feed-query.unit.test.ts` (recent beats older regardless of score,
  manual high from any age, manual medium does not override, mixed-set order, distinct reasons,
  the Feed unchanged, one SQL statement with the window CASE over unread active rows),
  `today-selection.unit.test.ts` (the Today query carries `recentDays=7`, filtered views do not,
  cards show `reasons[0]`), `today-prototype.component.test.tsx` (reason lines rendered, legacy
  lines hidden), `today-experience.component.test.tsx` and the feed route contract test updated
  for the new parameter.
- PostgreSQL integration (`feed-query.integration.test.ts`, testcontainers): seeded recent
  low/medium, old high/medium, old manual high, read and archived manual high, recent read;
  Today returned old-manual-high, recent-medium, recent-low, old-high, old-medium with the three
  reasons; read and archived excluded; keyset paging across the window/fill boundary stable; the
  Feed's priority sort unchanged. 9 tests pass.
- Local loop: private `postgres:16-alpine` container on 127.0.0.1:5442 (`today-edition-postgres`),
  worktree `.env.local` built from the Docker env, `scripts/local-db-reset.ts`, nine seeded items
  (2/4/6 days old; 20/30/60 days old; a 90-day manual high; an old read high; an old archived
  manual high). Today at `http://localhost:3000/` showed, in order: Old manual high ("Marked high
  priority · stays on Today until read"), Recent high, Recent medium, Recent low ("Saved in the
  last 7 days"), Old high, Old medium ("Older, still unread"); the read and archived items absent;
  the 60-day low beyond the six. No console errors.
- Gate: `npm run check` passes (eslint 0 errors and 4 pre-existing warnings in untouched files,
  Prettier, `state:check` 90 entries, `tsc` 0 errors after a fresh `npm ci`, Jest 271 suites /
  2438 tests). The 26 typecheck errors reported earlier on `main` were a stale worktree
  `node_modules` (see `2026-10-14-typecheck-gate.md`), not code.

Not verified: Production (nothing deployed); Amit's own local database was not touched.

## External resources

None.

## Next

1. Amit reviews the PR. Merging is a Production release under `AGENTS.md` §9 and needs his
   explicit authorization; auto-merge is not enabled.
2. After merge, from the main checkout: `git fetch origin --prune && git merge --ff-only
origin/main`, remove the worktree (save its `.env.local` first if wanted) and the local branch,
   stop the dev server, and `docker rm -f today-edition-postgres`.
3. Follow-ups, each its own topic when picked up: the `rank-v1` replay against Amit's must/nice/
   skip ratings now has its labelling rule (Q5 in `2026-10-01-intelligence-layer.md`); the
   `feedUrlForSearch` whitelist in `src/app/search/feed-url-for-search.ts` does not carry
   `recentDays` (old `/search` URLs never used it).
