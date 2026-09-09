# Phase 3 hosted-auth activation rehearsal

## Scope and authority

This runbook is the first operational step after Phase 3 implementation acceptance. It enables
Neon Auth only on a disposable, unpromoted Preview deployment with synthetic identities. It does
not authorize linking a real identity, issuing a real-user invitation, changing the stable Preview
alias, applying migrations to Production, or changing Production variables.

Use the accepted `codex/phase-3-tenancy` branch and require a green exact-SHA quality gate before
starting. Keep the existing legacy Preview available as the rollback target. Do not reuse its
database branch, auth configuration, cookie secret, or alias for this rehearsal.

## Release gates

1. Create a fresh, auto-expiring Neon branch from the accepted Preview source and apply the complete
   ordinary plus Phase 3 migration chain. Use separate owner/migration and restricted runtime roles.
2. Enable branch-scoped Managed Better Auth. Record only non-secret project, branch, and auth
   identifiers. Configure one exact HTTPS deployment origin, magic-link-only behavior, and the
   provider's shared development email service. Password, social, organization, anonymous access,
   wildcard domains, and localhost remain disabled.
3. Create an unpromoted Vercel Preview deployment bound to that branch. Set the variables below only
   for its Git branch/deployment scope. A build with hosted auth enabled must pass
   `npm run audit:phase3-activation`; the report names checks but never returns values.
4. Use synthetic test inboxes and operator identities only. Do not use Amit's email, migrate the
   accepted legacy owner, or set `DISTIL_LEGACY_USER_ID`.
5. Run the invitation, session, isolation, failure, logging, and rollback matrix below. Preserve a
   content-free evidence file with mode `0600` under the gitignored `artifacts/` tree.
6. Disable/delete branch auth, expire or delete the branch and test deployment, and verify that the
   stable Preview and Production aliases, variables, data, identities, and feature posture did not
   change.

## Deployment preflight contract

The rehearsal build requires:

- `FEATURE_NEON_AUTH=true` and `VERCEL_ENV=preview`.
- `FEATURE_CONNECTORS=false` and every Phase 2 product flag exactly `false`, so auth is the only
  changing dimension.
- Separate `DATABASE_URL` and `DATABASE_MIGRATION_URL` values. The application uses the restricted
  runtime role; only migration/verification commands use the owner role.
- Branch-scoped `NEON_AUTH_BASE_URL` and a unique `NEON_AUTH_COOKIE_SECRET` of at least 32
  characters.
- `NEXT_PUBLIC_API_BASE_URL`, `DISTIL_ALLOWED_ORIGINS`, and
  `DISTIL_PHASE3_REHEARSAL_ORIGIN` bound to the same exact HTTPS deployment origin with no wildcard.
- `DISTIL_PHASE3_REHEARSAL_SHA` equal to `VERCEL_GIT_COMMIT_SHA`.
- No `DISTIL_LEGACY_USER_ID`.

Run the deterministic repository gates before deployment:

```bash
npm run audit:phase3-dependencies
npm run audit:phase3-security -- --json
npm run test:phase3-isolation
```

The deployment build runs the conditional activation preflight automatically. To validate a fully
populated rehearsal environment explicitly, run:

```bash
npm run audit:phase3-activation -- --json
```

Never paste or echo environment values into the command line, evidence bundle, state document, or
chat. Use the provider and Vercel secret stores.

## Synthetic acceptance matrix

Record each case against one Git SHA, deployment ID, Neon branch ID, and timestamp:

- An uninvited provider identity and an unauthenticated request receive no personal data.
- One valid invite requests a magic link, accepts with the exact verified email, creates one
  internal UUID user plus one provider mapping, and consumes the invite exactly once.
- Wrong-email, revoked, expired, reused, concurrent, and redirect-tampered invitations fail with the
  same generic user-visible response and do not disclose account state.
- A second synthetic user completes the same path. Bidirectional item, nested-resource, search,
  queue, quota, export, deletion, object-key, identifier-guessing, and timing checks show no
  cross-tenant access.
- Sign out, second-device sign-in, individual-session revocation, revoke-other-sessions, and account
  disable take effect on the next protected request. A stable cookie secret preserves sessions
  across a no-code redeploy; a deliberately different secret invalidates them.
- Provider timeout/outage, database transaction retry, invitation dispatch replay, and lost callback
  resume safely without duplicate users, mappings, invites, or email dispatch claims.
- Runtime responses use private/no-store caching, cookies are Secure/HttpOnly/SameSite=Lax as
  applicable, callback origins remain exact, and logs contain no email link, invite token, cookie,
  content, prompt, database URL, or secret.
- The legacy flags-off deployment remains healthy throughout. Rolling the rehearsal deployment back
  to hosted-auth false restores the legacy path without changing either tenant's data.

## Stop conditions

Stop without linking a real account or promoting an alias if any gate is missing, the auth API can
be reached outside the invitation-validating path in a way that creates identities contrary to the
accepted policy, an exact callback/domain restriction cannot be enforced, a secret appears in logs,
or any foreign and missing resource diverges in status/code/body.

After a clean rehearsal, update `docs/project-state.md` with non-secret evidence and ask for a
separate operator decision covering: stable Preview promotion, the first real invitation, the
permanent internal UUID and provider mapping, ownership migration, rollback window, and later
Production planning. None of those actions is implied by rehearsal success.
