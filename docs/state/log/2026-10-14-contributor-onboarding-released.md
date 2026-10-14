---
topic: contributor-onboarding
title: One-command local setup and contributor PR path (#144) released
date: 2026-10-14
status: released
branch: claude/epic-cerf-9ec76a
pr: 144
---

## What changed

Docs only. PR #144 (squash commit `d40d64f2`, merged 2026-10-05 08:28 UTC) was merged with
Amit's authorization and Vercel deployed it to Production. `npm run setup`, `CONTRIBUTING.md`,
the PR template and the `/setup-local` skill are on `main`. The work is described in
`2026-10-03-contributor-onboarding.md`; the merge evidence is in
`2026-10-14-release-train-closeout-october.md`.

## Verification

Derived from `gh` on 2026-10-14: the merge commit and the `success` Production deployment
status. The setup script was not re-run for this entry.

## External resources

none

## Next

1. Amit: try `npm run setup` once on a second machine or a fresh clone, then hand new
   contributors `CONTRIBUTING.md` plus repository access.
2. Unverified by the task: a cold npm cache or Docker image, Windows (WSL expected), and the
   interactive "wipe the database?" prompt on a re-run. `.claude/launch.json` is gitignored and
   stale; harmless.
