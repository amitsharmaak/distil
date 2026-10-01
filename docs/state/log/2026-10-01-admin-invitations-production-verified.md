---
topic: admin-invitations
title: Admin invitations verified on Production
date: 2026-10-01
time: 06:40
status: released
branch: claude/x1-x2-production
---

## What changed

After PR #120 merged, its Production build applied `DISTIL_ADMIN_USER_IDS`.

## Verification

- `/api/v1/account` reports `isAdmin: true` for Amit.
- Settings shows the Invitations and Troubleshooting tabs. Invitations renders the invite form and
  the existing invitation list, so the control-plane client works (it would answer 503 without
  `DATABASE_CONTROL_PLANE_URL`). No console errors.
- No invitation was issued during verification.

## External resources

None changed in this step.

## Next

- Amit issues one real invitation from Settings when he has someone to invite and confirms the
  invitee can sign in.
