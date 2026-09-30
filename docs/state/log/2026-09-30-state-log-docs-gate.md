---
topic: state-log
title: Docs-only changes skip the full Quick gate
date: 2026-09-30
time: 18:00
status: merged
branch: claude/docs-only-ci-gate
---

## What changed

Every docs-only pull request, including each state-log entry, ran the full Quick gate (`npm ci`,
lint, typecheck, 244 Jest suites) because `ci.yml` had no path filter, and branch protection
requires the `quality-gate` check. `ci.yml` now ignores `docs/**` and `**/*.md`; the new
`docs-gate.yml` runs only for those paths and reports a job with the same name `quality-gate`
after `node scripts/state-handoff.mjs --check` and the changed-file Prettier check, installing
only Prettier at the pinned version. A change that mixes docs and code runs both workflows.

## Verification

Locally: both workflow files parse as YAML and pass Prettier; the docs-gate steps were run by hand
in a clean worktree without `node_modules` (Prettier install, state check, formatting check all
passed). The first real run is this PR's own `quality-gate` check.

## External resources

None. Branch protection is unchanged: it still requires `quality-gate` and `Vercel`.

## Next

- Vercel still builds and deploys every docs-only commit and its `Vercel` check still gates the
  PR. Skipping that needs Vercel's "Ignored Build Step" project setting and a check that a skipped
  build still reports the required status; both are Amit's to authorize.
