---
topic: state-log
title: Vercel skips the build for docs-only commits
date: 2026-09-30
time: 19:00
status: merged
branch: claude/vercel-ignore-docs-builds
---

## What changed

Part two of the docs-only CI reduction. `vercel.json` now sets `ignoreCommand` to
`scripts/vercel-ignore-build.sh`, Vercel's Ignored Build Step, which overrides the dashboard
setting. The script diffs `HEAD` against `VERCEL_GIT_PREVIOUS_SHA` (the last successful deployment
of that branch) and exits 0 (skip) only when every changed file is under `docs/`, is a Markdown
file, or is under `.github/`; a missing or unknown previous SHA, or any other change, exits 1
(build). `docs/vercel-deployment.md` documents it. No Vercel dashboard setting was changed.

## Verification

Locally verified against real commit ranges on `main`: docs-only ranges exit 0, ranges containing
code exit 1, an empty or unknown previous SHA exits 1. Not yet verified: how Vercel's required
`Vercel` status check appears on GitHub when the build is skipped. Vercel's docs say the commit
status indicates when a commit "skipped its Vercel deployment", and one report describes a
`success` status labelled "Canceled by Ignored Build Step". The first docs-only PR after this
merges is the test.

## External resources

None changed. Branch protection still requires `quality-gate` and `Vercel`.

## Next

- Merge this PR (it changes `vercel.json`, so it builds and deploys normally).
- Open the next docs-only PR and confirm the `Vercel` check goes green without a build. If it
  never reports, remove `Vercel` from the required checks on `main` (Amit's decision) or revert
  `ignoreCommand`.
