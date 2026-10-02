---
topic: backlog
title: Housekeeping done, legacy alias removed; capture diagnostics item closed as delivered
date: 2026-10-01
time: 07:41
status: ongoing
branch: claude/housekeeping-legacy-alias
---

## What changed

This entry supersedes the "Remaining backlog" list in `2026-10-01-backlog-orphan-jobs-s3-dropped.md`.
Both housekeeping items are closed, and the capture diagnostics item is closed as already delivered.

**Legacy Vercel alias removed (Amit, 2026-10-01)**

- Amit removed `distil-pv-1850.vercel.app` with `vercel alias rm`; the CLI reported the alias as
  removed. Before removal it pointed at the Performance P1 Production deployment
  `dpl_HMjgEvzutvgy3xZNxyBBHeAn65tJ` (2026-09-17, commit `f2e4155`), not at current releases.
- Nothing in code, scripts, CI, the extension manifest, the iPhone Shortcut docs or allowed origins
  referenced the alias. Only `AGENTS.md` §9 did: the release gate now requires only `distilai.app`
  to resolve to the released commit and notes the alias removal. No other live doc mentioned it.
- That deployment's own immutable URL still exists. Deleting old deployments is a separate
  decision and was not done.

**Local cleanup (with Amit's approval)**

- 16 worktrees and 27 merged local branches were removed. Each one's PR had been squash-merged from
  its exact tip, or its tip was already in `main`; none had uncommitted changes.
- Codex's `codex/*` worktrees were left untouched.
- The `jabra-evolve-mic-test` worktree had already been removed earlier; its leftover Claude
  transcript folder was deleted.

**Capture diagnostics in Settings closed as already delivered**

- It shipped as phase I3 of admin-invitations: an admin-only Settings → Troubleshooting tab
  (`src/components/capture/capture-diagnostics.tsx`, rendered under `isAdmin` in
  `src/app/settings/page.tsx`) that lists rejected or failed captures and shows a failure-count
  badge. Recorded in `2026-09-30-admin-invitations-i1-i3.md` and verified on Production on
  2026-10-01 (topic `admin-invitations`, status `released`). The backlog line predated I3.

**Remaining backlog (each becomes its own topic when picked up)**

- Classifier model (inline-search decision 12), waiting on Amit naming the model.
- Performance: the Vercel + Neon cold start.
- Phase 4 (mobile), only on Amit's decision.

## Verification

Observed by the orchestrator after the removal: `https://distil-pv-1850.vercel.app/api/health`
returned 404 and `https://distilai.app/api/health` returned 200. This branch is docs-only:
`npm run state:check` and Prettier check on the changed files passed. No deploy; no database or
environment change.

## External resources

- Vercel alias `distil-pv-1850.vercel.app`: removed by Amit on 2026-10-01. It pointed at
  deployment `dpl_HMjgEvzutvgy3xZNxyBBHeAn65tJ`, which still exists.

## Next

- Amit picks the next backlog item.
