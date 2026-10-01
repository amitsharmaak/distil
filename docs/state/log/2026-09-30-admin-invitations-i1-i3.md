---
topic: admin-invitations
title: Admin invitations I1–I3 implemented (allowlist, API, Invitations and Troubleshooting tabs)
date: 2026-09-30
time: 12:00
status: in-progress
branch: claude/admin-invitations-i1-i3
---

## What changed

One branch, three commits, executing the plan in the entry `2026-09-30-admin-invitations.md`
(decisions 1A–4A). Not merged, not deployed; nothing touched in Vercel or Neon.

- **I1 (`46f4755`)** `DISTIL_ADMIN_USER_IDS` (comma-separated UUIDs, read in
  `src/lib/auth/environment.ts`, invalid entries ignored, unset means nobody) and
  `isPlatformAdmin` (user actor kind only, so a capture token for an admin account is not an
  admin). `src/lib/auth/admin-invitations.ts` plus routes `GET/POST /api/v1/admin/invitations`
  and `DELETE /api/v1/admin/invitations/:id`: session + allowlist check on the server (403
  otherwise), `requireAllowedOrigin` on mutations, `POST` limited to 20 per admin per day, link
  returned once, list shows masked addresses and no hashes or links, revoke takes an optional
  reason and treats missing and non-pending ids alike (404). New `listInvitations` port method
  and Postgres implementation. `/api/v1/account` now returns `isAdmin`. New API error codes
  `FORBIDDEN`, `NOT_FOUND`, `SERVICE_UNAVAILABLE`. `scripts/auth-invitations.ts` now says
  "DATABASE_URL is not set" instead of the misleading repository error. Matrix, route-surface
  fixture, `AGENTS.md`, `docs/vercel-deployment.md` and `.env.local.example` updated.
- **I2 (`12ee34c`)** Settings → Invitations tab (admin only): email and optional note, "Send
  invitation", copy-once link card with expiry, status list (pending / accepted / revoked /
  expired) with "Revoke…" asking for a reason.
- **I3** Capture diagnostics moved out of Settings → Capture into an admin-only Troubleshooting
  tab with a failure-count badge shown only when failures exist. Non-admins no longer see the
  panel. Tabs are driven by the `isAdmin` flag on the account payload; the API is the real gate.

## Deviations from the plan, and why

1. **Control-plane client, not the runtime role.** Migration 0007 revokes every privilege on
   `invitations` from `distil_runtime`; the runtime role can only call the exact-key SECURITY
   DEFINER functions. Issue, list and revoke therefore run on
   `getControlPlaneRepositories(...).auth` and need `DATABASE_CONTROL_PLANE_URL`; without it the
   routes answer 503. Consequence for decision 3A: the `operator_audit_events` row is written on
   every issue and revoke (the client that can write invitations can also write the audit), not
   only "when configured". An audit-write failure is logged and does not hide the link. The
   `invitation.issue` action was added to the audit allowlist in
   `src/lib/postgres/lifecycle-repositories.ts`. The alternative (a migration adding SECURITY
   DEFINER issue/list/revoke functions for the runtime role, keeping the owner-level URL out of
   request handling) was not built; it needs a tenant migration and is Amit's call.
2. **No `FEATURE_NEON_AUTH` gate.** The plan said 404 when hosted auth is off. That would make the
   local loop (legacy auth) unverifiable, and the allowlist already decides access, so the routes
   work with either auth mode.
3. **No keyboard shortcuts** for the two new tabs (1 and 2 stay Capture and Account), to avoid
   registering help-dialog entries that non-admins cannot use.

## Verification

Locally verified on this branch (macOS, Docker Postgres):

- `npx tsc --noEmit` clean.
- New/changed tests: `admin-invitations.unit` (allowlist, masking, status), route security suite
  for all three methods (403 for member and capture-token actors, 401, cross-origin rejected
  before session resolution, 503 without control plane, 201 with audit and rate-limit, 429, 400,
  204/404 revoke), `auth-repository.unit` (`listInvitations` selects no hashes), account route
  contract (`isAdmin`), settings page and `InvitationsSettings` component tests, matrix and
  route-inventory harness counts (routes 87 → 89, surfaces 115 → 118).
- PostgreSQL integration `admin-invitations.integration.test.ts` (Testcontainers): issue, list
  (newest first, no hashes), revoke and audit on the control-plane client, and the runtime role is
  refused with "permission denied".
- Playwright `tests/e2e/admin-invitations.spec.ts` (desktop-chromium, local Docker loop with the
  owner in `DISTIL_ADMIN_USER_IDS`, run as `DISTIL_E2E_HOST=localhost DISTIL_E2E_PORT=3000`):
  send, link shown once, masked row pending, revoke, revoked. It also wrote and then I removed
  the matching `operator_audit_events` rows from the local database.
- Full gate results are in the PR description.

Not verified: any Production or Preview behaviour, mobile Playwright projects for the new spec,
real magic-link acceptance of an invitation issued through the new UI.

## External resources

None touched. The local Docker database received one test invitation and two audit rows, since
deleted.

## Next

- Amit reviews and merges the PR (not merged by the implementing session).
- Before the feature is usable in Production, Amit authorizes at release time: set
  `DISTIL_ADMIN_USER_IDS` (his Production user UUID) in Vercel, and confirm
  `DATABASE_CONTROL_PLANE_URL` is set in the Production web environment (the account-lifecycle
  queue already needs it; unverified here). Neither was changed.
- Amit decides whether the control-plane approach (deviation 1) is acceptable or whether to add a
  migration with SECURITY DEFINER functions for the runtime role.
- After release, issue one real invitation from Settings and confirm the invitee can sign in.
