---
topic: reader-go-deeper
title: Reader summary: Brief / Detailed control replaced by Go deeper progressive disclosure
date: 2026-10-14
status: in-progress
branch: claude/reader-go-deeper-edfc97
---

## What changed

Executes backlog item 2 of `2026-10-03-backlog-reading-modes-feedback.md` with the direction
Amit chose on 2026-10-14: progressive disclosure inside the summary (option 3). A Detailed
summary was never a second summary; the API returns the Brief plus a "Going deeper" delta, so
the reader now treats it that way.

- `src/components/feed/ai-summary-content.tsx`: the header row keeps only the Summary /
  Original tabs; the Brief / Detailed segmented control is gone. The Summary tab always renders
  the Brief. At its end an outline button "Go deeper" (Sparkles icon, same style and
  `min-h-11` as "Generate AI Summary", title "Go deeper · D") appends the "Going deeper"
  divider and delta sections inline, generating them through the existing
  `POST /api/ai/summarize` (`length: "detailed"`) when they are not cached. The Brief stays on
  screen while the delta loads; the skeleton and the error / Try Again block sit below the Brief
  for delta requests. Once expanded the button becomes "Show less" (chevron icon) and folds the
  delta; the delta stays in component state, so reopening is instant. `d` toggles the delta on
  the Summary tab when nothing is loading (shortcut id `reader.goDeeper`, label "Go deeper /
  show less"); `s` and Shift+S are unchanged in behaviour. An item that only has a detailed
  summary (no brief row) opens fully expanded with "Show less" available; its collapsed view
  is the brief part of the stored detailed markdown. A pre-v2 detailed summary without the
  divider still renders whole when expanded.
- Regenerate (overflow menu or Shift+S) regenerates the Brief and, when the delta is open,
  then regenerates the delta with a second request, because the delta expands one particular
  Brief and a new Brief makes it stale. When the server keeps the Brief (force within the
  cooldown returns `cached: true`) the delta is kept too. With the delta folded only the Brief
  is regenerated and the stale delta is dropped, as before.
- `docs/user-guide.md`: the reader row for `d` now reads "Go deeper / show less".
- Tests: `src/components/feed/__tests__/ai-summary.component.test.tsx` rewritten for the new
  control (14 tests): expand and collapse from the button and from `d`, no request for a cached
  delta, `d` inert on the Original tab and while the delta loads, the Brief visible during the
  delta request and after a failure, retry, detailed-only items opening expanded, regeneration
  with the delta folded and open, and the cooldown case.
- Before / after screenshots in `docs/reviews/reader-go-deeper/{before,after}/` (desktop
  1280 px and phone 375 px; header, end of Brief, loading, expanded, Show less, regenerate).
- No change to the API, the feed cards, the stored summary markdown or the summarize prompts.

## Verification

Locally verified on this branch (worktree `reader-go-deeper-edfc97`, fresh `npm ci`):

- `npm run check`: lint 0 errors / 4 pre-existing warnings, typecheck 0 errors, 271 suites /
  2432 tests passed. The 26 typecheck errors seen in stale worktrees are an install artefact
  (see topic `typecheck-gate`), not present after `npm ci`.
- Docker Postgres loop (`distil-local-postgres` on 5433, `.env.local.docker`, dev server on
  port 3200, inline capture, Gemini): three items captured from `docs/test-links/links.json`.
  Item with a cached brief only: "Go deeper" generated the delta (skeleton under the Brief,
  then the divider and delta inline), "Show less" folded it, reopening sent no request; same on
  phone width. Item with both cached: opens on the Brief, `d` expanded it with no request,
  Regenerate from the overflow menu while expanded sent two summarize requests (brief, then
  detailed) and left the new delta open. Item with no summary (brief row deleted locally):
  opens on Original with the Generate AI Summary button, unchanged.
- Not verified: any Preview or Production deployment. Nothing deployed.

## External resources

None touched. Local Docker database only.

## Next

1. Amit reviews the PR on `claude/reader-go-deeper-edfc97`. Merging is a Production release and
   needs his authorization; auto-merge is not enabled.
2. After the merge, remove the worktree and local branch (AGENTS.md §7.1) and add a `merged`
   entry for this topic.
