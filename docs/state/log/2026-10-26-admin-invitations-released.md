---
topic: admin-invitations
title: First real invitation and second invitation records (#158) released
date: 2026-10-26
status: released
branch: claude/kind-lehmann-ded362
pr: 158
---

## What changed

This entry is docs only; PR #158 changed docs only. PR #158 (squash commit `aef747d8`, merged 2026-10-26 13:25 IST) was merged with
Amit's authorization as the second of four PRs merged that day, in this order: #157 (`cbc94ed2`),
#158 (`aef747d8`), #159 (`71d626e1`), #154 (`4efee406`). It added
`2026-10-15-admin-invitations-first-real-invitation.md` and
`2026-10-19-admin-invitations-second-invitation.md` for this topic, plus
`2026-10-15-iphone-shortcut-token-icloud-link-published.md` and
`2026-10-15-chrome-extension-web-store-listing-live.md` for the other two topics. The invitations
themselves were issued on Production on 2026-10-15 and 2026-10-19; this PR changed no code and
built nothing, since `scripts/vercel-ignore-build.sh` skips docs-only commits.
The main Quick gate passed on `4efee406`, the head after all four merges, and Vercel deployed
that commit to Production (deployment `2XLjuNcbSYY3uVofohS88nDTsNU9`, status Ready, the
`distilai.app` alias created 2026-10-26 13:28 IST). The merge evidence comes from the session
that ran the merges.

## Verification

Derived from the merge session's report of the commits, the Quick gate and the deployment status.
Nothing was re-tested on `distilai.app` after the deploy, and Settings → Invitations was not
reopened: the status of both invitations is as last observed on 2026-10-19 (the first Accepted,
the second Pending).

## External resources

none

## Next

1. **Amit, today:** the second invitation's one-time link expires 2026-10-26. If the invitee has
   not accepted, revoke it in Settings → Invitations and issue a new one; if it was accepted, add
   a `closed` entry for this topic.
2. Confirm the first invitee connected Chrome and paired the iPhone (not visible to an admin),
   as noted in `2026-10-15-admin-invitations-first-real-invitation.md`.
3. An Android capture path is not planned; open a topic if invitees ask for it.
