---
topic: admin-invitations
title: Admin invitations configured for Production; same-commit redeploys now build
date: 2026-10-01
status: in-progress
branch: claude/vercel-ignore-redeploy
---

## What changed

Amit authorized the Production setup for admin invitations on 2026-10-01.

- `DATABASE_CONTROL_PLANE_URL` was already set for Production (added 2026-09-10); unchanged.
- Amit added `DISTIL_ADMIN_USER_IDS` (Config, Production) in the Vercel dashboard with his app
  user id, the `userId` that `/api/v1/account` returns when he is signed in. This is not the
  tenant-migration owner id used by `db:tenant:migrate`.
- His redeploy of `b2213d9` was canceled after one second by the Ignored Build Step: a redeploy of
  the same commit has an empty diff against `VERCEL_GIT_PREVIOUS_SHA`, which the script read as
  "only docs changed". `scripts/vercel-ignore-build.sh` now builds when the previous SHA is `HEAD`
  itself. Merging this branch also builds, since it changes a script, and that build picks up the
  new variable.

## Verification

- Script checked in a scratch repository: same commit builds (exit 1), docs-only skips (exit 0),
  code change builds (exit 1).
- Before the merge, `/api/v1/account` on Production still reported `isAdmin: false`.

## External resources

Vercel project `project-evgf1`: Production variable `DISTIL_ADMIN_USER_IDS` added by Amit.

## Next

- Amit merges this PR; the Production build that follows applies `DISTIL_ADMIN_USER_IDS`.
- Confirm `/api/v1/account` reports `isAdmin: true` and Settings → Invitations appears.
- Amit issues one real invitation from Settings and confirms the invitee can sign in.
