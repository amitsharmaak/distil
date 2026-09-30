---
topic: admin-invitations
title: Admin invitations from Settings, plan I1–I3 recorded and decided
date: 2026-09-30
status: planned
branch: claude/distil-onboarding-docs-a2addc
pr: 104
---

## What changed

Plan only, no code: checkpoint "Admin invitations from Settings: phased plan (I1–I3) —
2026-09-30" in `docs/project-state.md`. Onboarding a colleague needed a Neon SQL lookup, an inline
`DATABASE_URL` for `npm run auth:invite` and a hand-pasted link. **I1** admin allowlist plus
`/api/v1/admin/invitations` (issue, list, revoke) reusing `executeInvitationCommand`; **I2**
Settings → Invitations tab (admin only, link shown once with Copy, revoke); **I3** capture
diagnostics moved into an admin-only Troubleshooting tab. The same PR added `docs/onboarding.md`,
the guide sent to new users. Decisions 1–4 were answered by Amit on 2026-09-30 with the
recommended options (env allowlist, any email, audit when configured, admin-only Troubleshooting
tab).

## Verification

Docs only. PR #104 merged to `main` (`6da0e43`).

## External resources

None touched.

## Next

- Amit starts I1–I3 as one task with the single-session code prompt in the checkpoint.
- Production needs the admin allowlist environment variable set before I2 is usable there; that
  is a cloud mutation and needs Amit's authorization at release time.
