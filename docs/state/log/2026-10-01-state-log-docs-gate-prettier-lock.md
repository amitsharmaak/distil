---
topic: state-log
title: Docs gate installs the lockfile's Prettier, not the caret range
date: 2026-10-01
status: merged
branch: claude/docs-gate-prettier-lock
---

## What changed

The docs gate (`.github/workflows/docs-gate.yml`, PR #110) installed
`prettier@<package.json range>`, so `^3.8.1` resolved to the newest 3.x (3.9.9 on 2026-10-01)
while `ci.yml` and local runs use the lockfile's 3.8.1. On a pull request that changes both docs
and code, the docs gate re-checks the changed code files with the newer Prettier and failed on
files that 3.8.1 accepts (seen on PR #115). The workflow now reads the exact version from
`package-lock.json`.

## Verification

`node -p` on the new expression prints `3.8.1` locally. The workflow runs on this pull request
itself because it adds a Markdown file.

## External resources

None.

## Next

- After merge, update open mixed docs-and-code branches from `main` (PR #115 first) so their docs
  gate run uses the locked Prettier.
